import { pixelLabel } from './home';
import { uiSound } from './uisound';

/**
 * Video, top left beside the mic (2026-11-15: "add a video button next to mic - play icon and video / then that would a pop up with
 * the video embed to play / so it can be watched on quest"). The demo video (the site's `demoVideo`, app/_site/content.ts) from
 * YouTube's no-cookie player, made on open and removed on close, so it stops; the game's music is silent while it is open.
 */
const VIDEO = '7igom3vHeBk';

let open = false;
/** The video card is open (main.ts: the music steps out). */
export const videoOpen = () => open;

export function bindVideoCard() {
  const button = document.getElementById('open-video') as HTMLButtonElement | null, dialog = document.getElementById('video') as HTMLDialogElement | null;
  if (!button || !dialog) return;
  const frame = document.getElementById('video-frame')!;
  drawPlay(button.querySelector<HTMLCanvasElement>('canvas.play'));
  const word = button.querySelector<HTMLElement>('.video-word');
  if (word) pixelLabel(word, 'Video', 2, '#ffffff');
  button.setAttribute('aria-label', 'Watch the video');

  button.addEventListener('click', () => {
    uiSound('confirm');
    const player = document.createElement('iframe');
    player.src = `https://www.youtube-nocookie.com/embed/${VIDEO}?autoplay=1&rel=0&playsinline=1`;
    player.title = 'Inbox Zero: the demo video';
    player.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    player.allowFullscreen = true;
    frame.replaceChildren(player);
    open = true;
    dialog.showModal();
  });
  document.getElementById('video-close')!.addEventListener('click', () => { uiSound('back'); dialog.close(); });
  dialog.addEventListener('click', e => {
    const box = dialog.getBoundingClientRect();
    if (e.target === dialog && (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom)) dialog.close();
  });
  // (Esc or Close: the player goes, so the video stops, and the music comes back)
  dialog.addEventListener('close', () => { frame.replaceChildren(); open = false; });
}

/** A play triangle in pixels, white, the height of the pixel words. */
function drawPlay(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const rows = ['#....', '##...', '###..', '####.', '###..', '##...', '#....'], cell = 4;
  canvas.width = 5 * cell; canvas.height = rows.length * cell; canvas.style.width = `${(5 * cell) / 2}px`; canvas.style.height = `${(rows.length * cell) / 2}px`;
  const g = canvas.getContext('2d'); if (!g) return;
  g.fillStyle = '#ffffff';
  rows.forEach((row, y) => [...row].forEach((on, x) => { if (on === '#') g.fillRect(x * cell, y * cell, cell, cell); }));
}
