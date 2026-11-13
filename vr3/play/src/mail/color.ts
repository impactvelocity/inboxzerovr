import * as THREE from 'three';

/**
 * A colour as Unity writes it: r, g, b, a in 0..1 (UnityEngine.Color).
 *
 * Two readings of the same numbers matter in this port, because the Unity project is in linear
 * colour space:
 *
 *   - a MATERIAL colour (material.color, a property block) is an sRGB colour: 0xff5e7e looks
 *     like 0xff5e7e. Use `toLinear` to hand one to a shader.
 *   - a PAINTED or VERTEX colour (everything Painter/CardArt draws, mesh.colors) goes through
 *     unconverted, so its numbers are taken as linear light and come out brighter on screen:
 *     the glass panel 0x110a20 shows as a dusty purple, the pink button as pale pink. `css`
 *     with `encode` gives that on-screen colour for a canvas.
 */
export type Rgba = readonly [number, number, number, number];

export const hex = (rgb: number, a = 1): Rgba => [((rgb >> 16) & 255) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255, a];

export const alpha = (c: Rgba, a: number): Rgba => [c[0], c[1], c[2], a];

export const lerpColor = (a: Rgba, b: Rgba, t: number): Rgba => {
  const k = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
};

/** Unity: color * k (every channel). */
export const scaleColor = (c: Rgba, k: number): Rgba => [c[0] * k, c[1] * k, c[2] * k, c[3] * k];

/** Unity: Look.Hsl. */
export function hsl(hue: number, s: number, l: number): Rgba {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const h = (hue % 360) / 60;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = l - c / 2;
  const rgb = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return [rgb[0] + m, rgb[1] + m, rgb[2] + m, 1];
}

export const White: Rgba = [1, 1, 1, 1];

/** Unity: Look. */
export const Look = {
  Cyan: hex(0x20e7f2),
  Coral: hex(0xff5e7e),
  Gold: hex(0xffd24a),
  Magenta: hex(0xc864ff),
  Green: hex(0x5dffa1),
  Text: hex(0xf3f7ff),
  Dim: hex(0xb5b1d9),
  /** The dark, slightly see-through face of cards and chips. */
  Glass: hex(0x110a20, 0.84),
} as const;

/** sRGB electro-optical transfer: an sRGB channel to linear light. */
export function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v * 0.0773993808 : Math.pow(v * 0.9478672986 + 0.0521327014, 2.4);
}

/** And back: linear light to an sRGB channel. */
export function linearToSrgb(v: number): number {
  const c = Math.min(1, Math.max(0, v));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** A material colour (sRGB numbers) as a THREE.Color in the linear working space. */
export function toLinear(c: Rgba, out = new THREE.Color()): THREE.Color {
  return out.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
}

/**
 * A canvas fill style. With `encode`, the colour as Unity ends up showing a painted colour
 * (numbers taken as linear light); without, the bare numbers (for data a shader reads).
 */
export function css(c: Rgba, encode: boolean): string {
  const f = encode ? linearToSrgb : (v: number) => Math.min(1, Math.max(0, v));
  const r = Math.round(f(c[0]) * 255);
  const g = Math.round(f(c[1]) * 255);
  const b = Math.round(f(c[2]) * 255);
  return c[3] >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${Math.max(0, c[3])})`;
}
