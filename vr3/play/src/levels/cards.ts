import type { Email } from '../mail/emails';
import { Categories } from '../mail/emails';
import * as PixelFont from '../mail/pixelFont';
import type { CardStyle } from '../mail/layout';

/**
 * What an email looks like in each of the new levels, painted in full colour straight onto the
 * letter's canvas (Kyoto's is the Unity game's own card, shown as ink on washi: ../mail).
 *
 *   office   a mint phosphor INBOX window, as if lifted off the CRT's screen
 *   castle   a dispatch on parchment (no heading), in a carved frame with gold corners
 *   lab      CONTAMINATED MAIL on stained paper, slime at its edges; RADIOACTIVE for the hot ones
 *
 * Every painter takes the 2D context already scaled so that the card is W by H units, the email
 * (null: a title card; not shown since 2026-11-11, when a game was made to start straight on its
 * countdown) and whether it is a hazard.
 *
 * Since 2026-11-13 a painter paints only the decoration of an email: its paper, frame and marks.
 * It hands back a CardStyle (where the words go, their family and colours) and the words are set
 * by ../mail/layout.ts, the same in every level: sender top left, sort of mail top right, subject,
 * message. ("so its all consistent, and each level just has the decoration and effects")
 */
export const W = 1024, H = 640;
export type CardPainter = (g: CanvasRenderingContext2D, email: Email | null, hazard: boolean) => CardStyle | void;

const SERIF = 'Georgia, "Noto Serif", "Times New Roman", serif';
const SANS = '"Helvetica Neue", Arial, Roboto, "Noto Sans", sans-serif';
const MONO = 'ui-monospace, "SF Mono", "Roboto Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace';

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
/**
 * Wrapped like `wrap`, but with the lines made as even as they will go (CSS's text-wrap: balance), so a
 * subject does not leave one word on a line of its own: the narrowest width that still needs no more lines.
 */
function balance(g: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const lines = wrap(g, text, maxWidth, maxLines);
  if (lines.length < 2 || lines[lines.length - 1].endsWith('…')) return lines;
  let low = maxWidth / lines.length, high = maxWidth;
  for (let i = 0; i < 12; i++) { const mid = (low + high) / 2, trial = wrap(g, text, mid, 99); if (trial.length <= lines.length) high = mid; else low = mid; }
  return wrap(g, text, Math.ceil(high) + 1, maxLines);
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
function pixel(g: CanvasRenderingContext2D, text: string, left: number, yMid: number, cell: number, colour: string, align: 'left' | 'center' | 'right' = 'left') {
  const upper = text.toUpperCase(), wide = PixelFont.width(upper, cell);
  const x = Math.round(align === 'center' ? left - wide / 2 : align === 'right' ? left - wide : left);
  g.fillStyle = colour;
  PixelFont.cells(upper, x, Math.round(yMid - PixelFont.Rows * cell / 2), cell, (cx, cy, cw, ch) => g.fillRect(cx, cy, cw, ch));
  return wide;
}
function envelope(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, colour: string, line: number) {
  g.strokeStyle = colour; g.lineWidth = line; g.lineJoin = 'miter';
  g.strokeRect(x, y, w, h);
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + w / 2, y + h * 0.56); g.lineTo(x + w, y); g.stroke();
}
function fleur(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, colour: string) {
  g.save(); g.translate(cx, cy); g.scale(s, s); g.fillStyle = colour;
  // the middle petal
  g.beginPath(); g.moveTo(0, -1); g.bezierCurveTo(0.42, -0.5, 0.36, 0.1, 0, 0.42); g.bezierCurveTo(-0.36, 0.1, -0.42, -0.5, 0, -1); g.fill();
  // the two that curl away
  for (const side of [-1, 1]) {
    g.beginPath(); g.moveTo(side * 0.12, 0.34);
    g.bezierCurveTo(side * 0.5, 0.2, side * 0.95, -0.1, side * 0.82, -0.52);
    g.bezierCurveTo(side * 0.62, -0.5, side * 0.6, -0.26, side * 0.7, -0.2);
    g.bezierCurveTo(side * 0.56, 0.02, side * 0.34, 0.1, side * 0.12, 0.2); g.fill();
  }
  g.fillRect(-0.46, 0.36, 0.92, 0.16);
  g.beginPath(); g.moveTo(-0.3, 0.52); g.lineTo(0, 1); g.lineTo(0.3, 0.52); g.fill();
  g.restore();
}

// ------------------------------------------------------------------ office

const INK = '#0a3a2b', DEEP = '#1c6a53';
export const officeCard: CardPainter = (g, email) => {
  // the window's frame, and its glass
  g.fillStyle = DEEP; g.fillRect(0, 0, W, H);
  const glass = g.createLinearGradient(0, 0, 0, H); glass.addColorStop(0, '#a9f9d8'); glass.addColorStop(1, '#7eedc2');
  g.fillStyle = glass; g.fillRect(10, 10, W - 20, H - 20);
  // title bar
  g.fillStyle = '#63d6ab'; g.fillRect(10, 10, W - 20, 82);
  g.fillStyle = DEEP; g.fillRect(10, 90, W - 20, 6);
  envelope(g, 40, 30, 56, 40, INK, 6);
  pixel(g, 'INBOX', 122, 51, 7, INK);
  for (const [x, mark] of [[W - 152, '-'], [W - 88, 'x']] as const) {
    g.fillStyle = '#8ff0cb'; g.fillRect(x, 24, 54, 54); g.strokeStyle = INK; g.lineWidth = 5; g.strokeRect(x, 24, 54, 54);
    pixel(g, mark, x + 27, 51, 6, INK, 'center');
  }
  // the message
  g.fillStyle = 'rgba(214,255,238,.5)'; g.fillRect(36, 122, W - 72, H - 158);
  g.strokeStyle = DEEP; g.lineWidth = 4; g.strokeRect(36, 122, W - 72, H - 158);
  if (!email) {
    pixel(g, 'INBOX ZERO', W / 2, 228, 13, INK, 'center');
    g.fillStyle = DEEP; g.fillRect(W / 2 - 230, 290, 460, 5);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = INK;
    g.font = `700 46px ${MONO}`; g.fillText('THE OFFICE', W / 2, 346);
    g.font = `700 38px ${SANS}`; g.fillText('smash this one to begin', W / 2, 424);
    g.font = `400 28px ${SANS}`; g.fillStyle = DEEP; g.fillText('left hand: take one and throw it, to keep it', W / 2, 492);
  }
  // scan lines, and the tube's dim corners
  g.fillStyle = 'rgba(8,60,44,.07)';
  for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 2);
  const shade = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.72); shade.addColorStop(0, 'rgba(0,40,30,0)'); shade.addColorStop(1, 'rgba(0,40,30,.28)');
  g.fillStyle = shade; g.fillRect(0, 0, W, H);
  // (the words go on after this, over the scan lines: they are faint enough not to be missed)
  if (email) return { box: { x: 66, y: 146, w: W - 132, h: H - 146 - 62 }, family: MONO, text: INK, dim: '#145441', accent: () => DEEP, onAccent: '#b9fbe0', ok: DEEP, fail: '#a3262e' };
};

// ------------------------------------------------------------------ castle

/** The frame's width on the card, in card units: the frame's own mesh is raised over exactly this much (see frameSoup). */
export const FRAME = 54;
const WOOD = '#4b2a1b', GOLD = '#e0ac48', OXBLOOD = '#8a1e2b', QUILL = '#34190f';
export const castleCard: CardPainter = (g, email) => {
  const random = seeded(email ? email.subject : 'title');
  // the frame: dark carved wood
  g.fillStyle = WOOD; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(20,8,4,.35)'; g.lineWidth = 2;
  for (let i = 0; i < 46; i++) { const y = random() * H; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y + random() * 8 - 4, W * 0.7, y + random() * 8 - 4, W, y + random() * 6 - 3); g.stroke(); }
  g.strokeStyle = '#6d4028'; g.lineWidth = 5; g.strokeRect(7, 7, W - 14, H - 14);
  g.strokeStyle = '#2a140c'; g.lineWidth = 6; g.strokeRect(FRAME - 5, FRAME - 5, W - 2 * FRAME + 10, H - 2 * FRAME + 10);
  // carved leaves running round it
  g.fillStyle = '#7a4a2c';
  const leaf = (x: number, y: number, turn: number) => { g.save(); g.translate(x, y); g.rotate(turn); g.beginPath(); g.ellipse(0, 0, 13, 5.5, 0, 0, 7); g.fill(); g.restore(); };
  for (let x = 96; x < W - 80; x += 34) { leaf(x, FRAME / 2 - 1, 0.5); leaf(x, H - FRAME / 2 + 1, -0.5); }
  for (let y = 92; y < H - 76; y += 34) { leaf(FRAME / 2 - 1, y, 1.05); leaf(W - FRAME / 2 + 1, y, -1.05); }
  // gold corners, riveted, and a lily at the head of the frame
  for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]] as const) {
    g.save(); g.translate(cx, cy); g.scale(sx, sy);
    const metal = g.createLinearGradient(0, 0, 96, 96); metal.addColorStop(0, '#f6d27a'); metal.addColorStop(0.5, GOLD); metal.addColorStop(1, '#a87424');
    g.fillStyle = metal; g.beginPath(); g.moveTo(0, 0); g.lineTo(104, 0); g.lineTo(92, 26); g.lineTo(58, 30); g.lineTo(30, 58); g.lineTo(26, 92); g.lineTo(0, 104); g.closePath(); g.fill();
    g.fillStyle = '#7a5216'; for (const [rx, ry] of [[20, 20], [74, 14], [14, 74]]) { g.beginPath(); g.arc(rx, ry, 5, 0, 7); g.fill(); }
    g.restore();
  }
  fleur(g, W / 2, FRAME / 2 + 1, 19, GOLD);
  // the parchment
  const x0 = FRAME, y0 = FRAME, pw = W - 2 * FRAME, ph = H - 2 * FRAME;
  const skin = g.createLinearGradient(0, y0, 0, y0 + ph); skin.addColorStop(0, '#f4e3bd'); skin.addColorStop(1, '#e3c58e');
  g.fillStyle = skin; g.fillRect(x0, y0, pw, ph);
  for (let i = 0; i < 18; i++) { const bx = x0 + random() * pw, by = y0 + random() * ph, r = 30 + random() * 90; const blot = g.createRadialGradient(bx, by, 0, bx, by, r); blot.addColorStop(0, 'rgba(150,104,48,.10)'); blot.addColorStop(1, 'rgba(150,104,48,0)'); g.fillStyle = blot; g.fillRect(bx - r, by - r, 2 * r, 2 * r); }
  const age = g.createRadialGradient(W / 2, H / 2, ph * 0.38, W / 2, H / 2, pw * 0.62); age.addColorStop(0, 'rgba(110,66,24,0)'); age.addColorStop(1, 'rgba(110,66,24,.34)');
  g.fillStyle = age; g.fillRect(x0, y0, pw, ph);
  // the crest: only on the title card now. Emails have none (it sat faint at the bottom right until 2026-11-13:
  // "drop the icon bottom right corner on haunted halls email")
  const crest = (cx: number, cy: number) => { g.fillStyle = OXBLOOD; g.fillRect(cx - 39, cy - 39, 78, 78); g.strokeStyle = '#5e121c'; g.lineWidth = 4; g.strokeRect(cx - 39, cy - 39, 78, 78); fleur(g, cx, cy, 27, GOLD); };
  if (!email) crest(x0 + 65, y0 + 61);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = QUILL;
  const rule = (y: number, half: number) => { g.strokeStyle = 'rgba(52,25,15,.7)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(W / 2 - half, y); g.lineTo(W / 2 - 22, y); g.moveTo(W / 2 + 22, y); g.lineTo(W / 2 + half, y); g.stroke(); fleur(g, W / 2, y, 11, QUILL); };
  // (no ROYAL DISPATCH heading or the rule under it since 2026-11-12, asked for: the subject sits higher instead)
  void rule; const up = email ? 46 : 13;      // (the title card, with no seal under it, sits lower: in the middle)
  if (!email) {
    g.font = `italic 700 62px ${SERIF}`; g.fillText('Inbox Zero', W / 2, y0 + 190 - up);
    g.font = `400 40px ${SERIF}`; g.fillText('The Haunted Hall', W / 2, y0 + 254 - up);
    g.font = `italic 400 36px ${SERIF}`; g.fillText('cut this one to begin', W / 2, y0 + 318 - up);
    g.font = `400 26px ${SERIF}`; g.fillStyle = 'rgba(52,25,15,.75)'; g.fillText('left hand: take one and throw it, to keep it', W / 2, y0 + 368 - up);
    return;
  }
  return { box: { x: x0 + 44, y: y0 + 32, w: pw - 88, h: ph - 62 }, family: SERIF, displayWeight: 'italic 700', text: QUILL, dim: 'rgba(52,25,15,.86)', accent: () => OXBLOOD, onAccent: '#f4e3bd', ok: '#2f6b3a', fail: OXBLOOD };
};

// ------------------------------------------------------------------ lab

function biohazard(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, colour: string, paper: string) {
  g.save(); g.translate(cx, cy);
  g.strokeStyle = colour; g.lineWidth = r * 0.26;
  for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2.0944; g.beginPath(); g.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.46, a + 0.9, a - 0.9 + 6.2832); g.stroke(); }
  g.fillStyle = paper; g.beginPath(); g.arc(0, 0, r * 0.2, 0, 7); g.fill();
  for (let i = 0; i < 3; i++) { const a = Math.PI / 2 + i * 2.0944; g.save(); g.rotate(a); g.fillRect(-r * 0.05, 0, r * 0.1, r * 0.62); g.restore(); }
  g.lineWidth = r * 0.11; g.beginPath(); g.arc(0, 0, r * 0.4, 0, 7); g.stroke();
  g.restore();
}
function trefoil(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  g.fillStyle = '#ffd21f'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  g.strokeStyle = '#111'; g.lineWidth = r * 0.07; g.stroke();
  g.fillStyle = '#111';
  for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2.0944; g.beginPath(); g.arc(cx, cy, r * 0.82, a - 0.5236, a + 0.5236); g.arc(cx, cy, r * 0.26, a + 0.5236, a - 0.5236, true); g.closePath(); g.fill(); }
  g.beginPath(); g.arc(cx, cy, r * 0.15, 0, 7); g.fill();
}
function slime(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.fillStyle = '#3f9e2a'; g.beginPath(); g.arc(x, y, r + 4, 0, 7); g.fill();
  g.fillStyle = '#76de43'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  g.fillStyle = 'rgba(214,255,150,.75)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.32, r * 0.3, 0, 7); g.fill();
}
export const labCard: CardPainter = (g, email, hazard) => {
  const random = seeded(email ? email.subject : 'title');
  const paper = hazard ? '#eef0c4' : '#f0e7d0';
  g.fillStyle = paper; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 22; i++) { const bx = random() * W, by = random() * H, r = 40 + random() * 110; const stain = g.createRadialGradient(bx, by, 0, bx, by, r); stain.addColorStop(0, hazard ? 'rgba(150,200,40,.12)' : 'rgba(160,130,70,.10)'); stain.addColorStop(1, 'rgba(160,130,70,0)'); g.fillStyle = stain; g.fillRect(bx - r, by - r, 2 * r, 2 * r); }
  const worn = g.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, W * 0.66); worn.addColorStop(0, 'rgba(120,96,48,0)'); worn.addColorStop(1, 'rgba(120,96,48,.36)');
  g.fillStyle = worn; g.fillRect(0, 0, W, H);
  if (hazard) {
    // hazard tape, top and bottom
    for (const y of [0, H - 40]) { g.fillStyle = '#ffd21f'; g.fillRect(0, y, W, 40); g.fillStyle = '#16160f'; for (let x = -40; x < W; x += 64) { g.beginPath(); g.moveTo(x, y + 40); g.lineTo(x + 32, y + 40); g.lineTo(x + 72, y); g.lineTo(x + 40, y); g.closePath(); g.fill(); } }
  }
  // scorched at one corner
  const scorch = g.createRadialGradient(W - 6, 6, 4, W - 6, 6, 66);      // (small since 2026-11-13: the sort of mail is written at the top right) scorch.addColorStop(0, 'rgba(28,14,6,.95)'); scorch.addColorStop(0.45, 'rgba(96,44,10,.7)'); scorch.addColorStop(0.7, 'rgba(255,140,30,.35)'); scorch.addColorStop(1, 'rgba(255,140,30,0)');
  g.fillStyle = scorch; g.fillRect(W - 190, 0, 190, 180);
  // slime, creeping in from the edges
  const blobs: [number, number, number][] = [[24, 150, 30], [8, 196, 20], [36, 214, 13], [14, 330, 24], [40, 352, 11], [20, 470, 30], [50, 505, 14], [96, H - 16, 34], [150, H - 8, 20], [190, H - 22, 12], [W - 26, 420, 26], [W - 12, 470, 16], [W - 44, H - 20, 30], [150, 18, 22], [196, 8, 13], [W / 2 + 120, H - 10, 18]];
  for (const [x, y, r] of blobs) slime(g, x + (random() - 0.5) * 16, y + (random() - 0.5) * 16, r * (0.8 + random() * 0.5));
  const ink = '#15140f', grey = '#5f5c50', top = hazard ? 56 : 30;
  if (email) {
    // (just the mark, at the bottom right and faint, since the message may run over it: no CONTAMINATED MAIL heading since 2026-11-13)
    const x = 76, y = top + 18, foot = H - (hazard ? 62 : 40);
    g.globalAlpha = hazard ? 0.5 : 0.3;
    if (hazard) trefoil(g, W - x - 50, foot - 48, 46); else biohazard(g, W - x - 54, foot - 50, 54, ink, paper);
    g.globalAlpha = 1;
    return { box: { x, y, w: W - 2 * x, h: foot - y }, family: SANS, text: ink, dim: '#45423a', accent: () => (hazard ? '#6b5200' : '#2f6a1c'), onAccent: paper, ok: '#2f6a1c', fail: '#a3262e' };
  }
  g.textAlign = 'left'; g.textBaseline = 'middle';
  if (hazard) trefoil(g, 122, top + 78, 60); else biohazard(g, 122, top + 78, 74, ink, paper);
  g.fillStyle = ink; g.font = `800 62px ${SANS}`;
  g.fillText(hazard ? 'RADIOACTIVE MAIL' : 'CONTAMINATED MAIL', 214, top + 80);
  g.fillStyle = grey; g.fillRect(84, top + 160, W - 168, 4);
  g.textAlign = 'center'; g.fillStyle = ink;
  g.font = `800 70px ${SANS}`; g.fillText('INBOX ZERO', W / 2, top + 236);
  g.font = `600 42px ${SANS}`; g.fillStyle = grey; g.fillText('The Lab', W / 2, top + 300);
  g.fillStyle = grey; g.fillRect(84, top + 344, W - 168, 4);
  g.fillStyle = ink; g.font = `700 44px ${SANS}`; g.fillText('spray this one to begin', W / 2, top + 404);
  g.font = `400 30px ${SANS}`; g.fillStyle = grey; g.fillText('hold the trigger · left hand: take one and throw it, to keep it', W / 2, top + 462);
};
