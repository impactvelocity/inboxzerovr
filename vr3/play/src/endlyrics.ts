import * as PixelFont from './mail/pixelFont';
import { labelGlow, labelLetters } from './pixelLabel';
import { ANTHEM_LYRICS, type LyricLine } from './levels/lyrics';

/**
 * The end of a game, v2 (asked for on 2026-11-13): as the end song plays its words come up in pixel letters, word by
 * word with the singing. The word being sung comes in at the middle and pushes the line along to the left; when the next
 * line starts, the line before rises (centred now) and the new one starts at the middle, the lines stacking up. Each word
 * can be cut away, and the rest still come as sung. After the last word the logo comes in and smashes whatever is left;
 * then the logo is there to smash, as in v1.
 *
 * v1 is the end as it was: the logo alone, 0.3 s into the end (letters.ts, untouched). Keyboard Smash keeps v1 (its
 * monitor is its end). To swap a level back, set it to 'v1' here; `?end=v1` or `?end=v2` in the address tries one
 * for every level that has words (never the office).
 */
export const ENDING: Record<string, 'v1' | 'v2'> = {
  kyoto: 'v2', castle: 'v2', lab: 'v2', space: 'v2', inferno: 'v2', lumber: 'v2',
  office2: 'v1',
};
const MONITOR = new Set(['office', 'office2']);

/** v2 for this level? Only where there are words to show. */
export function endingFor(levelId: string): 'v1' | 'v2' {
  if (MONITOR.has(levelId) || !ANTHEM_LYRICS[levelId]?.length) return 'v1';
  let forced: string | null = null;
  try { forced = new URLSearchParams(location.search).get('end'); } catch { /* no address: as set */ }
  if (forced === 'v1' || forced === 'v2') return forced;
  return ENDING[levelId] ?? 'v1';
}

export const LYRICS_TUNE = {
  /** How tall a word's capitals are, in metres (2026-11-13: "a bit smaller, further a way a bit"; it was 0.058 at 1 m). */
  letters: 0.05,
  /** How much further off than the logo the words float, metres (the logo is 0.95 m from the seat). */
  further: 0.25,
  /** The space between words, metres. */
  gap: 0.04,
  /** From one line to the next, down, metres. */
  lineStep: 0.1,
  /** A word comes in this many seconds before it is sung (it pops in over a quarter second). */
  lead: 0.08,
  /**
   * Where the middle of the whole song's words sits once they are all in, metres up from the eye: the eye line, looking
   * a touch down (2026-11-13, latest: "a bit more center when all the text is done ... start loading next line under it,
   * so it would all fit in the screen"; it was the line being sung at -0.14, the lines before it rising above).
   */
  up: -0.05,
  /** The most letters (spaces and commas counted) a line may have; a longer one is broken in two, at a comma near its middle if it has one (2026-11-13: "a limit of how long a line should be, so its all easy to read"). */
  maxChars: 24,
  /** Seconds after the last word is sung before the logo comes and smashes what is left. */
  logoAfter: 1.3,
  /** How much nearer the line's ends are than its middle, per metre out squared (a gentle curve round the player). */
  curve: 0.35,
};

export interface LyricWord { line: number; index: number; t: number; text: string; canvas: HTMLCanvasElement; glow: HTMLCanvasElement; width: number; height: number }

const CELL = 12, PAD = 2;      // canvas pixels per font cell; cells of room round the letters (for the shadow and the cut)
/** One word in pixel letters, in the look every label in a level has (pixelLabel.ts: LATER's, in the level's two colours). */
function wordCanvas(text: string, colours: readonly [string, string]) {
  const upper = text.toUpperCase(), cols = PixelFont.widthCells(upper);
  const canvas = document.createElement('canvas');
  canvas.width = (cols + PAD * 2 + 1) * CELL; canvas.height = (PixelFont.Rows + PAD * 2 + 1) * CELL;
  labelLetters(canvas.getContext('2d')!, upper, PAD * CELL, PAD * CELL, CELL, colours);
  return canvas;
}
/**
 * A soft glow in the level's colours round each letter, the same size as the word's canvas so it lines up (2026-11-13: "a
 * bit of glow around each letter"). Drawn on its own plane behind the word, added light: the word itself keeps hard
 * edges (its material throws away anything see-through), so a glow in it would be cut off.
 */
function glowCanvas(text: string, colours: readonly [string, string]) {
  const upper = text.toUpperCase(), cols = PixelFont.widthCells(upper);
  const canvas = document.createElement('canvas');
  canvas.width = (cols + PAD * 2 + 1) * CELL; canvas.height = (PixelFont.Rows + PAD * 2 + 1) * CELL;
  labelGlow(canvas.getContext('2d')!, upper, PAD * CELL, PAD * CELL, CELL, colours);
  return canvas;
}

/** A word as shown: no punctuation (2026-11-13: full stops, then "remove any punctuation like commas"); an apostrophe inside a word stays (WE'LL). */
const shown = (word: string) => word.replace(/[^\p{L}\p{N}']+/gu, '').replace(/^'+|'+$/g, '');

/** A sung line, broken where it is longer than `maxChars`: at the comma nearest its middle, else the space nearest it; again if still too long. */
function breakLine(line: LyricLine): LyricLine[] {
  const length = (part: LyricLine) => part.reduce((n, [, w]) => n + shown(w).length, 0) + part.length - 1;      // (as shown: no punctuation)
  if (line.length < 2 || length(line) <= LYRICS_TUNE.maxChars) return [line];
  const half = length(line) / 2;
  let best = -1, bestScore = Infinity;
  for (let i = 1; i < line.length; i++) {
    const before = length(line.slice(0, i)), comma = /,$/.test(line[i - 1][1]);
    const score = Math.abs(before - half) - (comma ? 6 : 0);      // (a comma is where the singing breathes: it is preferred)
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return [...breakLine(line.slice(0, best)), ...breakLine(line.slice(best))];
}

/** Every word of a level's end song, in order, drawn and measured. Empty where it has none. */
export function lyricWords(levelId: string, colours: readonly [string, string]): LyricWord[] {
  const lines: LyricLine[] = (ANTHEM_LYRICS[levelId] ?? []).flatMap(breakLine);
  const out: LyricWord[] = [];
  const perCell = LYRICS_TUNE.letters / PixelFont.Rows;
  lines.forEach((line, l) => line.forEach(([t, said], index) => {
    const text = shown(said);
    if (!text) return;
    const canvas = wordCanvas(text, colours);
    out.push({ line: l, index, t, text, canvas, glow: glowCanvas(text, colours), width: canvas.width / CELL * perCell, height: canvas.height / CELL * perCell });
  }));
  return out;
}

/** When the last word is sung, in song seconds (0 if none). */
export const lastWordAt = (words: LyricWord[]) => (words.length ? words[words.length - 1].t : 0);

/**
 * Where each word that has come in sits at song time `t`: x to the right of the middle and y up (metres, from the line
 * being sung), z towards the player, and `off` once its line has gone past the ones kept (it floats up and away).
 */
export function lyricLayout(words: LyricWord[], t: number) {
  const tune = LYRICS_TUNE, at = new Map<LyricWord, { x: number; y: number; z: number; off: boolean }>();
  const shown = words.filter(w => w.t - tune.lead <= t);
  if (!shown.length) return at;
  const now = shown[shown.length - 1].line, lines = words[words.length - 1].line + 1;
  // (each word's own width less its shadow's and padding's room, so the gaps read even)
  const inner = (w: LyricWord) => w.width * (1 - (PAD * 2 + 1) / (w.canvas.width / CELL));
  for (let line = 0; line <= now; line++) {
    const these = shown.filter(w => w.line === line);
    if (!these.length) continue;
    const span = these.reduce((s, w) => s + inner(w), 0) + tune.gap * (these.length - 1);
    // every line centred on what has been sung of it (2026-11-13: it was the newest word in the middle, the rest pushed
    // left): a new word comes in at the right end and the line slides left half its width, so a three-word line ends
    // with its middle word in the middle
    let x = -span / 2;
    // each line in its own place, the first at the top and each next one under it, the whole song's lines centred on `up`:
    // nothing moves up or goes, so all of it is there to read (and cut) by the end
    const up = ((lines - 1) / 2 - line) * tune.lineStep;
    for (const w of these) {
      const mid = x + inner(w) / 2;
      at.set(w, { x: mid, y: up, z: tune.curve * mid * mid, off: false });
      x += inner(w) + tune.gap;
    }
  }
  return at;
}
