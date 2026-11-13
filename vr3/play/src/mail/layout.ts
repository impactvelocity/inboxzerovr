import { Categories, type Category, type Email } from './emails';
import * as PixelFont from './pixelFont';

/**
 * The one layout every level's email has (2026-11-13, asked for: "make all emails in all the levels
 * be positioned / laid out like kyoto ... so its all consistent, and each level just has the
 * decoration and effects"). A level paints its paper, frame and marks, and hands back a CardStyle:
 * where the words may go, and in what family and colours. This file sets the words.
 *
 *   top left     who it is from
 *   top right    what sort of mail it is
 *   then         the subject, its lines balanced (CSS's text-wrap: pretty)
 *   then         the email itself, left aligned: larger if it is short, smaller if it is long,
 *                never under BODY_MIN. Past that it scrolls (see Scroll), slowly, while it is up.
 *
 * A receipt, a bill and a delivery put their own thing where the message would be (the amount,
 * when it is due, how far the parcel has got); they are the same in every level too.
 * Everything is in card units (1024 by 640), on a context already scaled to them.
 */
export interface CardStyle {
  /** Where the words go: inside the level's decoration. */
  box: { x: number; y: number; w: number; h: number };
  /** The family of everything, and of the subject if that has its own (and its weight). */
  family: string; display?: string; displayWeight?: string;
  /** The subject, the sender and amounts; and the message. */
  text: string; dim: string;
  /** The colour of the tag, the sender's mark and what is filled in, by sort of mail; and of what is written on it. */
  accent: (category: Category) => string; onAccent: string;
  /** PAID; and a bill or a delivery that went wrong. */
  ok: string; fail: string;
  /** No round mark with the sender's initial (the level has its own mark there), and how far the sender's name starts from the box's left. */
  avatar?: boolean; headInset?: number;
}
/**
 * A message too long for its card at the smallest size: where its window is on the card, how tall
 * all of it is, and how to paint the whole of it on a strip of its own (`w` wide, `tall` high, in
 * card units). The strip is not a picture: red is how much of the message's ink is there, green how
 * much of the bold ink, and the letter's shader lays those on the card and moves them (letters.ts).
 */
export interface Scroll {
  x: number; y: number; w: number; h: number; tall: number;
  inks: [string, string];
  paint(g: CanvasRenderingContext2D): void;
}
/** The message is never smaller than this, and no larger than BODY_MAX; a scrolling one is at most STRIP_TALL high. */
export const BODY_MIN = 32, BODY_MAX = 50, STRIP_TALL = 900;      // (36 to 60 until 2026-11-13: "just a bit smaller in all the parts")
/** How far in from the level's box the words sit, across and down (2026-11-13: "more padding ... so text is more inside"). */
export const PAD_X = 34, PAD_Y = 22;

function fit(g: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (g.measureText(text).width <= maxWidth) return text;
  let t = text; while (t.length > 1 && g.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}
function wrap(g: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = []; let line = '';
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width <= maxWidth || !line) line = next; else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}
/** Wrapped, at most `maxLines`, the lines made as even as they will go: none is left with one word. */
function balance(g: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  let lines = wrap(g, text, maxWidth);
  if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = fit(g, `${lines[maxLines - 1]} …`, maxWidth); return lines; }
  if (lines.length < 2) return lines;
  let low = maxWidth / lines.length, high = maxWidth;
  for (let i = 0; i < 12; i++) { const mid = (low + high) / 2; if (wrap(g, text, mid).length <= lines.length) high = mid; else low = mid; }
  return wrap(g, text, Math.ceil(high) + 1);
}
function pixel(g: CanvasRenderingContext2D, text: string, x: number, yMid: number, cell: number, colour: string, align: 'left' | 'center' | 'right' = 'left', maxWidth = 0) {
  const upper = text.toUpperCase();
  while (maxWidth > 0 && cell > 2 && PixelFont.width(upper, cell) > maxWidth) cell--;
  const wide = PixelFont.width(upper, cell);
  const left = Math.round(align === 'center' ? x - wide / 2 : align === 'right' ? x - wide : x);
  g.fillStyle = colour;
  PixelFont.cells(upper, left, Math.round(yMid - PixelFont.Rows * cell / 2), cell, (cx, cy, cw, ch) => g.fillRect(cx, cy, cw, ch));
  return wide;
}
/** A box with a faint fill and a line round it, in one colour. */
function pill(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, colour: string, line = 3) {
  g.fillStyle = colour; g.globalAlpha = 0.13; g.fillRect(x, y, w, h); g.globalAlpha = 1;
  g.strokeStyle = colour; g.lineWidth = line; g.lineJoin = 'miter'; g.strokeRect(x + line / 2, y + line / 2, w - line, h - line);
}
interface Para { text: string; bold: boolean }
interface Line { text: string; bold: boolean; y: number }
/** What the message is: its own words; for a newsletter with none, its headline and its sections, all set alike. */
function message(email: Email): Para[] {
  const split = (text: string, bold = false) => text.split(/\n+/).map(t => t.trim()).filter(Boolean).map(text => ({ text, bold }));
  if (email.body) return split(email.body);
  if (email.items?.length) return email.items.flatMap(item => split(item));      // (its headline is not bold or another colour since 2026-11-13: a newsletter reads like any other message)
  return split(email.snippet ?? '');
}
const bodyFont = (style: CardStyle, size: number, bold: boolean) => `${bold ? '700' : '400'} ${size}px ${style.family}`;
/** The paragraphs set at one size, `w` wide: each line and its baseline from the top, and how tall it all is. */
function set(g: CanvasRenderingContext2D, style: CardStyle, paras: Para[], w: number, size: number) {
  const step = Math.round(size * 1.3), lines: Line[] = [];
  let y = size * 0.82;
  paras.forEach((para, i) => {
    if (i) y += step * 0.38;
    g.font = bodyFont(style, size, para.bold);
    for (const text of wrap(g, para.text, w)) { lines.push({ text, bold: para.bold, y }); y += step; }
  });
  return { lines, tall: lines.length ? y - step + size * 0.3 : 0, step };
}
/**
 * The message in the room it has (w by h): the largest size from `max` down to `min` at which all
 * of it fits. If it does not fit even at `min`, it is set at `min` and is taller than h.
 */
function sized(g: CanvasRenderingContext2D, style: CardStyle, paras: Para[], w: number, h: number, max: number, min: number) {
  for (let size = max; size > min; size -= 2) { const made = set(g, style, paras, w, size); if (made.tall <= h) return { ...made, size }; }
  return { ...set(g, style, paras, w, min), size: min };
}
function draw(g: CanvasRenderingContext2D, style: CardStyle, lines: Line[], size: number, x: number, y: number, plain: string, bold: string) {
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  for (const line of lines) { g.font = bodyFont(style, size, line.bold); g.fillStyle = line.bold ? bold : plain; g.fillText(line.text, x, y + line.y); }
}
/** Cut to what fits in `h`, the last line ending in "…". */
function cut(g: CanvasRenderingContext2D, style: CardStyle, made: { lines: Line[]; tall: number; size: number }, w: number, h: number) {
  if (made.tall <= h) return made;
  const lines = made.lines.filter(line => line.y + made.size * 0.3 <= h);
  if (!lines.length) lines.push(made.lines[0]);
  const last = lines[lines.length - 1];
  g.font = bodyFont(style, made.size, last.bold);
  lines[lines.length - 1] = { ...last, text: fit(g, `${last.text} …`, w) };
  return { ...made, lines, tall: last.y + made.size * 0.3 };
}
/** Words under something (an amount, a parcel's progress): as large as fits, cut if they will not. */
function note(g: CanvasRenderingContext2D, style: CardStyle, text: string, x: number, y: number, w: number, h: number, colour: string) {
  if (!text || h < 30) return;
  const made = cut(g, style, sized(g, style, [{ text, bold: false }], w, h, 44, 30), w, h);
  draw(g, style, made.lines, made.size, x, y, colour, colour);
}

/**
 * Sets an email on its card. `scroll`: a message too long for it may scroll (the result says where,
 * and paints its strip); if not, it is cut short with "…" (a card that will not be read: the day's
 * mail swirling at the end).
 */
export function layoutEmail(g: CanvasRenderingContext2D, email: Email, style: CardStyle, scroll = true): Scroll | null {
  const b = { x: style.box.x + PAD_X, y: style.box.y + PAD_Y, w: style.box.w - 2 * PAD_X, h: style.box.h - 2 * PAD_Y }, right = b.x + b.w, bottom = b.y + b.h, accent = style.accent(email.category);
  g.save(); g.globalAlpha = 1;

  // ---- top right: what sort of mail it is
  // (small, and only its name, since 2026-11-13: "its not as important, but still visible, no icon to that, just text")
  // (then a size up, and no box round it: just the word, flush right)
  const label = Categories.label(email.category), TAG = 48, mid = b.y + TAG / 2;
  const tagWide = pixel(g, label, right, mid, 4, accent, 'right');

  // ---- top left: who it is from
  let left = b.x + (style.headInset ?? 0);
  g.textBaseline = 'middle';
  if (style.avatar !== false) {
    g.fillStyle = accent; g.beginPath(); g.arc(left + 23, mid, 23, 0, 7); g.fill();
    g.fillStyle = style.onAccent; g.textAlign = 'center'; g.font = `700 26px ${style.family}`; g.fillText((email.from.trim()[0] ?? '?').toUpperCase(), left + 23, mid + 2);
    left += 60;
  }
  g.textAlign = 'left'; g.fillStyle = style.text; g.font = `700 34px ${style.family}`;
  g.fillText(fit(g, email.from, right - tagWide - 28 - left), left, mid + 2);

  // ---- the subject: two lines at most, balanced; a long one a size down
  g.textBaseline = 'alphabetic';
  const display = (size: number) => `${style.displayWeight ?? '800'} ${size}px ${style.display ?? style.family}`;
  let size = 52; g.font = display(size);
  if (wrap(g, email.subject, b.w).length > 2) { size = 46; g.font = display(size); }
  const subject = balance(g, email.subject, b.w, 2), step = Math.round(size * 1.14);
  let y = b.y + TAG + 40 + size * 0.8;      // (gaps: header to subject 24 then 40, subject to body 22 then 36, since 2026-11-13: "a bit more gap")
  g.fillStyle = style.text;
  subject.forEach((line, i) => g.fillText(line, b.x, y + i * step));
  y += (subject.length - 1) * step + size * 0.28 + 36;
  const room = bottom - y;

  // ---- and what it has to say
  let result: Scroll | null = null;
  const amount = (pillText: string, pillColour: string, cell: number) => {
    let tall = Math.max(56, Math.min(128, Math.round(room * 0.5)));
    g.fillStyle = style.text; g.textAlign = 'left';
    // (as big as leaves room beside it for the tag: a wide family, or a long amount, is set smaller, never cut)
    for (g.font = `800 ${tall}px ${style.family}`; tall > 48 && g.measureText(email.amount ?? '').width > b.w * 0.56; g.font = `800 ${tall}px ${style.family}`) tall -= 4;
    const shown = fit(g, email.amount ?? '', b.w * 0.62), wide = g.measureText(shown).width;
    g.fillText(shown, b.x - tall * 0.04, y + tall * 0.8);
    if (pillText) {
      const most = right - (b.x + wide + 36) - 48, across = Math.min(PixelFont.width(pillText.toUpperCase(), cell), most) + 48;
      pill(g, right - across, y + tall * 0.44 - 27, across, 54, pillColour, 3);
      pixel(g, pillText, right - across / 2, y + tall * 0.44, cell, pillColour, 'center', most);
    }
    note(g, style, email.snippet ?? '', b.x, y + tall + 10, b.w, bottom - (y + tall + 10), style.dim);
  };
  if (email.category === 'Receipt' && email.amount) amount('PAID', style.ok, 5);
  else if (email.category === 'Bill' && email.amount) amount(email.due ?? '', email.failed ? style.fail : accent, 4);
  else if (email.category === 'Tracking') {
    // how far the parcel has got: four stops on a line, filled up to where it is
    const stages = ['ORDERED', 'SHIPPED', 'ON ITS WAY', 'DELIVERED'], x0 = b.x + 70, x1 = right - 70, gap = (x1 - x0) / 3, row = y + 34;
    const now = email.failed ? style.fail : accent, at = Math.max(0, Math.min(3, email.step));
    let cell = 4; while (cell > 3 && PixelFont.width('ON ITS WAY', cell) > gap - 30) cell--;      // (one size for all four names, with air between them)
    g.fillStyle = style.dim; g.globalAlpha = 0.35; g.fillRect(x0, row - 3, x1 - x0, 6); g.globalAlpha = 1;
    g.fillStyle = accent; g.fillRect(x0, row - 3, gap * at, 6);
    stages.forEach((stage, i) => {
      const x = x0 + gap * i;
      if (i < at) { g.fillStyle = accent; g.fillRect(x - 14, row - 14, 28, 28); }
      else if (i === at) { pill(g, x - 22, row - 22, 44, 44, now, 5); g.fillStyle = now; g.fillRect(x - 9, row - 9, 18, 18); }
      else { g.globalAlpha = 0.6; g.strokeStyle = style.dim; g.lineWidth = 3; g.strokeRect(x - 12, row - 12, 24, 24); g.globalAlpha = 1; }
      g.globalAlpha = i === at ? 1 : 0.8; pixel(g, stage, x, row + 50, cell, i === at ? now : style.dim, 'center'); g.globalAlpha = 1;
    });
    note(g, style, email.snippet ?? '', b.x, row + 90, b.w, bottom - (row + 90), email.failed ? style.fail : style.dim);
  } else {
    const paras = message(email);
    if (paras.length) {
      const made = sized(g, style, paras, b.w, room, BODY_MAX, BODY_MIN);
      if (made.tall <= room) draw(g, style, made.lines, made.size, b.x, y, style.dim, style.text);
      else if (!scroll) draw(g, style, cut(g, style, made, b.w, room).lines, made.size, b.x, y, style.dim, style.text);
      else {
        const all = cut(g, style, made, b.w, STRIP_TALL);
        result = { x: b.x, y, w: b.w, h: room, tall: all.tall, inks: [style.dim, style.text], paint: strip => draw(strip, style, all.lines, all.size, 0, 0, '#f00', '#0f0') };
      }
    }
  }
  g.restore();
  return result;
}
