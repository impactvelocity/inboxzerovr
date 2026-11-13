import { alpha, css, hex, Look, White, type Rgba } from './color';
import { Categories, type Email } from './emails';
import { layoutEmail, type CardStyle, type Scroll } from './layout';
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

function panel(p: Painter, x: number, y: number, w: number, h: number, step: number, fill: Rgba, edge: Rgba, line: number): void {
  p.fillNotched(x, y, w, h, step, fill);
  if (line > 0) p.strokeNotched(x, y, w, h, step, edge, line);
}

// ---------------------------------------------------------------- emails

/** Kyoto's own colours for the words, as the ink shader wants them: Unity's numbers, unencoded. */
const raw = (c: Rgba) => css(c, false);
const KYOTO: CardStyle = {
  box: { x: 56, y: 38, w: 1024 - 112, h: 640 - 38 - 44 }, family: 'Arial, "Liberation Sans", Helvetica, "Helvetica Neue", sans-serif', displayWeight: '700',
  text: raw(Look.Text), dim: raw(Look.Dim), accent: category => raw(Categories.tint(category)), onAccent: raw(Ink), ok: raw(Green), fail: raw(Look.Coral),
};

/**
 * An email on Kyoto's card: the dark glass panel, edged in the colour of its sort of mail, and on
 * it the words, set as they are in every level (./layout.ts; until 2026-11-13 each sort of mail
 * had a layout of its own here, and a newsletter a mock page that scrolled). Says where a long
 * message scrolls, if it does.
 */
export function emailCard(p: Painter, surface: Surface, email: Email, scroll = true): Scroll | null {
  p.begin(surface);
  const tint = Categories.tint(email.category);
  const w = p.width;
  const h = p.height;
  panel(p, 6, 6, w - 12, h - 12, 12, Look.Glass, tint, 5);
  p.fillRect(30, 14, w - 60, 4, alpha(White, 0.07)); // a glint along the top
  const result = layoutEmail(surface.g, email, KYOTO, scroll);
  p.end();
  return result;
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
