import type { Email } from '../mail/emails';
import { H, W, type CardPainter } from './cards';

/**
 * What an email looks like in Inferno: BURN AFTER READING on cream paper, singed all round its
 * edge; the junk that shouts is HIGHLY FLAMMABLE, taped in red and black and already smouldering.
 * The words are plain, dark and large: the fire is at the edges, never under the writing.
 * (Its own file, with its own copies of cards.ts' small helpers, as spacecard.ts has: levels being
 * made at the same time do not meet in one file.)
 */
const SANS = '"Helvetica Neue", Arial, Roboto, "Noto Sans", sans-serif';
const INK = '#1c130f', SOFT = '#6a584a', BRICK = '#a82a17';

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
  return lines;
}
function fit(g: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (g.measureText(text).width <= maxWidth) return text;
  let t = text; while (t.length > 1 && g.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}
/** The words under the subject: whatever this kind of email has to say for itself. */
function gist(email: Email) {
  if (email.body) return email.body;
  const parts: string[] = [];
  if (email.amount) parts.push(email.due ? `${email.amount} · ${email.due}` : email.amount);
  if (email.snippet) parts.push(email.snippet);
  if (!parts.length && email.items?.length) parts.push(email.items.slice(0, 3).join(' · '));
  return parts.join('. ') || 'No preview.';
}
function envelope(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, colour: string, line: number) {
  g.strokeStyle = colour; g.lineWidth = line; g.lineJoin = 'miter';
  g.strokeRect(x, y, w, h);
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + w / 2, y + h * 0.56); g.lineTo(x + w, y); g.stroke();
}
/** A flame, `s` from its middle to its tip: an outer tongue and a paler heart. */
function flame(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, outer: string, heart: string) {
  g.save(); g.translate(cx, cy); g.scale(s, s);
  g.fillStyle = outer; g.beginPath();
  g.moveTo(0, -1); g.bezierCurveTo(0.15, -0.55, 0.75, -0.25, 0.7, 0.35); g.bezierCurveTo(0.68, 0.8, 0.3, 1, 0, 1);
  g.bezierCurveTo(-0.3, 1, -0.7, 0.8, -0.7, 0.3); g.bezierCurveTo(-0.7, 0, -0.5, -0.2, -0.42, -0.42);
  g.bezierCurveTo(-0.3, -0.2, -0.2, -0.1, -0.12, -0.12); g.bezierCurveTo(-0.25, -0.5, -0.1, -0.8, 0, -1); g.fill();
  g.fillStyle = heart; g.beginPath();
  g.moveTo(0.02, 0.08); g.bezierCurveTo(0.36, 0.42, 0.3, 0.9, 0, 0.9); g.bezierCurveTo(-0.3, 0.9, -0.34, 0.45, 0.02, 0.08); g.fill();
  g.restore();
}
/** One burn on the paper: black at its middle, through brown, to a ring of ember (brighter on the hot ones), to nothing. */
function scorch(g: CanvasRenderingContext2D, x: number, y: number, r: number, hot: boolean) {
  const burn = g.createRadialGradient(x, y, r * 0.05, x, y, r);
  burn.addColorStop(0, 'rgba(22,10,5,.96)'); burn.addColorStop(0.42, 'rgba(70,30,10,.82)');
  burn.addColorStop(0.66, hot ? 'rgba(255,120,24,.6)' : 'rgba(150,72,20,.5)'); burn.addColorStop(1, 'rgba(190,110,40,0)');
  g.fillStyle = burn; g.fillRect(x - r, y - r, r * 2, r * 2);
}

export const infernoCard: CardPainter = (g, email, hazard) => {
  const random = seeded(email ? email.subject : 'title');
  const paper = hazard ? '#f4dfb8' : '#f3e6cc';
  g.fillStyle = paper; g.fillRect(0, 0, W, H);
  // old paper: foxed, and browned towards its edges by the heat
  for (let i = 0; i < 20; i++) { const bx = random() * W, by = random() * H, r = 40 + random() * 110; const stain = g.createRadialGradient(bx, by, 0, bx, by, r); stain.addColorStop(0, 'rgba(170,120,60,.10)'); stain.addColorStop(1, 'rgba(170,120,60,0)'); g.fillStyle = stain; g.fillRect(bx - r, by - r, r * 2, r * 2); }
  const toasted = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.64); toasted.addColorStop(0, 'rgba(140,80,30,0)'); toasted.addColorStop(1, hazard ? 'rgba(150,70,20,.5)' : 'rgba(140,80,30,.38)');
  g.fillStyle = toasted; g.fillRect(0, 0, W, H);
  if (hazard) {
    // warning tape, top and bottom: red and black
    for (const y of [0, H - 40]) { g.fillStyle = '#e2371c'; g.fillRect(0, y, W, 40); g.fillStyle = '#17110f'; for (let x = -40; x < W; x += 64) { g.beginPath(); g.moveTo(x, y + 40); g.lineTo(x + 32, y + 40); g.lineTo(x + 72, y); g.lineTo(x + 40, y); g.closePath(); g.fill(); } }
  }
  // singed all round: bites out of the edge, bigger at the corners; never in as far as the writing
  const bites = hazard ? 34 : 24;
  for (let i = 0; i < bites; i++) {
    const along = random(), r = (hazard ? 34 : 26) + random() * (hazard ? 46 : 36), edge = Math.floor(random() * 4);
    const x = edge === 0 ? -r * 0.25 : edge === 1 ? W + r * 0.25 : along * W, y = edge === 2 ? -r * 0.25 : edge === 3 ? H + r * 0.25 : along * H;
    scorch(g, x, y, r, hazard);
  }
  for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) scorch(g, x, y, 60 + random() * 36, hazard);      // (a little smaller since 2026-11-13: sender and sort of mail are in the top corners)
  const top = hazard ? 56 : 30;
  if (email) {
    // (no flame at the bottom right any more: 2026-11-13, "drop icon bottom right in email"; no BURN AFTER READING heading either)
    const x = 90, y = top + 30, foot = H - (hazard ? 70 : 52);
    return { box: { x, y, w: W - 2 * x, h: foot - y }, family: SANS, text: INK, dim: '#4a3a2e', accent: () => (hazard ? '#c1260f' : BRICK), onAccent: paper, ok: '#3d6b24', fail: '#c1260f' };
  }
  // the title card (not shown since 2026-11-11)
  g.textAlign = 'left'; g.textBaseline = 'middle';
  flame(g, 122, top + 76, 54, hazard ? '#e2371c' : BRICK, hazard ? '#ffc23d' : paper);
  g.fillStyle = hazard ? '#c1260f' : BRICK; g.font = `800 60px ${SANS}`;
  g.fillText('BURN AFTER READING', 200, top + 80);
  g.fillStyle = SOFT; g.fillRect(84, top + 160, W - 168, 4);
  g.textAlign = 'center'; g.fillStyle = INK;
  g.font = `800 70px ${SANS}`; g.fillText('INBOX ZERO', W / 2, top + 236);
  g.font = `600 42px ${SANS}`; g.fillStyle = SOFT; g.fillText('Inferno', W / 2, top + 300);
  g.fillStyle = SOFT; g.fillRect(84, top + 344, W - 168, 4);
  g.fillStyle = INK; g.font = `700 44px ${SANS}`; g.fillText('burn this one to begin', W / 2, top + 404);
  g.font = `400 30px ${SANS}`; g.fillStyle = SOFT; g.fillText('hold the trigger · left hand: take one and throw it, to keep it', W / 2, top + 462);
};
