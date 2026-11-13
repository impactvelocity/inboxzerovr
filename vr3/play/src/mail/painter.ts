import * as THREE from 'three';
import { css, type Rgba } from './color';
import * as PixelFont from './pixelFont';

export type Align = 'left' | 'center' | 'right';
export type Baseline = 'alphabetic' | 'middle';

/** Unity's built-in font (LegacyRuntime.ttf) is Liberation Sans: Arial's metrics. */
const FONT = 'Arial, "Liberation Sans", Helvetica, "Helvetica Neue", sans-serif';

/**
 * Something to paint on: a canvas the size of one of Unity's render textures (times `scale`),
 * and, unless it is for the page itself, the texture made from it.
 *
 * `ink` surfaces carry data for the Ink shader, not a picture: Unity's own colour numbers,
 * unencoded, composited over opaque black (which is what a premultiplied render texture holds),
 * and sampled without colour conversion. Other surfaces hold the picture as Unity shows it.
 */
export interface Surface {
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  /** Unity's texture size: the units every drawing call uses. */
  width: number;
  height: number;
  scale: number;
  ink: boolean;
  texture: THREE.CanvasTexture | null;
}

export interface SurfaceOptions {
  scale?: number;
  ink?: boolean;
  /** False for a canvas that goes on the page (the key hints). */
  texture?: boolean;
  /** Wrap vertically, for the tall strip that scrolls through a newsletter's window. */
  repeatY?: boolean;
  /**
   * Upload premultiplied and unconverted, for LabelMaterial, which un-multiplies and decodes in
   * the shader: bilinear filtering and mipmaps then give clean edges with no dark fringe.
   * False gives a plain sRGB, straight-alpha canvas texture (for ctx.ui.material).
   */
  premultiplied?: boolean;
}

export function makeSurface(width: number, height: number, options: SurfaceOptions = {}): Surface {
  const scale = options.scale ?? 1;
  const ink = options.ink ?? false;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const g = canvas.getContext('2d');
  if (g === null) throw new Error('Inbox Zero: no 2D canvas context');
  let texture: THREE.CanvasTexture | null = null;
  if (options.texture ?? true) {
    texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 8;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = options.repeatY ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    if (ink) {
      texture.colorSpace = THREE.NoColorSpace;
    } else if (options.premultiplied ?? true) {
      texture.colorSpace = THREE.NoColorSpace; // decoded in LabelMaterial, after un-multiplying
      texture.premultiplyAlpha = true;
    } else {
      texture.colorSpace = THREE.SRGBColorSpace;
    }
  }
  return { canvas, g, width, height, scale, ink, texture };
}

/**
 * A tiny 2D canvas with Unity's Painter's calls (Painter.cs): notched and rounded rectangles,
 * circles, lines, pixel text and sans text. Coordinates are Unity texture pixels, y down.
 */
export class Painter {
  private s: Surface | null = null;

  private get g(): CanvasRenderingContext2D {
    if (this.s === null) throw new Error('Painter: begin() first');
    return this.s.g;
  }

  get width(): number {
    return this.s !== null ? this.s.width : 0;
  }

  get height(): number {
    return this.s !== null ? this.s.height : 0;
  }

  private style(c: Rgba): string {
    return css(c, this.s !== null && !this.s.ink);
  }

  begin(surface: Surface): void {
    this.s = surface;
    const g = surface.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, surface.canvas.width, surface.canvas.height);
    if (surface.ink) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, surface.canvas.width, surface.canvas.height);
    }
    g.setTransform(surface.scale, 0, 0, surface.scale, 0, 0);
    g.lineCap = 'butt';
    g.lineJoin = 'miter';
  }

  end(): void {
    if (this.s !== null && this.s.texture !== null) this.s.texture.needsUpdate = true;
    this.s = null;
  }

  // -------------------------------------------------------------- shapes

  private roundPath(x: number, y: number, w: number, h: number, r: number): void {
    const g = this.g;
    const k = Math.max(0.01, Math.min(r, Math.min(w, h) / 2));
    g.beginPath();
    g.moveTo(x + k, y);
    g.arcTo(x + w, y, x + w, y + h, k);
    g.arcTo(x + w, y + h, x, y + h, k);
    g.arcTo(x, y + h, x, y, k);
    g.arcTo(x, y, x + w, y, k);
    g.closePath();
  }

  fillRoundRect(x: number, y: number, w: number, h: number, r: number, color: Rgba): void {
    this.roundPath(x, y, w, h, r);
    this.g.fillStyle = this.style(color);
    this.g.fill();
  }

  strokeRoundRect(x: number, y: number, w: number, h: number, r: number, color: Rgba, lineWidth: number): void {
    this.roundPath(x, y, w, h, r);
    this.g.strokeStyle = this.style(color);
    this.g.lineWidth = lineWidth;
    this.g.stroke();
  }

  fillCircle(cx: number, cy: number, r: number, color: Rgba): void {
    const g = this.g;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = this.style(color);
    g.fill();
  }

  strokeCircle(cx: number, cy: number, r: number, color: Rgba, lineWidth: number): void {
    const g = this.g;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.strokeStyle = this.style(color);
    g.lineWidth = lineWidth;
    g.stroke();
  }

  /** An arc from angle a0 to a1 (radians, clockwise on screen from +x). */
  strokeArc(cx: number, cy: number, r: number, a0: number, a1: number, color: Rgba, lineWidth: number): void {
    const g = this.g;
    g.beginPath();
    g.arc(cx, cy, r, a0, a1);
    g.strokeStyle = this.style(color);
    g.lineWidth = lineWidth;
    g.stroke();
  }

  line(x0: number, y0: number, x1: number, y1: number, color: Rgba, lineWidth: number): void {
    const g = this.g;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.strokeStyle = this.style(color);
    g.lineWidth = lineWidth;
    g.stroke();
  }

  /** Many rectangles in one colour, filled as one shape so neighbours leave no seams. */
  fillRects(rects: readonly (readonly [number, number, number, number])[], color: Rgba): void {
    if (rects.length === 0) return;
    const g = this.g;
    g.beginPath();
    for (const r of rects) g.rect(r[0], r[1], r[2], r[3]);
    g.fillStyle = this.style(color);
    g.fill('nonzero');
  }

  fillRect(x: number, y: number, w: number, h: number, color: Rgba): void {
    this.g.fillStyle = this.style(color);
    this.g.fillRect(x, y, w, h);
  }

  /** A rectangle whose corners are cut in two pixel-art steps of `step`. */
  private notchedPath(x: number, y: number, w: number, h: number, step: number): void {
    const g = this.g;
    const s = Math.max(0, Math.min(step, Math.min(w, h) / 4));
    const r = x + w;
    const b = y + h;
    const p = [
      x + 2 * s, y, r - 2 * s, y, r - 2 * s, y + s, r - s, y + s,
      r - s, y + 2 * s, r, y + 2 * s, r, b - 2 * s, r - s, b - 2 * s,
      r - s, b - s, r - 2 * s, b - s, r - 2 * s, b, x + 2 * s, b,
      x + 2 * s, b - s, x + s, b - s, x + s, b - 2 * s, x, b - 2 * s,
      x, y + 2 * s, x + s, y + 2 * s, x + s, y + s, x + 2 * s, y + s,
    ];
    g.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
    g.closePath();
  }

  fillNotched(x: number, y: number, w: number, h: number, step: number, color: Rgba): void {
    const g = this.g;
    g.beginPath();
    this.notchedPath(x, y, w, h, step);
    g.fillStyle = this.style(color);
    g.fill();
  }

  /** The band between the outline grown and shrunk by half the line width, as Unity builds it. */
  strokeNotched(x: number, y: number, w: number, h: number, step: number, color: Rgba, lineWidth: number): void {
    const g = this.g;
    const half = lineWidth / 2;
    g.beginPath();
    this.notchedPath(x - half, y - half, w + lineWidth, h + lineWidth, step);
    this.notchedPath(x + half, y + half, w - lineWidth, h - lineWidth, step);
    g.fillStyle = this.style(color);
    g.fill('evenodd');
  }

  /**
   * Text in the pixel font, centred on `yMid`. `cell` is the size of one font pixel; it shrinks
   * to fit `maxWidth` if that is set. An outline rings the letters and a shadow drops one font
   * pixel below them. Returns the width drawn.
   */
  pixelText(text: string, x: number, yMid: number, cell: number, color: Rgba, align: Align = 'left',
    outline: Rgba | null = null, shadow: Rgba | null = null, maxWidth = 0): number {
    const upper = text.toUpperCase();
    const wide = PixelFont.widthCells(upper);
    if (wide <= 0) return 0;
    let size = cell;
    if (maxWidth > 0 && wide * size > maxWidth) size = Math.max(1, Math.floor(maxWidth / wide));
    const width = wide * size;
    const left = Math.round(align === 'center' ? x - width / 2 : align === 'right' ? x - width : x);
    const top = Math.round(yMid - (PixelFont.Rows * size) / 2);
    const lit: [number, number, number, number][] = [];
    PixelFont.cells(upper, left, top, size, (cx, cy, cw, ch) => lit.push([cx, cy, cw, ch]));
    const edge = Math.max(1, Math.round(size * 0.45));
    const grow = (by: number, down: number) =>
      lit.map((r) => [r[0] - by, r[1] - by + down, r[2] + 2 * by, r[3] + 2 * by] as const);
    if (shadow !== null) this.fillRects(grow(outline !== null ? edge : 0, edge * 1.4), shadow);
    if (outline !== null) this.fillRects(grow(edge, 0), outline);
    this.fillRects(lit, color);
    return width;
  }

  // ---------------------------------------------------------------- text

  private font(size: number, bold: boolean): string {
    return `${bold ? '700' : '400'} ${size}px ${FONT}`;
  }

  measure(text: string, size: number, bold: boolean): number {
    const g = this.g;
    g.font = this.font(size, bold);
    return g.measureText(text).width;
  }

  /** Break text into at most maxLines lines; the last gets "…" if cut. Always at least one line. */
  wrap(text: string, size: number, bold: boolean, maxWidth: number, maxLines: number): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line.length > 0 ? `${line} ${word}` : word;
      if (this.measure(next, size, bold) <= maxWidth || line.length === 0) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line.length > 0) lines.push(line);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      let last = lines[maxLines - 1];
      while (last.length > 1 && this.measure(`${last}…`, size, bold) > maxWidth) last = last.slice(0, -1);
      lines[maxLines - 1] = `${last}…`;
    }
    if (lines.length === 0) lines.push('');
    return lines;
  }

  /** `y` is the baseline, or the middle of the line with baseline 'middle'. */
  text(text: string, x: number, y: number, size: number, bold: boolean, color: Rgba,
    align: Align = 'left', baseline: Baseline = 'alphabetic'): void {
    if (text.length === 0) return;
    const g = this.g;
    g.font = this.font(size, bold);
    g.textAlign = align;
    g.textBaseline = baseline;
    g.fillStyle = this.style(color);
    g.fillText(text, x, y);
  }
}
