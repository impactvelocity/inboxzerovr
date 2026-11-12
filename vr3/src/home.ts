import type { Level } from './levels';
import * as PixelFont from './mail/pixelFont';

/**
 * The home screen: the title, a card for each level (Kyoto first) and Start. It sits over the
 * live scene, which shows whichever level is picked, so choosing a card is also a look at it.
 * In a headset's browser this is the flat page before Enter VR; leaving VR comes back to it.
 */
export function createHome(options: { levels: Level[]; pick(level: Level): void; start(where: 'vr' | 'screen'): void; settings(): void }) {
  const base = import.meta.env.BASE_URL;
  const list = document.getElementById('levels')!, start = document.getElementById('start') as HTMLButtonElement;
  const here = document.getElementById('start-here') as HTMLButtonElement, status = document.getElementById('xr-status')!;
  const cards = new Map<string, HTMLButtonElement>();
  for (const level of options.levels) {
    const card = document.createElement('button');
    card.type = 'button'; card.className = 'level'; card.setAttribute('role', 'radio'); card.setAttribute('aria-checked', 'false');
    card.style.setProperty('--accent', level.accent);
    card.innerHTML = `<span class="art" style="background-image:url('${base}${level.art[0]}')"></span><span class="art end" style="background-image:url('${base}${level.art[1]}')"></span>`
      + `<span class="shade"></span><span class="num">${level.number}</span><span class="pick">Selected</span>`
      + `<span class="words"><span class="name">${level.name}</span><span class="meta">${level.weapon} · ${level.line}</span></span>`;
    card.addEventListener('click', () => options.pick(level));
    list.append(card); cards.set(level.id, card);
  }
  // As a radio group: arrows move the choice, and only the chosen card is a tab stop.
  list.addEventListener('keydown', event => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault(); event.stopPropagation();
    const at = options.levels.findIndex(level => cards.get(level.id)!.getAttribute('aria-checked') === 'true');
    const next = options.levels[(at + step + options.levels.length) % options.levels.length];
    options.pick(next); cards.get(next.id)!.focus();
  });

  // The title, in the game's own pixel letters, lit in the chosen level's colour.
  const logo = document.getElementById('logo') as HTMLCanvasElement;
  function drawLogo(accent: string) {
    const g = logo.getContext('2d'); if (!g) return;
    const text = 'INBOX ZERO', cell = Math.floor(Math.min(logo.width / PixelFont.widthCells(text), logo.height / (PixelFont.Rows + 1)));
    const left = Math.round((logo.width - PixelFont.width(text, cell)) / 2), top = Math.round((logo.height - PixelFont.Rows * cell) / 2), gap = Math.max(1, Math.round(cell * 0.07));
    g.clearRect(0, 0, logo.width, logo.height);
    const fill = g.createLinearGradient(0, top, 0, top + PixelFont.Rows * cell); fill.addColorStop(0, '#ffffff'); fill.addColorStop(0.55, '#fff6ee'); fill.addColorStop(1, accent);
    g.fillStyle = '#00000066'; PixelFont.cells(text, left, top + Math.round(cell * 0.45), cell, (x, y, w, h) => g.fillRect(x + gap, y + gap, w - 2 * gap, h - 2 * gap));
    g.fillStyle = fill; PixelFont.cells(text, left, top, cell, (x, y, w, h) => g.fillRect(x + gap, y + gap, w - 2 * gap, h - 2 * gap));
  }

  let vr = false;
  start.addEventListener('click', () => options.start(vr ? 'vr' : 'screen'));
  here.addEventListener('click', () => options.start('screen'));
  document.getElementById('open-settings')!.addEventListener('click', options.settings);

  return {
    /** Mark a level's card as the chosen one. */
    select(id: string) {
      for (const [key, card] of cards) { card.setAttribute('aria-checked', String(key === id)); card.tabIndex = key === id ? 0 : -1; }
      const level = options.levels.find(l => l.id === id); if (level) drawLogo(level.accent);
    },
    /** A level is loading: Start waits. */
    busy(on: boolean) { document.body.classList.toggle('busy', on); },
    /** Can this browser enter VR? Start says which it will do. */
    vr(supported: boolean) {
      vr = supported; start.disabled = false; start.textContent = supported ? 'Enter VR' : 'Start'; here.hidden = !supported;
      status.textContent = supported ? '' : window.isSecureContext ? 'Playing on this screen. Open this page in a headset browser for VR.' : 'VR needs HTTPS or localhost. Playing on this screen.';
    },
  };
}
