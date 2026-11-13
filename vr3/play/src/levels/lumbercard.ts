import type { Email } from '../mail/emails';
import { Categories } from '../mail/emails';
import * as PixelFont from '../mail/pixelFont';
import { H, W, type CardPainter } from './cards';

/**
 * What an email looks like in LumberHack: TIMBER POST, a sheet of cream paper tacked to a board
 * of honey pine, the way a notice is nailed up in a timber yard. A barn-red band across its head,
 * iron nails at the corners, a maple-leaf postmark. Pale and warm, so that it reads against the
 * barn by day and by lamplight; the words are plain and large, and only the labels are in pixels.
 * (Its own file, with its own copies of cards.ts' small helpers, so that levels being made at the
 * same time do not meet in one file.)
 */
const SANS = '"Helvetica Neue", Arial, Roboto, "Noto Sans", sans-serif';
const INK = '#3a2414', SOFT = '#6b4a30', BARN = '#b5352a', BARN_DARK = '#7d2019', GOLD = '#f3b23a', CREAM = '#f7ead0', PINE = '#d9933f', BARK = '#6b3f1f';
/** How wide the board shows round the paper (the letter's shape stands this proud: lumber.ts). */
export const BOARD = 46;

function seeded(text: string) {
  let s = 2166136261;
  for (let i = 0; i < text.length; i++) s = Math.imul(s ^ text.charCodeAt(i), 16777619);
  return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; };
}
function wrap(g: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const lines: string[] = []; let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width <= maxWidth || !line) line = next; else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines; let last = lines[maxLines - 1];
    while (last.length > 1 && g.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines.length ? lines : [''];
}
function fit(g: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (g.measureText(text).width <= maxWidth) return text;
  let t = text; while (t.length > 1 && g.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}
function gist(email: Email) {
  if (email.body) return email.body;
  const parts: string[] = [];
  if (email.amount) parts.push(email.due ? `${email.amount} · ${email.due}` : email.amount);
  if (email.snippet) parts.push(email.snippet);
  if (!parts.length && email.items?.length) parts.push(email.items.slice(0, 3).join(' · '));
  return parts.join('. ') || 'No preview.';
}
function pixel(g: CanvasRenderingContext2D, text: string, left: number, yMid: number, cell: number, colour: string, align: 'left' | 'center' | 'right' = 'left') {
  const upper = text.toUpperCase(), wide = PixelFont.width(upper, cell);
  const x = Math.round(align === 'center' ? left - wide / 2 : align === 'right' ? left - wide : left);
  g.fillStyle = colour;
  PixelFont.cells(upper, x, Math.round(yMid - PixelFont.Rows * cell / 2), cell, (cx, cy, cw, ch) => g.fillRect(cx, cy, cw, ch));
  return wide;
}
/** A maple leaf, point up, about 2 * r tall: the same outline the leaves in the air have (../props/leaves.ts). */
const LEAF: [number, number][] = [[0, 0.5], [0.07, 0.33], [0.16, 0.37], [0.12, 0.2], [0.3, 0.3], [0.5, 0.22], [0.4, 0.1], [0.46, 0.04], [0.3, -0.04], [0.4, -0.2], [0.22, -0.18], [0.05, -0.24], [0.02, -0.48]];
function maple(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, turn: number, colour: string) {
  g.save(); g.translate(cx, cy); g.rotate(turn); g.scale(r * 2, -r * 2); g.fillStyle = colour;
  g.beginPath();
  LEAF.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  for (let i = LEAF.length - 1; i >= 0; i--) g.lineTo(-LEAF[i][0], LEAF[i][1]);
  g.closePath(); g.fill(); g.restore();
}
/** An iron nail head, struck a little off true. */
function nail(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const iron = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r); iron.addColorStop(0, '#8d8a8c'); iron.addColorStop(0.6, '#4b4749'); iron.addColorStop(1, '#262325');
  g.fillStyle = 'rgba(40,20,8,.35)'; g.beginPath(); g.arc(x + 2, y + 3, r + 1, 0, 7); g.fill();
  g.fillStyle = iron; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
}

const BAR = 84;
export const lumberCard: CardPainter = (g, email) => {
  const random = seeded(email ? email.subject : 'title');
  // the board: honey pine, its grain running along it, a knot or two, darker bark at its edge
  const wood = g.createLinearGradient(0, 0, 0, H); wood.addColorStop(0, '#e3a04a'); wood.addColorStop(0.5, PINE); wood.addColorStop(1, '#c47f33');
  g.fillStyle = wood; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 64; i++) {
    const y = random() * H, bend = random() * 10 - 5;
    g.strokeStyle = `rgba(${random() < 0.5 ? '120,66,22' : '255,214,140'},${0.10 + random() * 0.16})`; g.lineWidth = 1.5 + random() * 2.5;
    g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y + bend, W * 0.7, y - bend, W, y + random() * 8 - 4); g.stroke();
  }
  for (const [kx, ky] of [[0.07 + random() * 0.1, 0.03 + random() * 0.02], [0.72 + random() * 0.2, 0.965 + random() * 0.015]] as const) {
    for (let r = 20; r > 3; r -= 5) { g.strokeStyle = `rgba(110,58,20,${0.2 + (20 - r) * 0.025})`; g.lineWidth = 2.5; g.beginPath(); g.ellipse(kx * W, ky * H, r * 1.5, r * 0.7, 0, 0, 7); g.stroke(); }
  }
  g.strokeStyle = BARK; g.lineWidth = 10; g.strokeRect(5, 5, W - 10, H - 10);
  g.strokeStyle = 'rgba(255,224,160,.55)'; g.lineWidth = 3; g.strokeRect(12, 12, W - 24, H - 24);
  // the paper tacked to it, with a soft shadow under its foot
  const x0 = BOARD, y0 = BOARD, pw = W - 2 * BOARD, ph = H - 2 * BOARD;
  g.fillStyle = 'rgba(70,36,10,.38)'; g.fillRect(x0 + 5, y0 + 7, pw, ph);
  const paper = g.createLinearGradient(0, y0, 0, y0 + ph); paper.addColorStop(0, CREAM); paper.addColorStop(1, '#ecd9b4');
  g.fillStyle = paper; g.fillRect(x0, y0, pw, ph);
  // a few flecks in it, as in rough paper
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(140,96,46,${0.05 + random() * 0.09})`; g.fillRect(x0 + random() * pw, y0 + BAR + random() * (ph - BAR), 2 + random() * 4, 1.5 + random() * 2); }
  // its head: a barn-red band, a gold line under it
  const band = g.createLinearGradient(0, y0, 0, y0 + BAR); band.addColorStop(0, '#c9433a'); band.addColorStop(1, BARN);
  g.fillStyle = band; g.fillRect(x0, y0, pw, BAR);
  g.fillStyle = BARN_DARK; g.fillRect(x0, y0 + BAR - 10, pw, 4);
  g.fillStyle = GOLD; g.fillRect(x0, y0 + BAR - 6, pw, 6);
  maple(g, x0 + 54, y0 + 40, 25, -0.25, GOLD);
  pixel(g, 'TIMBER POST', x0 + 100, y0 + 40, 6, CREAM);
  // four nails
  for (const [nx, ny] of [[x0 + 16, y0 + 16], [x0 + pw - 16, y0 + 16], [x0 + 16, y0 + ph - 16], [x0 + pw - 16, y0 + ph - 16]]) nail(g, nx, ny, 8);

  if (!email) {
    pixel(g, 'INBOX ZERO', W / 2, 262, 13, INK, 'center');
    g.fillStyle = BARN; g.fillRect(W / 2 - 240, 326, 480, 6);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = BARN_DARK;
    g.font = `800 50px ${SANS}`; g.fillText('LumberHack', W / 2, 388);
    g.font = `600 38px ${SANS}`; g.fillStyle = SOFT; g.fillText('chop this one to begin', W / 2, 458);
    return;
  }
  // what sort of mail it is, as a tag in the band
  const label = Categories.label(email.category), tab = PixelFont.width(label, 4) + 40;
  g.fillStyle = 'rgba(60,14,10,.45)'; g.fillRect(x0 + pw - 44 - tab, y0 + 17, tab, 46);
  g.strokeStyle = GOLD; g.lineWidth = 3; g.strokeRect(x0 + pw - 44 - tab, y0 + 17, tab, 46);
  pixel(g, label, x0 + pw - 44 - tab / 2, y0 + 40, 4, '#ffe2a0', 'center');

  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  const left = x0 + 44, wide = pw - 88;
  g.fillStyle = BARN; g.fillRect(left, y0 + BAR + 30, 10, 50);
  g.fillStyle = INK; g.font = `800 54px ${SANS}`; g.fillText(fit(g, email.from, wide - 34), left + 30, y0 + BAR + 75);
  g.font = `800 50px ${SANS}`;
  const subject = wrap(g, email.subject, wide, 2);
  subject.forEach((text, i) => g.fillText(text, left, y0 + BAR + 158 + i * 60));
  const top = y0 + BAR + 158 + subject.length * 60;
  // a saw-cut rule: a line with teeth along it
  g.fillStyle = 'rgba(181,53,42,.8)'; g.fillRect(left, top - 36, wide, 4);
  for (let x = left; x < left + wide - 10; x += 20) { g.beginPath(); g.moveTo(x, top - 32); g.lineTo(x + 10, top - 24); g.lineTo(x + 20, top - 32); g.fill(); }
  g.fillStyle = SOFT; g.font = `400 37px ${SANS}`;
  wrap(g, gist(email), wide - 96, Math.max(1, Math.floor((y0 + ph - 30 - top) / 48))).forEach((text, i) => g.fillText(text, left, top + 24 + i * 48));
  // the postmark, bottom right: a ring of ink with a leaf in it, turned a little differently on every one
  const px = x0 + pw - 82, py = y0 + ph - 80, turn = random() * 0.8 - 0.4;
  g.save(); g.translate(px, py); g.rotate(turn); g.globalAlpha = 0.6;
  g.strokeStyle = BARN; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 50, 0, 7); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 40, 0, 7); g.stroke();
  g.restore();
  g.globalAlpha = 0.72; maple(g, px, py, 26, turn, BARN); g.globalAlpha = 1;
};
