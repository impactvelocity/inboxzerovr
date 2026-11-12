import * as THREE from 'three';
import type { World } from '@iwsdk/core';

/**
 * Something held in the right hand: the keyboard, the knight's sword, the sprayer. (Kyoto's katana
 * came first and is its own file, ../sword.ts; this is the same idea made general.)
 *
 * A weapon file builds a model and says how it is held (a HeldSpec); createHeld() puts it in the
 * hand in VR, stages it on a monitor, draws its swing trail and its glow while the trigger makes
 * it live, and says where its hitting end or its nozzle is for the game.
 *
 * Two ways of holding:
 *  - a ROD (rodHold): built handle-centred with its length along +Y and its leading edge on -X,
 *    exactly as the katana is. The fist sits right under `guardY`.
 *  - a PISTOL (pistolHold): built with its nozzle along -Z, its handle down -Y, the middle of the
 *    fist at the origin.
 */

export interface HeldSpec {
  name: string;
  model: THREE.Object3D;
  /** Model space to WebXR grip space: rodHold() or pistolHold(). */
  hold: THREE.Matrix4;
  /** Degrees the closed fist is leaned to sit round the handle (what the outline hand is turned by). */
  tilt: number;
  /** Rods: the numbers `hold` was made from, so that the lean can be changed from the Settings (Weapon.setRod). */
  rod?: { guardY: number; reach: number; tilt: number; turn: number };
  /** On a monitor: where it sits from the camera, and how it is turned (radians, applied X then Y then Z). */
  desktop?: { position?: [number, number, number]; rotateX?: number; rotateY?: number; rotateZ?: number };
  /** Rods: the model-space ends of the part that hits things. The trail is drawn between them. */
  hit?: { base: THREE.Vector3; tip: THREE.Vector3 };
  /** The swing ribbon's colour (linear r, g, b). None without `hit`. */
  trail?: [number, number, number];
  /** A soft light along the hit line while the trigger makes it live: halo and core colours. */
  glow?: { halo: [number, number, number]; core: [number, number, number]; width?: number };
  /** Pointing tools: the model-space mouth of the nozzle and the way it points. */
  aim?: { origin: THREE.Vector3; direction: THREE.Vector3 };
  /** Every frame, 0 to 1: how live the trigger is making it. Light the model up here. */
  onLive?(level: number, clock: number): void;
  /** Every frame: anything the model does by itself. `speed` is its hitting end's (or nozzle's) speed, m/s. */
  onUpdate?(dt: number, clock: number, speed: number, night: number): void;
  dispose?(): void;
}

export interface Weapon {
  root: THREE.Group;
  spec: HeldSpec;
  update(dt: number, frame: XRFrame | undefined, motion: boolean, night: number): void;
  previewSwing(): void;
  clearTrail(): void;
  /** 0 or 1 from the game each frame: is the trigger making it live? */
  setLive(level: number): void;
  /** Rods: change how it sits in the fist (lean, turn, reach), at once. */
  setRod(next: Partial<NonNullable<HeldSpec['rod']>>): void;
  /** Its level is not being played: out of sight, nothing tracked. */
  hide(): void;
  /** Rods: what hits things, in `root`'s own space. */
  hit: { root: THREE.Object3D; tip: THREE.Vector3; base: THREE.Vector3 } | null;
  /** Pointing tools: the nozzle in world space, and whether it means anything this frame. */
  aim: { origin: THREE.Vector3; direction: THREE.Vector3; valid: boolean } | null;
  /** On a monitor, the stand-in for the trigger: 1 for a moment after previewSwing() on a pointing tool. */
  pressed(): number;
  diagnostics(): { visible: boolean; trailSegments: number; live: number };
  dispose(): void;
}

const RAD = Math.PI / 180;
const rodBasis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0));

/**
 * How a rod sits in the fist (the katana's own sum, sword.ts). WebXR's grip space has -Z running
 * through the closed fist from little finger to thumb and -Y towards the knuckles.
 * guardY: the model-space height the top of the fist comes up to; reach: metres from the middle of
 * the fist to there; tilt: degrees it leans towards the knuckles; turn: degrees it is angled across
 * the body to the left.
 */
export function rodHold({ guardY = 0, reach = 0.03, tilt = 28, turn = 15 }: { guardY?: number; reach?: number; tilt?: number; turn?: number } = {}) {
  return new THREE.Matrix4().makeRotationX(-tilt * RAD).multiply(rodBasis)
    .multiply(new THREE.Matrix4().makeRotationX(turn * RAD))
    .multiply(new THREE.Matrix4().makeTranslation(0, reach - guardY, 0));
}

/**
 * How a pistol-gripped tool sits in the fist: handle through the fist, nozzle out past the
 * knuckles. rake: degrees the nozzle is lifted from the knuckles' line towards the thumb, so that
 * it points where the forearm does; shift: the model moved in grip space afterwards, metres.
 */
export function pistolHold({ rake = 20, turn = 0, shift = [0, 0, 0] }: { rake?: number; turn?: number; shift?: [number, number, number] } = {}) {
  // turn: degrees the nozzle is swung about the fist's own line (positive: to the player's right, as measured in the emulator)
  return new THREE.Matrix4().makeTranslation(shift[0], shift[1], shift[2]).multiply(new THREE.Matrix4().makeRotationZ(turn * RAD)).multiply(new THREE.Matrix4().makeRotationX(-(90 - rake) * RAD));
}

/**
 * A small reflection environment for a prop's metal and gloss, made from a gradient and a few
 * lamps: no downloads. `stops` run top to bottom; `lamps` are [x, y, width, height, colour] on a
 * 256 by 128 canvas.
 */
export function propEnvironment(renderer: THREE.WebGLRenderer, stops: [number, string][], lamps: [number, number, number, number, string][] = []) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  const gradient = g.createLinearGradient(0, 0, 0, 128);
  for (const [at, colour] of stops) gradient.addColorStop(at, colour);
  g.fillStyle = gradient; g.fillRect(0, 0, 256, 128);
  for (const [x, y, w, h, colour] of lamps) { g.fillStyle = colour; g.fillRect(x, y, w, h); }
  const picture = new THREE.CanvasTexture(c); picture.colorSpace = THREE.SRGBColorSpace; picture.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer); const target = pmrem.fromEquirectangular(picture);
  pmrem.dispose(); picture.dispose();
  return target;
}

export function createHeld(world: World, spec: HeldSpec): Weapon {
  const root = new THREE.Group(); root.name = spec.name; root.add(spec.model); root.visible = false;
  world.createTransformEntity(root);

  // The swing ribbon: a fixed pool of world-space samples, as the katana's is.
  const count = 20;
  const base = Array.from({ length: count }, () => new THREE.Vector3()), tip = Array.from({ length: count }, () => new THREE.Vector3());
  const births = new Float32Array(count).fill(-10), strengths = new Float32Array(count);
  const pos = new Float32Array((count - 1) * 18), fade = new Float32Array((count - 1) * 6);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  trailGeometry.setAttribute('opacity', new THREE.BufferAttribute(fade, 1).setUsage(THREE.DynamicDrawUsage));
  const trailColour = spec.trail ?? [0.8, 0.8, 0.8];
  const trailMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { tint: { value: new THREE.Vector3(...trailColour) } },
    vertexShader: 'attribute float opacity;varying float alpha;void main(){alpha=opacity;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 tint;varying float alpha;void main(){gl_FragColor=vec4(tint,alpha);}',
  });
  const trail = new THREE.Mesh(trailGeometry, trailMaterial); trail.name = `${spec.name}: swing ribbon`; trail.frustumCulled = false; trail.visible = false;
  world.createTransformEntity(trail);

  // The light along it while it is live: a ribbon down the hit line that always faces the eye.
  let glow: THREE.Mesh | null = null, glowMaterial: THREE.ShaderMaterial | null = null;
  if (spec.hit && spec.glow) {
    const rings = 10, position: number[] = [], direction: number[] = [], place: number[] = [], index: number[] = [];
    const run = spec.hit.tip.clone().sub(spec.hit.base);
    for (let r = 0; r <= rings; r++) {
      const at = spec.hit.base.clone().addScaledVector(run, r / rings);
      for (const side of [-1, 1]) { position.push(at.x, at.y, at.z); direction.push(run.x, run.y, run.z); place.push(side, r / rings); }
      if (r < rings) index.push(r * 2, r * 2 + 1, r * 2 + 2, r * 2 + 1, r * 2 + 3, r * 2 + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('direction', new THREE.Float32BufferAttribute(direction, 3));
    geometry.setAttribute('place', new THREE.Float32BufferAttribute(place, 2));
    geometry.setIndex(index);
    glowMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { level: { value: 0 }, time: { value: 0 }, width: { value: spec.glow.width ?? 0.06 },
        halo: { value: new THREE.Vector3(...spec.glow.halo) }, core: { value: new THREE.Vector3(...spec.glow.core) } },
      vertexShader: /* glsl */ `
        attribute vec3 direction; attribute vec2 place; uniform float width; varying vec2 at;
        void main(){
          at=place;
          vec4 mv=modelViewMatrix*vec4(position,1.);
          vec3 run=normalize((modelViewMatrix*vec4(direction,0.)).xyz);
          mv.xyz+=normalize(cross(run,normalize(mv.xyz)))*place.x*width;
          gl_Position=projectionMatrix*mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float level,time; uniform vec3 halo,core; varying vec2 at;
        void main(){
          float across=at.x, along=at.y;
          float ends=smoothstep(0.,.08,along)*(1.-smoothstep(.93,1.,along));
          float shimmer=.82+.18*sin(along*26.-time*11.)*sin(along*7.+time*3.);
          float soft=exp(-across*across*5.)*.6, hard=exp(-across*across*80.)*.85;
          gl_FragColor=vec4(mix(halo,core,hard),(soft+hard)*ends*shimmer*level);
          #include <colorspace_fragment>
        }`,
    });
    glow = new THREE.Mesh(geometry, glowMaterial); glow.name = `${spec.name}: live glow`; glow.frustumCulled = false; glow.renderOrder = 3; glow.visible = false;
    root.add(glow);
  }

  const hit = spec.hit ? { root: root as THREE.Object3D, tip: spec.hit.tip, base: spec.hit.base } : null;
  const aim = spec.aim ? { origin: new THREE.Vector3(), direction: new THREE.Vector3(0, 0, -1), valid: false } : null;
  const currentBase = new THREE.Vector3(), currentTip = new THREE.Vector3(), lastTip = new THREE.Vector3(), staged = new THREE.Vector3();
  let clock = 0, tracked = false, swingTime = -1, activeSamples = 0, live = 0, liveLevel = 0, pressedFor = 0;

  function clearTrail() { births.fill(-10); strengths.fill(0); tracked = false; activeSamples = 0; trail.visible = false; }
  function previewSwing() { if (world.renderer.xr.isPresenting) return; if (spec.aim) pressedFor = 2; else swingTime = 0; }
  function hide() { root.visible = false; clearTrail(); if (aim) aim.valid = false; live = 0; liveLevel = 0; pressedFor = 0; if (glow) glow.visible = false; spec.onLive?.(0, clock); }

  function update(dt: number, frame: XRFrame | undefined, motion: boolean, night: number) {
    clock += dt; pressedFor = Math.max(0, pressedFor - dt);
    let valid = false;
    if (world.renderer.xr.isPresenting) {
      const session = world.renderer.xr.getSession(), space = world.renderer.xr.getReferenceSpace();
      if (frame && space && session) for (const source of session.inputSources) {
        if (source.handedness !== 'right' || !source.gripSpace) continue;
        const pose = frame.getPose(source.gripSpace, space);
        if (pose) {
          root.matrixAutoUpdate = false;
          root.matrix.fromArray(pose.transform.matrix).multiply(spec.hold).premultiply(world.player.matrixWorld);
          root.matrixWorldNeedsUpdate = true; valid = true;
        }
        break;
      }
    } else {
      // On a monitor it is staged in front of the camera, not held.
      const d = spec.desktop ?? {}, p = d.position ?? (spec.aim ? [0.27, -0.2, -0.52] : [0.32, -0.3, -0.65]);
      root.matrixAutoUpdate = true;
      world.camera.getWorldPosition(root.position);
      root.position.add(staged.set(p[0], p[1], p[2]).applyQuaternion(world.camera.quaternion));
      root.quaternion.copy(world.camera.quaternion);
      root.rotateX(d.rotateX ?? (spec.aim ? 0 : -0.35)); root.rotateY(d.rotateY ?? (spec.aim ? 0.12 : 0)); root.rotateZ(d.rotateZ ?? (spec.aim ? 0 : -0.22));
      if (swingTime >= 0) {
        swingTime += dt; const phase = Math.min(swingTime / 0.65, 1);
        root.rotateZ(Math.sin(phase * Math.PI) * 1.9); root.rotateX(-Math.sin(phase * Math.PI) * 0.45);
        if (phase === 1) swingTime = -1;
      }
      valid = true;
    }
    root.visible = valid;
    if (!valid) { clearTrail(); if (aim) aim.valid = false; return; }
    root.updateMatrixWorld(true);
    if (aim && spec.aim) {
      aim.origin.copy(spec.aim.origin).applyMatrix4(root.matrixWorld);
      aim.direction.copy(spec.aim.direction).transformDirection(root.matrixWorld);
      aim.valid = true;
    }
    let speed = 0;
    if (spec.hit) {
      currentBase.copy(spec.hit.base).applyMatrix4(root.matrixWorld); currentTip.copy(spec.hit.tip).applyMatrix4(root.matrixWorld);
      const distance = tracked ? currentTip.distanceTo(lastTip) : 0;
      speed = dt > 0.001 ? distance / dt : 0;
      const reset = !tracked || distance > 0.5 || dt > 0.1 || !motion;
      if (reset) clearTrail();
      lastTip.copy(currentTip); tracked = true;
      for (let i = count - 1; i > 0; i--) { base[i].copy(base[i - 1]); tip[i].copy(tip[i - 1]); births[i] = births[i - 1]; strengths[i] = strengths[i - 1]; }
      base[0].copy(currentBase); tip[0].copy(currentTip); births[0] = clock; strengths[0] = !reset ? Math.min(0.32, Math.max(0, speed - 0.65) * 0.1) : 0;
      activeSamples = 0;
      for (let i = 0; i < count - 1; i++) {
        const a = Math.max(0, 1 - (clock - births[i]) / 0.18) * Math.min(strengths[i], strengths[i + 1]); if (a > 0.005) activeSamples++;
        for (let v = 0; v < 6; v++) {
          const p = v === 0 || v === 3 ? base[i] : v === 1 ? tip[i] : v === 2 || v === 4 ? tip[i + 1] : base[i + 1];
          p.toArray(pos, i * 18 + v * 3); fade[i * 6 + v] = a * (v === 0 || v === 3 || v === 5 ? 0.12 : 1);
        }
      }
      trail.visible = motion && activeSamples > 0 && !!spec.trail;
      trailGeometry.attributes.position.needsUpdate = true; trailGeometry.attributes.opacity.needsUpdate = true;
    }
    liveLevel += (live - liveLevel) * (1 - Math.exp(-dt * (live > liveLevel ? 16 : 6)));
    if (glow && glowMaterial) { glow.visible = liveLevel > 0.01; glowMaterial.uniforms.level.value = liveLevel; glowMaterial.uniforms.time.value = clock; }
    spec.onLive?.(liveLevel, clock);
    spec.onUpdate?.(dt, clock, speed, night);
  }

  return {
    root, spec, update, previewSwing, clearTrail, hide, hit, aim,
    setLive: (level: number) => { live = level; },
    setRod: next => { if (!spec.rod) return; Object.assign(spec.rod, next); spec.hold.copy(rodHold(spec.rod)); spec.tilt = spec.rod.tilt; },
    pressed: () => (pressedFor > 0 ? 1 : 0),
    diagnostics: () => ({ visible: root.visible, trailSegments: activeSamples, live: Number(liveLevel.toFixed(2)) }),
    dispose: () => { trailGeometry.dispose(); trailMaterial.dispose(); glow?.geometry.dispose(); glowMaterial?.dispose(); spec.dispose?.(); root.removeFromParent(); trail.removeFromParent(); },
  };
}
