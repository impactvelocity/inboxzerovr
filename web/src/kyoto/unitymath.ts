import * as THREE from 'three';

/** Small pieces of Unity's maths, so the courtyard's numbers can be used as they are. */

const DEG = Math.PI / 180;
const euler = new THREE.Euler();

/** Quaternion.Euler(x, y, z), in degrees. */
export function unityEuler(x: number, y: number, z: number, out = new THREE.Quaternion()): THREE.Quaternion {
  return out.setFromEuler(euler.set(x * DEG, y * DEG, z * DEG, 'YXZ'));
}

const mx = new THREE.Vector3();
const my = new THREE.Vector3();
const mz = new THREE.Vector3();
const basis = new THREE.Matrix4();

/** Quaternion.LookRotation(forward, up). */
export function lookRotation(forward: THREE.Vector3, up = THREE.Object3D.DEFAULT_UP, out = new THREE.Quaternion()): THREE.Quaternion {
  mz.copy(forward).normalize();
  mx.crossVectors(up, mz);
  if (mx.lengthSq() < 1e-10) mx.set(1, 0, 0);
  mx.normalize();
  my.crossVectors(mz, mx);
  return out.setFromRotationMatrix(basis.makeBasis(mx, my, mz));
}

/** A colour written as Unity writes them (0xRRGGBB, as the eye sees it), in linear light. */
export function hex(value: number, out = new THREE.Color()): THREE.Color {
  return out.setHex(value, THREE.SRGBColorSpace);
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const inverseLerp = (a: number, b: number, v: number) => clamp01((v - a) / (b - a));
export const smoothstep01 = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const moveTowards = (from: number, to: number, by: number) => (Math.abs(to - from) <= by ? to : from + Math.sign(to - from) * by);

/** Three stops: dusk, blue hour, night (KyotoCourtyard.Mix). */
export function mix3(a: number, b: number, c: number, t: number): number {
  return t < 0.5 ? lerp(a, b, t * 2) : lerp(b, c, t * 2 - 1);
}
export function mixColor3(a: THREE.Color, b: THREE.Color, c: THREE.Color, t: number, out: THREE.Color): THREE.Color {
  return t < 0.5 ? out.copy(a).lerp(b, t * 2) : out.copy(b).lerp(c, t * 2 - 1);
}

// Mathf.PerlinNoise stands in: smooth, between 0 and 1, never the same twice along a line.
const perm = new Uint8Array(512);
{
  let seed = 1234567;
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
function grad(h: number, x: number, y: number): number {
  switch (h & 7) {
    case 0: return x + y; case 1: return x - y; case 2: return -x + y; case 3: return -x - y;
    case 4: return x; case 5: return -x; case 6: return y; default: return -y;
  }
}
export function perlin(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const X = xi & 255, Y = yi & 255;
  const u = fade(xf), v = fade(yf);
  const a = perm[X] + Y, b = perm[X + 1] + Y;
  const n = lerp(lerp(grad(perm[a], xf, yf), grad(perm[b], xf - 1, yf), u), lerp(grad(perm[a + 1], xf, yf - 1), grad(perm[b + 1], xf - 1, yf - 1), u), v);
  return clamp01(n * 0.5 + 0.5);
}

/**
 * What Unity does to a colour handed to a shader (Material.SetColor, a property block) in a
 * linear-colour project: it takes the numbers as display values and converts them, the
 * over-bright ones too. The courtyard's glows were all tuned through this.
 */
export function gammaToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : v < 1 ? Math.pow((v + 0.055) / 1.055, 2.4) : Math.pow(v, 2.2);
}
export function shaderColor(c: THREE.Color): THREE.Color {
  return c.setRGB(gammaToLinear(c.r), gammaToLinear(c.g), gammaToLinear(c.b));
}
