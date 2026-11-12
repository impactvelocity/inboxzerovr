import * as THREE from 'three';
import { propEnvironment, rodHold, type HeldSpec } from './held';
import { insetPolygon, liveGlow, Soup, type P2, type P3 } from './parts';

/**
 * The office's weapon: a beige 1990s keyboard, swung like a bat by one short end (design:
 * design/theme-tests-v2/crt-office/weapon-angles.png). A chamfered wedge of a case, tapered caps a
 * shade darker than it sitting in dark wells, in the real blocks: function row in groups, the main
 * block with its L-shaped Enter, the navigation keys, the arrows, the number pad, three small
 * lights top right.
 *
 * It is a rod (held.ts): its length runs along +Y from the Esc end in the fist to the number pad
 * at the far end, the tall function-row edge leads (-X), and the board is turned about Y so that a
 * right-handed player sees the keys. One mesh, one draw.
 *
 * Laid out in key units: u along the board from its left end, v across it from the function-row
 * edge to the space-bar edge.
 */
const LENGTH = 0.52, ACROSS = 8.37, ALONG = 24.6;
const U = LENGTH / ALONG;                          // one key, 21 mm: a chunky board
const BACK = 0.040, FRONT = 0.021;                 // the case's height at the function-row edge, and at the space bar's
const MIDDLE = 0.016;                              // the fist's line runs through the case at this height
const CAP = 0.42 * U;                              // a key cap's height
const TURN = 35 * Math.PI / 180;                   // the keys are turned this far from the palm's side towards the player
const GUARD_Y = 0.06;

const top = (v: number) => BACK + (FRONT - BACK) * v / ACROSS;
/** Board (u, v, height above the desk) to model space. */
const at = (u: number, v: number, h: number): P3 => [(v - ACROSS / 2) * U, u * U, h - MIDDLE];

export function buildKeyboard(renderer: THREE.WebGLRenderer): HeldSpec {
  const soup = new Soup();
  const caseColour = '#f6d2a8', capTop = new THREE.Color('#ecc198'), capFoot = new THREE.Color('#a87d62'), well = '#4a362c';

  // ---- the case: an eight-cornered outline, a wedge in height, its upper and lower edges taken off
  const k = 0.62;
  const outline: P2[] = [[k, 0], [ALONG - k, 0], [ALONG, k], [ALONG, ACROSS - k], [ALONG - k, ACROSS], [k, ACROSS], [0, ACROSS - k], [0, k]];
  const ring = (inset: number, height: (v: number) => number): P3[] => insetPolygon(outline, inset).map(([u, v]) => at(u, v, height(v)));
  const foot = ring(0.3, () => 0), low = ring(0, () => 0.0065), high = ring(0, v => top(v) - 0.0055), lid = ring(0.26, v => top(v));
  soup.paint('#dcb891').fan(foot);
  soup.paint('#e8c49b').band(foot, low);
  soup.paint(caseColour).band(low, high).band(high, lid).fan(lid);
  // four small rubber feet underneath
  soup.paint('#5a4a40');
  for (const [u, v] of [[1.6, 1.1], [ALONG - 1.6, 1.1], [1.6, ACROSS - 1.1], [ALONG - 1.6, ACROSS - 1.1]]) {
    const a = 0.55, b = 0.3, drop = -0.0022;
    const under: P3[] = [at(u - a, v - b, 0), at(u + a, v - b, 0), at(u + a, v + b, 0), at(u - a, v + b, 0)];
    const sole: P3[] = [at(u - a * 0.8, v - b * 0.7, drop), at(u + a * 0.8, v - b * 0.7, drop), at(u + a * 0.8, v + b * 0.7, drop), at(u - a * 0.8, v + b * 0.7, drop)];
    soup.band(under, sole).fan(sole);
  }

  // ---- the keys, in units: [u, v, width, depth]
  const keys: [number, number, number, number][] = [];
  const row = (u: number, v: number, widths: number[], depth = 1) => { for (const w of widths) { keys.push([u, v, w, depth]); u += w; } };
  const ones = (n: number) => Array.from({ length: n }, () => 1);
  const MAIN = 0.77, FN = 0.7, ROW = 2.3, NAV = 16.2, PAD = 19.74, FKEY = 0.92, FGROUP = FKEY * 4, FGAP = (15 - 2.3 - FGROUP * 3) / 2;
  const wells: [number, number, number, number][] = [];
  row(MAIN + 0.53, FN, [1]); wells.push([MAIN + 0.53, FN, 1, 1]);
  for (let g = 0; g < 3; g++) { const u = MAIN + 2.3 + g * (FGROUP + FGAP); row(u, FN, [FKEY, FKEY, FKEY, FKEY]); wells.push([u, FN, FGROUP, 1]); }
  row(NAV, FN, ones(3)); wells.push([NAV, FN, 3, 1]);
  row(MAIN, ROW, [...ones(13), 2]);
  row(MAIN, ROW + 1, [1.5, ...ones(12)]);
  row(MAIN, ROW + 2, [1.75, ...ones(12)]);
  keys.push([MAIN + 13.5, ROW + 1, 1.5, 1], [MAIN + 13.75, ROW + 1, 1.25, 2]);          // Enter: an L
  row(MAIN, ROW + 3, [2.25, ...ones(10), 2.75]);
  row(MAIN, ROW + 4, [1.75, 2.25, 7, 2, 2]);
  wells.push([MAIN, ROW, 15, 5]);
  row(NAV, ROW, ones(3)); row(NAV, ROW + 1, ones(3)); wells.push([NAV, ROW, 3, 2]);
  keys.push([NAV + 1, ROW + 3, 1, 1]); row(NAV, ROW + 4, ones(3)); wells.push([NAV + 1, ROW + 3, 1, 1], [NAV, ROW + 4, 3, 1]);
  row(PAD, ROW, ones(4)); row(PAD, ROW + 1, ones(3)); row(PAD, ROW + 2, ones(3)); row(PAD, ROW + 3, ones(3)); row(PAD, ROW + 4, [2, 1]);
  keys.push([PAD + 3, ROW + 1, 1, 2], [PAD + 3, ROW + 3, 1, 2]);
  wells.push([PAD, ROW, 4, 5]);

  // the dark wells the blocks sit in: they are what shows between the keys, and what lights up
  soup.paint(well, 1);
  for (const [u, v, w, d] of wells) { const m = 0.09, h = 0.0005; soup.quad(at(u - m, v - m, top(v - m) + h), at(u + w + m, v - m, top(v - m) + h), at(u + w + m, v + d + m, top(v + d + m) + h), at(u - m, v + d + m, top(v + d + m) + h)); }
  for (const [u, v, w, d] of keys) {
    const b0u = u + 0.045, b1u = u + w - 0.045, b0v = v + 0.045, b1v = v + d - 0.045;
    const t0u = u + 0.19, t1u = u + w - 0.19, t0v = v + 0.15, t1v = v + d - 0.22;
    const base: P3[] = [at(b0u, b0v, top(b0v)), at(b1u, b0v, top(b0v)), at(b1u, b1v, top(b1v)), at(b0u, b1v, top(b1v))];
    const cap: P3[] = [at(t0u, t0v, top(t0v) + CAP), at(t1u, t0v, top(t0v) + CAP), at(t1u, t1v, top(t1v) + CAP), at(t0u, t1v, top(t1v) + CAP)];
    soup.paint(capTop, 0.5).quad(cap[0], cap[1], cap[2], cap[3]);
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; soup.quad(base[i], base[j], cap[j], cap[i], [capFoot, capFoot, capTop, capTop], [0.9, 0.9, 0.5, 0.5]); }
  }
  // three small lights, top right: beige until the board is live
  for (const u of [20.96, 21.9, 22.84]) {
    const v = 1.08, s = 0.5, m = 0.07, h = 0.0005, rise = 0.0018;
    soup.paint(well, 0.6).quad(at(u - m, v - m, top(v) + h), at(u + s + m, v - m, top(v) + h), at(u + s + m, v + s + m, top(v) + h), at(u - m, v + s + m, top(v) + h));
    soup.paint('#f8d9b3', 1).quad(at(u, v, top(v) + rise), at(u + s, v, top(v) + rise), at(u + s, v + s, top(v) + rise), at(u, v + s, top(v) + rise));
  }

  const geometry = soup.geometry();
  const environment = propEnvironment(renderer, [[0, '#f6f8fc'], [0.45, '#d5dbe8'], [0.55, '#8f96a8'], [1, '#69738d']], [[20, 8, 70, 10, '#ffffff'], [150, 14, 60, 8, '#ffffff']]);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.8, metalness: 0, envMap: environment.texture, envMapIntensity: 0.3 });
  // live: phosphor green up through the wells and on the caps, a wave of it running along the board
  const live = liveGlow(material, '#39ff9a', '#1fd183');
  live.liveRipple.value = 0.55;
  const board = new THREE.Mesh(geometry, material); board.name = 'Beige keyboard'; board.rotation.y = TURN;
  const model = new THREE.Group(); model.name = 'Keyboard'; model.add(board);

  return {
    name: 'Office keyboard — right grip', model,
    // Upright, as the knight's sword is (asked for on 2026-11-11): about 60 degrees up with the controller level.
    hold: rodHold({ guardY: GUARD_Y, reach: 0.03, tilt: -15, turn: 8 }), tilt: -15, rod: { guardY: GUARD_Y, reach: 0.03, tilt: -15, turn: 8 },
    // on a monitor it stands at the right of the view with its keys towards the middle
    desktop: { rotateY: -0.8 },
    hit: { base: new THREE.Vector3(0, 0.1, 0), tip: new THREE.Vector3(0, LENGTH, 0) },
    trail: [1, 0.93, 0.82],
    glow: { halo: [0.16, 1, 0.5], core: [0.75, 1, 0.88], width: 0.1 },
    onLive(level, clock) { live.liveLevel.value = level * 0.85; live.liveTime.value = clock; },
    dispose() { geometry.dispose(); material.dispose(); environment.dispose(); },
  };
}
