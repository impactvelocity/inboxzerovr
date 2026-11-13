import * as THREE from 'three';
import { pistolHold, propEnvironment, type HeldSpec } from './held';
import { Soup, type P3 } from './parts';

/**
 * Knockout's weapon: a red leather boxing glove on the right fist (design: the user's glove sheets
 * of 2026-11-12, and design/theme-tests-v2/boxing/weapon-angles.png for the low-poly cut of it). A
 * plump mitt, wider at the knuckles than at the wrist, with a fold across its palm; a separate
 * thumb lying along its thumb edge, stitched down its length; a cream cuff with rolled edges, a
 * strap wrapped over it ending in a rounded tab, red stitching round both; dark lining in the
 * wrist opening.
 *
 * Worn, not held, but placed as a pistol is (held.ts): the middle of the fist at the origin, the
 * punching face towards -Z, the cuff and wrist opening towards +Z, the thumb on +Y (the fist is
 * held thumb up), the back of the hand towards +X and the palm towards -X. One mesh, one draw.
 *
 * The mitt and the thumb are balls of triangles pulled into shape (blob(), below); the cuff is
 * turned about Z. A hit squashes the mitt in the vertex shader (the cuff stays as it is) and
 * knocks the whole glove back a little; both spring back.
 */
const FRONT = -0.100;                 // the front of the knuckle padding
const NECK = 0.064;                   // where the mitt goes into the cuff
const CUFF_END = 0.170;
const CUFF_R = 0.0465, CUFF_X = 0.93, CUFF_Y = 1.06;        // the cuff is a little oval, as a wrist is: wider thumb to little finger
const MITT = { zc: -0.006, hz: 0.094, rx: 0.061, ry: 0.074, square: 2.7 };
const THUMB = { centre: new THREE.Vector3(-0.031, 0.056, 0.005), rx: 0.032, ry: 0.033, rz: 0.061 };
const RAKE = 22;                      // degrees the punch's line is lifted from the knuckles' towards the thumb: along the forearm
const SQUASH = 0.22;                  // how much shorter the mitt is at the moment of a full-strength hit

type Shape = (dx: number, dy: number, dz: number, out: THREE.Vector3) => THREE.Vector3;
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (x: number, y: number, z: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };

/** How deep the fold across the palm is at a point of the mitt (0 none, 1 its bottom). */
function fold(across: number, z: number, side: number) {
  if (across >= 0) return 0;
  // a soft valley across the palm, a little ahead of the fist's middle, bowed forward at its ends
  const line = 0.006 - 0.022 * side * side;
  const g = Math.exp(-((z - line) ** 2) / (2 * 0.019 ** 2));
  return g * smooth(0, 0.5, -across) * (1 - smooth(0.72, 1, Math.abs(side)));
}

/** The mitt: an egg, blunt at the front, fuller on the back of the hand than on the palm. */
const mitt: Shape = (dx, dy, dz, out) => {
  const round = Math.sqrt(Math.max(1e-9, 1 - dz * dz)), cx = dx / round, cy = dy / round;
  // (its section is squarer than a circle: a padded cushion, not a ball)
  const boxy = Math.pow(Math.pow(Math.abs(cx), MITT.square) + Math.pow(Math.abs(cy), MITT.square), -1 / MITT.square);
  const rad = Math.pow(round * round, 0.41) * (1 - 0.13 * dz) * boxy;
  let x = MITT.rx * rad * cx * (cx < 0 ? 0.84 : 1), y = MITT.ry * rad * cy;
  const z = MITT.zc + MITT.hz * dz * (1.12 - 0.12 * dz * dz);
  x += 0.0075 * fold(cx, z, cy);                                // the fold, pressed in
  const curl = Math.max(0, -0.02 - z) / 0.08;
  x -= 0.011 * curl * curl;                                    // the fingers' end curls over towards the palm
  return out.set(x, y, z);
};

const thumbTurn = new THREE.Matrix4().makeRotationX(-0.16).multiply(new THREE.Matrix4().makeRotationY(0.08));
/** The thumb: plump, a touch fatter towards its tip, lying along the mitt's thumb edge and leaning in over the palm. */
const thumb: Shape = (dx, dy, dz, out) => {
  const round = Math.sqrt(Math.max(1e-9, 1 - dz * dz)), cx = dx / round, cy = dy / round;
  const rad = Math.pow(round * round, 0.39) * (1 - 0.2 * dz);
  out.set(THUMB.rx * rad * cx, THUMB.ry * rad * cy * (cy < 0 ? 0.8 : 1), THUMB.rz * dz);
  return out.applyMatrix4(thumbTurn).add(THUMB.centre);
};

const DARK = new THREE.Color('#7c1018'), LIGHT = new THREE.Color('#d2322c'), CREASE = new THREE.Color('#5c0a12');
/** Painted leather: warmer and lighter where the arena's lights fall (the thumb's side, the back of the hand), deeper underneath and in the fold. */
function leather(p: THREE.Vector3, shade: number, out: THREE.Color) {
  const up = smooth(-0.07, 0.085, p.y), back = smooth(-0.06, 0.06, p.x);
  const t = 0.12 + 0.62 * up + 0.2 * back + 0.14 * (hash(Math.round(p.x * 90), Math.round(p.y * 90), Math.round(p.z * 90)) - 0.5);
  return out.copy(DARK).lerp(LIGHT, Math.max(0, Math.min(1, t))).lerp(CREASE, Math.max(0, Math.min(1, shade)));
}

/** A ball of triangles pulled into `shape`, each corner painted by `colour`. */
function blob(soup: Soup, detail: number, shape: Shape, colour: (p: THREE.Vector3, out: THREE.Color) => THREE.Color) {
  const ball = new THREE.IcosahedronGeometry(1, detail), at = ball.getAttribute('position');
  const d = new THREE.Vector3(), p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i < at.count; i += 3) {
    const colours = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
    for (let k = 0; k < 3; k++) { d.fromBufferAttribute(at, i + k).normalize(); shape(d.x, d.y, d.z, p[k]); colour(p[k], colours[k]); }
    soup.tri(p[0].toArray() as P3, p[1].toArray() as P3, p[2].toArray() as P3, colours);
  }
  ball.dispose();
}

/** A point of the cuff's surface: angle round Z from the back of the hand (+X) towards the thumb (+Y), z, radius. */
const cuffAt = (angle: number, z: number, r: number): P3 => [Math.cos(angle) * r * CUFF_X, Math.sin(angle) * r * CUFF_Y, z];

/**
 * A row of stitches along a path over the cuff (points [angle, z]) at radius r: dashes `length`
 * long, `gap` apart, `width` across.
 */
function stitches(soup: Soup, path: [number, number][], r: number, length: number, gap: number, width: number) {
  let walked = 0, next = gap * 0.5;
  for (let i = 0; i < path.length - 1; i++) {
    const [a0, z0] = path[i], [a1, z1] = path[i + 1];
    const du = (a1 - a0) * r, dz = z1 - z0, step = Math.hypot(du, dz);
    if (step < 1e-7) continue;
    while (next + length * 0.5 <= walked + step) {
      const t = (next - walked) / step, a = a0 + (a1 - a0) * t, z = z0 + dz * t;
      // along the path, and across it, as changes of angle and of z
      const ta = du / step / r, tz = dz / step, na = -tz / r, nz = du / step, l = length / 2, w = width / 2;
      soup.quad(cuffAt(a - ta * l - na * w, z - tz * l - nz * w, r), cuffAt(a + ta * l - na * w, z + tz * l - nz * w, r),
        cuffAt(a + ta * l + na * w, z + tz * l + nz * w, r), cuffAt(a - ta * l + na * w, z - tz * l + nz * w, r));
      next += length + gap;
    }
    walked += step;
  }
}

export function buildGlove(renderer: THREE.WebGLRenderer): HeldSpec {
  const soup = new Soup();
  const cream = '#f0dcb4', creamLow = '#d9bf93', creamHigh = '#fbeccc', thread = '#b3202a', lining = '#5a0d14', deep = '#35070c';

  // ---- the mitt and the thumb
  const q = new THREE.Vector3();
  blob(soup, 6, mitt, (p, out) => {
    const round = Math.hypot(p.x / MITT.rx, p.y / MITT.ry) || 1;
    // darker in the fold, and in the gully the thumb lies in
    const off = q.copy(p).sub(THUMB.centre).setZ(0).length() - 0.03;
    const gully = Math.exp(-(off * off) / (2 * 0.008 ** 2)) * smooth(-0.05, -0.02, -Math.abs(p.z - THUMB.centre.z));
    return leather(p, 0.5 * fold(p.x / MITT.rx / round, p.z, p.y / MITT.ry / round) + 0.45 * gully, out);
  });
  blob(soup, 3, thumb, (p, out) => leather(p, 0.3 * smooth(0.05, 0.03, p.y), out));

  // the seam down the thumb, on the palm's side and on the back's: light stitches standing just proud of the leather
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
  const onThumb = (turn: number, along: number, out: THREE.Vector3) => {
    const round = Math.sqrt(1 - along * along);
    thumb(Math.cos(turn) * round, Math.sin(turn) * round, along, out);
    return out.addScaledVector(q.copy(out).sub(THUMB.centre).normalize(), 0.0008);
  };
  soup.paint('#f08a78');
  for (const turn of [3.62, -0.5]) for (let k = 0; k < 9; k++) {
    const along = -0.74 + k * 0.165, l = 0.045, w = 0.045;
    onThumb(turn - w, along - l, a); onThumb(turn + w, along - l, b); onThumb(turn + w, along + l, c); onThumb(turn - w, along + l, d);
    soup.quad(a.toArray() as P3, b.toArray() as P3, c.toArray() as P3, d.toArray() as P3);
  }

  // ---- the cuff, turned about Z: rolled at both edges, then in through the opening to the dark lining
  const turned = new THREE.Matrix4().makeScale(CUFF_X, CUFF_Y, 1).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  const R = CUFF_R, SIDES = 22;
  soup.place(turned);
  soup.paint(creamLow).lathe([[R - 0.006, NECK - 0.004], [R + 0.0018, NECK + 0.003]], SIDES);
  soup.paint(creamHigh).lathe([[R + 0.0018, NECK + 0.003], [R + 0.0018, NECK + 0.0075], [R, NECK + 0.0105]], SIDES);
  soup.paint(cream).lathe([[R, NECK + 0.0105], [R, CUFF_END - 0.0105]], SIDES);
  soup.paint(creamHigh).lathe([[R, CUFF_END - 0.0105], [R + 0.0018, CUFF_END - 0.0075], [R + 0.0018, CUFF_END - 0.003]], SIDES);
  soup.paint(creamLow).lathe([[R + 0.0018, CUFF_END - 0.003], [R - 0.002, CUFF_END], [R - 0.0065, CUFF_END - 0.001]], SIDES);
  soup.paint(lining).lathe([[R - 0.0065, CUFF_END - 0.001], [R - 0.008, CUFF_END - 0.03]], SIDES);
  soup.paint(deep).lathe([[R - 0.008, CUFF_END - 0.03], [R - 0.011, CUFF_END - 0.075], [0, CUFF_END - 0.075]], SIDES);
  // the strap, all the way round: a band standing proud of the cuff
  const S0 = NECK + 0.0225, S1 = CUFF_END - 0.0205, RS = R + 0.0024;
  soup.paint(creamLow).lathe([[R, S0 - 0.0012], [RS, S0]], SIDES);
  soup.paint(cream).lathe([[RS, S0], [RS, S1]], SIDES);
  soup.paint(creamLow).lathe([[RS, S1], [R, S1 + 0.0012]], SIDES);
  soup.place(null);

  // ...and its end, wrapped over on top of that: a tab that comes round under the little finger and
  // over the back of the hand, and ends rounded just short of the thumb's side
  const RT = RS + 0.0026, MID = (S0 + S1) / 2, HALF = (S1 - S0) / 2 - 0.0022, FROM = -1.75, TO = 0.72;
  const halfAt = (angle: number) => { const u = (TO - angle) * RT; return u >= HALF ? HALF : Math.sqrt(Math.max(0, HALF * HALF - (HALF - u) ** 2)); };
  const turns: number[] = [];
  for (let i = 0; i <= 12; i++) turns.push(FROM + (TO - HALF / RT - FROM) * i / 12);
  for (let i = 1; i <= 7; i++) turns.push(TO - HALF / RT * Math.cos(i / 7 * Math.PI / 2));
  for (let i = 0; i < turns.length - 1; i++) {
    const a0 = turns[i], a1 = turns[i + 1], h0 = halfAt(a0), h1 = halfAt(a1);
    soup.paint(creamHigh).quad(cuffAt(a0, MID - h0, RT), cuffAt(a1, MID - h1, RT), cuffAt(a1, MID + h1, RT), cuffAt(a0, MID + h0, RT));
    soup.paint(creamLow);
    for (const side of [-1, 1]) soup.quad(cuffAt(a0, MID + side * h0, RT), cuffAt(a1, MID + side * h1, RT), cuffAt(a1, MID + side * (h1 + 0.001), RS), cuffAt(a0, MID + side * (h0 + 0.001), RS));
  }
  soup.quad(cuffAt(FROM, MID - HALF, RT), cuffAt(FROM, MID + HALF, RT), cuffAt(FROM - 0.02, MID + HALF, RS), cuffAt(FROM - 0.02, MID - HALF, RS));

  // red stitching: a row inside each rolled edge of the cuff, and round the tab just in from its edge
  soup.paint(thread);
  const circle = (z: number): [number, number][] => Array.from({ length: 73 }, (_, i) => [i / 72 * Math.PI * 2, z]);
  stitches(soup, circle(NECK + 0.0155), R + 0.0006, 0.0046, 0.0034, 0.0014);
  stitches(soup, circle(CUFF_END - 0.0155), R + 0.0006, 0.0046, 0.0034, 0.0014);
  const IN = 0.0052, half = HALF - IN, end = TO - IN / RT;
  const round: [number, number][] = [];
  for (let i = 0; i <= 20; i++) round.push([FROM + 0.03 + (end - half / RT - FROM - 0.03) * i / 20, MID - half]);
  for (let i = 1; i <= 12; i++) { const turn = -Math.PI / 2 + i / 12 * Math.PI; round.push([end - half / RT + Math.cos(turn) * half / RT, MID + Math.sin(turn) * half]); }
  for (let i = 1; i <= 20; i++) round.push([end - half / RT - (end - half / RT - FROM - 0.03) * i / 20, MID + half]);
  stitches(soup, round, RT + 0.0006, 0.0046, 0.0034, 0.0014);

  const geometry = soup.geometry();
  // The arena overhead: a warm white rig of floodlights, the dark of the hall, the blue canvas thrown back up.
  const environment = propEnvironment(renderer, [[0, '#fff3dc'], [0.3, '#8f86c8'], [0.55, '#2a2f6e'], [1, '#3a55c4']],
    [[18, 6, 54, 12, '#ffffff'], [104, 4, 48, 10, '#ffffff'], [186, 8, 50, 12, '#fff0d0']]);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.45, metalness: 0, envMap: environment.texture, envMapIntensity: 0.55 });
  // A hit squashes the mitt: shorter along the punch, fatter across it. The cuff, behind the neck, keeps its shape.
  const squash = { value: 0 };
  material.onBeforeCompile = shader => {
    shader.uniforms.gloveSquash = squash;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float gloveSquash;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float soft = 1. - smoothstep(${(NECK - 0.02).toFixed(4)}, ${(NECK + 0.008).toFixed(4)}, position.z);
        transformed.z = mix(transformed.z, ${NECK.toFixed(4)} + (transformed.z - ${NECK.toFixed(4)}) * (1. - gloveSquash), soft);
        transformed.xy *= 1. + gloveSquash * .55 * soft;`);
  };
  material.customProgramCacheKey = () => 'vr3-glove-squash';
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Red leather boxing glove';
  const model = new THREE.Group(); model.name = 'Boxing glove'; model.add(mesh);

  // the squash is a spring: let go at the moment of the hit, it comes back past its shape a little and settles in about a quarter of a second
  let pressed = 0, speed = 0;
  return {
    name: 'Boxing glove — right fist', model,
    hold: pistolHold({ rake: RAKE }), tilt: 0, hidesHand: true,
    // on a monitor: low at the right of the view, knuckles into the scene and a little towards the middle, the thumb's side up and showing
    desktop: { position: [0.27, -0.25, -0.46], rotateX: 0.4, rotateY: 0.5, rotateZ: -0.55, punch: true },
    hit: { base: new THREE.Vector3(0, 0, 0.1), tip: new THREE.Vector3(0, 0, FRONT) },
    trail: [1, 0.62, 0.5],
    onImpact(strength) { pressed = Math.max(pressed, SQUASH * Math.max(0, Math.min(1, strength))); speed = 0; },
    onUpdate(dt) {
      if (pressed === 0 && speed === 0) return;
      // (in small steps, so a long frame cannot throw it)
      for (let left = Math.min(dt, 0.1); left > 0; left -= 0.004) {
        const h = Math.min(0.004, left);
        speed += (-760 * pressed - 22 * speed) * h; pressed += speed * h;
      }
      if (Math.abs(pressed) < 0.0005 && Math.abs(speed) < 0.02) { pressed = 0; speed = 0; }
      squash.value = pressed; model.position.z = pressed * 0.07;
    },
    dispose() { geometry.dispose(); material.dispose(); environment.dispose(); },
  };
}
