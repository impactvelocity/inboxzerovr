import * as PixelFont from './mail/pixelFont';

/**
 * One look for every word a level puts up in pixel letters (2026-11-13: "take that same text coloring for each level and
 * use that for the FIGHT, LATER, SAVED, REPLY etc labels throughout the level so it all feels together"): the end song's
 * words (endlyrics.ts) and round two's words, the countdown, FIGHT! and REPLY! (roundui.ts).
 *
 * A dark drop under it all, a block round each lit cell running top to bottom through the level's two colours (its
 * `bar`), the letters white with a hint of the first colour, and a soft glow of the two round them.
 */

/** How much of the level's first colour is in the white of the letters. */
export const LABEL_TINT = 0.12;

/** A #rrggbb colour taken `amount` of the way to white. */
export function towardWhite(hex: string, amount: number) {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (!isFinite(n)) return '#ffffff';
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

/** How far the coloured block reaches out from each cell, in canvas pixels. */
export const labelEdge = (cell: number) => Math.max(3, Math.round(cell * 0.35));

/** The letters: the drop, the two-colour block and the white, `upper` drawn with its top-left cell at (left, top). */
export function labelLetters(g: CanvasRenderingContext2D, upper: string, left: number, top: number, cell: number, colours: readonly [string, string]) {
  const edge = labelEdge(cell), block = (x: number, y: number, w: number, h: number) => g.fillRect(x - edge, y - edge, w + 2 * edge, h + 2 * edge);
  g.fillStyle = 'rgba(0,0,0,.7)'; PixelFont.cells(upper, left, top + edge, cell, block);
  const band = g.createLinearGradient(0, top - edge, 0, top + PixelFont.Rows * cell + edge);
  band.addColorStop(0, colours[0]); band.addColorStop(1, colours[1]);
  g.fillStyle = band; PixelFont.cells(upper, left, top, cell, block);
  g.fillStyle = towardWhite(colours[0], 1 - LABEL_TINT); PixelFont.cells(upper, left, top, cell, (x, y, w, h) => g.fillRect(x, y, w, h));
}

/** How much room the glow wants round the letters, in canvas pixels. */
export const labelGlowRoom = (cell: number) => Math.round(cell * 1.6);

/** The glow round the letters: the wide one in the second colour, the near one in the first. Draw it before the letters (or on its own canvas). */
export function labelGlow(g: CanvasRenderingContext2D, upper: string, left: number, top: number, cell: number, colours: readonly [string, string], strength = 1) {
  g.save();
  for (const [blur, alpha, colour] of [[cell * 1.6, 0.55, colours[1]], [cell * 0.7, 0.8, colours[0]]] as const) {
    g.shadowColor = colour; g.fillStyle = colour; g.shadowBlur = blur; g.globalAlpha = alpha * strength;
    PixelFont.cells(upper, left, top, cell, (x, y, w, h) => g.fillRect(x, y, w, h));
  }
  g.restore();
}
