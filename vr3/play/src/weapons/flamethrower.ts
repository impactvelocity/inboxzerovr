import * as THREE from 'three';
import { pistolHold, propEnvironment, type HeldSpec } from './held';
import { liveGlow, Soup, type P2, type P3 } from './parts';

/**
 * Inferno's tool: a flame thrower (design: design/incinerator-v2/weapon-angles.png and
 * weapon-hero.png). A short broad graphite barrel with an oversized copper muzzle ring, a chunky
 * brick-red body banded in brass, a copper carry handle on top, a cream dial with a flame on its
 * left side, an orange button, a raked brown grip with a brass cap, and a brass tank slung under
 * the front.
 *
 * A pistol (held.ts): muzzle along -Z, grip down -Y, the middle of the fist at the origin. Three
 * draws: the painted parts, the brass and copper, and the dial's needle (it moves). The flame
 * itself is ../flame.ts.
 *
 * Measured off the sheet's left side view (muzzle to the left), one of its pixels being K metres:
 * px(x, y) is that view's point as [z, y] here.
 */
const K = 0.00042;
const R = (pixels: number) => pixels * K;
const px = (x: number, y: number): P2 => [(x - 622) * K, (372 - y) * K];
const AXIS_Y = px(0, 231)[1];        // the barrel's line above the middle of the fist: 5.9 cm
const TIP_Z = px(47, 0)[0];          // the muzzle: 24 cm ahead of it
const HANDLE_RAKE = 24;              // degrees the grip is raked back, as the sheet draws it
// How it sits in the fist: the sprayer's hold, which the user settled on 2026-11-11 ("more natural
// like it's being held, more straight"): the grip nearly in the fist, the barrel along the forearm.
// (8 degrees higher than it was, and in the hand a little to the right, 2026-11-12: "move the gun more to the
// right (in hand slightly) and angle the gun up more, it feels too pointed down")
const AIM_RAKE = 29;
const SHIFT: [number, number, number] = [0.012, 0, 0];
const TURN = -7;
const HALF = R(104);                 // half the body's width: it is as broad as it is tall
const NEEDLE_REST = -42, NEEDLE_FULL = 64;      // degrees from straight up, towards the back of the gun

export function buildFlameThrower(renderer: THREE.WebGLRenderer): HeldSpec {
  const red = '#c9402e', graphite = '#4a3e49', brown = '#6e3b2c', cream = '#f3e4c2', tan = '#a9814a';
  const copper = '#e8703a', brass = '#f0bc4c';
  const paint = new Soup(), metal = new Soup();
  const SIDES = 10, PHASE = Math.PI / SIDES;

  // ---- everything turned about the barrel's own line: muzzle ring, bore, barrel, front band
  const barrel = new THREE.Matrix4().makeTranslation(0, AXIS_Y, TIP_Z).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  metal.place(barrel).paint(copper, 0.22).lathe([[R(86), R(8)], [R(104), 0], [R(121), R(16)], [R(121), R(70)], [R(111), R(91)], [R(102), R(91)]], SIDES, PHASE);
  // the bore: dark, and hot at the back of it (the glow is the pilot light, and brighter while it fires)
  paint.place(barrel).paint('#2a1814', 0.45).lathe([[R(86), R(8)], [R(78), R(125)]], SIDES, PHASE);
  paint.paint('#3a1a10', 1).lathe([[R(78), R(125)], [0, R(125)]], SIDES, PHASE);
  paint.paint(graphite).lathe([[R(102), R(91)], [R(102), R(200)]], SIDES, PHASE);
  metal.paint(brass).lathe([[R(102), R(194)], [R(119), R(197)], [R(119), R(256)], [R(100), R(259)]], SIDES, PHASE);
  metal.place(null); paint.place(null);

  // ---- the body: a square section with its edges taken off, drawn in to a blunt nose at the back
  const section = (z: number, half: number, top: number, bottom: number, c: number): P3[] => [
    [-half + c, bottom, z], [half - c, bottom, z], [half, bottom + c, z], [half, top - c, z],
    [half - c, top, z], [-half + c, top, z], [-half, top - c, z], [-half, bottom + c, z]];
  const front = section(px(298, 0)[0], HALF, px(0, 128)[1], px(0, 335)[1], 0.012);
  const back = section(px(592, 0)[0], HALF, px(0, 128)[1], px(0, 335)[1], 0.012);
  const nose = section(px(665, 0)[0], R(48), px(0, 168)[1], px(0, 226)[1], 0.006);
  paint.paint(red).band(front, back).band(back, nose).fan(nose).fan(front);
  // the brass bracket over the back of it
  metal.paint(brass).block(0, px(0, 150)[1], px(580, 0)[0], (HALF + 0.003) * 2, R(76), R(55), 0.006);

  // ---- bolts: two each side on the front band, one each side on the bracket
  const bolt = (x: number, y: number, z: number, side: number) => {
    metal.paint('#f0c25a').place(new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationZ(-side * Math.PI / 2)));
    metal.lathe([[0, 0.0034], [0.0046, 0.0034], [0.0060, 0]], 6);
    metal.place(null);
  };
  for (const side of [-1, 1]) {
    for (const y of [160, 305]) bolt(side * R(93), px(0, y)[1], px(283, 0)[0], side);
    bolt(side * (HALF + 0.003), px(0, 160)[1], px(583, 0)[0], side);
  }

  // ---- the carry handle: a copper arch on two brass feet
  metal.paint(copper).hull([px(318, 102), px(342, 42), px(514, 42), px(542, 102), px(506, 102), px(489, 70), px(367, 70), px(353, 102)], R(28), 0.004, 0.003);
  metal.paint(brass);
  for (const x of [339, 519]) metal.block(0, px(0, 114)[1], px(x, 0)[0], R(92), R(32), R(72), 0.004);

  // ---- the grip and its cap; an orange button either side where the thumb comes
  paint.paint(brown).hull([px(522, 300), px(546, 366), px(586, 456), px(716, 431), px(692, 340), px(656, 268), px(616, 238)], 0.019, 0.007, 0.005);
  metal.paint(brass).hull([px(570, 452), px(718, 426), px(724, 462), px(578, 490)], 0.022, 0.005, 0.003);
  paint.paint('#ff6a1a', 0.7);
  for (const side of [-1, 1]) paint.block(side * (HALF + 0.001), px(0, 277)[1], px(585, 0)[0], 0.008, R(44), R(44), 0.004);

  // ---- the tank: a brass capsule on two mounts, two straps round it
  const tank = new THREE.Matrix4().makeTranslation(0, px(0, 403)[1], px(248, 0)[0]).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  metal.place(tank).paint(brass).lathe([[0, 0], [R(30), R(5)], [R(48), R(22)], [R(52), R(44)], [R(52), R(221)], [R(48), R(243)], [R(30), R(260)], [0, R(265)]], SIDES, PHASE);
  paint.place(tank).paint(tan);
  for (const at of [60, 184]) paint.lathe([[R(52), R(at)], [R(55.5), R(at + 1)], [R(55.5), R(at + 29)], [R(52), R(at + 30)]], SIDES, PHASE);
  metal.place(null); paint.place(null);
  metal.paint(brass);
  for (const x of [321, 446]) metal.block(0, px(0, 345)[1], px(x, 0)[0], R(70), R(26), R(44), 0.004);

  // ---- the dial, on the left: a brass ring, a cream face, its marks and a flame. Built lying
  // down (up the gun is +X here, towards the back of it +Z, out of the face +Y) and stood on the side.
  const [dialZ, dialY] = px(440, 230);
  const dial = new THREE.Matrix4().makeTranslation(-HALF, dialY, dialZ).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
  const FACE = 0.005;
  /** A point on the dial's face: so many pixels to the right of its middle and down, as the sheet has it. */
  const on = (right: number, down: number, lift = 0.0005): P3 => [-down * K, FACE + lift, right * K];
  metal.place(dial).paint(brass).lathe([[R(80), 0], [R(80), 0.007], [R(69), 0.010], [R(63), FACE]], 12);
  metal.paint('#f0c25a').lathe([[0, 0.0095], [R(9), 0.0095], [R(12), FACE]], 8);
  paint.place(dial).paint(cream).lathe([[R(63), FACE], [0, FACE]], 12);
  paint.paint('#77706c');
  for (const degrees of [-56, -20, 16]) {
    const a = degrees * Math.PI / 180, s = Math.sin(a), c = Math.cos(a), w = 3.6;
    const at = (r: number, off: number) => on(s * r + c * off, -c * r + s * off);
    paint.quad(at(40, -w), at(40, w), at(53, w), at(53, -w));
  }
  const flame = (points: [number, number][], lift = 0.0005) => paint.fan(points.map(([x, y]) => on(x * 0.95, y * 0.95 + 37, lift)));
  paint.paint('#d9472c', 0.5);
  flame([[0, -21], [9, -7], [14, 4], [11, 13], [4, 17], [-4, 17], [-11, 13], [-14, 4], [-8, -5]]);
  flame([[-15, -12], [-7, -2], [-13, 6]]);
  paint.paint(cream); flame([[0, 3], [5, 10], [0, 15], [-5, 10]], 0.0009);
  metal.place(null); paint.place(null);

  // the needle, by itself because it moves: it lies along +X (straight up the dial) and turns about the face
  const needleSoup = new Soup().paint('#d9372a');
  needleSoup.tri([0, 0, -R(5)], [0, 0, R(5)], [R(55), 0, 0]).tri([0, 0, -R(5)], [0, 0, R(5)], [-R(12), 0, 0]);

  const paintGeometry = paint.geometry(), metalGeometry = metal.geometry(), needleGeometry = needleSoup.geometry();

  // A furnace room to reflect: dark iron, the amber lamps overhead, firelight low to either side.
  const environment = propEnvironment(renderer, [[0, '#6a4a3c'], [0.42, '#b98a62'], [0.56, '#6a4234'], [1, '#2a1c1c']],
    [[26, 6, 56, 12, '#ffe0a8'], [150, 8, 64, 12, '#ffd08a'], [84, 64, 22, 34, '#ff8a2a'], [214, 66, 22, 32, '#ff7a1e']]);
  const enamel = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.58, metalness: 0.02, envMap: environment.texture, envMapIntensity: 0.35 });
  const brassy = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.2, envMap: environment.texture, envMapIntensity: 1.1 });
  const pointer = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.5, metalness: 0 });
  // What is hot glows: the bore always (the pilot light), and with it the muzzle ring as it heats up.
  const glows = [liveGlow(enamel, '#ffc04a', '#ff3c0a'), liveGlow(brassy, '#ffb040', '#ff2e06')];

  const model = new THREE.Group(); model.name = 'Flame thrower';
  const body = new THREE.Group(); body.name = 'Flame thrower body';          // (everything, so that it can kick as it fires)
  const painted = new THREE.Mesh(paintGeometry, enamel); painted.name = 'Body, barrel, grip and dial face';
  const fittings = new THREE.Mesh(metalGeometry, brassy); fittings.name = 'Muzzle ring, bands, handle and tank';
  const needlePivot = new THREE.Group(); needlePivot.name = 'Dial needle'; needlePivot.matrixAutoUpdate = false;
  needlePivot.matrix.copy(dial).multiply(new THREE.Matrix4().makeTranslation(0, FACE + 0.0022, 0));
  const needle = new THREE.Mesh(needleGeometry, pointer); needlePivot.add(needle);
  body.add(painted, fittings, needlePivot); model.add(body);

  let squeezed = 0, heat = 0, swing = NEEDLE_REST;

  const spec: HeldSpec = {
    name: 'Flame thrower — right grip', model,
    hold: pistolHold({ rake: AIM_RAKE, turn: TURN, shift: SHIFT }), tilt: HANDLE_RAKE - AIM_RAKE,
    aim: { origin: new THREE.Vector3(0, AXIS_Y, TIP_Z - 0.004), direction: new THREE.Vector3(0, 0, -1) },
    onLive(level) { squeezed = level; },
    onUpdate(dt, clock, _speed, night) {
      // it heats as it is fired and cools slowly after: the muzzle ring glows on for a while
      heat += (squeezed - heat) * (1 - Math.exp(-dt * (squeezed > heat ? 0.8 : 0.4)));
      const flutter = 0.86 + 0.14 * Math.sin(clock * 37) * Math.sin(clock * 23.3);
      const level = (0.42 + 0.14 * night) * (0.85 + 0.15 * Math.sin(clock * 9.1)) + squeezed * 0.75 * flutter + heat * 0.85;
      for (const glow of glows) { glow.liveLevel.value = level; glow.liveTime.value = clock; }
      // the needle climbs with the pressure, and shakes while it fires
      const want = NEEDLE_REST + (NEEDLE_FULL - NEEDLE_REST) * Math.max(squeezed, heat * 0.55);
      swing += (want - swing) * (1 - Math.exp(-dt * 9));
      needle.rotation.y = -(swing + squeezed * 4 * Math.sin(clock * 41)) * Math.PI / 180;
      // and the whole thing kicks back a little and shudders in the hand
      body.position.set(squeezed * 0.0007 * Math.sin(clock * 53), squeezed * 0.0007 * Math.sin(clock * 47 + 1), squeezed * (0.004 + 0.0012 * Math.sin(clock * 61)));
    },
    dispose() {
      for (const g of [paintGeometry, metalGeometry, needleGeometry]) g.dispose();
      for (const m of [enamel, brassy, pointer]) m.dispose();
      environment.dispose();
    },
  };
  spec.onUpdate!(0, 0, 0, 0);
  return spec;
}
