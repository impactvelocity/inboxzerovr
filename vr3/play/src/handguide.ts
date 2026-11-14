import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AnimatedControllerHand, DEFAULT_PROFILES_PATH } from '@iwsdk/core';

/**
 * How to Play's hands (2026-11-13, asked for: "a pop up that shows the glowing meta hands, so model that for left
 * and right hand", "animate open and closed fist", "left hand to grab, read and throw to keep", "right hand - close
 * hand to activate and swing to slash").
 *
 * The hands are the game's own: the Quest hand models the SDK loads for the outline hands in VR (src/hands.ts),
 * and the closed fist is the SDK's own pressed pose. Here they are lit: a dark see-through body with a bright rim
 * in the level's colour, and a soft halo around it.
 *
 * Two cards, one hand each, drawn into one canvas laid under them (each card's .hand-view is where its hand is drawn).
 * They take turns ("two cards, one at a time highlight", 2026-11-13): the left card lights and plays, then the right.
 *   left    an email flies in · the thread finds it · the fist closes and it flies in · read · thrown away, gold: kept
 *   right   the hand closes on the hilt and the blade lights · it swings · the email falls in two
 *
 * Everything on screen is a function of the time alone (draw(left, right)), so any moment can be drawn by itself:
 * `__guide.frame(1.1, 2.1)` in the console of a dev build.
 */

type Side = 'left' | 'right';
export type Ease = (x: number) => number;
/** A moment on a track: when, the values then, and how the way INTO it is eased (smooth unless said). */
export type Key = [time: number, values: number[], ease?: Ease];

const LOOP = 5;                                   // seconds: the length of each hand's tracks
/** How long each hand has the light, in turn (its tracks have played and settled by then). */
const TURN_LEFT = 4.6, TURN_RIGHT = 4.4;
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth: Ease = x => x * x * (3 - 2 * x), easeIn: Ease = x => x * x, easeOut: Ease = x => 1 - (1 - x) ** 3;
export const ramp = (a: number, b: number, x: number) => smooth(clamp01((x - a) / (b - a)));

/** A track's values at a time. */
export function sample(keys: Key[], t: number, out: number[] = []) {
  let a = keys[0], b = keys[0];
  for (let i = 1; i < keys.length; i++) { a = keys[i - 1]; b = keys[i]; if (t <= b[0]) break; }
  const k = b[0] > a[0] ? (b[2] ?? smooth)(clamp01((t - a[0]) / (b[0] - a[0]))) : 1;
  for (let i = 0; i < b[1].length; i++) out[i] = a[1][i] + (b[1][i] - a[1][i]) * k;
  return out;
}

// ── the two loops. A hand's place: x y z in metres (the camera looks down -z, as a seated player does), then its
//    turn: pitch (fingers up), yaw (fingers to the left) and roll (the left palm up; the right palm down).
export const L_REST = [-0.045, -0.055, 0, 0.5, -0.3, 0.95];
// (2026-11-13: "the hand shouldnt move too much, just grab and line appears and email gets bigger, then throw to top left, fling like".
//  As in the game, the email hangs ahead of the hand on a thread of light, never in it: letters.ts reachLine, holdDistance, the thread.
//  The hand barely moves: it closes, the thread lights, the email flies in and grows; then a small wind-up and a flick up and left.)
const L_POSE: Key[] = [[0, L_REST], [0.88, L_REST], [1.0, [-0.045, -0.05, -0.012, 0.53, -0.3, 0.95]], [1.3, L_REST],
  [1.8, [-0.044, -0.054, 0.008, 0.55, -0.28, 0.92]], [3.0, [-0.044, -0.054, 0.008, 0.55, -0.28, 0.92]],
  [3.18, [-0.03, -0.072, 0.025, 0.36, -0.2, 1.05]],                                   // (the wind-up: down and to the right a touch)
  [3.34, [-0.08, -0.025, -0.035, 0.85, -0.55, 0.72], easeIn],                         // (the flick, up and to the left)
  [3.56, [-0.092, -0.016, -0.042, 0.92, -0.62, 0.66], easeOut], [4.4, L_REST], [LOOP, L_REST]];
const L_CURL: Key[] = [[0, [0]], [0.86, [0]], [1.04, [1]], [3.28, [1]], [3.4, [0], easeOut], [LOOP, [0]]];
/** Where the caught email hangs from the left hand (x y z), and its size: ahead of it on its thread, growing as it comes in to be read. */
const L_HOLD: Key[] = [[0, [0.05, 0.16, -0.3, 1]], [1.0, [0.05, 0.16, -0.3, 1]], [1.7, [0.058, 0.172, -0.2, 1.45], easeOut], [3.0, [0.058, 0.172, -0.2, 1.45]],
  [3.3, [0.055, 0.168, -0.22, 1.4]], [LOOP, [0.055, 0.168, -0.22, 1.4]]];
/** The fist closes on it (the thread lights and it starts in); it has arrived; it is let go, mid-flick. */
const L_CATCH = 0.95, L_IN = 1.5, L_THROW = 3.3;
/** Where the email waits, out of reach, until the fist closes. */
const L_WAIT = new THREE.Vector3(0.05, 0.15, -0.55);

// (at rest the right hand is turned out, its palm and the hilt across it towards the player, so the fingers are seen closing round it)
const R_REST = [0.035, -0.095, 0.02, -0.05, -0.9, 0.1], R_UP = [0.035, -0.05, 0.05, 0.5, -0.7, -0.35];
const R_POSE: Key[] = [[0, R_REST], [1.5, R_REST], [1.9, R_UP], [2.0, R_UP], [2.19, [-0.07, -0.12, -0.05, -0.95, -0.12, 1.0], easeIn],
  [2.48, [-0.085, -0.13, -0.05, -1.08, -0.1, 1.1], easeOut], [3.4, R_REST], [LOOP, R_REST]];
const R_CURL: Key[] = [[0, [0.1]], [0.86, [0.1]], [1.1, [1]], [3.9, [1]], [4.25, [0.1]], [LOOP, [0.1]]];
/** How alight the blade is: it catches as the fist closes, a little over, then steady. */
const R_POWER: Key[] = [[0, [0]], [1.02, [0]], [1.14, [1.6], easeOut], [1.4, [1]], [3.9, [1]], [4.2, [0]], [LOOP, [0]]];
const R_LIT = 1.06, R_CUT = 2.145;      // (the cut: the moment the blade is seen to cross the email, measured)

/** Which words light when, by half: [from, to] in that half's own seconds. */
const STEPS: Record<string, [number, number]> = { 'left:0': [0.86, 3.0], 'left:2': [3.0, 4.1], 'right:0': [0.86, 1.6], 'right:1': [1.6, 3.0] };

// ── the look: a rim that brightens where the surface turns away, as Meta's own hands do
const VERTEX = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform float puff; uniform float cuff;
varying vec3 gNormal; varying vec3 gView; varying float gCuff;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #ifdef PUFF
  transformed += normalize(objectNormal) * puff;
  #endif
  vec4 mv = modelViewMatrix * vec4(transformed, 1.);
  gNormal = normalMatrix * objectNormal; gView = -mv.xyz;
  gCuff = mix(1., smoothstep(.066, .036, position.y), cuff);      // (the hand's model runs along -Y from its wrist: it fades out at the cuff)
  gl_Position = projectionMatrix * mv;
}`;
const BODY = /* glsl */ `
uniform vec3 tint; uniform vec3 core; uniform float fill; uniform float lit; uniform float sharp;
varying vec3 gNormal; varying vec3 gView; varying float gCuff;
void main() {
  float rim = pow(1. - abs(dot(normalize(gNormal), normalize(gView))), sharp);
  vec3 c = mix(core, mix(tint, vec3(1.), rim * .75), rim) * (1. + lit);
  gl_FragColor = vec4(c, mix(fill, 1., rim) * gCuff);
  #include <colorspace_fragment>
}`;
const HALO = /* glsl */ `
uniform vec3 tint; uniform float strength; uniform float lit;
varying vec3 gNormal; varying vec3 gView; varying float gCuff;
void main() {
  float facing = abs(dot(normalize(gNormal), normalize(gView)));
  gl_FragColor = vec4(tint, facing * facing * strength * (1. + lit) * gCuff);
  #include <colorspace_fragment>
}`;
export type Shared = { value: unknown };
/** The lit body of a thing: dark and see-through, its rim bright. */
export function bodyMaterial(tint: Shared, core: THREE.ColorRepresentation, fill: number, lit: Shared, cuff = 0, sharp = 1.5) {
  return new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: BODY, transparent: true, depthWrite: false,
    uniforms: { tint, core: { value: new THREE.Color(core) }, fill: { value: fill }, lit, sharp: { value: sharp }, puff: { value: 0 }, cuff: { value: cuff } } });
}
/** The glow round a thing: its own shape a little bigger, seen from inside, fading to its edge. */
export function haloMaterial(tint: Shared, puff: number, strength: number, lit: Shared, cuff = 0) {
  return new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: HALO, defines: { PUFF: 1 }, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { tint, strength: { value: strength }, lit, puff: { value: puff }, cuff: { value: cuff } } });
}
/** Nothing to see, but it is in the way: so a see-through thing shows only its nearest surface. (Not past a hand's cuff, where it has faded out: its open end would hide what is behind it.) */
const depthOnly = (cuff = 0) => new THREE.ShaderMaterial({ vertexShader: VERTEX, colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, uniforms: { puff: { value: 0 }, cuff: { value: cuff } },
  fragmentShader: /* glsl */ `varying float gCuff; void main() { if (gCuff < .02) discard; gl_FragColor = vec4(0.); }` });

// ── a hand
const FINGERS = ['pinky', 'ring', 'middle', 'index', 'thumb'];      // (the order they close in)
/** How far the open hand is from the model's flat one towards the SDK's relaxed one (0 is a flat palm, 1 is curled round a controller). */
const OPEN = 0.3;
const ONE = new THREE.Vector3(1, 1, 1);
// In the model the fingers run along -Y, the thumb is on -Z and the palm faces X (the left) or -X (the right).
// Held as for a handshake: the fingers away from the player, the thumb up, the palm inwards.
const HANDSHAKE = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0)));

export interface Hand {
  /** Moved and turned by the loop; the middle of the palm is at its origin. */
  root: THREE.Group;
  /** 0 an open hand, 1 a fist. The little finger leads and the thumb closes last. */
  curl(amount: number): void;
  /** A flash through the whole hand, 0 to 1. */
  lit: { value: number };
  /** Where a handle runs through the fist, in root's space: the middle of the fingers' loop, and the way out past the thumb. */
  grip: { centre: THREE.Vector3; axis: THREE.Vector3 };
}

export async function buildHand(side: Side, tint: Shared): Promise<Hand> {
  const gltf = await new GLTFLoader().loadAsync(`${DEFAULT_PROFILES_PATH}/generic-hand/${side}.glb`);
  const model = gltf.scene, skin = model.getObjectByProperty('type', 'SkinnedMesh') as THREE.SkinnedMesh;
  const matrix = new THREE.Matrix4(), scale = new THREE.Vector3();
  // The SDK's poses are the right hand's, each joint where the controller's grip sees it; the left is their mirror.
  const posed = (pose: Record<string, number[]>, name: string) => {
    const p = new THREE.Vector3(), q = new THREE.Quaternion(); matrix.fromArray(pose[name]).decompose(p, q, scale);
    if (side === 'left') { p.x *= -1; q.x *= -1; q.w *= -1; }
    return new THREE.Matrix4().compose(p, q, ONE);
  };
  const bones = new Map<string, THREE.Object3D>();
  for (const name of Object.keys(AnimatedControllerHand.defaultPose)) { const bone = model.getObjectByName(name); if (bone) bones.set(name, bone); }
  const bound = (name: string) => { const bone = bones.get(name)!; return new THREE.Matrix4().compose(bone.position, bone.quaternion, ONE); };
  // Every pose is taken about its own wrist, so that closing the hand moves the fingers and leaves the wrist where it is.
  const wrist = bound('wrist');
  const about = (at: (name: string) => THREE.Matrix4) => { const inverse = at('wrist').invert(); return (name: string) => { const p = new THREE.Vector3(), q = new THREE.Quaternion(); inverse.clone().multiply(at(name)).decompose(p, q, scale); return { p, q }; }; };
  const flat = about(bound), relaxed = about(name => posed(AnimatedControllerHand.defaultPose, name)), fist = about(name => posed(AnimatedControllerHand.pressedPose, name));
  const joints = [...bones].map(([name, bone]) => {
    const a = flat(name), b = relaxed(name);
    return { name, bone, order: Math.max(0, FINGERS.findIndex(finger => name.startsWith(finger))), open: { p: a.p.lerp(b.p, OPEN), q: a.q.slerp(b.q, OPEN) }, fist: fist(name) };
  });
  const p = new THREE.Vector3(), q = new THREE.Quaternion();
  /** A joint's place in the model at a curl. */
  const jointAt = (joint: typeof joints[number], amount: number, out = new THREE.Matrix4()) => {
    const k = smooth(clamp01(amount * 1.24 - joint.order * 0.06));
    return out.compose(p.lerpVectors(joint.open.p, joint.fist.p, k), q.slerpQuaternions(joint.open.q, joint.fist.q, k), ONE).premultiply(wrist);
  };
  const curl = (amount: number) => { for (const joint of joints) jointAt(joint, amount, matrix).decompose(joint.bone.position, joint.bone.quaternion, scale); };

  // the look: the nearest surface only (a depth pass), the lit body, and two halos
  const lit = { value: 0 };
  skin.frustumCulled = false; skin.material = depthOnly(1);
  for (const material of [bodyMaterial(tint, '#0b0d16', 0.42, lit, 1), haloMaterial(tint, 0.0035, 0.5, lit, 1), haloMaterial(tint, 0.011, 0.2, lit, 1)]) {
    const pass = skin.clone(); pass.material = material; pass.frustumCulled = false; skin.parent!.add(pass);
  }

  // the middle of the palm at the root's origin, and the handshake hold
  const where = (name: string, amount: number) => new THREE.Vector3().setFromMatrixPosition(jointAt(joints.find(j => j.name === name)!, amount));
  const knuckles = ['index', 'middle', 'ring', 'pinky'].map(finger => `${finger}-finger-phalanx-proximal`);
  const palm = knuckles.reduce((sum, name) => sum.add(where(name, 0)), where('wrist', 0)).divideScalar(knuckles.length + 1);
  const root = new THREE.Group(), turn = new THREE.Group(); turn.quaternion.copy(HANDSHAKE); model.position.copy(palm).negate(); turn.add(model); root.add(turn);
  // a handle: through the middle of the closed fingers' loop, out past the first finger
  const toRoot = (v: THREE.Vector3) => v.sub(palm).applyQuaternion(HANDSHAKE);
  const loop = ['index', 'middle', 'ring', 'pinky'].flatMap(finger => ['phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map(part => `${finger}-finger-${part}`));
  const centre = toRoot(loop.reduce((sum, name) => sum.add(where(name, 1)), new THREE.Vector3()).divideScalar(loop.length));
  const axis = where('index-finger-phalanx-proximal', 1).sub(where('pinky-finger-phalanx-proximal', 1)).applyQuaternion(HANDSHAKE).normalize();
  curl(0);
  return { root, curl, lit, grip: { centre, axis } };
}

// ── the email: a small card of paper, as the game's are in outline
export const CARD_W = 0.15, CARD_H = 0.094;
export function paintCard(canvas: HTMLCanvasElement, accent: string) {
  const g = canvas.getContext('2d')!; canvas.width = 512; canvas.height = 320;
  const bar = (x: number, y: number, w: number, h: number, colour: string) => { g.fillStyle = colour; g.beginPath(); g.roundRect(x, y, w, h, h / 2); g.fill(); };
  g.fillStyle = '#f7f2e8'; g.beginPath(); g.roundRect(3, 3, 506, 314, 24); g.fill();
  g.strokeStyle = '#d6ccba'; g.lineWidth = 6; g.stroke();
  g.fillStyle = accent; g.beginPath(); g.arc(64, 66, 28, 0, Math.PI * 2); g.fill();
  bar(108, 46, 170, 16, '#2a2530'); bar(108, 72, 96, 10, '#b3a999'); bar(384, 48, 92, 30, accent);
  bar(38, 126, 330, 24, '#2a2530');
  bar(38, 176, 432, 12, '#a39a8c'); bar(38, 204, 396, 12, '#a39a8c'); bar(38, 232, 418, 12, '#a39a8c'); bar(38, 260, 240, 12, '#a39a8c');
}
/** A piece of the card: the corners given (in half-widths and half-heights, -1 to 1), anticlockwise. */
export function cardPiece(corners: [number, number][], map: THREE.Texture) {
  const geometry = new THREE.BufferGeometry(), positions: number[] = [], uvs: number[] = [];
  for (let i = 1; i < corners.length - 1; i++) for (const [x, y] of [corners[0], corners[i], corners[i + 1]]) { positions.push(x * CARD_W / 2, y * CARD_H / 2, 0); uvs.push((x + 1) / 2, (y + 1) / 2); }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.02, side: THREE.DoubleSide }));
}
export const glowing = (colour: THREE.ColorRepresentation) => new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

/** A soft round dot, for sparks. */
export function dotTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32; const g = canvas.getContext('2d')!;
  const fade = g.createRadialGradient(16, 16, 0, 16, 16, 16); fade.addColorStop(0, '#ffffff'); fade.addColorStop(0.35, '#ffffffcc'); fade.addColorStop(1, '#ffffff00');
  g.fillStyle = fade; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
}
/** Sparks thrown from a point: where each is, a time after. The same every loop (no dice), so a moment can be drawn twice. */
export function sparks(count: number, colour: THREE.ColorRepresentation, map: THREE.Texture, size: number) {
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: colour, map, size, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  points.frustumCulled = false;
  const dice = (i: number, salt: number) => { const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); };
  return { points,
    /** `along` leans them one way (a cut's line); `life` is how long they last. */
    at(origin: THREE.Vector3, age: number, life: number, speed: number, along?: THREE.Vector3) {
      const material = points.material; material.opacity = age > 0 && age < life ? (1 - age / life) ** 1.5 : 0; points.visible = material.opacity > 0;
      if (!points.visible) return;
      const array = geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < count; i++) {
        const turn = dice(i, 1) * Math.PI * 2, lift = dice(i, 2) * 2 - 1, v = speed * (0.35 + dice(i, 3) * 0.65), flat = Math.sqrt(1 - lift * lift);
        let x = Math.cos(turn) * flat, y = lift, z = Math.sin(turn) * flat * 0.5;
        if (along) { const side = dice(i, 4) < 0.5 ? -1 : 1; x = x * 0.45 + along.x * side; y = y * 0.45 + along.y * side; z = z * 0.45 + along.z * side; }
        array[i * 3] = origin.x + x * v * age; array[i * 3 + 1] = origin.y + y * v * age - 0.9 * age * age; array[i * 3 + 2] = origin.z + z * v * age;
      }
      geometry.attributes.position.needsUpdate = true;
    } };
}

export interface HandGuide { start(): void; stop(): void; /** The level's colour, as CSS. */ accent(colour: string): void; /** One moment: each hand's own seconds, and which card is lit. */ frame(left: number, right: number, lit?: 'left' | 'right' | 'both'): void }

/**
 * The hands, in the canvas inside `host`. Words in it marked data-step="left:0" (and so on) light as their part plays.
 * Nothing moves until start(). Rejects if the hands cannot be fetched.
 */
export async function createHandGuide(host: HTMLElement): Promise<HandGuide> {
  const canvas = host.querySelector('canvas')!;
  const steps = Array.from(host.querySelectorAll<HTMLElement>('[data-step]'));
  const cards = { left: host.querySelector<HTMLElement>('[data-hand=left]')!, right: host.querySelector<HTMLElement>('[data-hand=right]')! };
  const views = { left: cards.left.querySelector<HTMLElement>('.hand-view')!, right: cards.right.querySelector<HTMLElement>('.hand-view')! };
  const tint = { value: new THREE.Color('#f6b3cc') }, lightless = { value: 0 };
  const [left, right] = await Promise.all([buildHand('left', tint), buildHand('right', tint)]);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);      // (between and around the cards: see-through)
  renderer.toneMapping = THREE.NoToneMapping; renderer.setScissorTest(true);
  const scene = new THREE.Scene();
  // each half is a pool of the level's colour in the dark
  const backdrop = document.createElement('canvas'); backdrop.width = backdrop.height = 256;
  const backing = new THREE.CanvasTexture(backdrop); backing.colorSpace = THREE.SRGBColorSpace; scene.background = backing;
  const dot = dotTexture();
  const cardArt = document.createElement('canvas'), cardMap = new THREE.CanvasTexture(cardArt); cardMap.colorSpace = THREE.SRGBColorSpace; cardMap.anisotropy = 4;

  // The halves stand well apart, each with a camera of its own, so neither is in the other's picture.
  const stageL = new THREE.Group(), stageR = new THREE.Group(); stageL.position.x = -10; stageR.position.x = 10; scene.add(stageL, stageR);
  const eye = (stage: THREE.Group, from: [number, number, number], to: [number, number, number]) => {
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20); camera.position.set(...from); camera.lookAt(...to);
    stage.add(camera); return camera;
  };
  const cameraL = eye(stageL, [0.02, 0.2, 0.66], [0.01, 0.03, 0]), cameraR = eye(stageR, [0.0, 0.14, 0.86], [-0.01, 0.03, -0.04]);

  // ── left: the hand, its email, the ring as it is caught, the gold of a kept one
  stageL.add(left.root);
  const letter = new THREE.Group(), page = cardPiece([[-1, -1], [1, -1], [1, 1], [-1, 1]], cardMap);
  const gold = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W * 1.14, CARD_H * 1.22), new THREE.MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); gold.position.z = -0.002;
  const aura = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W * 2.3, CARD_H * 2.6), glowing('#ffc23d')); (aura.material as THREE.MeshBasicMaterial).map = dot; aura.position.z = -0.004;
  letter.add(aura, gold, page); stageL.add(letter);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 56), glowing('#ffffff')); stageL.add(ring);
  const kept = sparks(18, '#ffd36b', dot, 0.02); stageL.add(kept.points);
  // the thread: from the hand to the email it has found, faint at the hand, brightest at the paper (as letters.ts draws it)
  const threadLook = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { fade: { value: 0 }, near: tint, far: { value: new THREE.Color('#ffffff') } },
    vertexShader: /* glsl */ `varying float along; void main() { along = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */ `uniform float fade; uniform vec3 near; uniform vec3 far; varying float along;
      void main() { gl_FragColor = vec4(mix(near, far, along * .6), fade * (.18 + .82 * along * along));
        #include <colorspace_fragment>
      }` });
  const thread = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0), threadLook); thread.frustumCulled = false; stageL.add(thread);
  const threadGlow = new THREE.Mesh(thread.geometry, threadLook.clone()); threadGlow.frustumCulled = false; threadGlow.material.uniforms.near = tint; stageL.add(threadGlow);
  const UP = new THREE.Vector3(0, 1, 0), handAt = new THREE.Vector3();

  // ── right: the hand, a blade in it, its email in two pieces, the flash and sparks of the cut, the swing's trail
  stageR.add(right.root);
  const power = { value: 0 }, hot = { value: new THREE.Color() };
  const blade = new THREE.Group(); blade.position.copy(right.grip.centre); blade.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), right.grip.axis); right.root.add(blade);
  const BLADE_FROM = 0.074, BLADE_LONG = 0.27;
  const steel = (geometry: THREE.BufferGeometry, y: number) => {
    const mesh = new THREE.Mesh(geometry, bodyMaterial(tint, '#1b1a26', 1, lightless, 0, 2.2)); mesh.position.y = y;
    const solid = new THREE.Mesh(geometry, depthOnly()); mesh.add(solid); blade.add(mesh); return mesh;
  };
  steel(new THREE.CylinderGeometry(0.0118, 0.0128, 0.128, 18), 0); steel(new THREE.SphereGeometry(0.0155, 16, 12), -0.068); steel(new THREE.CylinderGeometry(0.03, 0.026, 0.009, 6), 0.068);
  const edge = new THREE.CylinderGeometry(0.0012, 0.0125, BLADE_LONG, 4, 1); edge.scale(1, 1, 0.32); edge.translate(0, BLADE_FROM + BLADE_LONG / 2, 0);
  // the blade: dull steel until the fist closes, then the level's colour, white at its heart
  const bladeBody = new THREE.ShaderMaterial({ vertexShader: VERTEX, uniforms: { tint, hot, power, puff: { value: 0 }, cuff: { value: 0 } },
    fragmentShader: /* glsl */ `uniform vec3 tint; uniform vec3 hot; uniform float power; varying vec3 gNormal; varying vec3 gView;
      void main() { float rim = pow(1. - abs(dot(normalize(gNormal), normalize(gView))), 1.4); float on = clamp(power, 0., 1.);
        vec3 dull = mix(vec3(.05, .055, .08), vec3(.42, .46, .56), rim);
        gl_FragColor = vec4(mix(dull, mix(hot, vec3(1.), .35 + .65 * (1. - rim)) * (.9 + .5 * power), on), 1.);
        #include <colorspace_fragment>
      }` });
  blade.add(new THREE.Mesh(edge, bladeBody));
  const bladeGlows = [haloMaterial(tint, 0.006, 0, lightless), haloMaterial(tint, 0.02, 0, lightless)];
  for (const material of bladeGlows) blade.add(new THREE.Mesh(edge, material));
  const bladeBase = right.grip.centre.clone().addScaledVector(right.grip.axis, BLADE_FROM), bladeTip = right.grip.centre.clone().addScaledVector(right.grip.axis, BLADE_FROM + BLADE_LONG);
  const lightRing = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 56), glowing('#ffffff')); stageR.add(lightRing);

  // the email it cuts: two pieces from the first, along the line the blade takes (down from the right)
  const CUT: [[number, number], [number, number]] = [[-1, -0.42], [1, 0.42]];
  const upper = cardPiece([CUT[0], CUT[1], [1, 1], [-1, 1]], cardMap), lower = cardPiece([[-1, -1], [1, -1], CUT[1], CUT[0]], cardMap);
  stageR.add(upper, lower);
  const cutLine = new THREE.Vector3((CUT[1][0] - CUT[0][0]) * CARD_W / 2, (CUT[1][1] - CUT[0][1]) * CARD_H / 2, 0);
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowing('#ffffff')); stageR.add(flash);
  const chips = sparks(22, '#ffffff', dot, 0.026); stageR.add(chips.points);
  // the trail: a ribbon through where the blade has just been
  const TRAIL = 26, TRAIL_STEP = 0.003;
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(TRAIL * 6), 3)); trailGeometry.setAttribute('age', new THREE.Float32BufferAttribute(new Float32Array(TRAIL * 2), 1));
  trailGeometry.setIndex(Array.from({ length: TRAIL - 1 }, (_, i) => [i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2]).flat());
  const trailLook = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { tint, strength: { value: 0 } },
    vertexShader: /* glsl */ `attribute float age; varying float vAge; void main() { vAge = age; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */ `uniform vec3 tint; uniform float strength; varying float vAge;
      void main() { float a = pow(1. - vAge, 3.) * strength; gl_FragColor = vec4(tint, a);
        #include <colorspace_fragment>
      }` });
  const trail = new THREE.Mesh(trailGeometry, trailLook); trail.frustumCulled = false; stageR.add(trail);

  // ── one moment
  const v: number[] = [], w: number[] = [], spot = new THREE.Vector3(), from = new THREE.Vector3(), ghost = new THREE.Object3D();
  const turnWave = Math.PI * 2 / LOOP;
  /** Put a hand (or a stand-in for it) where its track has it at a time, with a little life in it. */
  const place = (target: THREE.Object3D, keys: Key[], t: number, phase: number) => {
    sample(keys, t, v);
    target.position.set(v[0] + Math.cos(t * turnWave * 2 + phase) * 0.003, v[1] + Math.sin(t * turnWave * 3 + phase) * 0.004, v[2]);
    target.rotation.set(v[3] + Math.sin(t * turnWave * 2 + phase) * 0.02, v[4], v[5] + Math.cos(t * turnWave * 3 + phase) * 0.025);
  };
  /** Where the left hand's email floats at a time (into `spot`), and its size. */
  const held = (t: number) => { place(ghost, L_POSE, t, 0); sample(L_HOLD, t, w); spot.set(ghost.position.x + w[0], ghost.position.y + w[1], ghost.position.z + w[2]); return w[3]; };
  const FAR_L = new THREE.Vector3(0.14, 0.2, -1.5), FAR_R = new THREE.Vector3(-0.16, 0.24, -1.7), FOCUS_R = new THREE.Vector3(-0.055, 0.1, -0.2);
  const throwV = new THREE.Vector3(-1.15, 0.95, -0.55),      // (flung off to the top left)
    upperV = new THREE.Vector3(0.1, 0.3, -0.25), lowerV = new THREE.Vector3(-0.16, -0.06, 0.05);
  const pulse = (mesh: THREE.Mesh, at: THREE.Vector3, age: number, life: number, from0: number, to: number, camera: THREE.Camera) => {
    const material = mesh.material as THREE.MeshBasicMaterial; material.opacity = age > 0 && age < life ? (1 - age / life) ** 2 * 0.65 : 0; mesh.visible = material.opacity > 0;
    if (mesh.visible) { mesh.position.copy(at); mesh.quaternion.copy(camera.quaternion); mesh.scale.setScalar(from0 + (to - from0) * easeOut(age / life)); }
  };
  const fade = (mesh: THREE.Mesh, opacity: number) => { (mesh.material as THREE.MeshBasicMaterial).opacity = opacity; mesh.visible = opacity > 0.01; };

  /** Draw both hands, each at its own time. `lit` says which card has the light (both, when nothing moves). */
  function draw(tl: number, tr: number, lit: Side | 'both' = 'both') {
    cards.left.classList.toggle('on', lit !== 'right'); cards.right.classList.toggle('on', lit !== 'left');
    // left: caught, read, thrown
    place(left.root, L_POSE, tl, 0); left.curl(sample(L_CURL, tl, w)[0]);
    left.lit.value = Math.max(0, 1 - Math.abs(tl - (L_CATCH + 0.1)) / 0.22) * 0.7;
    let size = 1, roll = -0.05, opacity = 1, thrown = -1;
    if (tl < L_CATCH) { const k = clamp01(tl / 0.8); spot.lerpVectors(FAR_L, L_WAIT, easeOut(k)); spot.y += Math.sin(tl * 9) * 0.004 * ramp(0.6, 0.85, tl); size = 1; opacity = clamp01(tl / 0.25); roll = -0.05 + (1 - k) * 0.5; }
    else if (tl < L_IN) { const k = easeOut((tl - L_CATCH) / (L_IN - L_CATCH)); size = held(tl); spot.lerpVectors(L_WAIT, spot, k); }      // (it flies in to the hand's hold, not into the hand)
    else if (tl < L_THROW) { size = held(tl); roll = -0.05 + Math.sin(tl * turnWave * 3) * 0.02; }
    else { thrown = tl - L_THROW; size = held(L_THROW); from.copy(spot); spot.addScaledVector(throwV, thrown); spot.y -= 0.35 * thrown * thrown; roll = -0.05 + thrown * 9; opacity = 1 - ramp(0.3, 0.5, thrown); }
    letter.position.copy(spot); letter.quaternion.copy(cameraL.quaternion); letter.rotateZ(roll); letter.scale.setScalar(size * (1 + Math.max(0, 1 - Math.abs(tl - (L_CATCH + 0.05)) / 0.12) * 0.1));
    fade(page, opacity); const beat = thrown >= 0 ? (0.75 + 0.25 * Math.sin(thrown * 34)) * clamp01(thrown / 0.05) * opacity : 0; fade(gold, beat); fade(aura, beat * 0.7);
    if (thrown >= 0) held(L_THROW); kept.at(spot, thrown, 0.5, 0.55, throwV.clone().normalize().negate());      // (a gold burst where it was let go, trailing back)
    // the thread, hand to paper: it finds the email, holds it while it is held, and lets go with the throw
    const threadOn = tl < L_THROW ? ramp(L_CATCH - 0.02, L_CATCH + 0.1, tl) : 1 - ramp(0, 0.06, tl - L_THROW);
    left.root.updateMatrix(); handAt.copy(left.grip.centre).applyMatrix4(left.root.matrix);
    const span = from.subVectors(letter.position, handAt), length = span.length() - CARD_H * 0.35 * letter.scale.x;
    for (const [mesh, width, strength] of [[thread, 0.0011, 1], [threadGlow, 0.0045, 0.28]] as const) {
      mesh.visible = threadOn > 0.01 && length > 0.01;
      if (!mesh.visible) continue;
      mesh.position.copy(handAt); mesh.quaternion.setFromUnitVectors(UP, span.normalize()); mesh.scale.set(width, length, width);
      mesh.material.uniforms.fade.value = threadOn * strength * (1 + 0.8 * Math.max(0, 1 - Math.abs(tl - L_CATCH - 0.06) / 0.2));
    }
    pulse(ring, L_WAIT, tl - L_CATCH, 0.42, 0.03, 0.12, cameraL);

    // right: lit, swung, cut
    place(right.root, R_POSE, tr, 2); right.curl(sample(R_CURL, tr, w)[0]);
    const on = sample(R_POWER, tr, w)[0]; power.value = on;
    bladeGlows[0].uniforms.strength.value = 0.85 * on; bladeGlows[1].uniforms.strength.value = 0.4 * on;
    right.lit.value = Math.max(0, 1 - Math.abs(tr - (R_LIT + 0.06)) / 0.22) * 0.7;
    right.root.updateMatrix(); spot.copy(bladeBase).applyMatrix4(right.root.matrix); pulse(lightRing, spot, tr - R_LIT, 0.45, 0.02, 0.11, cameraR);
    // its email: in from afar, waiting, then in two
    const cut = tr - R_CUT;
    spot.copy(FOCUS_R); spot.y += Math.sin(tr * turnWave * 2) * 0.006;
    if (tr < 1.2) { from.copy(spot); spot.lerpVectors(FAR_R, from, easeOut(tr / 1.2)); }
    const shown = cut < 0 ? clamp01(tr / 0.25) : 1 - ramp(0.4, 0.8, cut);
    for (const [piece, velocity, spin] of [[upper, upperV, 2.6], [lower, lowerV, -1.9]] as const) {
      piece.position.copy(spot); piece.quaternion.copy(cameraR.quaternion); piece.rotateZ(0.06);
      if (cut > 0) { piece.position.addScaledVector(velocity, cut); piece.position.y -= 0.55 * cut * cut; piece.rotateZ(spin * cut); piece.rotateX(spin * 0.7 * cut); }
      fade(piece, shown);
    }
    // the flash along the cut, and what flies off it
    const flashOn = cut > 0 && cut < 0.18 ? (1 - cut / 0.18) ** 2 : 0; fade(flash, flashOn);
    if (flashOn > 0) { flash.position.copy(spot); flash.position.z += 0.004; flash.quaternion.copy(cameraR.quaternion); flash.rotateZ(0.06 + Math.atan2(cutLine.y, cutLine.x)); flash.scale.set(0.3 * easeOut(clamp01(cut / 0.05)), 0.002 + 0.009 * flashOn, 1); }
    from.copy(cutLine).normalize().applyQuaternion(cameraR.quaternion); chips.at(spot, cut, 0.55, 0.75, from);
    // the trail: where the blade was at each of the last moments, bright while it is fast and alight
    const positions = trailGeometry.attributes.position.array as Float32Array, ages = trailGeometry.attributes.age.array as Float32Array;
    let fast = 0;
    for (let i = 0; i < TRAIL; i++) {
      place(ghost, R_POSE, Math.max(0, tr - i * TRAIL_STEP), 2); ghost.updateMatrix();
      spot.copy(bladeBase).lerp(bladeTip, 0.55).applyMatrix4(ghost.matrix); positions.set([spot.x, spot.y, spot.z], i * 6);
      spot.copy(bladeTip).applyMatrix4(ghost.matrix); positions.set([spot.x, spot.y, spot.z], i * 6 + 3);
      if (i === 0) from.copy(spot); else if (i === 1) fast = from.distanceTo(spot) / TRAIL_STEP;
      ages[i * 2] = ages[i * 2 + 1] = i / (TRAIL - 1);
    }
    trailGeometry.attributes.position.needsUpdate = true; trailGeometry.attributes.age.needsUpdate = true;
    trailLook.uniforms.strength.value = clamp01(on) * clamp01((fast - 1.2) / 2.5) * 0.45; trail.visible = trailLook.uniforms.strength.value > 0.01;

    for (const step of steps) { const [side] = step.dataset.step!.split(':'), span = STEPS[step.dataset.step!], t = side === 'left' ? tl : tr; step.classList.toggle('on', !!span && moving && t >= span[0] && t < span[1]); }

    // each hand into its card's window on the canvas
    const box = canvas.getBoundingClientRect();
    renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);
    for (const [view, camera] of [[views.left, cameraL], [views.right, cameraR]] as const) {
      const r = view.getBoundingClientRect(), x = r.left - box.left, y = box.bottom - r.bottom;
      camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
      renderer.setViewport(x, y, r.width, r.height); renderer.setScissor(x, y, r.width, r.height); renderer.render(scene, camera);
    }
  }

  // ── running
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let moving = false, frame = 0, began = 0;
  const fit = () => {
    const box = canvas.getBoundingClientRect(); if (box.width < 2) return false;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(box.width, box.height, false); return true;
  };
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    if (!fit()) return;
    const t = ((now - began) / 1000) % (TURN_LEFT + TURN_RIGHT);
    host.classList.toggle('still', still.matches);
    if (still.matches) { moving = false; draw(2.3, 1.45); }      // (asked for no motion: the email held up, the blade alight)
    else if (t < TURN_LEFT) draw(t, 0, 'left');                  // (the other hand waits, open, at the start of its own loop)
    else draw(0, t - TURN_LEFT, 'right');
    canvas.classList.add('ready');
  };
  const guide: HandGuide = {
    start() { if (frame) return; moving = true; began = performance.now(); frame = requestAnimationFrame(tick); },
    stop() { cancelAnimationFrame(frame); frame = 0; moving = false; for (const step of steps) step.classList.remove('on'); cards.left.classList.remove('on'); cards.right.classList.remove('on'); },
    accent(colour) {
      const css = colour.trim() || '#f6b3cc';
      tint.value.set(css); hot.value.copy(tint.value).lerp(new THREE.Color('#ffffff'), 0.35);
      (ring.material as THREE.MeshBasicMaterial).color.copy(hot.value); (lightRing.material as THREE.MeshBasicMaterial).color.copy(hot.value); chips.points.material.color.copy(hot.value);
      paintCard(cardArt, css); cardMap.needsUpdate = true;
      const g = backdrop.getContext('2d')!, pool = g.createRadialGradient(128, 138, 0, 128, 138, 180);
      pool.addColorStop(0, `color-mix(in srgb, ${css} 16%, #17141f)`); pool.addColorStop(0.55, '#110f18'); pool.addColorStop(1, '#09080d');
      g.fillStyle = '#110f18'; g.fillRect(0, 0, 256, 256); g.fillStyle = pool; g.fillRect(0, 0, 256, 256); backing.needsUpdate = true;
    },
    frame(tl, tr, lit) { if (fit()) { moving = true; draw(tl, tr, lit); canvas.classList.add('ready'); } },
  };
  guide.accent(getComputedStyle(host).getPropertyValue('--accent'));
  if (import.meta.env.DEV) Object.assign(window, { __guide: { ...guide, left, right, cameraL, cameraR, blade, bladeBase, bladeTip, FOCUS_R, tracks: { L_POSE, L_CURL, L_HOLD, R_POSE, R_CURL, R_POWER } } });
  return guide;
}
