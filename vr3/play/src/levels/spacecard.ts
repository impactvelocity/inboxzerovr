import type { Email } from '../mail/emails';
import { Categories } from '../mail/emails';
import * as PixelFont from '../mail/pixelFont';
import { H, W, type CardPainter } from './cards';

/**
 * What an email looks like in Super Space: a pale data slate, its kind of mail in the bar across its
 * head (it said INCOMING TRANSMISSION beside a planet until 2026-11-12: "drop the plane icon ... and
 * instead of incoming transmission, just make that the label - centered"), in the
 * saber's own colours (ivory, plum, magenta, cyan). Pale, because the sky behind it is dark and the
 * mail is what is to be looked at; the words are plain and large, and only the labels are in pixels.
 * (Its own file, with its own copies of cards.ts' small helpers, so that levels being made at the
 * same time do not meet in one file.)
 */
const SANS = '"Helvetica Neue", Arial, Roboto, "Noto Sans", sans-serif';
const INK = '#1b1440', SOFT = '#4a4478', PLUM = '#4a1c5e', CYAN = '#00c8e6', MAGENTA = '#e229a6', IVORY = '#f6f1ff';

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
const BAR = 92, EDGE = 12;
export const spaceCard: CardPainter = (g, email) => {
  const random = seeded(email ? email.subject : 'title');
  // the slate: a plum rim, a pale face
  g.fillStyle = PLUM; g.fillRect(0, 0, W, H);
  const face = g.createLinearGradient(0, 0, 0, H); face.addColorStop(0, IVORY); face.addColorStop(1, '#ddd6fb');
  g.fillStyle = face; g.fillRect(EDGE, EDGE, W - 2 * EDGE, H - 2 * EDGE);
  // a few faint stars in it, off to the sides where the words are not
  for (let i = 0; i < 26; i++) {
    const side = random() < 0.5, x = side ? EDGE + 8 + random() * 26 : W - EDGE - 34 + random() * 26, y = BAR + 30 + random() * (H - BAR - 90), s = 3 + Math.floor(random() * 2) * 3;
    g.fillStyle = `rgba(122,96,220,${0.10 + random() * 0.16})`; g.fillRect(Math.round(x / 3) * 3, Math.round(y / 3) * 3, s, s);
  }
  // the head of it
  const bar = g.createLinearGradient(0, 0, W, 0); bar.addColorStop(0, '#5a2370'); bar.addColorStop(0.55, PLUM); bar.addColorStop(1, '#2d1a66');
  g.fillStyle = bar; g.fillRect(EDGE, EDGE, W - 2 * EDGE, BAR - EDGE);
  const line = g.createLinearGradient(0, 0, W, 0); line.addColorStop(0, MAGENTA); line.addColorStop(1, CYAN);
  g.fillStyle = line; g.fillRect(EDGE, BAR - 6, W - 2 * EDGE, 6);
  // corner marks, as on a sight
  g.fillStyle = CYAN;
  for (const [cx, cy, sx, sy] of [[EDGE, H - EDGE, 1, -1], [W - EDGE, H - EDGE, -1, -1]] as const) { g.fillRect(cx + (sx > 0 ? 14 : -62), cy - 20, 48, 6); g.fillRect(cx + (sx > 0 ? 14 : -20), cy + sy * 62, 6, 48); }

  if (!email) {
    pixel(g, 'INBOX ZERO', W / 2, 250, 13, INK, 'center');
    g.fillStyle = line; g.fillRect(W / 2 - 240, 316, 480, 6);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = PLUM;
    g.font = `800 50px ${SANS}`; g.fillText('Super Space', W / 2, 380);
    g.font = `600 38px ${SANS}`; g.fillStyle = SOFT; g.fillText('cut this one to begin', W / 2, 452);
    return;
  }
  // what sort of mail it is: the bar's own words, in the middle of it
  pixel(g, Categories.label(email.category), W / 2, 51, 5, IVORY, 'center');

  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  const left = 76, wide = W - 2 * left;
  g.fillStyle = MAGENTA; g.fillRect(left, 132, 10, 50);
  g.fillStyle = INK; g.font = `800 56px ${SANS}`; g.fillText(fit(g, email.from, wide - 34), left + 30, 178);
  g.font = `800 52px ${SANS}`;
  const subject = wrap(g, email.subject, wide, 2);
  subject.forEach((text, i) => g.fillText(text, left, 268 + i * 62));
  const top = 268 + subject.length * 62;
  g.fillStyle = line; g.globalAlpha = 0.75; g.fillRect(left, top - 34, wide, 5); g.globalAlpha = 1;
  g.fillStyle = SOFT; g.font = `400 38px ${SANS}`;
  wrap(g, gist(email), wide, Math.max(1, Math.floor((H - 76 - top) / 50))).forEach((text, i) => g.fillText(text, left, top + 26 + i * 50));
  // along the foot: the signal it came in on, a row of pixels different for every email
  for (let i = 0; i < 34; i++) { const tall = 6 + Math.floor(random() * 4) * 6; g.fillStyle = i % 9 === 4 ? MAGENTA : 'rgba(74,28,94,.42)'; g.fillRect(W / 2 - 204 + i * 12, H - EDGE - 20 - tall, 8, tall); }
};
