import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { PX_PER_M } from '../config';

/**
 * World-space text is drawn to 2D canvases in millimetre units, so a font
 * size of 40 is 40 mm tall in the headset regardless of texture resolution.
 */
export const FONT = '"Inter", "Segoe UI", "Roboto", "Noto Sans", system-ui, -apple-system, sans-serif';
const MM = PX_PER_M / 1000;

export type Ctx = CanvasRenderingContext2D;

export function font(sizeMm: number, weight: 400 | 500 | 600 | 700 | 800 = 500, italic = false): string {
  return `${italic ? 'italic ' : ''}${weight} ${sizeMm}px ${FONT}`;
}

export function makeCanvas(widthM: number, heightM: number): { canvas: HTMLCanvasElement; ctx: Ctx; w: number; h: number } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(widthM * PX_PER_M));
  canvas.height = Math.max(2, Math.round(heightM * PX_PER_M));
  const ctx = canvas.getContext('2d')!;
  ctx.scale(MM, MM);
  ctx.textBaseline = 'alphabetic';
  return { canvas, ctx, w: widthM * 1000, h: heightM * 1000 };
}

let scratch: Ctx | null = null;
/** A context for measuring text before the real canvas size is known. */
export function measureCtx(): Ctx {
  if (!scratch) scratch = makeCanvas(0.01, 0.01).ctx;
  return scratch;
}

export function toTexture(canvas: HTMLCanvasElement, anisotropy = 8): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = anisotropy;
  return tex;
}

/** Break text into lines no wider than maxWidth. Honours newlines and splits words that cannot fit. */
export function wrapText(ctx: Ctx, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    if (para.trim() === '') {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      // A single word wider than the line (long URLs, unspaced scripts): split by character.
      while (ctx.measureText(line).width > maxWidth && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxWidth) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Limit to maxLines, ending the last kept line with an ellipsis if text was dropped. */
export function clampLines(ctx: Ctx, lines: string[], maxLines: number, maxWidth: number): string[] {
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return kept;
}

/** Truncate a single line with an ellipsis. */
export function fitText(ctx: Ctx, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Rectangle with cut corners, the angular shape used for every panel. */
export function chamferPath(ctx: Ctx, x: number, y: number, w: number, h: number, c: number): void {
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h - c);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

export type IconName =
  | 'mail'
  | 'undo'
  | 'calendar'
  | 'keep'
  | 'slash'
  | 'read'
  | 'mic'
  | 'check'
  | 'gear'
  | 'close'
  | 'back'
  | 'pencil'
  | 'clip'
  | 'next'
  | 'prev'
  | 'exit';

/** Line icons drawn inside a size×size box at (x, y). Original, deliberately simple shapes. */
export function drawIcon(ctx: Ctx, name: IconName, x: number, y: number, size: number, color: string): void {
  const s = size;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.6, s * 0.09);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  switch (name) {
    case 'mail':
      ctx.rect(s * 0.06, s * 0.2, s * 0.88, s * 0.6);
      ctx.moveTo(s * 0.06, s * 0.22);
      ctx.lineTo(s * 0.5, s * 0.56);
      ctx.lineTo(s * 0.94, s * 0.22);
      break;
    case 'undo':
      ctx.moveTo(s * 0.34, s * 0.14);
      ctx.lineTo(s * 0.1, s * 0.36);
      ctx.lineTo(s * 0.34, s * 0.58);
      ctx.moveTo(s * 0.12, s * 0.36);
      ctx.lineTo(s * 0.62, s * 0.36);
      ctx.arc(s * 0.62, s * 0.6, s * 0.24, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(s * 0.3, s * 0.84);
      break;
    case 'calendar':
      ctx.rect(s * 0.1, s * 0.2, s * 0.8, s * 0.7);
      ctx.moveTo(s * 0.1, s * 0.42);
      ctx.lineTo(s * 0.9, s * 0.42);
      ctx.moveTo(s * 0.3, s * 0.08);
      ctx.lineTo(s * 0.3, s * 0.28);
      ctx.moveTo(s * 0.7, s * 0.08);
      ctx.lineTo(s * 0.7, s * 0.28);
      break;
    case 'keep':
      ctx.moveTo(s * 0.08, s * 0.5);
      ctx.lineTo(s * 0.24, s * 0.16);
      ctx.lineTo(s * 0.76, s * 0.16);
      ctx.lineTo(s * 0.92, s * 0.5);
      ctx.lineTo(s * 0.92, s * 0.86);
      ctx.lineTo(s * 0.08, s * 0.86);
      ctx.closePath();
      ctx.moveTo(s * 0.08, s * 0.5);
      ctx.lineTo(s * 0.34, s * 0.5);
      ctx.lineTo(s * 0.4, s * 0.64);
      ctx.lineTo(s * 0.6, s * 0.64);
      ctx.lineTo(s * 0.66, s * 0.5);
      ctx.lineTo(s * 0.92, s * 0.5);
      break;
    case 'slash':
      ctx.moveTo(s * 0.12, s * 0.88);
      ctx.lineTo(s * 0.88, s * 0.12);
      ctx.moveTo(s * 0.12, s * 0.62);
      ctx.lineTo(s * 0.38, s * 0.88);
      break;
    case 'read':
      ctx.moveTo(s * 0.5, s * 0.24);
      ctx.lineTo(s * 0.5, s * 0.86);
      ctx.moveTo(s * 0.5, s * 0.24);
      ctx.quadraticCurveTo(s * 0.3, s * 0.1, s * 0.06, s * 0.18);
      ctx.lineTo(s * 0.06, s * 0.78);
      ctx.quadraticCurveTo(s * 0.3, s * 0.72, s * 0.5, s * 0.86);
      ctx.quadraticCurveTo(s * 0.7, s * 0.72, s * 0.94, s * 0.78);
      ctx.lineTo(s * 0.94, s * 0.18);
      ctx.quadraticCurveTo(s * 0.7, s * 0.1, s * 0.5, s * 0.24);
      break;
    case 'mic':
      ctx.roundRect(s * 0.36, s * 0.08, s * 0.28, s * 0.5, s * 0.14);
      ctx.moveTo(s * 0.2, s * 0.46);
      ctx.arc(s * 0.5, s * 0.46, s * 0.3, Math.PI, 0, true);
      ctx.moveTo(s * 0.5, s * 0.76);
      ctx.lineTo(s * 0.5, s * 0.94);
      break;
    case 'check':
      ctx.moveTo(s * 0.12, s * 0.54);
      ctx.lineTo(s * 0.4, s * 0.8);
      ctx.lineTo(s * 0.9, s * 0.2);
      break;
    case 'gear':
      ctx.arc(s * 0.5, s * 0.5, s * 0.16, 0, Math.PI * 2);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.moveTo(s * 0.5 + Math.cos(a) * s * 0.3, s * 0.5 + Math.sin(a) * s * 0.3);
        ctx.lineTo(s * 0.5 + Math.cos(a) * s * 0.42, s * 0.5 + Math.sin(a) * s * 0.42);
      }
      break;
    case 'close':
      ctx.moveTo(s * 0.18, s * 0.18);
      ctx.lineTo(s * 0.82, s * 0.82);
      ctx.moveTo(s * 0.82, s * 0.18);
      ctx.lineTo(s * 0.18, s * 0.82);
      break;
    case 'back':
    case 'prev':
      ctx.moveTo(s * 0.62, s * 0.14);
      ctx.lineTo(s * 0.26, s * 0.5);
      ctx.lineTo(s * 0.62, s * 0.86);
      break;
    case 'next':
      ctx.moveTo(s * 0.38, s * 0.14);
      ctx.lineTo(s * 0.74, s * 0.5);
      ctx.lineTo(s * 0.38, s * 0.86);
      break;
    case 'pencil':
      ctx.moveTo(s * 0.14, s * 0.86);
      ctx.lineTo(s * 0.2, s * 0.62);
      ctx.lineTo(s * 0.68, s * 0.14);
      ctx.lineTo(s * 0.86, s * 0.32);
      ctx.lineTo(s * 0.38, s * 0.8);
      ctx.closePath();
      break;
    case 'clip':
      ctx.moveTo(s * 0.7, s * 0.3);
      ctx.lineTo(s * 0.36, s * 0.64);
      ctx.arc(s * 0.44, s * 0.72, s * 0.11, Math.PI * 0.75, Math.PI * 1.75, true);
      ctx.lineTo(s * 0.8, s * 0.4);
      ctx.arc(s * 0.66, s * 0.26, s * 0.2, Math.PI * 0.25, Math.PI * 1.25, true);
      ctx.lineTo(s * 0.2, s * 0.6);
      break;
    case 'exit':
      ctx.moveTo(s * 0.56, s * 0.12);
      ctx.lineTo(s * 0.14, s * 0.12);
      ctx.lineTo(s * 0.14, s * 0.88);
      ctx.lineTo(s * 0.56, s * 0.88);
      ctx.moveTo(s * 0.4, s * 0.5);
      ctx.lineTo(s * 0.9, s * 0.5);
      ctx.moveTo(s * 0.72, s * 0.32);
      ctx.lineTo(s * 0.9, s * 0.5);
      ctx.lineTo(s * 0.72, s * 0.68);
      break;
  }
  ctx.stroke();
  ctx.restore();
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
