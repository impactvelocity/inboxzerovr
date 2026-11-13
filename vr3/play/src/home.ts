import type { Level } from './levels';
import * as PixelFont from './mail/pixelFont';

/**
 * The home screen: the chosen level's own logo, a card for each level (Kyoto first) and Start. It
 * sits over the live scene, which shows whichever level is picked, so choosing a card is also a look
 * at it. In a headset's browser this is the flat page before Enter VR; leaving VR comes back to it.
 *
 * The logo (the user's own art, one per level, 2026-11-11: public/logos, cut by tools/logos.py)
 * floats a little, gives off something of its level (petals, phosphor, embers, bubbles), and now
 * and then a glint runs across it, as on an arcade title screen.
 */
type Air = 'petals' | 'phosphor' | 'embers' | 'bubbles' | 'stars';
const LOGOS: Record<string, { file: string; air: Air; colours: string[] }> = {
  lumber: { file: 'lumber', air: 'petals', colours: ['#f6a81c', '#ee7a1a', '#d9471c', '#f3c53a'] },      // (its 'petals' are maple leaves)
  knockout: { file: 'knockout', air: 'embers', colours: ['#ffd24a', '#ff5a5a', '#6fa8ff', '#fff6d8'] },
  kyoto: { file: 'kyoto', air: 'petals', colours: ['#ffc4d8', '#ff9fc0', '#fff0f5'] },
  office: { file: 'office', air: 'phosphor', colours: ['#7dffc9', '#b8ffe4', '#f2e2bd'] },
  office2: { file: 'office', air: 'phosphor', colours: ['#7dffc9', '#b8ffe4', '#f2e2bd'] },
  castle: { file: 'castle', air: 'embers', colours: ['#ffc457', '#ff8a3d', '#b79cff', '#fff1c4'] },
  lab: { file: 'lab', air: 'bubbles', colours: ['#a6ff3d', '#5dffa1', '#e9ffd0'] },
  inferno: { file: 'inferno', air: 'embers', colours: ['#ffc23d', '#ff7a1e', '#ff3d2e', '#fff1c4'] },
  space: { file: 'space', air: 'stars', colours: ['#ffffff', '#7df3ff', '#ff8ae6', '#cfc4ff'] },
};

/**
 * A voice saying the level's name as it is picked (the user's own clips, 2026-11-11). Only when the
 * player picks one, never as the page opens; a pick while one is still speaking cuts it off.
 */
/** Where the icon top right goes: the hackathon this was built for. (Empty for now: the icon shows, and goes nowhere.) */
const HACKATHON_URL = '';

const ANNOUNCE: Record<string, string> = { lumber: 'audio/lumber/announce.mp3', knockout: 'audio/knockout/announce.mp3', kyoto: 'audio/kyoto/announce.mp3', office: 'audio/office/announce.mp3', office2: 'audio/office/announce.mp3', castle: 'audio/castle/announce.mp3', lab: 'audio/lab/announce.mp3', inferno: 'audio/inferno/announce.mp3', space: 'audio/space/announce.mp3' };

export function createHome(options: { levels: Level[]; pick(level: Level): void; start(where: 'vr' | 'screen'): void; settings(): void }) {
  const base = import.meta.env.BASE_URL;
  const list = document.getElementById('levels')!, start = document.getElementById('start') as HTMLButtonElement;
  const here = document.getElementById('start-here') as HTMLButtonElement, status = document.getElementById('xr-status')!;
  const cards = new Map<string, HTMLButtonElement>();
  const voices = new Map<string, HTMLAudioElement>();
  for (const url of new Set(Object.values(ANNOUNCE))) { const clip = new Audio(`${base}${url}`); clip.preload = 'auto'; voices.set(url, clip); }
  let speaking: HTMLAudioElement | null = null;
  function announce(level: Level) {
    if (speaking) { speaking.pause(); speaking.currentTime = 0; speaking = null; }
    const url = ANNOUNCE[level.id], clip = url ? voices.get(url) : undefined;
    if (!clip) return;
    clip.currentTime = 0; clip.volume = 1;
    void clip.play().catch(() => { /* not allowed yet: nothing to say */ });
    speaking = clip;
  }
  for (const level of options.levels) {
    const card = document.createElement('button');
    card.type = 'button'; card.className = 'level'; card.setAttribute('role', 'radio'); card.setAttribute('aria-checked', 'false'); card.setAttribute('aria-label', level.name);
    card.style.setProperty('--accent', level.accent);
    card.innerHTML = `<span class="art" style="background-image:url('${base}${level.art[0]}')"></span><span class="art end" style="background-image:url('${base}${level.art[1]}')"></span>`
      + `<span class="shade"></span><span class="pick" aria-hidden="true"><canvas class="check"></canvas></span><canvas class="name" width="560" height="120" aria-hidden="true"></canvas>`;
    card.addEventListener('click', () => options.pick(level));      // (its sting plays as it is chosen: main.ts)
    drawCheck(card.querySelector<HTMLCanvasElement>('canvas.check')!);
    list.append(card); cards.set(level.id, card);
  }
  // The rest of the last row (four to a row): blank, for levels still to come (asked for on 2026-11-11).
  for (let i = 0; i < (4 - options.levels.length % 4) % 4; i++) {
    const soon = document.createElement('div');
    soon.className = 'level soon'; soon.setAttribute('aria-label', 'Coming soon');
    const words = document.createElement('canvas'); words.width = 330; words.height = 40; words.setAttribute('aria-hidden', 'true');
    const g = words.getContext('2d');
    if (g) { const cell = 4, text = 'COMING SOON', left = Math.round((words.width - PixelFont.width(text, cell)) / 2); g.fillStyle = '#ffffff'; PixelFont.cells(text, left, Math.round((words.height - PixelFont.Rows * cell) / 2), cell, (x, y, cw, ch) => g.fillRect(x, y, cw, ch)); }
    soon.append(words); list.append(soon);
  }
  // every name at the same size: the size the longest one fits at
  const size = Math.min(...options.levels.map(level => nameCell(level.name)));
  for (const level of options.levels) drawName(cards.get(level.id)!.querySelector<HTMLCanvasElement>('canvas.name')!, level.name, size);
  // As a radio group: arrows move the choice, and only the chosen card is a tab stop.
  list.addEventListener('keydown', event => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault(); event.stopPropagation();
    const at = options.levels.findIndex(level => cards.get(level.id)!.getAttribute('aria-checked') === 'true');
    const next = options.levels[(at + step + options.levels.length) % options.levels.length];
    options.pick(next); cards.get(next.id)!.focus();
  });

  // ---------------------------------------------------------------- the logo
  const stage = document.getElementById('logo-stage')!, float = stage.querySelector('.logo-float') as HTMLElement;
  const shine = stage.querySelector('.logo-shine') as HTMLElement, air = stage.querySelector('canvas.logo-air') as HTMLCanvasElement;
  const images = new Map<string, HTMLImageElement>();
  for (const file of new Set(Object.values(LOGOS).map(l => l.file))) {
    const img = document.createElement('img');
    img.className = 'logo-img'; img.alt = ''; img.src = `${base}logos/${file}.webp`; img.decoding = 'async';
    float.insertBefore(img, shine); images.set(file, img);
  }
  // Behind it all, the chosen level's own picture (the user's art, 2026-11-11: public/home), cross-fading as the choice changes.
  const backdrop = document.createElement('div'); backdrop.className = 'home-bg'; backdrop.setAttribute('aria-hidden', 'true');
  const pictures = new Map<string, HTMLDivElement>();
  for (const file of new Set(Object.values(LOGOS).map(l => l.file))) {
    const picture = document.createElement('div'); picture.className = 'pic'; picture.style.backgroundImage = `url('${base}home/${file}.webp')`;
    backdrop.append(picture); pictures.set(file, picture);
  }
  const sceneAir = document.createElement('canvas'); sceneAir.className = 'scene-air'; backdrop.append(sceneAir);
  document.getElementById('home')!.prepend(backdrop);
  // ---------------------------------------------------------------- the background's air
  // Over the level's picture, under the menu, something of the level moving (2026-11-11: the picture
  // replaced the live scene, and its life with it): petals and lantern motes, dust in the strip lights,
  // mist and embers, toxic bubbles. Glows are drawn from small pictures made once, so it stays cheap.
  interface Kind { shape: 'petal' | 'glow' | 'ember' | 'bubble' | 'mist' | 'pixel' | 'dust' | 'streak'; count: number; colours: string[]; size: [number, number];
    vx: [number, number]; vy: [number, number]; life: [number, number]; alpha: number; from: 'top' | 'bottom' | 'anywhere'; sway: number }
  const SCENE_AIR: Record<string, Kind[]> = {
    // (lumber: maple leaves coming down across the yard, gold dust in the low sun)
    lumber: [
      { shape: 'mist', count: 4, colours: ['#ffb347', '#e8452f', '#ffd98a'], size: [220, 380], vx: [-5, 8], vy: [-2, 2], life: [16, 24], alpha: 0.06, from: 'anywhere', sway: 3 },
      { shape: 'petal', count: 34, colours: ['#f6a81c', '#ee7a1a', '#d9471c', '#f3c53a', '#c22f1c'], size: [5, 10], vx: [10, 34], vy: [18, 44], life: [9, 16], alpha: 0.85, from: 'top', sway: 26 },
      { shape: 'glow', count: 18, colours: ['#ffe3a8', '#ffc56b'], size: [1.4, 3], vx: [-6, 6], vy: [-8, 3], life: [4, 8], alpha: 0.7, from: 'anywhere', sway: 10 },
    ],
    knockout: [
      { shape: 'mist', count: 5, colours: ['#ff5a5a', '#3b7bff', '#ffd24a'], size: [220, 380], vx: [-6, 6], vy: [-2, 2], life: [14, 22], alpha: 0.06, from: 'anywhere', sway: 3 },
      { shape: 'dust', count: 50, colours: ['#ffffff', '#ffe9b8'], size: [0.8, 2], vx: [-5, 5], vy: [2, 9], life: [6, 12], alpha: 0.45, from: 'anywhere', sway: 6 },
      { shape: 'glow', count: 20, colours: ['#ffffff', '#ffd24a', '#cfe0ff'], size: [1.4, 3.2], vx: [-3, 3], vy: [-3, 3], life: [1.2, 3], alpha: 0.85, from: 'anywhere', sway: 4 },
    ],
    kyoto: [
      { shape: 'mist', count: 4, colours: ['#ff9fc0', '#b48cff'], size: [220, 380], vx: [-6, 6], vy: [-2, 2], life: [16, 24], alpha: 0.06, from: 'anywhere', sway: 4 },
      { shape: 'petal', count: 32, colours: ['#ffc4d8', '#ff9fc0', '#fff0f5'], size: [4, 8], vx: [14, 38], vy: [16, 40], life: [10, 18], alpha: 0.8, from: 'top', sway: 18 },
      { shape: 'glow', count: 16, colours: ['#ffe3a8', '#ffd0e6'], size: [1.5, 3], vx: [-6, 6], vy: [-8, 3], life: [4, 8], alpha: 0.75, from: 'anywhere', sway: 10 },
    ],
    office: [
      { shape: 'mist', count: 3, colours: ['#9fb4ff', '#7dffc9'], size: [240, 380], vx: [-5, 5], vy: [-2, 2], life: [16, 24], alpha: 0.05, from: 'anywhere', sway: 3 },
      { shape: 'dust', count: 60, colours: ['#ffffff', '#d6e4ff'], size: [0.8, 2], vx: [-5, 5], vy: [-4, 5], life: [6, 12], alpha: 0.45, from: 'anywhere', sway: 6 },
      { shape: 'pixel', count: 12, colours: ['#7dffc9', '#b8ffe4'], size: [2, 4], vx: [-3, 3], vy: [-16, -6], life: [3, 6], alpha: 0.6, from: 'bottom', sway: 3 },
    ],
    castle: [
      { shape: 'mist', count: 6, colours: ['#7d5cff', '#5a3fd1', '#3df5c2'], size: [180, 340], vx: [-8, 8], vy: [-3, 3], life: [14, 22], alpha: 0.09, from: 'anywhere', sway: 4 },
      { shape: 'ember', count: 24, colours: ['#ffc457', '#ff8a3d', '#fff1c4'], size: [1.2, 3], vx: [-8, 8], vy: [-30, -12], life: [3, 6], alpha: 0.85, from: 'bottom', sway: 10 },
      { shape: 'glow', count: 14, colours: ['#b79cff', '#e2d6ff'], size: [1.2, 2.6], vx: [-6, 6], vy: [-6, 6], life: [3, 6], alpha: 0.75, from: 'anywhere', sway: 8 },
    ],
    lab: [
      { shape: 'mist', count: 5, colours: ['#2dff8a', '#0aa86b'], size: [200, 360], vx: [-6, 6], vy: [-2, 2], life: [14, 22], alpha: 0.07, from: 'bottom', sway: 3 },
      { shape: 'bubble', count: 20, colours: ['#a6ff3d', '#5dffa1', '#e9ffd0'], size: [3, 10], vx: [-4, 4], vy: [-34, -14], life: [4, 8], alpha: 0.55, from: 'bottom', sway: 8 },
      { shape: 'glow', count: 24, colours: ['#a6ff3d', '#3dff9f'], size: [1.2, 2.6], vx: [-6, 6], vy: [-8, 2], life: [4, 8], alpha: 0.65, from: 'anywhere', sway: 9 },
    ],
    inferno: [
      { shape: 'mist', count: 5, colours: ['#ff7a1e', '#c2331a', '#ffb24a'], size: [200, 360], vx: [-6, 6], vy: [-4, 1], life: [14, 22], alpha: 0.08, from: 'bottom', sway: 3 },
      { shape: 'ember', count: 40, colours: ['#ffc23d', '#ff7a1e', '#fff1c4'], size: [1.2, 3.2], vx: [-10, 10], vy: [-44, -16], life: [3, 6], alpha: 0.9, from: 'bottom', sway: 12 },
      { shape: 'glow', count: 14, colours: ['#ff8a3d', '#ffd27a'], size: [1.2, 2.6], vx: [-6, 6], vy: [-10, 2], life: [3, 6], alpha: 0.7, from: 'anywhere', sway: 8 },
    ],
    // (space: the stars go by, right to left and a little down, with a few quick streaks among them)
    space: [
      { shape: 'mist', count: 5, colours: ['#7d5cff', '#c04dff', '#27d9ff'], size: [220, 400], vx: [-10, -3], vy: [-2, 2], life: [16, 24], alpha: 0.07, from: 'anywhere', sway: 3 },
      { shape: 'pixel', count: 70, colours: ['#ffffff', '#cfc4ff', '#7df3ff'], size: [1, 2.5], vx: [-46, -8], vy: [3, 12], life: [7, 14], alpha: 0.75, from: 'anywhere', sway: 0 },
      { shape: 'streak', count: 9, colours: ['#ffffff', '#7df3ff', '#ff8ae6'], size: [1.5, 2.5], vx: [-520, -300], vy: [70, 130], life: [1.6, 3.2], alpha: 0.7, from: 'anywhere', sway: 0 },
      { shape: 'glow', count: 12, colours: ['#ff8ae6', '#7df3ff'], size: [1.2, 2.4], vx: [-8, -2], vy: [-3, 3], life: [4, 8], alpha: 0.7, from: 'anywhere', sway: 6 },
    ],
  };
  interface Speck { kind: Kind; x: number; y: number; vx: number; vy: number; size: number; colour: string; age: number; life: number; seed: number; spin: number; turn: number }
  let specks: Speck[] = [], sceneKinds: Kind[] = SCENE_AIR.kyoto;
  const between = (r: [number, number]) => r[0] + Math.random() * (r[1] - r[0]);
  function speck(kind: Kind, w: number, h: number, anywhere = false): Speck {
    const size = between(kind.size), from = anywhere ? 'anywhere' : kind.from;
    const x = from === 'top' ? (Math.random() * 1.3 - 0.3) * w : Math.random() * w, y = from === 'top' ? -20 - Math.random() * 40 : from === 'bottom' ? h + 20 + Math.random() * 40 : Math.random() * h;
    return { kind, x, y, vx: between(kind.vx), vy: between(kind.vy), size, colour: kind.colours[Math.floor(Math.random() * kind.colours.length)], age: anywhere ? Math.random() * 4 : 0, life: between(kind.life), seed: Math.random() * 9, spin: Math.random() * 6, turn: (Math.random() - 0.5) * 2.4 };
  }
  /** A soft round light in a colour, drawn once and kept: glows, embers and mist are drawn from it. */
  const sprites = new Map<string, HTMLCanvasElement>();
  function sprite(colour: string, soft: boolean) {
    const key = `${colour}/${soft}`; let made = sprites.get(key);
    if (!made) {
      made = document.createElement('canvas'); made.width = made.height = 64;
      const sg = made.getContext('2d')!, grad = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
      if (soft) { grad.addColorStop(0, colour); grad.addColorStop(1, 'rgba(0,0,0,0)'); }
      else { grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.18, colour); grad.addColorStop(0.45, `${colour}55`); grad.addColorStop(1, 'rgba(0,0,0,0)'); }
      sg.fillStyle = grad; sg.fillRect(0, 0, 64, 64); sprites.set(key, made);
    }
    return made;
  }
  const sg = sceneAir.getContext('2d');
  function sceneFrame(dt: number) {
    if (!sg) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1), w = sceneAir.clientWidth, h = sceneAir.clientHeight;
    if (!w) return;
    if (sceneAir.width !== Math.round(w * dpr) || sceneAir.height !== Math.round(h * dpr)) { sceneAir.width = Math.round(w * dpr); sceneAir.height = Math.round(h * dpr); }
    sg.setTransform(dpr, 0, 0, dpr, 0, 0); sg.clearRect(0, 0, w, h);
    if (!specks.length) for (const kind of sceneKinds) for (let i = 0; i < kind.count; i++) specks.push(speck(kind, w, h, true));
    for (let i = 0; i < specks.length; i++) {
      let p = specks[i];
      p.age += dt;
      if (p.age >= p.life || p.y < -80 || p.y > h + 80 || p.x < -120 || p.x > w + 120) { p = specks[i] = speck(p.kind, w, h); }
      p.x += (p.vx + p.kind.sway * Math.sin(p.age * 0.9 + p.seed)) * dt; p.y += p.vy * dt; p.spin += p.turn * dt;
      const t = p.age / p.life, fade = Math.min(1, t * 4) * Math.min(1, (1 - t) * 3);
      let a = p.kind.alpha * fade;
      switch (p.kind.shape) {
        case 'petal':
          sg.save(); sg.globalAlpha = a; sg.translate(p.x, p.y); sg.rotate(p.spin); sg.scale(1, 0.5 + 0.4 * Math.sin(p.age * 3 + p.seed));
          sg.fillStyle = p.colour; sg.beginPath(); sg.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, Math.PI * 2); sg.fill(); sg.restore(); break;
        case 'dust': sg.globalAlpha = a * (0.6 + 0.4 * Math.sin(p.age * 2 + p.seed)); sg.fillStyle = p.colour; sg.beginPath(); sg.arc(p.x, p.y, p.size, 0, Math.PI * 2); sg.fill(); break;
        case 'pixel': sg.globalAlpha = a * (Math.sin(p.age * 19 + p.seed) > -0.3 ? 1 : 0.3); sg.fillStyle = p.colour; sg.fillRect(Math.round(p.x), Math.round(p.y), p.size * 2, p.size * 2); break;
        case 'bubble':
          sg.globalAlpha = a; sg.strokeStyle = p.colour; sg.lineWidth = 1.5; sg.beginPath(); sg.arc(p.x, p.y, p.size, 0, Math.PI * 2); sg.stroke();
          sg.globalAlpha = a * 0.8; sg.fillStyle = '#ffffff'; sg.beginPath(); sg.arc(p.x - p.size * 0.35, p.y - p.size * 0.35, p.size * 0.22, 0, Math.PI * 2); sg.fill(); break;
        case 'streak': {
          // a line of light, bright at its head and gone at its tail, the length it goes in a tenth of a second
          const tx = p.x - p.vx * 0.1, ty = p.y - p.vy * 0.1, line = sg.createLinearGradient(p.x, p.y, tx, ty);
          line.addColorStop(0, p.colour); line.addColorStop(1, 'rgba(0,0,0,0)');
          sg.globalAlpha = a; sg.strokeStyle = line; sg.lineWidth = p.size; sg.beginPath(); sg.moveTo(p.x, p.y); sg.lineTo(tx, ty); sg.stroke(); break;
        }
        case 'mist': { sg.globalAlpha = a; const r = p.size; sg.drawImage(sprite(p.colour, true), p.x - r, p.y - r * 0.6, r * 2, r * 1.2); break; }
        default: {
          // glow and ember: a bright point in a soft light, twinkling
          a *= p.kind.shape === 'ember' ? 0.65 + 0.35 * Math.sin(p.age * 17 + p.seed) : 0.55 + 0.45 * Math.sin(p.age * 3 + p.seed);
          sg.globalAlpha = a; const r = p.size * 7; sg.drawImage(sprite(p.colour, false), p.x - r, p.y - r, r * 2, r * 2);
        }
      }
    }
    sg.globalAlpha = 1;
  }

  let look = LOGOS.kyoto;
  function showLogo(id: string) {
    look = LOGOS[id] ?? LOGOS.kyoto;
    for (const [file, img] of images) img.classList.toggle('on', file === look.file);
    for (const [file, picture] of pictures) picture.classList.toggle('on', file === look.file);
    const url = `url('${base}logos/${look.file}.webp')`;
    shine.style.maskImage = url; shine.style.webkitMaskImage = url;
    for (const p of motes) p.life = 0;          // what was in the air goes, and the new level's comes
    const kinds = SCENE_AIR[look.file] ?? SCENE_AIR.kyoto;
    if (kinds !== sceneKinds) { sceneKinds = kinds; specks = []; }
  }
  // a glint across it now and then: every four to nine seconds
  let nextShine = 2.5;
  function glint() { shine.classList.remove('go'); void shine.offsetWidth; shine.classList.add('go'); }

  // what comes off it: a few dozen motes drawn on a canvas a little bigger than the logo
  interface Mote { x: number; y: number; vx: number; vy: number; size: number; spin: number; turn: number; age: number; life: number; colour: string; seed: number }
  const motes: Mote[] = [];
  const g = air.getContext('2d');
  function spawn(w: number, h: number): Mote {
    const c = look.colours[Math.floor(Math.random() * look.colours.length)], r = Math.random;
    // from somewhere along the logo, which fills the middle of the canvas
    const x = w * (0.12 + 0.76 * r()), y = h * (0.3 + 0.4 * r());
    switch (look.air) {
      case 'petals': return { x, y: h * (0.2 + 0.3 * r()), vx: 10 + 22 * r(), vy: 12 + 18 * r(), size: 4 + 3 * r(), spin: r() * 6, turn: (r() - 0.5) * 3, age: 0, life: 3 + 2.5 * r(), colour: c, seed: r() * 9 };
      case 'phosphor': return { x, y, vx: (r() - 0.5) * 6, vy: -(8 + 16 * r()), size: 1.5 + Math.round(1.5 * r()), spin: 0, turn: 0, age: 0, life: 1.6 + 1.6 * r(), colour: c, seed: r() * 9 };
      case 'embers': return { x, y: h * (0.4 + 0.3 * r()), vx: (r() - 0.5) * 10, vy: -(14 + 22 * r()), size: 1.6 + 2 * r(), spin: 0, turn: 0, age: 0, life: 1.8 + 1.8 * r(), colour: c, seed: r() * 9 };
      case 'stars': return { x: w * (0.06 + 0.88 * r()), y: h * (0.12 + 0.76 * r()), vx: -(4 + 10 * r()), vy: (r() - 0.5) * 3, size: 2 + Math.round(r()), spin: 0, turn: 0, age: 0, life: 1.4 + 1.8 * r(), colour: c, seed: r() * 9 };
      default: return { x, y: h * (0.45 + 0.3 * r()), vx: (r() - 0.5) * 5, vy: -(10 + 16 * r()), size: 3 + 4 * r(), spin: 0, turn: 0, age: 0, life: 2 + 2 * r(), colour: c, seed: r() * 9 };
    }
  }
  function drawMote(p: Mote, fade: number) {
    if (!g) return;
    g.globalAlpha = fade;
    switch (look.air) {
      case 'petals':
        g.save(); g.translate(p.x, p.y); g.rotate(p.spin); g.scale(1, 0.55 + 0.35 * Math.sin(p.age * 4 + p.seed));
        g.fillStyle = p.colour; g.beginPath(); g.ellipse(0, 0, p.size, p.size * 0.62, 0, 0, Math.PI * 2); g.fill(); g.restore(); break;
      case 'phosphor': {
        // square pixels that flicker, as on an old screen
        g.globalAlpha = fade * (0.55 + 0.45 * Math.sign(Math.sin(p.age * 23 + p.seed)));
        g.fillStyle = p.colour; g.shadowColor = p.colour; g.shadowBlur = 8;
        g.fillRect(Math.round(p.x), Math.round(p.y), p.size * 2, p.size * 2); g.shadowBlur = 0; break;
      }
      case 'embers': {
        const flick = 0.6 + 0.4 * Math.sin(p.age * 17 + p.seed);
        g.globalAlpha = fade * flick; g.fillStyle = p.colour; g.shadowColor = p.colour; g.shadowBlur = 16;
        g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0; break;
      }
      case 'stars': {
        // a plus of five pixels with a glow, winking
        const s = p.size, x = Math.round(p.x), y = Math.round(p.y);
        g.globalAlpha = fade * (0.6 + 0.4 * Math.sin(p.age * 9 + p.seed)); g.fillStyle = p.colour; g.shadowColor = p.colour; g.shadowBlur = 10;
        g.fillRect(x - s * 2, y, s * 5, s); g.fillRect(x, y - s * 2, s, s * 5); g.shadowBlur = 0;
        g.fillStyle = '#ffffff'; g.fillRect(x, y, s, s); break;
      }
      default:
        // a bubble: a ring with a glint, a soft green glow
        g.strokeStyle = p.colour; g.lineWidth = 2; g.shadowColor = p.colour; g.shadowBlur = 10;
        g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.stroke(); g.shadowBlur = 0;
        g.fillStyle = '#ffffff'; g.globalAlpha = fade * 0.8; g.beginPath(); g.arc(p.x - p.size * 0.35, p.y - p.size * 0.35, p.size * 0.22, 0, Math.PI * 2); g.fill();
    }
  }
  let last = performance.now(), running = false;
  function frame(now: number) {
    running = document.body.classList.contains('at-home');
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    // keep the canvas sharp at its shown size
    const dpr = Math.min(2, window.devicePixelRatio || 1), cw = Math.round(air.clientWidth * dpr), ch = Math.round(air.clientHeight * dpr);
    if (cw && (air.width !== cw || air.height !== ch)) { air.width = cw; air.height = ch; }
    const w = air.clientWidth, h = air.clientHeight;
    if (g && w) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      const want = look.air === 'petals' ? 12 : look.air === 'bubbles' ? 12 : 18;      // (fewer since 2026-11-11: subtler)
      while (motes.length < want) { const p = spawn(w, h); p.age = Math.random() * p.life; motes.push(p); }
      for (let i = 0; i < motes.length; i++) {
        let p = motes[i];
        p.age += dt;
        if (p.age >= p.life) { p = motes[i] = spawn(w, h); }
        if (look.air === 'petals') { p.x += (p.vx + 8 * Math.sin(p.age * 2 + p.seed)) * dt; p.y += p.vy * dt; p.spin += p.turn * dt; }
        else if (look.air === 'bubbles') { p.x += (p.vx + 6 * Math.sin(p.age * 3 + p.seed)) * dt; p.y += p.vy * dt; }
        else { p.x += (p.vx + 4 * Math.sin(p.age * 2.5 + p.seed)) * dt; p.y += p.vy * dt; }
        const t = p.age / p.life, fade = Math.min(1, t * 5) * Math.min(1, (1 - t) * 2.5);
        drawMote(p, fade * (look.air === 'phosphor' ? 0.5 : 0.55));
      }
      g.globalAlpha = 1;
    }
    sceneFrame(dt);
    if ((nextShine -= dt) <= 0) { glint(); nextShine = 4 + Math.random() * 5; }
    requestAnimationFrame(frame);
  }
  function wake() { if (!running) { last = performance.now(); requestAnimationFrame(frame); } }
  new MutationObserver(wake).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  wake();

  // the line under it, in the pixel letters, in the level's colour (asked for on 2026-11-11, with better words)
  const tagline = document.getElementById('tagline') as HTMLCanvasElement;
  function drawTagline(accent: string) {
    const g = tagline.getContext('2d'); if (!g) return;
    const text = (tagline.getAttribute('aria-label') ?? '').toUpperCase(), w = tagline.width, h = tagline.height;
    const cell = Math.max(2, Math.min(6, Math.floor((w - 8) / PixelFont.widthCells(text)))), wide = PixelFont.width(text, cell);
    const left = Math.round((w - wide) / 2), top = Math.round((h - PixelFont.Rows * cell) / 2) - 2, drop = Math.max(2, Math.round(cell * 0.5));
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,.8)'; PixelFont.cells(text, left, top + drop, cell, (x, y, cw, ch) => g.fillRect(x, y, cw, ch));
    g.fillStyle = accent; PixelFont.cells(text, left, top, cell, (x, y, cw, ch) => g.fillRect(x, y, cw, ch));
  }

  // the line over the logo, small, in white pixel letters
  {
    const credit = document.getElementById('credit') as HTMLCanvasElement | null, g = credit?.getContext('2d');
    if (credit && g) {
      const text = (credit.getAttribute('aria-label') ?? '').toUpperCase(), w = credit.width, h = credit.height;
      const cell = Math.max(2, Math.min(4, Math.floor((w - 8) / PixelFont.widthCells(text)))), left = Math.round((w - PixelFont.width(text, cell)) / 2), top = Math.round((h - PixelFont.Rows * cell) / 2);
      g.fillStyle = 'rgba(0,0,0,.7)'; PixelFont.cells(text, left, top + 2, cell, (x, y, cw, ch) => g.fillRect(x, y, cw, ch));
      g.fillStyle = '#ffffff'; PixelFont.cells(text, left, top, cell, (x, y, cw, ch) => g.fillRect(x, y, cw, ch));
    }
  }

  let vr = false;
  start.addEventListener('click', () => options.start(vr ? 'vr' : 'screen'));
  here.addEventListener('click', () => options.start('screen'));
  document.getElementById('open-settings')!.addEventListener('click', options.settings);
  // The buttons' words in the pixel letters (the main one bigger, dark on the level's colour)
  pixelLabel(start, start.textContent ?? '', 3, '#14121a');
  document.querySelectorAll<HTMLButtonElement>('#home button.pix:not(#start):not(.icon)').forEach(button =>
    pixelLabel(button, button.textContent ?? '', 2, button.classList.contains('close-dialog') ? '#14121a' : '#ffffff'));
  drawGear(document.querySelector<HTMLCanvasElement>('#open-settings canvas.gear')!);
  // top right: a loop like Meta's, to the hackathon
  const hackathon = document.getElementById('hackathon') as HTMLAnchorElement;
  const loop = hackathon.querySelector<HTMLCanvasElement>('canvas.loop')!;
  drawLoop(loop, '#f6b3cc');
  if (HACKATHON_URL) hackathon.href = HACKATHON_URL;
  // Setup and How to Play: cards over the home screen
  const setup = document.getElementById('setup') as HTMLDialogElement, guide = document.getElementById('guide') as HTMLDialogElement;
  for (const dialog of [setup, guide]) {
    dialog.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });        // (a click outside the card)
  }
  document.getElementById('open-setup')!.addEventListener('click', () => setup.showModal());
  document.getElementById('open-guide')!.addEventListener('click', () => guide.showModal());
  document.getElementById('setup-weapon')!.addEventListener('click', () => {
    // to the settings, opened at this level's weapon (the katana's own section in Kyoto)
    setup.close(); options.settings();
    const weapon = document.querySelector<HTMLDetailsElement>('#weapon-settings:not([hidden])') ?? document.querySelector<HTMLDetailsElement>('#controls details:has(#reach)');
    if (weapon) { weapon.open = true; weapon.scrollIntoView({ block: 'nearest' }); }
  });

  return {
    /** Mark a level's card as the chosen one, and show its logo. */
    select(id: string) {
      for (const [key, card] of cards) { card.setAttribute('aria-checked', String(key === id)); card.tabIndex = key === id ? 0 : -1; }
      const level = options.levels.find(l => l.id === id);
      if (level) { stage.style.setProperty('--accent', level.accent); showLogo(id); drawTagline(level.accent); drawLoop(loop, level.accent); glint(); nextShine = 4 + Math.random() * 4; }
    },
    /** Say a level's name (the menu in VR picks levels too). */
    announce(id: string) { const level = options.levels.find(l => l.id === id); if (level) announce(level); },
    /** A level is loading: Start waits. */
    busy(on: boolean) { document.body.classList.toggle('busy', on); },
    /** Can this browser enter VR? Start says which it will do. */
    vr(supported: boolean) {
      vr = supported; start.disabled = false; pixelLabel(start, 'Clean Your Inbox', 3, '#14121a'); start.title = supported ? 'Enter VR' : 'Play on this screen'; here.hidden = !supported;
      status.textContent = supported ? '' : window.isSecureContext ? 'Playing on this screen. Open this page in a headset browser for VR.' : 'VR needs HTTPS or localhost. Playing on this screen.';
    },
  };
}

const NAME_W = 560, NAME_H = 120;
/** The words of a name laid out in lines at a pixel size. */
function layName(name: string, cell: number) {
  const lines: string[] = []; let line = '';
  for (const word of name.toUpperCase().split(' ')) { const next = line ? `${line} ${word}` : word; if (!line || PixelFont.widthCells(next) * cell <= NAME_W - 8) line = next; else { lines.push(line); line = word; } }
  lines.push(line);
  return lines;
}
/** The biggest pixel size a name fits on a card at, on two lines at most. */
function nameCell(name: string) {
  let cell = 8;
  const bad = (lines: string[]) => lines.length > 2 || lines.some(l => PixelFont.widthCells(l) * cell > NAME_W - 8) || lines.length * (PixelFont.Rows + 3) * cell > NAME_H;
  while (cell > 2 && bad(layName(name, cell))) cell--;
  return cell;
}
/** A level's name on its card, in the game's pixel letters: white with a dark drop. */
function drawName(canvas: HTMLCanvasElement, name: string, cell: number) {
  const g = canvas.getContext('2d'); if (!g) return;
  const w = canvas.width, h = canvas.height, lines = layName(name, cell);
  g.clearRect(0, 0, w, h);
  const tall = (PixelFont.Rows + 3) * cell, top0 = h - lines.length * tall + 3 * cell, drop = Math.max(2, Math.round(cell * 0.45));
  lines.forEach((line, i) => {
    const top = top0 + i * tall;
    g.fillStyle = 'rgba(0,0,0,.75)'; PixelFont.cells(line, 4, top + drop, cell, (x, y, cw, ch) => g.fillRect(x, y, cw, ch));
    g.fillStyle = '#ffffff'; PixelFont.cells(line, 4, top, cell, (x, y, cw, ch) => g.fillRect(x, y, cw, ch));
  });
}

/**
 * A button's words in the game's pixel letters: a canvas at twice the size it is shown, `cell` CSS
 * pixels to a font pixel, with a one-pixel drop under it. The words stay the button's name for screen readers.
 */
export function pixelLabel(button: HTMLElement, text: string, cell: number, colour: string) {
  const upper = text.toUpperCase(), scale = 2, c = cell * scale, drop = Math.max(2, Math.round(c * 0.5));
  const canvas = document.createElement('canvas');
  canvas.width = PixelFont.width(upper, c) + 2; canvas.height = PixelFont.Rows * c + drop;
  canvas.style.width = `${canvas.width / scale}px`; canvas.style.height = `${canvas.height / scale}px`;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = colour === '#ffffff' ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.35)'; PixelFont.cells(upper, 1, drop, c, (x, y, w, h) => g.fillRect(x, y, w, h));
    g.fillStyle = colour; PixelFont.cells(upper, 1, 0, c, (x, y, w, h) => g.fillRect(x, y, w, h));
  }
  button.setAttribute('aria-label', text); button.replaceChildren(canvas);
}
/** A gear for Settings, drawn in pixels to go with the pixel words. */
function drawGear(canvas: HTMLCanvasElement) {
  const rows = ['...##...', '.#.##.#.', '.######.', '###..###', '###..###', '.######.', '.#.##.#.', '...##...'], cell = 2 * 2;
  canvas.width = canvas.height = rows.length * cell; canvas.style.width = canvas.style.height = `${(rows.length * cell) / 2}px`;
  const g = canvas.getContext('2d'); if (!g) return;
  g.fillStyle = '#ffffff';
  rows.forEach((row, y) => [...row].forEach((on, x) => { if (on === '#') g.fillRect(x * cell, y * cell, cell, cell); }));
}

/** A loop on its side, like Meta's, in pixels, in the chosen level's colour (a little lighter on the left). */
function drawLoop(canvas: HTMLCanvasElement, colour: string) {
  const rows = [
    '..###.......###..',
    '.#...#.....#...#.',
    '#.....#...#.....#',
    '#......#.#......#',
    '#.......#.......#',
    '#......#.#......#',
    '#.....#...#.....#',
    '.#...#.....#...#.',
    '..###.......###..',
  ];
  const cell = 2 * 2, w = rows[0].length;
  canvas.width = w * cell; canvas.height = rows.length * cell;
  canvas.style.width = `${(w * cell) / 2}px`; canvas.style.height = `${(rows.length * cell) / 2}px`;
  const g = canvas.getContext('2d'); if (!g) return;
  const hex = colour.replace('#', ''), right = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)), left = right.map(v => Math.round(v + (255 - v) * 0.45));
  g.clearRect(0, 0, canvas.width, canvas.height);
  rows.forEach((row, y) => [...row].forEach((on, x) => {
    if (on !== '#') return;
    const t = x / (w - 1), c = left.map((v, i) => Math.round(v + (right[i] - v) * t));
    g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; g.fillRect(x * cell, y * cell, cell, cell);
  }));
}

/** The chosen card's badge: a check mark in pixels, dark on the level's colour. */
function drawCheck(canvas: HTMLCanvasElement) {
  const rows = ['.......#', '......##', '#....##.', '##..##..', '.####...', '..##....'], cell = 3 * 2;
  canvas.width = rows[0].length * cell; canvas.height = rows.length * cell;
  canvas.style.width = `${canvas.width / 2}px`; canvas.style.height = `${canvas.height / 2}px`;
  const g = canvas.getContext('2d'); if (!g) return;
  g.fillStyle = '#14121a';
  rows.forEach((row, y) => [...row].forEach((on, x) => { if (on === '#') g.fillRect(x * cell, y * cell, cell, cell); }));
}
