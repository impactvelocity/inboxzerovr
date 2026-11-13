import * as THREE from 'three';
import { propEnvironment, rodHold, type HeldSpec } from './held';
import { liveGlow, Soup, type P3 } from './parts';

/**
 * The castle's weapon: a plain knight's sword (design: design/theme-tests-v2/castle/weapon-angles.png).
 * A straight double-edged blade of faceted silver with a dark fuller, drawn to a point; a silver
 * crossguard, slightly swept, flared at its ends; a brown leather grip with a spiral wrap; a small
 * brass disc of a pommel.
 *
 * A rod (held.ts): the blade runs up +Y from the guard, its edges on -X and +X, its flats on Z.
 * y = 0 is the underside of the crossguard, where the top of the fist comes to. Three draws:
 * steel, leather, brass.
 */
const GUARD = 0.040;                 // the crossguard's height at its middle
const BLADE = 0.60;                  // from the guard to the point (58 cm felt right for the katana)
const SHOULDER = GUARD + 0.505;      // where the edges turn in towards the point
const TIP = GUARD + BLADE;
const GRIP = 0.150;
// The whole sword is turned this far about its own length, towards the player, so that they see
// the flat of the blade and its fuller catch the light and not only its edge (as the mock-up has
// it). The edge still leads; what hits things is the line up the middle, which a turn leaves alone.
const TWIST = 22 * Math.PI / 180;

export function buildKnightSword(renderer: THREE.WebGLRenderer): HeldSpec {
  let seed = 7741;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };

  // ---- steel: the blade, as rings up its length. Each ring is twelve points: the two edges, the
  // corners of the flats, and the fuller's lips and floor, front and back.
  const steel = new Soup();
  const bevel = new THREE.Color('#e9e9f3'), flat = new THREE.Color('#c8c8da'), groove = new THREE.Color('#57546c');
  const FULLER_FROM = GUARD + 0.022, FULLER_TO = GUARD + 0.445, POINTED = 0.024;
  const stations: number[] = [GUARD - 0.012];
  for (const y of [FULLER_FROM, FULLER_FROM + POINTED, FULLER_TO - POINTED, FULLER_TO, SHOULDER, TIP]) {
    // short lengths, so that every facet catches the light a little differently
    const last = stations[stations.length - 1], steps = Math.max(1, Math.round((y - last) / 0.034));
    for (let s = 1; s <= steps; s++) stations.push(last + (y - last) * s / steps);
  }
  const blend = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
  function section(y: number): P3[] {
    const body = (y - GUARD) / (SHOULDER - GUARD), point = (y - SHOULDER) / (TIP - SHOULDER);
    const w = y <= SHOULDER ? blend(0.0320, 0.0275, body) : blend(0.0275, 0, point);
    const t = y <= SHOULDER ? blend(0.0068, 0.0054, body) : blend(0.0054, 0.0004, point);
    const a = y <= SHOULDER ? w * 0.5 : blend(w * 0.5, 0, point * 1.6);
    const open = Math.min(blend(0, 1, (y - FULLER_FROM) / POINTED), blend(0, 1, (FULLER_TO - y) / POINTED));
    const g = 0.0062 * open, d = 0.0042 * open;
    // The flats are not quite flat: each corner sits a hair in or out, as hammered steel does, so
    // that no two facets throw back the same light. The edges and the point stay true.
    const dent = () => (random() - 0.5) * 0.0011 * Math.min(1, t / 0.004);
    return [[-w, y, 0], [-a, y, t + dent()], [-g, y, t + dent() * 0.5], [0, y, t - d], [g, y, t + dent() * 0.5], [a, y, t + dent()], [w, y, 0],
      [a, y, -t + dent()], [g, y, -t + dent() * 0.5], [0, y, -t + d], [-g, y, -t + dent() * 0.5], [-a, y, -t + dent()]];
  }
  // around a ring: edge, flat, fuller, fuller, flat, edge, and the same again on the back
  const kinds = [bevel, flat, groove, groove, flat, bevel], glowAt = [1, 0.42, 0.3, 0.8, 0.3, 0.42, 1, 0.42, 0.3, 0.8, 0.3, 0.42];
  const sections = stations.map(section);
  for (let s = 0; s < sections.length - 1; s++) {
    const lower = sections[s], upper = sections[s + 1];
    for (let i = 0; i < 12; i++) {
      const j = (i + 1) % 12;
      // two triangles to a face, split the other way on every other one, each its own shade
      const corners = [lower[i], lower[j], upper[j], upper[i]], glows = [glowAt[i], glowAt[j], glowAt[j], glowAt[i]];
      const turn = (s + i) % 2;
      for (const [p, q, r] of turn ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 3], [1, 2, 3]]) {
        const colour = kinds[i % 6].clone().multiplyScalar(0.93 + random() * 0.12);
        steel.tri(corners[p], corners[q], corners[r], [colour, colour, colour], [glows[p], glows[q], glows[r]]);
      }
    }
  }
  // ---- steel: the crossguard. A block where the blade passes through it, and two arms that
  // narrow, then flare, their ends lifted a little towards the blade.
  const guardSteel = new THREE.Color('#cfcfda');
  const armRing = (x: number, middle: number, hy: number, hz: number): P3[] => {
    const c = Math.min(hy, hz) * 0.42;
    return ([[hz - c, -hy], [hz, -hy + c], [hz, hy - c], [hz - c, hy], [-hz + c, hy], [-hz, hy - c], [-hz, -hy + c], [-hz + c, -hy]] as [number, number][])
      .map(([z, y]) => [x, middle + y, z] as P3);
  };
  for (const side of [-1, 1]) {
    const rings = [armRing(side * 0.016, 0.0200, 0.0160, 0.0110), armRing(side * 0.046, 0.0204, 0.0138, 0.0094),
      armRing(side * 0.076, 0.0216, 0.0160, 0.0098), armRing(side * 0.093, 0.0230, 0.0205, 0.0108), armRing(side * 0.0995, 0.0234, 0.0182, 0.0090)];
    for (let r = 0; r < rings.length - 1; r++) { steel.paint(guardSteel.clone().multiplyScalar(0.95 + random() * 0.1), 0.12); steel.band(rings[r], rings[r + 1]); }
    steel.paint(guardSteel.clone().multiplyScalar(1.04), 0.12).fan(rings[rings.length - 1]);
  }
  steel.paint(guardSteel.clone().multiplyScalar(1.03), 0.2).block(0, GUARD / 2, 0, 0.040, GUARD, 0.034, 0.007);
  const steelGeometry = steel.geometry();

  // ---- leather: the grip, a little fuller in the middle, with a strap wound up it
  const leather = new Soup();
  const strap = new THREE.Color('#9b5434'), seam = new THREE.Color('#4c2416');
  const SIDES = 12, RINGS = 44, TURNS = 8.5;
  const gripRing = (j: number) => Array.from({ length: SIDES }, (_, i) => {
    const k = j / RINGS, around = i / SIDES, wound = (TURNS * k + around) % 1, raised = wound < 0.78;
    const r = (0.0176 + 0.0020 * Math.sin(Math.PI * k)) * (raised ? 1 : 0.87), angle = around * Math.PI * 2;
    return { p: [Math.cos(angle) * r, -GRIP + GRIP * k, Math.sin(angle) * r * 0.88] as P3, c: raised ? strap : seam };
  });
  for (let j = 0; j < RINGS; j++) {
    const lower = gripRing(j), upper = gripRing(j + 1);
    for (let i = 0; i < SIDES; i++) { const n = (i + 1) % SIDES; leather.quad(lower[i].p, lower[n].p, upper[n].p, upper[i].p, [lower[i].c, lower[n].c, upper[n].c, upper[i].c]); }
  }
  const leatherGeometry = leather.geometry();

  // ---- brass: a collar under the grip, and the pommel, a disc facing front and back
  const brass = new Soup().paint('#d1a851');
  brass.lathe([[0.0115, -GRIP - 0.012], [0.0155, -GRIP - 0.009], [0.0155, -GRIP - 0.003], [0.0182, -GRIP + 0.002], [0.0182, -GRIP + 0.005]], 10, 0, 0.9);
  const pommelY = -GRIP - 0.012 - 0.0215;
  brass.place(new THREE.Matrix4().makeTranslation(0, pommelY, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
  brass.lathe([[0, -0.012], [0.0165, -0.012], [0.0245, -0.0065], [0.0245, 0.0065], [0.0165, 0.012], [0, 0.012]], 12, Math.PI / 12);
  const brassGeometry = brass.geometry();

  // Candlelight and a cold moon to reflect: the warm and violet patches the sheet's steel has.
  const environment = propEnvironment(renderer, [[0, '#5a55a6'], [0.28, '#b9b6ea'], [0.45, '#fff2e6'], [0.56, '#9b90c0'], [1, '#342b4a']],
    [[24, 30, 34, 50, '#ffad5c'], [112, 40, 22, 34, '#ffd7a0'], [190, 12, 34, 34, '#e3ecff'], [226, 56, 20, 26, '#ff9a4a']]);
  const steelMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, metalness: 0.88, roughness: 0.3, envMap: environment.texture, envMapIntensity: 1.05 });
  const leatherMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, metalness: 0, roughness: 0.62, envMap: environment.texture, envMapIntensity: 0.35 });
  const brassMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, metalness: 0.9, roughness: 0.34, envMap: environment.texture, envMapIntensity: 1.1 });
  // live: the blade is enchanted, violet through its body and pale cyan along its edges and fuller
  const live = liveGlow(steelMaterial, '#9fe9ff', '#6a4dff');

  const model = new THREE.Group(); model.name = "Knight's sword";
  const blade = new THREE.Mesh(steelGeometry, steelMaterial); blade.name = 'Faceted steel blade and crossguard';
  const grip = new THREE.Mesh(leatherGeometry, leatherMaterial); grip.name = 'Leather-wrapped grip';
  const pommel = new THREE.Mesh(brassGeometry, brassMaterial); pommel.name = 'Brass pommel';
  model.add(blade, grip, pommel);
  model.rotation.y = TWIST;

  return {
    name: "Knight's sword — right grip", model,
    // Upright in the hand, as a knight carries one (asked for on 2026-11-11: "more up, more vertical with the player").
    // A Quest controller held level has the fist's axis about 45 degrees forward of straight up, and the lean
    // adds to that: the katana's 28 points a blade forward, -15 stands this one at about 60 degrees.
    hold: rodHold({ guardY: 0, reach: 0.03, tilt: -15, turn: 8 }), tilt: -15, rod: { guardY: 0, reach: 0.03, tilt: -15, turn: 8 },
    hit: { base: new THREE.Vector3(0, GUARD + 0.012, 0), tip: new THREE.Vector3(0, TIP, 0) },
    trail: [0.5, 0.58, 1],
    glow: { halo: [0.42, 0.36, 1], core: [0.72, 0.95, 1], width: 0.07 },
    onLive(level, clock) { live.liveLevel.value = level * (0.92 + 0.08 * Math.sin(clock * 9)); live.liveTime.value = clock; },
    dispose() { steelGeometry.dispose(); leatherGeometry.dispose(); brassGeometry.dispose(); steelMaterial.dispose(); leatherMaterial.dispose(); brassMaterial.dispose(); environment.dispose(); },
  };
}
