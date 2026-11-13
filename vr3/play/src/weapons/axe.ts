import * as THREE from 'three';
import { propEnvironment, rodHold, type HeldSpec } from './held';
import { insetPolygon, liveGlow, Soup, type P2, type P3 } from './parts';

/**
 * LumberHack's weapon: a lumberjack's axe (design: design/lumberjack-farm-v1/axe-angles-v2.png, the
 * plain one: no paint on the head, no pin). A chunky bearded head of charcoal steel with a broad
 * satin-silver bevel to its edge; a honey-brown handle with a long easy S to it, a burgundy leather
 * wrap where it is held, a cream cap on its butt, and the handle's wedge showing through the top
 * of the head.
 *
 * A rod (held.ts): the handle runs up +Y, the edge leads on -X, the head's flats are on Z. y = 0 is
 * where the top of the fist comes to, on the wrap. Two draws (steel; wood, leather and cap), and a
 * third while the trigger makes it live: a light along the edge.
 */
const CAP = -0.150, WRAP_FROM = -0.116, WRAP_TO = 0.106;
/** Where the top of the fist comes to, up the handle (it was the wrap's top, 0, until 2026-11-12: "the hand feels too low on the handle"). The wrap runs on up past it. */
const GRIP_Y = 0.07;
/** The middle of the head, up the handle, and how far the handle goes on through it to the top of the wedge. */
const HEAD_Y = 0.35, TOP_Y = 0.428;
/** The handle's middle line, [x, y]: an S, its belly towards the edge, straightening into the head; the butt kicks forward. */
const SPINE: P2[] = [[-0.011, -0.156], [-0.005, -0.118], [0, -0.05], [0, 0.02], [-0.012, 0.09], [-0.03, 0.16], [-0.042, 0.23], [-0.042, 0.29], [-0.034, HEAD_Y], [-0.026, TOP_Y]];

/** A smooth line through the spine's points: where the handle's middle is at height y, and which way it runs there. */
function spine(y: number): { at: P2; along: P2 } {
  let k = 1;
  while (k < SPINE.length - 2 && SPINE[k + 1][1] < y) k++;
  if (y < SPINE[1][1]) k = 0;
  const p0 = SPINE[Math.max(0, k - 1)], p1 = SPINE[k], p2 = SPINE[k + 1], p3 = SPINE[Math.min(SPINE.length - 1, k + 2)];
  const t = (y - p1[1]) / (p2[1] - p1[1]), t2 = t * t, t3 = t2 * t;
  // Catmull-Rom in x (the points are near enough evenly spaced in y for y itself to be the measure along it)
  const x = 0.5 * (2 * p1[0] + (p2[0] - p0[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (3 * p1[0] - p0[0] - 3 * p2[0] + p3[0]) * t3);
  const dx = 0.5 * ((p2[0] - p0[0]) + 2 * (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t + 3 * (3 * p1[0] - p0[0] - 3 * p2[0] + p3[0]) * t2) / (p2[1] - p1[1]);
  const n = Math.hypot(dx, 1);
  return { at: [x, y], along: [dx / n, 1 / n] };
}
/** A ring round the handle at height y: `a` its half-width fore and aft, `b` across, `sides` corners. */
function ring(y: number, a: number, b: number, sides: number, phase = 0): P3[] {
  const { at, along } = spine(y);
  // (across the handle, in its own plane: the way the handle runs, turned a quarter)
  const nx = along[1], ny = -along[0];
  return Array.from({ length: sides }, (_, i) => {
    const angle = phase + i / sides * Math.PI * 2, c = Math.cos(angle) * a, s = Math.sin(angle) * b;
    return [at[0] + nx * c, at[1] + ny * c, s] as P3;
  });
}

// ---- the head, drawn in its own plane: u towards the edge, v up the handle, metres from the middle of the eye.
// Its outline, in order round it: the poll (the flat back), the top out to the toe, the edge down to the heel,
// and the throat back under the cheek.
const POLL: P2[] = [[-0.036, -0.036], [-0.040, -0.030], [-0.040, 0.038], [-0.034, 0.045]];
const TOP: P2[] = [[0.028, 0.051]];
const BEVEL_TOP: P2 = [0.104, 0.036];              // where the bevel begins along the top
const EDGE: P2[] = [[0.148, 0.026], [0.161, -0.012], [0.164, -0.052], [0.157, -0.094], [0.136, -0.136]];      // toe to heel
const BEVEL_FOOT: P2 = [0.098, -0.096];            // and where it ends along the throat
const THROAT: P2[] = [[0.078, -0.074], [0.056, -0.056], [0.036, -0.046], [0.026, -0.043]];
/** The bevel's inner line, top to foot, between those two (the silver begins here). */
const BEVEL_LINE: P2[] = [[0.113, -0.004], [0.116, -0.044], [0.111, -0.080]];
const HALF_POLL = 0.027, HALF_BEVEL = 0.0105;
// The whole axe is turned this far about its handle, its edge in towards the middle of the view, so that
// the player sees the cheek of the head and its bright bevel and not only the back of it (as the knight's
// sword is turned to show its flat). The edge still leads, and now leads towards where the mail is.
const TWIST = 26 * Math.PI / 180;      // half the head's thickness at the eye, and where the bevel begins

export function buildAxe(renderer: THREE.WebGLRenderer): HeldSpec {
  let seed = 61331;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const shade = (colour: THREE.Color, spread: number) => colour.clone().multiplyScalar(1 - spread / 2 + random() * spread);

  // The head's plane, set on the handle: v runs the way the handle does there, u a quarter turn from it towards -X.
  const eye = spine(HEAD_Y);
  // (and drawn a size up: on the sheet the head is two fifths of the axe's whole length)
  const BIG = 1.2;
  const place = (u0: number, v0: number, z: number): P3 => { const u = u0 * BIG, v = v0 * BIG; return [eye.at[0] - eye.along[1] * u + eye.along[0] * v, eye.at[1] + eye.along[0] * u + eye.along[1] * v, z]; };

  // ---- steel: the head
  const steel = new Soup();
  const charcoal = new THREE.Color('#56545c'), silver = new THREE.Color('#e4e6ea');
  const outline: P2[] = [...POLL, ...TOP, BEVEL_TOP, ...EDGE, BEVEL_FOOT, ...THROAT];
  const iTop = POLL.length + TOP.length, iToe = iTop + 1, iHeel = iToe + EDGE.length - 1, iFoot = iHeel + 1;
  const inner = insetPolygon(outline, 0.0065);
  // How far a point is from the eye towards the edge, 0 to 1: the edge's own line is 1.
  const edgeAt = (v: number) => {
    if (v >= EDGE[0][1]) return EDGE[0][0];
    for (let i = 0; i < EDGE.length - 1; i++) if (v >= EDGE[i + 1][1]) { const t = (EDGE[i][1] - v) / (EDGE[i][1] - EDGE[i + 1][1]); return EDGE[i][0] + (EDGE[i + 1][0] - EDGE[i][0]) * t; }
    return EDGE[EDGE.length - 1][0];
  };
  const onEdge = new Set<P2>(EDGE), onBevel = new Set<P2>([BEVEL_TOP, BEVEL_FOOT, ...BEVEL_LINE]);
  /** Half the head's thickness at a point of it: thick at the eye, thinning along the cheek, then quickly to nothing at the edge. */
  function half(p: P2, source: P2 = p): number {
    if (onEdge.has(source)) return 0;
    if (onBevel.has(source)) return HALF_BEVEL;
    const front = 0.030, s = Math.max(0, Math.min(1, (p[0] - front) / (edgeAt(p[1]) - 0.03 - front)));
    return HALF_POLL + (HALF_BEVEL - HALF_POLL) * Math.pow(s, 0.8);
  }
  // each corner of the outline, and of the line drawn in from it, on both faces
  const rim = outline.map(p => half(p) * (onEdge.has(p) ? 0 : 0.68)), deep = inner.map((p, i) => (onEdge.has(outline[i]) ? 0.0024 : half(p, outline[i])));
  const glowOf = (i: number) => (onEdge.has(outline[i]) ? 1 : onBevel.has(outline[i]) ? 0.4 : 0.03);
  const bevelPart = (i: number, j: number) => i >= iTop && j <= iFoot && j > i;
  for (const face of [1, -1]) {
    // the chamfer all round, from the outline in to the inner line; silver along the bevel
    for (let i = 0; i < outline.length; i++) {
      const j = (i + 1) % outline.length, colour = shade(bevelPart(i, j) ? silver : charcoal, 0.1);
      steel.quad(place(outline[i][0], outline[i][1], rim[i] * face), place(outline[j][0], outline[j][1], rim[j] * face),
        place(inner[j][0], inner[j][1], deep[j] * face), place(inner[i][0], inner[i][1], deep[i] * face),
        [colour, colour, colour, colour], [glowOf(i), glowOf(j), glowOf(j) * 0.6, glowOf(i) * 0.6]);
    }
    // the cheek: everything inside the inner line as far as the bevel's line, in big flat facets
    const cheek: { p: P2; z: number }[] = [];
    for (let i = 0; i <= iTop; i++) cheek.push({ p: inner[i], z: deep[i] });
    for (const p of BEVEL_LINE) cheek.push({ p, z: HALF_BEVEL });
    for (let i = iFoot; i < outline.length; i++) cheek.push({ p: inner[i], z: deep[i] });
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(cheek.map(k => new THREE.Vector2(k.p[0], k.p[1])), [])) {
      const colour = shade(charcoal, 0.16);
      steel.tri(place(cheek[a].p[0], cheek[a].p[1], cheek[a].z * face), place(cheek[b].p[0], cheek[b].p[1], cheek[b].z * face), place(cheek[c].p[0], cheek[c].p[1], cheek[c].z * face), [colour, colour, colour], [0.03, 0.03, 0.03]);
    }
    // the bevel: from its line out to the edge
    const bevel: { p: P2; z: number; glow: number }[] = [];
    for (let i = iTop; i <= iFoot; i++) bevel.push({ p: inner[i], z: deep[i], glow: glowOf(i) * 0.8 });
    for (const p of BEVEL_LINE.slice().reverse()) bevel.push({ p, z: HALF_BEVEL, glow: 0.35 });
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(bevel.map(k => new THREE.Vector2(k.p[0], k.p[1])), [])) {
      const colour = shade(silver, 0.12);
      steel.tri(place(bevel[a].p[0], bevel[a].p[1], bevel[a].z * face), place(bevel[b].p[0], bevel[b].p[1], bevel[b].z * face), place(bevel[c].p[0], bevel[c].p[1], bevel[c].z * face), [colour, colour, colour], [bevel[a].glow, bevel[b].glow, bevel[c].glow]);
    }
  }
  // its rim, face to face: the poll, the top and the throat have one; along the edge the two faces meet
  for (let i = 0; i < outline.length; i++) {
    const j = (i + 1) % outline.length;
    if (rim[i] === 0 && rim[j] === 0) continue;
    const colour = shade(i >= iTop && j <= iFoot && j > i ? silver : charcoal, 0.08).multiplyScalar(1.12);
    steel.quad(place(outline[i][0], outline[i][1], rim[i]), place(outline[j][0], outline[j][1], rim[j]), place(outline[j][0], outline[j][1], -rim[j]), place(outline[i][0], outline[i][1], -rim[i]),
      [colour, colour, colour, colour], [glowOf(i), glowOf(j), glowOf(j), glowOf(i)]);
  }
  const steelGeometry = steel.geometry();

  // ---- wood: the handle, as rings up its S. Eight-sided, wider fore and aft than across, a belly in its
  // middle; each long facet its own shade of honey, changing now and then along it, as carved wood has.
  const wood = new Soup();
  const honey = new THREE.Color('#e8962e'), cream = new THREE.Color('#f3dfb4'), wedge = new THREE.Color('#e8983a');
  const SIDES = 8, STEP = 0.022;
  const girth = (y: number): [number, number] => {
    const k = Math.max(0, Math.min(1, (y - WRAP_TO) / (HEAD_Y - WRAP_TO))), belly = Math.sin(Math.PI * Math.min(1, k * 1.25));
    return [0.0235 + 0.0055 * belly + 0.002 * k, 0.0178 + 0.003 * belly];
  };
  const stations: number[] = [];
  for (let y = WRAP_TO - 0.004; y < TOP_Y - 0.016; y += STEP) stations.push(y);
  stations.push(TOP_Y - 0.016);
  const streak = Array.from({ length: SIDES }, () => 0.84 + random() * 0.3);
  for (let s = 0; s < stations.length - 1; s++) {
    const lower = ring(stations[s], ...girth(stations[s]), SIDES, Math.PI / SIDES), upper = ring(stations[s + 1], ...girth(stations[s + 1]), SIDES, Math.PI / SIDES);
    for (let i = 0; i < SIDES; i++) {
      if (random() < 0.3) streak[i] = 0.8 + random() * 0.36;
      const j = (i + 1) % SIDES, corners = [lower[i], lower[j], upper[j], upper[i]];
      // (split the other way on every other face, so the facets run in long diagonals up the handle)
      for (const [p, q, r] of (s + i) % 2 ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 3], [1, 2, 3]]) {
        const colour = honey.clone().multiplyScalar(streak[i] * (0.97 + random() * 0.06));
        wood.tri(corners[p], corners[q], corners[r], [colour, colour, colour]);
      }
    }
  }
  // the wedge: the handle's end, standing a little proud of the head's top
  const top = spine(TOP_Y - 0.012), lean = Math.atan2(-top.along[0], top.along[1]);
  wood.place(new THREE.Matrix4().makeTranslation(top.at[0], top.at[1], 0).multiply(new THREE.Matrix4().makeRotationZ(lean)));
  wood.paint(wedge).block(0, 0, 0, 0.052, 0.026, 0.03, 0.005);
  wood.place(null);
  // the cap on the butt: cream, flared, its end rounded off
  const capRings: [number, number, number][] = [[WRAP_FROM + 0.004, 0.0256, 0.0204], [WRAP_FROM - 0.012, 0.03, 0.024], [CAP + 0.004, 0.0284, 0.0226], [CAP - 0.006, 0.0185, 0.0148]];
  for (let r = 0; r < capRings.length - 1; r++) {
    wood.paint(shade(cream, 0.08));
    wood.band(ring(capRings[r][0], capRings[r][1], capRings[r][2], SIDES, Math.PI / SIDES), ring(capRings[r + 1][0], capRings[r + 1][1], capRings[r + 1][2], SIDES, Math.PI / SIDES));
  }
  wood.paint(shade(cream, 0.05)).fan(ring(capRings[3][0], capRings[3][1], capRings[3][2], SIDES, Math.PI / SIDES));
  // ---- leather: the wrap, two straps wound opposite ways so that they cross, standing a little proud of the wood
  const strapA = new THREE.Color('#a8342a'), strapB = new THREE.Color('#8e2a25'), seam = new THREE.Color('#5c1a18');
  const AROUND = 14, RINGS = 67, TURNS = 8;        // (as tightly wound as before, over the longer wrap)
  const wrapRing = (j: number) => {
    const k = j / RINGS, y = WRAP_FROM + (WRAP_TO - WRAP_FROM) * k, at = spine(y), nx = at.along[1], ny = -at.along[0];
    return Array.from({ length: AROUND }, (_, i) => {
      const around = i / AROUND, one = (TURNS * k + around) % 1, other = (TURNS * k - around + 8) % 1;
      const over = one < 0.62, under = !over && other < 0.7, lift = over ? 1.09 : under ? 1.045 : 0.99;
      const ends = Math.min(1, Math.min(k, 1 - k) * 14 + 0.9), angle = around * Math.PI * 2;
      const c = Math.cos(angle) * 0.0242 * lift * ends, s = Math.sin(angle) * 0.0188 * lift * ends;
      return { p: [at.at[0] + nx * c, at.at[1] + ny * c, s] as P3, c: over ? strapA : under ? strapB : seam };
    });
  };
  for (let j = 0; j < RINGS; j++) {
    const lower = wrapRing(j), upper = wrapRing(j + 1);
    for (let i = 0; i < AROUND; i++) { const n = (i + 1) % AROUND; wood.quad(lower[i].p, lower[n].p, upper[n].p, upper[i].p, [lower[i].c, lower[n].c, upper[n].c, upper[i].c]); }
  }
  const woodGeometry = wood.geometry();

  // The yard to reflect: blue sky over, a pale gold horizon, earth under. (Kept pale: a redder one turned the silver bevel pink.)
  const environment = propEnvironment(renderer, [[0, '#7aa6ea'], [0.36, '#dbe8ff'], [0.5, '#fff0d2'], [0.6, '#b9966e'], [1, '#4f4038']],
    [[26, 34, 40, 34, '#fffaf0'], [214, 40, 22, 26, '#ffd9a0']]);
  const steelMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, metalness: 0.55, roughness: 0.46, envMap: environment.texture, envMapIntensity: 0.9 });
  const woodMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, metalness: 0, roughness: 0.66, envMap: environment.texture, envMapIntensity: 0.3 });
  // live: the edge is hot from the stone, gold along its line and deepening to ember up the bevel
  const live = liveGlow(steelMaterial, '#ffd98a', '#ff7a1e');

  // ---- the light along the edge while it is live: a ribbon down the edge's own curve that always faces the eye
  // (held.ts draws one along a straight hit line; an axe's edge is a curve, and not where its handle is)
  const edgePoints: THREE.Vector3[] = [];
  for (let i = 0; i < EDGE.length - 1; i++) for (let s = 0; s < 4; s++) { const t = s / 4; edgePoints.push(new THREE.Vector3(...place(EDGE[i][0] + (EDGE[i + 1][0] - EDGE[i][0]) * t, EDGE[i][1] + (EDGE[i + 1][1] - EDGE[i][1]) * t, 0))); }
  edgePoints.push(new THREE.Vector3(...place(EDGE[EDGE.length - 1][0], EDGE[EDGE.length - 1][1], 0)));
  const glowPosition: number[] = [], glowDirection: number[] = [], glowPlace: number[] = [], glowIndex: number[] = [];
  edgePoints.forEach((p, r) => {
    const run = edgePoints[Math.min(edgePoints.length - 1, r + 1)].clone().sub(edgePoints[Math.max(0, r - 1)]);
    for (const side of [-1, 1]) { glowPosition.push(p.x, p.y, p.z); glowDirection.push(run.x, run.y, run.z); glowPlace.push(side, r / (edgePoints.length - 1)); }
    if (r < edgePoints.length - 1) glowIndex.push(r * 2, r * 2 + 1, r * 2 + 2, r * 2 + 1, r * 2 + 3, r * 2 + 2);
  });
  const glowGeometry = new THREE.BufferGeometry();
  glowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(glowPosition, 3));
  glowGeometry.setAttribute('direction', new THREE.Float32BufferAttribute(glowDirection, 3));
  glowGeometry.setAttribute('place', new THREE.Float32BufferAttribute(glowPlace, 2));
  glowGeometry.setIndex(glowIndex);
  const glowMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { level: { value: 0 }, time: { value: 0 }, width: { value: 0.055 }, halo: { value: new THREE.Vector3(1, 0.5, 0.12) }, core: { value: new THREE.Vector3(1, 0.9, 0.62) } },
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
        float ends=smoothstep(0.,.14,along)*(1.-smoothstep(.86,1.,along));
        float shimmer=.84+.16*sin(along*19.-time*9.)*sin(along*6.+time*2.6);
        float soft=exp(-across*across*5.)*.5, hard=exp(-across*across*70.)*.8;
        gl_FragColor=vec4(mix(halo,core,hard),(soft+hard)*ends*shimmer*level);
        #include <colorspace_fragment>
      }`,
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial); glow.name = 'Axe: light along the edge'; glow.frustumCulled = false; glow.renderOrder = 3; glow.visible = false;

  const model = new THREE.Group(); model.name = "Lumberjack's axe";
  const head = new THREE.Mesh(steelGeometry, steelMaterial); head.name = 'Faceted steel axe head';
  const handle = new THREE.Mesh(woodGeometry, woodMaterial); handle.name = 'Carved handle, leather wrap and butt cap';
  model.add(head, handle, glow);
  model.rotation.y = TWIST;

  // What hits things: a line from the handle, a hand's breadth above the fist, out to the toe of the edge.
  // So a swing that catches a letter with the head or with the handle just under it both count, the swing
  // ribbon (bright at its tip, faint at its base) follows the head, and the long reach past the tip runs on
  // the way the edge is pointing.
  const toe = place(EDGE[0][0], EDGE[0][1] + 0.004, 0), base = spine(GRIP_Y + 0.115);
  return {
    name: "Lumberjack's axe — right grip", model,
    // Upright in the hand, as the sword, the katana and the keyboard are (the user's own choice for those,
    // 2026-11-11); its head hangs forward of the handle by itself. Lean and Turn are in the Settings.
    hold: rodHold({ guardY: GRIP_Y, reach: 0.03, tilt: -15, turn: 8 }), tilt: -15, rod: { guardY: GRIP_Y, reach: 0.03, tilt: -15, turn: 8 },
    // (these two are in the hand's space, not the model's: turned as the model is)
    hit: { base: new THREE.Vector3(base.at[0], base.at[1], 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), TWIST), tip: new THREE.Vector3(...toe).applyAxisAngle(new THREE.Vector3(0, 1, 0), TWIST) },
    trail: [1, 0.74, 0.36],
    onLive(level, clock) {
      const beat = level * (0.9 + 0.1 * Math.sin(clock * 8));
      live.liveLevel.value = beat * 0.9; live.liveTime.value = clock;
      glow.visible = level > 0.01; glowMaterial.uniforms.level.value = beat; glowMaterial.uniforms.time.value = clock;
    },
    dispose() { steelGeometry.dispose(); woodGeometry.dispose(); glowGeometry.dispose(); steelMaterial.dispose(); woodMaterial.dispose(); glowMaterial.dispose(); environment.dispose(); },
  };
}
