import { alpha, hex, hsl, Look, White, type Rgba } from './color';
import { Categories, type Category, type Email } from './emails';
import type { Painter, Surface } from './painter';
import * as PixelFont from './pixelFont';
import type { LevelLook } from './tuning';

/**
 * 2D drawing for the emails, the HUD and the buttons (Unity: CardArt.cs, call for call). Every
 * function fills the whole surface it is given.
 *
 * The style: dark glass panels with corners cut in pixel-art steps, display text in the chunky
 * PixelFont, and email content in a clean sans so it reads at a glance. On a letter the Ink
 * shader turns the same drawing into dark ink on paper.
 */

const Edge = hex(0x4b3f7d);
const Ink = hex(0x16081a); // dark text on bright fills
const Outline = hex(0x0a0614); // around display text
const Soft = hex(0xd6def5); // second-level text
const Green = hex(0x5dffa1);

/** Where the scrolling preview sits on a newsletter card, in card pixels. */
export const ScrollWindow = { x: 56, y: 236, width: 912, height: 362 } as const;
/** The height of the tall texture that scrolls through that window. */
export const ScrollHeight = 1440;

export const scrolls = (email: Email): boolean => email.category === 'Newsletter' || email.category === 'Promo';

function hueOf(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (Math.imul(hash, 31) + name.charCodeAt(i)) >>> 0;
  return hash % 360;
}

function initials(name: string): string {
  let letters = '';
  for (const c of name) {
    if (letters.length < 2 && c !== c.toLowerCase() && c === c.toUpperCase()) letters += c;
  }
  return letters.length > 0 ? letters : name.substring(0, 1).toUpperCase();
}

/** A made-up time of day, the same for the same email. */
function timeOf(email: Email): string {
  const hash = hueOf(email.subject + email.from);
  const hour = 7 + (hash % 11);
  const minute = (hash * 7) % 60;
  return `${hour > 12 ? hour - 12 : hour}:${minute.toString().padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function panel(p: Painter, x: number, y: number, w: number, h: number, step: number, fill: Rgba, edge: Rgba, line: number): void {
  p.fillNotched(x, y, w, h, step, fill);
  if (line > 0) p.strokeNotched(x, y, w, h, step, edge, line);
}

// ----------------------------------------------------------------- icons

/** A small line icon for an email type, about `s` pixels from centre to edge. */
function icon(p: Painter, category: Category, cx: number, cy: number, s: number, c: Rgba): void {
  const line = 4;
  switch (category) {
    case 'Work': // briefcase
      p.strokeRoundRect(cx - s, cy - s * 0.5, s * 2, s * 1.4, 3, c, line);
      p.strokeRoundRect(cx - s * 0.45, cy - s * 0.95, s * 0.9, s * 0.5, 2, c, line);
      break;
    case 'Personal': // a person
      p.fillCircle(cx, cy - s * 0.45, s * 0.42, c);
      p.fillRoundRect(cx - s * 0.8, cy + s * 0.15, s * 1.6, s * 0.8, s * 0.4, c);
      break;
    case 'Newsletter': // a page of text
      p.strokeRoundRect(cx - s * 0.8, cy - s, s * 1.6, s * 2, 2, c, line);
      for (let i = -1; i <= 1; i++) p.line(cx - s * 0.4, cy + i * s * 0.45, cx + s * 0.4, cy + i * s * 0.45, c, line);
      break;
    case 'Spam': // no entry
      p.strokeCircle(cx, cy, s * 0.95, c, line);
      p.line(cx - s * 0.65, cy - s * 0.65, cx + s * 0.65, cy + s * 0.65, c, line);
      break;
    case 'Receipt': // a ticked slip
      p.strokeRoundRect(cx - s * 0.75, cy - s, s * 1.5, s * 2, 2, c, line);
      p.line(cx - s * 0.38, cy, cx - s * 0.08, cy + s * 0.32, c, line);
      p.line(cx - s * 0.08, cy + s * 0.32, cx + s * 0.42, cy - s * 0.32, c, line);
      break;
    case 'Tracking': // a parcel
      p.strokeRoundRect(cx - s, cy - s * 0.8, s * 2, s * 1.6, 2, c, line);
      p.line(cx - s, cy - s * 0.25, cx + s, cy - s * 0.25, c, line);
      p.line(cx, cy - s * 0.8, cx, cy - s * 0.25, c, line);
      break;
    case 'Social': // two people
      p.fillCircle(cx - s * 0.42, cy - s * 0.3, s * 0.38, c);
      p.fillCircle(cx + s * 0.42, cy - s * 0.3, s * 0.38, c);
      p.fillRoundRect(cx - s, cy + s * 0.25, s * 2, s * 0.65, s * 0.3, c);
      break;
    case 'Calendar':
      p.strokeRoundRect(cx - s, cy - s * 0.75, s * 2, s * 1.7, 2, c, line);
      p.line(cx - s, cy - s * 0.25, cx + s, cy - s * 0.25, c, line);
      p.line(cx - s * 0.5, cy - s * 1.05, cx - s * 0.5, cy - s * 0.55, c, line);
      p.line(cx + s * 0.5, cy - s * 1.05, cx + s * 0.5, cy - s * 0.55, c, line);
      break;
    default: {
      // a sign in a circle: % for offers, $ for bills, ! for alerts
      p.strokeCircle(cx, cy, s * 0.95, c, line);
      const sign = category === 'Promo' ? '%' : category === 'Bill' ? '$' : '!';
      p.pixelText(sign, cx + 1, cy, Math.max(2, Math.round(s * 0.18)), c, 'center');
      break;
    }
  }
}

/** The email's type as a tag: icon and name in a notched pill. Returns its width. */
function tag(p: Painter, category: Category, x: number, yMid: number, alignRight: boolean): number {
  const tint = Categories.tint(category);
  const label = Categories.label(category);
  const cell = 5;
  const w = PixelFont.width(label, cell) + 92;
  const h = 62;
  const left = alignRight ? x - w : x;
  panel(p, left, yMid - h / 2, w, h, 5, alpha(tint, 0.14), tint, 3);
  icon(p, category, left + 32, yMid, 14, tint);
  p.pixelText(label, left + 60, yMid, cell, tint);
  return w;
}

// ---------------------------------------------------------------- emails

const M = 56; // margin

/** An email, laid out for its type. */
export function emailCard(p: Painter, surface: Surface, email: Email): void {
  p.begin(surface);
  const tint = Categories.tint(email.category);
  const w = p.width;
  const h = p.height;
  panel(p, 6, 6, w - 12, h - 12, 12, Look.Glass, tint, 5);
  p.fillRect(30, 14, w - 60, 4, alpha(White, 0.07)); // a glint along the top
  switch (email.category) {
    case 'Work':
    case 'Personal':
    case 'Calendar': personCard(p, email); break;
    case 'Newsletter':
    case 'Promo': letterCard(p, email); break;
    case 'Receipt': receiptCard(p, email, tint); break;
    case 'Bill': billCard(p, email, tint); break;
    case 'Tracking': parcelCard(p, email, tint); break;
    case 'Spam': spamCard(p, email); break;
    default: noteCard(p, email, tint); break;
  }
  p.end();
}

/** From a person: the subject first, then who it is from, then as much of the message as fits. */
function personCard(p: Painter, e: Email): void {
  const w = p.width;
  tag(p, e.category, M, 66, false);
  p.text(timeOf(e), w - M, 68, 34, false, Look.Dim, 'right', 'middle');
  let y = 184;
  for (const line of p.wrap(e.subject, 72, true, w - 2 * M, 2)) {
    p.text(line, M, y, 72, true, Look.Text);
    y += 82;
  }
  const cy = y - 82 + 70;
  p.fillCircle(M + 26, cy, 26, hsl(hueOf(e.from), 0.7, 0.62));
  p.text(e.from.substring(0, 1).toUpperCase(), M + 26, cy + 2, 30, true, Ink, 'center', 'middle');
  p.text(e.from, M + 68, cy + 1, 38, true, Soft, 'left', 'middle');
  let by = cy + 76;
  // as many lines of the message as there is room for (a paragraph fills the card; it was three lines)
  const room = Math.max(1, Math.floor((p.height - 40 - by) / 48) + 1);
  for (const line of p.wrap(e.body ?? e.snippet ?? '', 36, false, w - 2 * M, room)) {
    p.text(line, M, by, 36, false, Look.Dim);
    by += 48;
  }
}

/** A company's header: its mark, its name and the type tag. */
function brand(p: Painter, e: Email, tint: Rgba): void {
  const w = p.width;
  p.fillNotched(M, 38, 70, 70, 6, tint);
  p.text(initials(e.from), M + 35, 75, 30, true, Ink, 'center', 'middle');
  const tagW = tag(p, e.category, w - M, 73, true);
  p.text(p.wrap(e.from, 40, true, w - 2 * M - 110 - tagW, 1)[0], M + 90, 75, 40, true, Look.Text, 'left', 'middle');
}

/**
 * A newsletter or an offer: who, the subject, and a window onto the email itself, which scrolls
 * by (see scrollContent).
 */
function letterCard(p: Painter, e: Email): void {
  const w = p.width;
  brand(p, e, Categories.tint(e.category));
  p.text(p.wrap(e.subject, 46, true, w - 2 * M, 1)[0], M, 190, 46, true, Soft);
  const win = ScrollWindow;
  panel(p, win.x - 10, win.y - 8, win.width + 20, win.height + 16, 6, alpha(White, 0.035), alpha(White, 0.08), 2);
}

/** The tall mock email that scrolls through a newsletter's window. */
export function scrollContent(p: Painter, surface: Surface, e: Email): void {
  p.begin(surface);
  const w = p.width;
  const h = p.height;
  const tint = Categories.tint(e.category);
  const items = e.items !== undefined && e.items.length > 1 ? e.items : [e.subject, e.subject];

  // The hero: a block of colour, the headline in big pixel type, a button.
  let y = 20;
  panel(p, 0, y, w, 270, 8, alpha(tint, 0.26), alpha(tint, 0.6), 3);
  p.pixelText(items[0], w / 2, y + 100, 8, White, 'center', Outline, alpha(tint, 0.9), w - 70);
  const action = e.category === 'Promo' ? 'SHOP NOW' : 'READ MORE';
  const bw = PixelFont.width(action, 5) + 64;
  p.fillNotched(w / 2 - bw / 2, y + 176, bw, 58, 5, tint);
  p.pixelText(action, w / 2, y + 205, 5, Ink, 'center');
  y += 310;

  let k = 1;
  while (y < h - 230) {
    const item = items[k];
    k = (k % (items.length - 1)) + 1;
    // A picture, then the section's title and a couple of lines of filler.
    panel(p, 0, y, 180, 160, 6, alpha(tint, 0.16), alpha(tint, 0.35), 2);
    picture(p, 90, y + 80, tint, k);
    let ty = y + 48;
    for (const line of p.wrap(item, 40, true, w - 220, 2)) {
      p.text(line, 212, ty, 40, true, Look.Text);
      ty += 48;
    }
    p.fillRoundRect(212, ty + 2, w - 240, 14, 7, alpha(Look.Dim, 0.22));
    p.fillRoundRect(212, ty + 30, (w - 240) * 0.62, 14, 7, alpha(Look.Dim, 0.22));
    y += 210;
  }
  p.line(0, y + 10, w, y + 10, alpha(Look.Dim, 0.25), 2);
  p.text('Unsubscribe  ·  View in browser', w / 2, y + 70, 30, false, alpha(Look.Dim, 0.7), 'center');
  p.end();
}

/** A simple shape standing in for a picture in a newsletter. */
function picture(p: Painter, cx: number, cy: number, tint: Rgba, which: number): void {
  const c = alpha(tint, 0.85);
  switch (which % 3) {
    case 0:
      p.fillCircle(cx, cy, 38, c);
      break;
    case 1: // hills and a sun
      p.fillCircle(cx + 34, cy - 30, 16, c);
      p.line(cx - 70, cy + 50, cx - 20, cy - 10, c, 10);
      p.line(cx - 20, cy - 10, cx + 20, cy + 30, c, 10);
      p.line(cx + 20, cy + 30, cx + 70, cy - 20, c, 10);
      break;
    default:
      p.fillNotched(cx - 50, cy - 50, 44, 44, 4, c);
      p.fillNotched(cx + 6, cy - 50, 44, 44, 4, alpha(tint, 0.5));
      p.fillNotched(cx - 50, cy + 6, 44, 44, 4, alpha(tint, 0.5));
      p.fillNotched(cx + 6, cy + 6, 44, 44, 4, c);
      break;
  }
}

function dashes(p: Painter, x: number, y: number, width: number, c: Rgba): void {
  const rects: [number, number, number, number][] = [];
  for (let d = 0; d < width; d += 28) rects.push([x + d, y, 16, 3]);
  p.fillRects(rects, c);
}

/** A receipt: who, the subject, and the amount, big, with what it was for. */
function receiptCard(p: Painter, e: Email, tint: Rgba): void {
  const w = p.width;
  brand(p, e, tint);
  p.text(p.wrap(e.subject, 48, true, w - 2 * M, 1)[0], M, 196, 48, true, Soft);
  dashes(p, M, 236, w - 2 * M, alpha(Look.Dim, 0.35));
  p.text(e.amount ?? '', M, 388, 124, true, Look.Text);
  p.text(p.wrap(e.snippet ?? '', 38, false, w - 2 * M, 1)[0], M, 456, 38, false, Look.Dim);
  panel(p, w - M - 190, 512, 190, 66, 5, alpha(Green, 0.1), Green, 4);
  p.pixelText('PAID', w - M - 95, 545, 6, Green, 'center');
  p.text('VISA  ••••  4242', M, 560, 32, false, alpha(Look.Dim, 0.8));
}

/** A bill: the amount and when it is due. */
function billCard(p: Painter, e: Email, tint: Rgba): void {
  const w = p.width;
  brand(p, e, tint);
  p.text(p.wrap(e.subject, 48, true, w - 2 * M, 1)[0], M, 196, 48, true, Soft);
  dashes(p, M, 236, w - 2 * M, alpha(Look.Dim, 0.35));
  p.text(e.amount ?? '', M, 380, 120, true, Look.Text);
  const due = e.failed ? Look.Coral : tint;
  const dueText = e.due ?? '';
  const dw = PixelFont.width(dueText, 5) + 60;
  panel(p, M, 422, dw, 64, 5, alpha(due, 0.14), due, 3);
  p.pixelText(dueText, M + 30, 454, 5, due);
  p.text(p.wrap(e.snippet ?? '', 36, false, w - 2 * M, 1)[0], M, 560, 36, false, Look.Dim);
}

/** A delivery: the subject and how far the parcel has got. */
function parcelCard(p: Painter, e: Email, tint: Rgba): void {
  const w = p.width;
  brand(p, e, tint);
  let y = 198;
  for (const line of p.wrap(e.subject, 52, true, w - 2 * M, 2)) {
    p.text(line, M, y, 52, true, Look.Text);
    y += 60;
  }
  const stages = ['ORDERED', 'SHIPPED', 'ON ITS WAY', 'DELIVERED'];
  const left = M + 70;
  const right = w - M - 70;
  const row = 404;
  const gap = (right - left) / 3;
  const now = e.failed ? Look.Coral : tint;
  p.line(left, row, right, row, alpha(Look.Dim, 0.3), 6);
  if (e.step > 0) p.line(left, row, left + gap * e.step, row, tint, 6);
  for (let i = 0; i < 4; i++) {
    const x = left + gap * i;
    if (i < e.step) p.fillNotched(x - 14, row - 14, 28, 28, 4, tint);
    else if (i === e.step) {
      p.fillNotched(x - 22, row - 22, 44, 44, 5, alpha(now, 0.25));
      p.strokeNotched(x - 22, row - 22, 44, 44, 5, now, 5);
      if (e.failed) p.pixelText('X', x, row, 3, now, 'center');
    } else p.strokeNotched(x - 12, row - 12, 24, 24, 3, alpha(Look.Dim, 0.6), 3);
    p.pixelText(stages[i], x, row + 58, 4, i === e.step ? now : alpha(Look.Dim, 0.8), 'center');
  }
  p.text(p.wrap(e.snippet ?? '', 38, false, w - 2 * M, 1)[0], M, 566, 38, false, e.failed ? Look.Coral : Look.Dim);
}

/** An alert or a social ping: the subject and one line in a box. */
function noteCard(p: Painter, e: Email, tint: Rgba): void {
  const w = p.width;
  brand(p, e, tint);
  let y = 214;
  for (const line of p.wrap(e.subject, 62, true, w - 2 * M, 2)) {
    p.text(line, M, y, 62, true, Look.Text);
    y += 72;
  }
  const boxY = Math.max(y - 20, 330);
  panel(p, M, boxY, w - 2 * M, 110, 8, alpha(tint, 0.1), alpha(tint, 0.7), 3);
  p.fillNotched(M + 24, boxY + 25, 60, 60, 5, tint);
  p.pixelText(e.category === 'Social' ? '+' : '!', M + 54, boxY + 55, 6, Ink, 'center');
  for (const line of p.wrap(e.snippet ?? '', 36, false, w - 2 * M - 130, 1)) {
    p.text(line, M + 108, boxY + 57, 36, false, Soft, 'left', 'middle');
  }
}

/** Spam: everything a little smaller and quieter. */
function spamCard(p: Painter, e: Email): void {
  const w = p.width;
  const h = p.height;
  tag(p, e.category, w - M, 70, true);
  p.fillCircle(M + 20, 70, 20, hsl(hueOf(e.from), 0.5, 0.55));
  p.text(e.from, M + 54, 72, 32, true, Look.Dim, 'left', 'middle');
  const lines = p.wrap(e.subject, 56, true, w - 2 * M - 120, 2);
  let y = lines.length === 1 ? 290 : 250;
  for (const line of lines) {
    p.text(line, M, y, 56, true, Look.Text);
    y += 66;
  }
  p.text(p.wrap(e.snippet ?? '', 32, false, w - 2 * M - 120, 1)[0], M, y + 16, 32, false, Look.Dim);
  icon(p, 'Spam', w - M - 70, h - M - 70, 64, alpha(Categories.tint('Spam'), 0.14));
}

// ------------------------------------------------------------- the round

/**
 * The round's name and a square per email: done ones in the colour of what happened to them,
 * the current one outlined in white.
 */
export function hud(p: Painter, surface: Surface, title: string, total: number, marks: readonly Rgba[]): void {
  p.begin(surface);
  const w = p.width;
  p.pixelText(title, w / 2, 52, 8, White, 'center', Outline);
  const gap = 12;
  const size = Math.min(44, (w - 40) / Math.max(1, total) - gap);
  const row = total * (size + gap) - gap;
  const x = (w - row) / 2;
  const y = 142 - size / 2;
  for (let i = 0; i < total; i++) {
    const left = x + i * (size + gap);
    if (i < marks.length) p.fillNotched(left, y, size, size, 4, marks[i]);
    else if (i === marks.length) {
      p.fillNotched(left, y, size, size, 4, alpha(White, 0.3));
      p.strokeNotched(left, y, size, size, 4, White, 5);
    } else p.strokeNotched(left, y, size, size, 4, [0.55, 0.65, 0.95, 0.55], 4);
  }
  p.end();
}

/** "ROUND 1" and a big number, or "GO!". */
export function countdown(p: Painter, surface: Surface, eyebrow: string, big: string, level: LevelLook): void {
  p.begin(surface);
  const w = p.width;
  p.pixelText(eyebrow, w / 2, 70, 8, level.accent, 'center', Outline);
  // A soft block of the level's colour behind the number, then the number.
  p.fillNotched(w / 2 - 150, 300 - 150, 300, 300, 24, alpha(level.second, 0.16));
  p.pixelText(big, w / 2, 300, 36, White, 'center', Outline, null, w - 40);
  p.end();
}

/** The end of the day. */
export function summary(p: Painter, surface: Surface, rank: string, lines: readonly string[], level: LevelLook): void {
  p.begin(surface);
  const w = p.width;
  p.pixelText('INBOX ZERO!', w / 2, 64, 11, White, 'center', Outline, level.second, w - 60);
  const gold = Look.Gold;
  panel(p, w / 2 - 74, 132, 148, 148, 10, alpha(gold, 0.12), gold, 6);
  p.pixelText(rank, w / 2, 206, 14, gold, 'center', Outline);
  p.pixelText('RANK', w / 2, 312, 5, alpha(gold, 0.85), 'center');
  let y = 392;
  for (const line of lines) {
    p.text(line, w / 2, y, 38, true, Soft, 'center');
    y += 50;
  }
  p.end();
}

/** A word or two in the pixel font, for pop-ups. */
export function pixelLabel(p: Painter, surface: Surface, text: string, color: Rgba, shadow: Rgba): void {
  p.begin(surface);
  p.pixelText(text, p.width / 2, p.height / 2 - 6, 14, color, 'center', Outline, shadow, p.width - 40);
  p.end();
}

// ------------------------------------------------------------------ home

/** The big button: a slab of the level's colour with a darker lip under it, like an arcade button. */
export function button(p: Painter, surface: Surface, text: string, accent: Rgba): void {
  p.begin(surface);
  const w = p.width;
  const h = p.height;
  const deep: Rgba = [accent[0] * 0.45, accent[1] * 0.45, accent[2] * 0.55, 1];
  p.fillNotched(4, 12, w - 8, h - 16, 10, deep);
  p.fillNotched(4, 4, w - 8, h - 22, 10, accent);
  p.fillRect(30, 14, w - 60, 6, alpha(White, 0.4));
  p.pixelText(text, w / 2, (h - 22) / 2 + 6, 8, Ink, 'center', null, null, w - 70);
  p.end();
}

// --------------------------------------------------------------- round 2

/** One of the two ready-made replies above the email. */
export function replyChip(p: Painter, surface: Surface, text: string): void {
  p.begin(surface);
  const w = p.width;
  const h = p.height;
  panel(p, 6, 6, w - 12, h - 12, 8, hex(0x110a20, 0.95), Green, 5);
  p.pixelText('REPLY', w / 2, 42, 4, Green, 'center');
  const lines = p.wrap(text, 46, true, w - 60, 2);
  let y = lines.length === 1 ? 132 : 108;
  for (const line of lines) {
    p.text(line, w / 2, y, 46, true, Look.Text, 'center');
    y += 54;
  }
  p.end();
}

/** The dictation target: a microphone in a circle. */
export function mic(p: Painter, surface: Surface, listening: boolean): void {
  p.begin(surface);
  const w = p.width;
  const h = p.height;
  const color = listening ? Look.Coral : Look.Magenta;
  const cx = w / 2;
  const cy = h / 2 - 22;
  p.fillCircle(cx, cy, 84, listening ? hex(0x3a1020) : hex(0x110a20, 0.95));
  p.strokeCircle(cx, cy, 84, color, 7);
  p.fillRoundRect(cx - 17, cy - 50, 34, 62, 17, color);
  p.strokeArc(cx, cy - 4, 31, 0.1 * Math.PI, 0.9 * Math.PI, color, 7);
  p.line(cx, cy + 27, cx, cy + 46, color, 7);
  p.line(cx - 18, cy + 46, cx + 18, cy + 46, color, 7);
  p.pixelText(listening ? 'LISTENING' : 'DICTATE', cx, h - 16, 3, listening ? Look.Coral : Look.Dim, 'center');
  p.end();
}

// ----------------------------------------------------------------- other

/** A line of keyboard hints: each key in a small cap, then what it does. */
export function hints(p: Painter, surface: Surface, keys: readonly (readonly [string, string])[]): void {
  p.begin(surface);
  const w = p.width;
  const h = p.height;
  const size = 30;
  const pad = 14;
  const gap = 12;
  const between = 44;
  let total = -between;
  for (const [key, does] of keys) total += between + p.measure(key, size, true) + pad * 2 + gap + p.measure(does, size, false);
  let x = (w - total) / 2;
  const mid = h / 2;
  for (const [key, does] of keys) {
    const cap = p.measure(key, size, true) + pad * 2;
    panel(p, x, mid - 24, cap, 48, 4, Look.Glass, Edge, 3);
    p.text(key, x + pad, mid + 1, size, true, Look.Text, 'left', 'middle');
    x += cap + gap;
    p.text(does, x, mid + 1, size, false, Look.Dim, 'left', 'middle');
    x += p.measure(does, size, false) + between;
  }
  p.end();
}
