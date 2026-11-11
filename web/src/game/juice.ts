import * as THREE from 'three';
import { lerpColor, scaleColor, srgbToLinear, toLinear, White, type Rgba } from './color';
import { GlowMaterial, hardDisc, InkMaterial, neonRing, neonSlash, twinkle } from './look';
import { angleAxis, clamp01, euler, insideUnitCircle, lerp, onUnitSphere, Rad2Deg, range, transformPoint } from './mathx';

/**
 * Everything that makes a hit feel like a hit (Unity: Juice.cs, with its timings and curves):
 * sparks, the blast, the mark of the cut, the letter coming apart, and the blade's trail.
 *
 * All of it lives directly in Unity space, under the game's stage, and is stepped with the
 * world's clock, so a hit-stop holds it still.
 */

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _c2 = new THREE.Vector2();

/**
 * Square pixels of light. A burst is thrown along a direction; embers drift up and twinkle.
 * Each pixel flashes white, burns to its colour, then darkens and shrinks a size at a time, the
 * way pixel-art sparks do. One mesh for all of them.
 */
export class Sparks {
  static readonly Count = 260;
  private readonly at = new Float32Array(Sparks.Count * 3);
  private readonly velocity = new Float32Array(Sparks.Count * 3);
  private readonly age = new Float32Array(Sparks.Count).fill(1);
  private readonly life = new Float32Array(Sparks.Count).fill(1);
  private readonly gravity = new Float32Array(Sparks.Count);
  private readonly drag = new Float32Array(Sparks.Count);
  private readonly size = new Float32Array(Sparks.Count);
  private readonly color = new Float32Array(Sparks.Count * 3);
  private readonly twinkles = new Uint8Array(Sparks.Count);
  private readonly points: THREE.BufferAttribute;
  private readonly colors: THREE.BufferAttribute;
  private readonly mesh: THREE.Mesh;
  private next = 0;

  constructor(parent: THREE.Object3D, renderOrder: number) {
    const n = Sparks.Count;
    const geometry = new THREE.BufferGeometry();
    this.points = new THREE.BufferAttribute(new Float32Array(n * 12), 3);
    this.colors = new THREE.BufferAttribute(new Float32Array(n * 16), 4);
    this.points.setUsage(THREE.DynamicDrawUsage);
    this.colors.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.points);
    geometry.setAttribute('vcolor', this.colors);
    const index = new Uint16Array(n * 6);
    for (let i = 0; i < n; i++) index.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4 + 1, i * 4 + 2, i * 4 + 3], i * 6);
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(geometry, new GlowMaterial(true));
    this.mesh.name = 'Sparks';
    this.mesh.frustumCulled = false; // its points are anywhere in Unity space
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  private take(x: number, y: number, z: number, tint: Rgba): number {
    const i = this.next;
    this.next = (this.next + 1) % Sparks.Count;
    this.at[i * 3] = x;
    this.at[i * 3 + 1] = y;
    this.at[i * 3 + 2] = z;
    this.age[i] = 0;
    this.color[i * 3] = tint[0];
    this.color[i * 3 + 1] = tint[1];
    this.color[i * 3 + 2] = tint[2];
    this.twinkles[i] = 0;
    return i;
  }

  /**
   * Pixels thrown along `direction` (zero: every way). `spread` 0 is a tight jet, 1 a wide fan.
   */
  burst(at: THREE.Vector3, direction: THREE.Vector3, spread: number, tint: Rgba, count: number,
    speedMin: number, speedMax: number, pixel = 0.013, seconds = 0.55, fall = 5): void {
    const aimed = direction.lengthSq() > 1e-6;
    if (aimed) _w.copy(direction).normalize();
    for (let n = 0; n < count; n++) {
      const i = this.take(at.x, at.y, at.z, tint);
      onUnitSphere(_v);
      _v.z *= 0.35; // keep them mostly across the view, where they read
      if (aimed) _v.multiplyScalar(spread).add(_w);
      _v.normalize().multiplyScalar(range(speedMin, speedMax));
      this.velocity[i * 3] = _v.x;
      this.velocity[i * 3 + 1] = _v.y;
      this.velocity[i * 3 + 2] = _v.z;
      this.life[i] = seconds * range(0.6, 1.2);
      this.gravity[i] = fall;
      this.drag[i] = 2.2;
      this.size[i] = pixel * range(0.7, 1.5);
    }
  }

  /** Slow embers that drift up from `at` and twinkle out. */
  embers(at: THREE.Vector3, tint: Rgba, count: number, radius: number): void {
    for (let n = 0; n < count; n++) {
      insideUnitCircle(_c2).multiplyScalar(radius);
      const i = this.take(at.x + _c2.x, at.y + _c2.y, at.z - 0.02, tint);
      this.velocity[i * 3] = range(-0.2, 0.2);
      this.velocity[i * 3 + 1] = range(0.15, 0.55);
      this.velocity[i * 3 + 2] = 0;
      this.life[i] = range(0.8, 1.5);
      this.gravity[i] = -0.25;
      this.drag[i] = 1.2;
      this.size[i] = range(0.006, 0.011);
      this.twinkles[i] = 1;
    }
  }

  step(dt: number): void {
    const p = this.points.array as Float32Array;
    const c = this.colors.array as Float32Array;
    let drawn = 0;
    for (let i = 0; i < Sparks.Count; i++) {
      if (this.age[i] >= this.life[i]) continue;
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) continue;
      const k = i * 3;
      this.velocity[k + 1] -= this.gravity[i] * dt;
      const slow = 1 / (1 + this.drag[i] * dt);
      this.velocity[k] *= slow;
      this.velocity[k + 1] *= slow;
      this.velocity[k + 2] *= slow;
      this.at[k] += this.velocity[k] * dt;
      this.at[k + 1] += this.velocity[k + 1] * dt;
      this.at[k + 2] += this.velocity[k + 2] * dt;

      const t = this.age[i] / this.life[i];
      let r: number, g: number, b: number;
      if (t < 0.12) {
        const u = t / 0.12;
        r = 1 + (this.color[k] - 1) * u;
        g = 1 + (this.color[k + 1] - 1) * u;
        b = 1 + (this.color[k + 2] - 1) * u;
      } else {
        const u = 1 - 0.7 * ((t - 0.12) / 0.88);
        r = this.color[k] * u;
        g = this.color[k + 1] * u;
        b = this.color[k + 2] * u;
      }
      if (this.twinkles[i] === 1) {
        const wink = 0.45 + 0.55 * Math.abs(Math.sin(this.age[i] * 17 + i));
        r *= wink;
        g *= wink;
        b *= wink;
      }
      r = srgbToLinear(r);
      g = srgbToLinear(g);
      b = srgbToLinear(b);

      const half = (this.size[i] * (Math.ceil((1 - t) * 3) / 3)) / 2;
      const x = this.at[k];
      const y = this.at[k + 1];
      const z = this.at[k + 2];
      const o = drawn * 12;
      p[o] = x - half; p[o + 1] = y - half; p[o + 2] = z;
      p[o + 3] = x + half; p[o + 4] = y - half; p[o + 5] = z;
      p[o + 6] = x - half; p[o + 7] = y + half; p[o + 8] = z;
      p[o + 9] = x + half; p[o + 10] = y + half; p[o + 11] = z;
      const oc = drawn * 16;
      for (let v = 0; v < 4; v++) {
        c[oc + v * 4] = r;
        c[oc + v * 4 + 1] = g;
        c[oc + v * 4 + 2] = b;
        c[oc + v * 4 + 3] = 1;
      }
      drawn++;
    }
    this.mesh.geometry.setDrawRange(0, drawn * 6);
    this.mesh.visible = drawn > 0;
    if (drawn > 0) {
      this.points.needsUpdate = true;
      this.colors.needsUpdate = true;
    }
  }
}

/**
 * The flash of the blow itself: a cluster of solid blasts that pop, burn from white to the
 * email's colour and shrink, with stars around them.
 */
export class Boom {
  private static readonly Blobs = 9;
  private static readonly Stars = 8;
  private static readonly Seconds = 0.5;
  private readonly blobs: THREE.Mesh[] = [];
  private readonly blobLook: GlowMaterial[] = [];
  private readonly stars: THREE.Mesh[] = [];
  private readonly starLook = new GlowMaterial(true);
  private readonly blobDelay = new Float32Array(Boom.Blobs);
  private readonly blobSize = new Float32Array(Boom.Blobs);
  private readonly starDelay = new Float32Array(Boom.Stars);
  private readonly starSize = new Float32Array(Boom.Stars);
  private tint: Rgba = White;
  private age = 1;

  constructor(parent: THREE.Object3D, renderOrder: number) {
    const disc = hardDisc(12);
    const star = twinkle(0.09);
    for (let i = 0; i < Boom.Blobs; i++) {
      const look = new GlowMaterial(false);
      const blob = new THREE.Mesh(disc, look);
      blob.name = 'Blast';
      blob.renderOrder = renderOrder;
      blob.visible = false;
      parent.add(blob);
      this.blobs.push(blob);
      this.blobLook.push(look);
    }
    for (let i = 0; i < Boom.Stars; i++) {
      const one = new THREE.Mesh(star, this.starLook);
      one.name = 'Star';
      one.renderOrder = renderOrder + 1;
      one.visible = false;
      parent.add(one);
      this.stars.push(one);
    }
  }

  /** `along` stretches the cluster along the cut. */
  go(at: THREE.Vector3, along: THREE.Vector3, color: Rgba, strength = 1): void {
    this.tint = color;
    this.age = 0;
    const side = _w.set(along.y, -along.x, 0); // Cross(along, forward)
    if (side.lengthSq() > 1e-12) side.normalize();
    for (let i = 0; i < Boom.Blobs; i++) {
      const a = range(-0.12, 0.12) * strength;
      const s = range(-0.04, 0.04) * strength;
      this.blobs[i].position.set(at.x + along.x * a + side.x * s, at.y + along.y * a + side.y * s, at.z + along.z * a - 0.02 - i * 0.0015);
      this.blobDelay[i] = i < 2 ? 0 : range(0, 0.16);
      this.blobSize[i] = (i < 2 ? range(0.03, 0.042) : range(0.012, 0.03)) * strength;
    }
    for (let i = 0; i < Boom.Stars; i++) {
      insideUnitCircle(_c2);
      if (_c2.lengthSq() > 1e-12) _c2.normalize();
      _c2.multiplyScalar(range(0.1, 0.3) * strength);
      this.stars[i].position.set(at.x + _c2.x, at.y + _c2.y, at.z - 0.03);
      this.starDelay[i] = range(0, 0.22);
      this.starSize[i] = range(0.04, 0.11);
    }
    this.step(0);
  }

  step(dt: number): void {
    if (this.age >= 1) return;
    this.age = Math.min(1, this.age + dt / Boom.Seconds);
    const seconds = this.age * Boom.Seconds;
    const done = this.age >= 1;
    for (let i = 0; i < Boom.Blobs; i++) {
      const life = (seconds - this.blobDelay[i]) / 0.24;
      const on = !done && life >= 0 && life < 1;
      this.blobs[i].visible = on;
      if (!on) continue;
      this.blobs[i].scale.setScalar(this.blobSize[i] * (life < 0.25 ? 1 : 1 - (life - 0.25) / 0.75));
      const shade = life < 0.3 ? lerpColor(White, this.tint, life / 0.3) : lerpColor(this.tint, scaleColor(this.tint, 0.45), (life - 0.3) / 0.7);
      toLinear(shade, this.blobLook[i].tint);
    }
    toLinear(lerpColor(White, this.tint, 0.3), this.starLook.tint);
    for (let i = 0; i < Boom.Stars; i++) {
      const life = (seconds - this.starDelay[i]) / 0.26;
      const on = !done && life >= 0 && life < 1;
      this.stars[i].visible = on;
      if (on) this.stars[i].scale.setScalar(Math.max(1e-5, this.starSize[i] * Math.sin(life * Math.PI)));
    }
  }
}

/**
 * The mark of a cut: a white-hot line along the blade's path, right across the email and
 * beyond, and a ring of light opening from the hit.
 */
export class HitFx {
  private readonly slash: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly slashGlow = new GlowMaterial(true);
  private readonly ringGlow = new GlowMaterial(true);
  private tint: Rgba = White;
  private age = 1;

  constructor(parent: THREE.Object3D, slashOrder: number, ringOrder: number) {
    this.slash = new THREE.Mesh(neonSlash(0.012), this.slashGlow);
    this.slash.name = 'SlashMark';
    this.slash.renderOrder = slashOrder;
    this.ring = new THREE.Mesh(neonRing(0.04, 0.09, 48), this.ringGlow);
    this.ring.name = 'HitRing';
    this.ring.renderOrder = ringOrder;
    this.slash.visible = this.ring.visible = false;
    parent.add(this.slash, this.ring);
  }

  /** `along` is the direction of the cut; `facing` the card's rotation. */
  strike(at: THREE.Vector3, along: THREE.Vector3, facing: THREE.Quaternion, color: Rgba): void {
    this.tint = color;
    this.age = 0;
    const flat = _v.copy(along).applyQuaternion(_q.copy(facing).invert());
    const angle = Math.atan2(flat.y, flat.x) * Rad2Deg;
    const out = _w.set(0, 0, 1).applyQuaternion(facing);
    this.slash.position.copy(at).addScaledVector(out, -0.012);
    this.slash.quaternion.copy(facing).multiply(euler(0, 0, angle, _q));
    this.ring.position.copy(at).addScaledVector(out, -0.008);
    this.ring.quaternion.copy(facing);
    this.slash.visible = this.ring.visible = true;
    this.step(0);
  }

  step(dt: number): void {
    if (this.age >= 1) return;
    this.age = Math.min(1, this.age + dt / 0.38);
    // The line snaps out long and thin, and is gone first.
    const cut = clamp01(this.age / 0.45);
    this.slash.scale.set((0.3 + 0.7 * (1 - Math.pow(1 - cut, 3))) * 0.85, Math.max(1e-4, 1.3 - cut) * 0.85, 0.85);
    toLinear(lerpColor(White, this.tint, 0.25), this.slashGlow.tint);
    this.slashGlow.setOpacity(1 - cut);
    const open = 1 - Math.pow(1 - this.age, 3);
    this.ring.scale.setScalar(0.02 + 0.15 * open);
    toLinear(this.tint, this.ringGlow.tint);
    this.ringGlow.setOpacity(0.7 * (1 - this.age));
    if (this.age >= 1) this.slash.visible = this.ring.visible = false;
  }
}

/**
 * An email cut in two along the blade's path. The halves fly apart from the cut, carried the way
 * the blade was going and tumbling away from it, then burn up in square cells.
 */
export class CardSplit {
  private static readonly Life = 0.8;
  private static readonly MaxPoints = 8;
  private readonly halves: THREE.Mesh[] = [];
  private readonly velocity = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly axis = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly spin = [0, 0];
  private age = 1;
  /** The halves' material: paper and ink, like the letter they were. */
  readonly material: InkMaterial;

  constructor(parent: THREE.Object3D, paper: THREE.Texture, renderOrder: number) {
    this.material = new InkMaterial({ map: null, paperMap: paper, paper: true, side: THREE.DoubleSide });
    for (let i = 0; i < 2; i++) {
      const geometry = new THREE.BufferGeometry();
      const points = new THREE.BufferAttribute(new Float32Array(CardSplit.MaxPoints * 3), 3);
      const uvs = new THREE.BufferAttribute(new Float32Array(CardSplit.MaxPoints * 2), 2);
      points.setUsage(THREE.DynamicDrawUsage);
      uvs.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('position', points);
      geometry.setAttribute('uv', uvs);
      const index = new Uint16Array((CardSplit.MaxPoints - 2) * 3);
      for (let k = 1; k < CardSplit.MaxPoints - 1; k++) index.set([0, k, k + 1], (k - 1) * 3);
      geometry.setIndex(new THREE.BufferAttribute(index, 1));
      geometry.setDrawRange(0, 0);
      const half = new THREE.Mesh(geometry, this.material);
      half.name = 'CardHalf';
      half.frustumCulled = false;
      half.renderOrder = renderOrder;
      half.visible = false;
      parent.add(half);
      this.halves.push(half);
    }
  }

  /** Keep the part of `polygon` (x, y pairs) where dot(normal, p - through) >= 0. */
  private static clip(polygon: number[], tx: number, ty: number, nx: number, ny: number): number[] {
    const kept: number[] = [];
    const n = polygon.length / 2;
    for (let i = 0; i < n; i++) {
      const ax = polygon[i * 2];
      const ay = polygon[i * 2 + 1];
      const bx = polygon[((i + 1) % n) * 2];
      const by = polygon[((i + 1) % n) * 2 + 1];
      const da = nx * (ax - tx) + ny * (ay - ty);
      const db = nx * (bx - tx) + ny * (by - ty);
      if (da >= 0) kept.push(ax, ay);
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db);
        kept.push(ax + (bx - ax) * t, ay + (by - ay) * t);
      }
    }
    return kept;
  }

  /**
   * Cut the card (`width` by `height`, showing `face`) through `at` along `cut`, both in the
   * card's own space. `push` is the blade's velocity.
   */
  go(card: THREE.Object3D, width: number, height: number, at: THREE.Vector2, cut: THREE.Vector2, push: THREE.Vector3,
    face: THREE.Texture | null, burn: Rgba): void {
    this.material.face = face;
    toLinear(burn, this.material.burn);
    this.material.dissolve = 0;
    this.age = 0;
    const nx = -cut.y;
    const ny = cut.x;
    const rect = [-width / 2, -height / 2, width / 2, -height / 2, width / 2, height / 2, -width / 2, height / 2];
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(card.quaternion);
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? 1 : -1;
      const poly = CardSplit.clip(rect, at.x, at.y, nx * side, ny * side);
      const count = Math.min(CardSplit.MaxPoints, poly.length / 2);
      const half = this.halves[s];
      half.visible = count >= 3;
      if (count < 3) continue;
      let mx = 0;
      let my = 0;
      for (let i = 0; i < count; i++) {
        mx += poly[i * 2];
        my += poly[i * 2 + 1];
      }
      mx /= count;
      my /= count;
      const points = half.geometry.getAttribute('position') as THREE.BufferAttribute;
      const uvs = half.geometry.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < count; i++) {
        const x = poly[i * 2];
        const y = poly[i * 2 + 1];
        points.setXYZ(i, x - mx, y - my, 0);
        uvs.setXY(i, x / width + 0.5, y / height + 0.5);
      }
      points.needsUpdate = true;
      uvs.needsUpdate = true;
      half.geometry.setDrawRange(0, (count - 2) * 3);

      transformPoint(card, _v.set(mx, my, 0), half.position);
      half.quaternion.copy(card.quaternion);
      half.scale.copy(card.scale);
      const apart = _v.set(nx * side, ny * side, 0).applyQuaternion(card.quaternion);
      this.velocity[s].copy(apart).multiplyScalar(range(0.45, 0.75)).addScaledVector(push, 0.22).addScaledVector(forward, 0.25);
      this.velocity[s].y += 0.15;
      // Each half tumbles away from the cut, turning about it.
      this.axis[s].set(cut.x, cut.y, 0).applyQuaternion(card.quaternion).multiplyScalar(0.7).addScaledVector(forward, side * 0.7).normalize();
      this.spin[s] = side * range(4, 8);
    }
  }

  step(dt: number): void {
    if (this.age >= 1) return;
    this.age = Math.min(1, this.age + dt / CardSplit.Life);
    for (let s = 0; s < 2; s++) {
      const half = this.halves[s];
      if (!half.visible) continue;
      this.velocity[s].y -= 2.2 * dt;
      this.velocity[s].multiplyScalar(1 / (1 + 0.8 * dt));
      half.position.addScaledVector(this.velocity[s], dt);
      half.quaternion.premultiply(angleAxis(this.spin[s] * dt * Rad2Deg, this.axis[s], _q));
    }
    const burn = clamp01((this.age * CardSplit.Life - 0.12) / (CardSplit.Life - 0.2));
    this.material.dissolve = Math.pow(burn, 0.8);
    if (this.age >= 1) for (const half of this.halves) half.visible = false;
  }

  /** How far the evening has gone, for the paper's shade. */
  setNight(night: number): void {
    this.material.night = night;
  }
}

interface TrailSample {
  inner: THREE.Vector3;
  tip: THREE.Vector3;
  time: number;
}

/**
 * The ribbon of light a swinging blade leaves behind it: brightest at the tip edge, fading
 * toward the hilt and with age, smoothed between frames so a fast swing draws an arc, not a fan
 * of straight lines.
 */
export class BladeTrail {
  private static readonly Seconds = 0.09;
  private static readonly Steps = 4; // smoothing points between two frames
  private static readonly MaxSlices = 240;
  private readonly samples: TrailSample[] = [];
  private readonly pool: TrailSample[] = [];
  private readonly points: THREE.BufferAttribute;
  private readonly colors: THREE.BufferAttribute;
  private readonly mesh: THREE.Mesh;
  private slices = 0;
  /** The colour a swing leaves in the air: a vertex colour, so Unity's numbers as they are. */
  tint: Rgba;

  constructor(parent: THREE.Object3D, tint: Rgba, renderOrder: number) {
    this.tint = tint;
    const max = BladeTrail.MaxSlices;
    const geometry = new THREE.BufferGeometry();
    this.points = new THREE.BufferAttribute(new Float32Array(max * 9), 3);
    this.colors = new THREE.BufferAttribute(new Float32Array(max * 12), 4);
    this.points.setUsage(THREE.DynamicDrawUsage);
    this.colors.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.points);
    geometry.setAttribute('vcolor', this.colors);
    const index = new Uint16Array((max - 1) * 12);
    for (let s = 1; s < max; s++) {
      for (let i = 0; i < 2; i++) {
        const a = s * 3 - 3 + i;
        const b = s * 3 + i;
        index.set([a, b, b + 1, a, b + 1, a + 1], (s - 1) * 12 + i * 6);
      }
    }
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(geometry, new GlowMaterial(true));
    this.mesh.name = 'BladeTrail';
    this.mesh.frustumCulled = false; // drawn in Unity space; never cull
    this.mesh.renderOrder = renderOrder; // under the blade
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  clear(): void {
    if (this.samples.length === 0) return;
    while (this.samples.length > 0) this.pool.push(this.samples.pop() as TrailSample);
    this.mesh.geometry.setDrawRange(0, 0);
    this.mesh.visible = false;
  }

  private static spline(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
    const t2 = t * t;
    const t3 = t2 * t;
    return out.set(
      0.5 * (2 * b.x + (c.x - a.x) * t + (2 * a.x - 5 * b.x + 4 * c.x - d.x) * t2 + (3 * b.x - a.x - 3 * c.x + d.x) * t3),
      0.5 * (2 * b.y + (c.y - a.y) * t + (2 * a.y - 5 * b.y + 4 * c.y - d.y) * t2 + (3 * b.y - a.y - 3 * c.y + d.y) * t3),
      0.5 * (2 * b.z + (c.z - a.z) * t + (2 * a.z - 5 * b.z + 4 * c.z - d.z) * t2 + (3 * b.z - a.z - 3 * c.z + d.z) * t3),
    );
  }

  /**
   * Call every frame with where the blade is, in Unity space. `inner` is the point down the
   * blade where the trail starts.
   */
  push(inner: THREE.Vector3, tip: THREE.Vector3, now: number): void {
    const samples = this.samples;
    // A jump (the weapon was put somewhere new) starts a fresh trail.
    if (samples.length > 0 && samples[samples.length - 1].tip.distanceToSquared(tip) > 0.7 * 0.7) {
      while (samples.length > 0) this.pool.push(samples.pop() as TrailSample);
    }
    const sample = this.pool.pop() ?? { inner: new THREE.Vector3(), tip: new THREE.Vector3(), time: 0 };
    sample.inner.copy(inner);
    sample.tip.copy(tip);
    sample.time = now;
    samples.push(sample);
    while (samples.length > 0 && now - samples[0].time > BladeTrail.Seconds) this.pool.push(samples.shift() as TrailSample);

    this.slices = 0;
    const n = samples.length;
    for (let i = 0; i < n - 1; i++) {
      const a = samples[Math.max(0, i - 1)];
      const b = samples[i];
      const c = samples[i + 1];
      const d = samples[Math.min(n - 1, i + 2)];
      for (let k = 0; k < BladeTrail.Steps; k++) {
        const t = k / BladeTrail.Steps;
        const time = lerp(b.time, c.time, t);
        let fresh = clamp01(1 - (now - time) / BladeTrail.Seconds);
        fresh *= fresh;
        BladeTrail.spline(a.tip, b.tip, c.tip, d.tip, t, _v);
        BladeTrail.spline(a.inner, b.inner, c.inner, d.inner, t, _w);
        this.add(_w, _v, fresh);
      }
    }
    if (n > 1) this.add(samples[n - 1].inner, samples[n - 1].tip, 1);

    const shown = this.slices >= 2;
    this.mesh.geometry.setDrawRange(0, shown ? (this.slices - 1) * 12 : 0);
    this.mesh.visible = shown;
    if (shown) {
      this.points.needsUpdate = true;
      this.colors.needsUpdate = true;
    }
  }

  /**
   * One slice across the ribbon: clear at the inner end, the blade's colour most of the way
   * out, nearly white at the tip.
   */
  private add(inner: THREE.Vector3, tip: THREE.Vector3, fresh: number): void {
    if (this.slices >= BladeTrail.MaxSlices) return;
    const k = this.slices * 3;
    const color = this.tint;
    this.points.setXYZ(k, inner.x, inner.y, inner.z);
    this.points.setXYZ(k + 1, inner.x + (tip.x - inner.x) * 0.6, inner.y + (tip.y - inner.y) * 0.6, inner.z + (tip.z - inner.z) * 0.6);
    this.points.setXYZ(k + 2, tip.x, tip.y, tip.z);
    this.colors.setXYZW(k, color[0], color[1], color[2], 0);
    this.colors.setXYZW(k + 1, color[0], color[1], color[2], 0.22 * fresh);
    this.colors.setXYZW(k + 2, (color[0] + 1) / 2, (color[1] + 1) / 2, (color[2] + 1) / 2, 0.6 * fresh);
    this.slices++;
  }
}
