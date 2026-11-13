import type { Email } from '../mail/emails';
import { Categories } from '../mail/emails';
import * as PixelFont from '../mail/pixelFont';
import { H, W, type CardPainter } from './cards';

/**
 * What an email looks like in Knockout: the front page of the evening paper, flung into the ring
 * (the user's mock-up of this level had exactly that, "THE EVENING POST" with the subject as its
 * headline). Warm newsprint, black ink, one red tab for what sort of mail it is. Who it is from
 * and the subject are big and plain; the pixel font is only on the labels.
 * (Its own file, with its own copies of cards.ts' small helpers, so that levels being made at the
 * same time do not meet in one file.)
 */
const SERIF = 'Georgia, "Noto Serif", "Times New Roman", serif';
const SANS = '"Helvetica Neue", Arial, Roboto, "Noto Sans", sans-serif';
const INK = '#1d1712', SOFT = '#5b4c3c', RULE = '#2a211a', RED = '#c3202c', PAPER = '#f6e8c8';

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
function star(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, colour: string) {
  g.fillStyle = colour; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r * 0.42 : r; g.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); }
  g.closePath(); g.fill();
}

export const knockoutCard: CardPainter = (g, email) => {
  const random = seeded(email ? email.from + email.subject : 'knockout');
  // newsprint: warm, a little darker towards its edges, with the grain of cheap paper
  const paper = g.createLinearGradient(0, 0, 0, H); paper.addColorStop(0, PAPER); paper.addColorStop(1, '#ecd9ae');
  g.fillStyle = paper; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(96,70,36,.05)';
  for (let i = 0; i < 260; i++) g.fillRect(random() * W, random() * H, 2 + random() * 5, 1.5);
  const worn = g.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, W * 0.68); worn.addColorStop(0, 'rgba(120,84,40,0)'); worn.addColorStop(1, 'rgba(120,84,40,.22)');
  g.fillStyle = worn; g.fillRect(0, 0, W, H);

  // the masthead, between rules
  g.fillStyle = RULE; g.fillRect(34, 26, W - 68, 5);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = INK;
  g.font = `900 52px ${SERIF}`; g.fillText('THE EVENING POST', W / 2, 70);
  const half = g.measureText('THE EVENING POST').width / 2;
  star(g, W / 2 - half - 44, 68, 17, RED); star(g, W / 2 + half + 44, 68, 17, RED);
  pixel(g, 'FIGHT NIGHT', 40, 70, 3, SOFT); pixel(g, 'FINAL EDITION', W - 40, 70, 3, SOFT, 'right');
  g.fillStyle = RULE; g.fillRect(34, 106, W - 68, 3); g.fillRect(34, 113, W - 68, 7);

  if (!email) {
    g.fillStyle = INK; g.font = `900 104px ${SERIF}`; g.fillText('KNOCKOUT', W / 2, 262);
    g.font = `italic 400 44px ${SERIF}`; g.fillStyle = SOFT; g.fillText('Punch this one to begin', W / 2, 372);
    g.font = `400 30px ${SANS}`; g.fillText('left hand: take one and throw it, to keep it', W / 2, 452);
    return;
  }
  g.fillStyle = RULE; g.fillRect(34, H - 30, W - 68, 5);
  // (the words are set as in every level since 2026-11-13, ../mail/layout.ts; the subject is still the headline, in the paper's own serif)
  return { box: { x: 46, y: 140, w: W - 92, h: H - 140 - 48 }, family: SANS, display: SERIF, displayWeight: '900', text: INK, dim: '#33271d', accent: () => RED, onAccent: '#fff3da', ok: '#2f6b3a', fail: RED };
};
