import * as THREE from 'three';

/**
 * Unity's maths, by Unity's names, on three's types. Everything here works on numbers inside
 * the Unity-space group (see api.ts): the arithmetic is the same in both engines, so these are
 * line-for-line what Mathf, Vector3 and Quaternion do.
 */

export const Deg2Rad = Math.PI / 180;
export const Rad2Deg = 180 / Math.PI;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Mathf.Lerp: clamped. */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * clamp01(t);
export const moveTowards = (from: number, to: number, by: number): number =>
  Math.abs(to - from) <= by ? to : from + Math.sign(to - from) * by;
export const range = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);
export const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length) % items.length];

/** InboxGame.Ease and Snap. */
export const ease = (t: number): number => t * t * (3 - 2 * t);
export const snap = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const Up = new THREE.Vector3(0, 1, 0);
export const Right = new THREE.Vector3(1, 0, 0);
export const Forward = new THREE.Vector3(0, 0, 1);

const _e = new THREE.Euler();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();

/** Quaternion.Euler(x, y, z), in degrees. */
export function euler(x: number, y: number, z: number, out = new THREE.Quaternion()): THREE.Quaternion {
  return out.setFromEuler(_e.set(x * Deg2Rad, y * Deg2Rad, z * Deg2Rad, 'YXZ'));
}

/** Quaternion.FromToRotation. Neither vector needs to be unit length. */
export function fromTo(from: THREE.Vector3, to: THREE.Vector3, out = new THREE.Quaternion()): THREE.Quaternion {
  _a.copy(from).normalize();
  _b.copy(to).normalize();
  return out.setFromUnitVectors(_a, _b);
}

/** Quaternion.LookRotation(forward, up): +z along `forward`, +y as near `up` as it can be. */
export function lookRotation(forward: THREE.Vector3, up: THREE.Vector3 = Up, out = new THREE.Quaternion()): THREE.Quaternion {
  _z.copy(forward);
  if (_z.lengthSq() < 1e-12) return out.identity();
  _z.normalize();
  _x.crossVectors(up, _z);
  if (_x.lengthSq() < 1e-10) {
    // Looking straight along `up`: any sideways will do.
    _x.crossVectors(Math.abs(_z.x) < 0.9 ? Right : Forward, _z);
  }
  _x.normalize();
  _y.crossVectors(_z, _x);
  return out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
}

/** Quaternion.AngleAxis(degrees, axis). */
export function angleAxis(degrees: number, axis: THREE.Vector3, out = new THREE.Quaternion()): THREE.Quaternion {
  return out.setFromAxisAngle(_a.copy(axis).normalize(), degrees * Deg2Rad);
}

/** Transform.TransformPoint for something that sits directly in Unity space. */
export function transformPoint(t: THREE.Object3D, local: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  return out.copy(local).multiply(t.scale).applyQuaternion(t.quaternion).add(t.position);
}

/** Transform.InverseTransformPoint, likewise. */
export function inverseTransformPoint(t: THREE.Object3D, world: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  out.copy(world).sub(t.position).applyQuaternion(_q.copy(t.quaternion).invert());
  return out.set(out.x / t.scale.x, out.y / t.scale.y, out.z / t.scale.z);
}

/** Random.onUnitSphere. */
export function onUnitSphere(out = new THREE.Vector3()): THREE.Vector3 {
  const z = Math.random() * 2 - 1;
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return out.set(r * Math.cos(a), r * Math.sin(a), z);
}

/** Random.insideUnitCircle. */
export function insideUnitCircle(out = new THREE.Vector2()): THREE.Vector2 {
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random());
  return out.set(r * Math.cos(a), r * Math.sin(a));
}
