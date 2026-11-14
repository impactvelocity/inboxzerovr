import * as THREE from 'three';
import { settings } from '../garden';
import type { StageContext, StageProps } from '../levels/backdrop';

/**
 * LumberHack's falling leaves: real maple leaves in the air between the seat and the barn, coming
 * down off the two maples the painting has at its edges. Each swings from side to side as a leaf
 * does, turning over, and drifts on the Breeze; now and then a gust brings a flurry across from
 * the big tree on the left.
 *
 * They answer the game: the axe swung through them knocks them aside, and a letter chopped among
 * them blows them outwards and throws out a puff of leaves of its own. They are never left lying (the yard under them is painted, and a real
 * leaf on a painted floor would float in a headset): each fades out just above the ground.
 *
 * One instanced draw. The Motion setting stops them where they are.
 */
export const leafTune = {
  count: 140,              // (56 on Light detail; 110 until 2026-11-13, "more leaves")
  fall: [0.26, 0.6],       // m/s, the slowest and the fastest
  swing: [0.16, 0.5],      // metres side to side
  drift: 0.55,             // m/s sideways at full Breeze
  gust: [9, 22],           // seconds between gusts
  reach: 0.42,             // the axe stirs leaves this near its head
  blast: 1.5,              // a chopped letter blows leaves this far from it
  // (2026-11-13: "add more leaves particles when chopping") each chop also throws out a puff of leaves of its own
  burst: 28,               // leaves thrown out of each chopped letter (14 on Light detail)
  pool: 84,                // how many such leaves can be in the air at once (three chops' worth)
  burstSpeed: [1.4, 3.4],  // m/s they leave the cut at
};
/** The air they fall through, metres from the seat's floor: left to right, floor to top, far to near. (Since the
 * 2026-11-13 paintings the player sits under a porch roof 2.65 m up that reaches about 3.7 m out, and the maples
 * stand across the yard, about 7 m off to either side: leaves fall in the yard, and some are blown in under the roof.) */
const BOX = { x: [-6.6, 6.6], y: [0, 4.6], z: [-8.6, 0.6] };
/** Where the porch roof ends, metres ahead, and how high it is: nothing falls from above it. */
const PORCH = { edge: -3.7, roof: 2.5 };
/** A maple leaf's outline, right half, tip up (lumbercard.ts draws the same one as the postmark). */
const HALF: [number, number][] = [[0, 0.5], [0.07, 0.33], [0.16, 0.37], [0.12, 0.2], [0.3, 0.3], [0.5, 0.22], [0.4, 0.1], [0.46, 0.04], [0.3, -0.04], [0.4, -0.2], [0.22, -0.18], [0.05, -0.24], [0.02, -0.48]];
const TINTS = ['#f6a81c', '#f3c53a', '#ee7a1a', '#ee7a1a', '#d9471c', '#c22f1c', '#f6a81c', '#a8601f'];

interface Leaf {
  p: THREE.Vector3; kick: THREE.Vector3; turn: THREE.Euler; spin: THREE.Vector3;
  size: number; fall: number; swing: number; rate: number; phase: number;
  /** Seconds until it comes again (it has reached the ground), or 0 while it is in the air. */
  wait: number; grow: number;
  /** m/s it is carried in under the porch roof, towards the seat (0 for one falling in the yard). */
  inward: number;
  /** One thrown out of a chopped letter: it falls once and is not sent round again. */
  burst?: boolean;
}

function leafGeometry() {
  // a fan from the leaf's middle: the two halves fold up a little from the midrib, and the tip curls
  const outline: [number, number][] = [...HALF, ...HALF.slice().reverse().map(([x, y]) => [-x, y] as [number, number])];
  const position: number[] = [], bend = (x: number, y: number) => 0.34 * Math.abs(x) + 0.22 * y * y;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    if (a[0] === b[0] && a[1] === b[1]) continue;
    position.push(0, 0.02, 0, a[0], a[1], bend(a[0], a[1]), b[0], b[1], bend(b[0], b[1]));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  return geometry;
}

export function createLeaves(_context: StageContext): StageProps {
  const group = new THREE.Group(); group.name = 'LumberHack: falling leaves';
  const N = leafTune.count, B = leafTune.pool;
  let seed = 90417;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const between = (r: number[]) => r[0] + random() * (r[1] - r[0]);

  const geometry = leafGeometry();
  const tints = new Float32Array((N + B) * 3), colour = new THREE.Color();
  for (let i = 0; i < N + B; i++) { colour.set(TINTS[Math.floor(random() * TINTS.length)]).offsetHSL((random() - 0.5) * 0.02, 0, (random() - 0.5) * 0.08).toArray(tints, i * 3); }
  geometry.setAttribute('tint', new THREE.InstancedBufferAttribute(tints, 3));
  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, uniforms: { blend: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute vec3 tint; varying vec3 vTint; varying vec3 vWorld; varying vec2 vLeaf;
      void main(){
        vTint=tint; vLeaf=position.xy;
        vec4 world=modelMatrix*instanceMatrix*vec4(position,1.);
        vWorld=world.xyz;
        gl_Position=projectionMatrix*viewMatrix*world;
      }`,
    fragmentShader: /* glsl */ `
      uniform float blend; varying vec3 vTint; varying vec3 vWorld; varying vec2 vLeaf;
      void main(){
        // painted, not lit: each flat facet a little lighter the more it faces the sky, the midrib a darker line
        vec3 n=normalize(cross(dFdx(vWorld),dFdy(vWorld)));
        float up=abs(n.y), rib=1.-.22*smoothstep(.035,.0,abs(vLeaf.x));
        vec3 day=vTint*(.74+.38*up)*rib;
        // by night: dusky copper in the blue, a touch of the barn lamp's amber on whatever faces it
        vec3 night=vTint*vec3(.40,.34,.52)*(.75+.45*up)*rib+vec3(.30,.15,.04)*abs(n.z)*.5;
        gl_FragColor=vec4(mix(day,night,blend),1.);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, N + B); mesh.name = `${N} maple leaves and ${B} for chops`; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(mesh);

  /**
   * A new place to fall from: mostly out of the two maples across the yard, and a quarter blown in under the porch
   * roof from its edge, drifting in towards the seat (where the axe can reach them). `anywhere`: at any height (the start).
   */
  function launch(leaf: Leaf, anywhere = false, flurry = false) {
    const from = random();
    leaf.inward = 0;
    if (!flurry && from >= 0.75) {
      // blown in: from the porch's edge, under the roof
      leaf.p.set((random() - 0.5) * 7, anywhere ? 0.4 + random() * 1.9 : 1.1 + random() * 1.3, PORCH.edge + 0.3 - random() * 0.5);
      if (anywhere) leaf.p.z += random() * 3;
      leaf.inward = 0.25 + random() * 0.45;
    } else {
      const left = flurry || from < 0.52;
      leaf.p.set(left ? -6.2 + random() * 3.8 : 3.8 + random() * 2.4, anywhere ? 0.3 + random() * 3.9 : 2.5 + random() * 1.9,
        left ? -8.2 + random() * 3.6 : -7.6 + random() * 3.3);
      // (a flurry comes across nearer, between the maple and the porch)
      if (flurry) leaf.p.z = -5.2 + random() * 1.3;
    }
    // (nearer ones are small, so that one passing the face is a leaf and not a blanket; far ones bigger, to be seen at all)
    leaf.size = (0.085 + random() * 0.055) * (1 + Math.min(1, Math.max(0, (-leaf.p.z - 2) / 5)) * 0.7);
    leaf.fall = between(leafTune.fall); leaf.swing = between(leafTune.swing); leaf.rate = 1.1 + random() * 1.3; leaf.phase = random() * 6.2832;
    leaf.turn.set(random() * 6.2832, random() * 6.2832, random() * 6.2832);
    leaf.spin.set((random() - 0.5) * 1.6, (random() - 0.5) * 2.2, (random() - 0.5) * 1.2);
    leaf.kick.set(flurry ? 1.2 + random() * 1.6 : 0, 0, 0); leaf.wait = 0; leaf.grow = anywhere ? 1 : 0;
  }
  const leaves: Leaf[] = Array.from({ length: N }, () => {
    const leaf: Leaf = { p: new THREE.Vector3(), kick: new THREE.Vector3(), turn: new THREE.Euler(), spin: new THREE.Vector3(), size: 0.1, fall: 0.4, swing: 0.3, rate: 1.5, phase: 0, wait: 0, grow: 1, inward: 0 };
    launch(leaf, true); return leaf;
  });
  // the chop puffs: after the falling leaves in the one draw, waiting until a letter is chopped
  const thrown: Leaf[] = Array.from({ length: B }, () => ({ p: new THREE.Vector3(), kick: new THREE.Vector3(), turn: new THREE.Euler(), spin: new THREE.Vector3(), size: 0.08, fall: 0.4, swing: 0.2, rate: 1.5, phase: 0, wait: Infinity, grow: 1, inward: 0, burst: true }));
  let nextThrown = 0;
  /** A puff of leaves out of a chopped letter (in the leaves' space): out every way, more up than down, spinning hard. */
  function puff(at: THREE.Vector3, count: number) {
    for (let k = 0; k < count; k++) {
      const leaf = thrown[nextThrown]; nextThrown = (nextThrown + 1) % B;
      leaf.p.set(at.x + (random() - 0.5) * 0.18, at.y + (random() - 0.5) * 0.18, at.z + (random() - 0.5) * 0.1);
      const speed = between(leafTune.burstSpeed);
      push.set(random() - 0.5, random() - 0.25, random() - 0.5).normalize();
      leaf.kick.copy(push).multiplyScalar(speed); leaf.kick.y += 0.6 + random() * 1.1;
      // (small: they start right in front of the player)
      leaf.size = 0.055 + random() * 0.04;
      leaf.fall = between(leafTune.fall); leaf.swing = between(leafTune.swing) * 0.6; leaf.rate = 1.4 + random() * 1.6; leaf.phase = random() * 6.2832;
      leaf.turn.set(random() * 6.2832, random() * 6.2832, random() * 6.2832);
      leaf.spin.set((random() - 0.5) * 7, (random() - 0.5) * 9, (random() - 0.5) * 4);
      leaf.wait = 0; leaf.grow = 0.35; leaf.inward = 0;
    }
  }

  const dummy = new THREE.Object3D(), local = new THREE.Vector3(), tip = new THREE.Vector3(), push = new THREE.Vector3(), eyeLocal = new THREE.Vector3();
  let nextGust = 5 + random() * 8, gust = 0;
  const blasts: { at: THREE.Vector3; power: number }[] = [];
  /** Chops whose puff of leaves comes out after this frame's blasts (so the blast does not throw them twice as far). */
  const puffs: { at: THREE.Vector3; count: number }[] = [];

  function update(dt: number, c: Parameters<StageProps['update']>[1]) {
    // the leaves' own space: the seat's floor (the painting's ground is 1.2 m under where the player sat down)
    group.position.set(c.seat.x, c.seat.y - 1.2, c.seat.z);
    material.uniforms.blend.value = c.blend;
    const live = settings.quality === 'low' ? Math.ceil(N * 0.4) : N;
    mesh.count = N + B;
    if (live < N) { dummy.scale.setScalar(0); dummy.updateMatrix(); for (let i = live; i < N; i++) mesh.setMatrixAt(i, dummy.matrix); }
    const step = settings.motion ? dt : 0, wind = settings.wind;
    // a gust: for a couple of seconds the air moves three times as fast, and whatever was waiting to fall comes at once
    if ((nextGust -= step) <= 0) { nextGust = between(leafTune.gust); gust = 2.6; for (const leaf of leaves) if (leaf.wait > 0 && random() < 0.7) launch(leaf, false, true); }
    gust = Math.max(0, gust - step);
    const blow = leafTune.drift * wind * (1 + 2.2 * Math.sin(Math.min(1, gust / 2.6) * Math.PI));
    eyeLocal.copy(c.eye).sub(group.position);
    // the axe's head, if it is moving: in the leaves' space
    const blade = c.blade, swung = !!blade && blade.moving && blade.speed > 1.4;
    if (swung && blade) tip.copy(blade.tip).sub(group.position);
    for (let n = 0; n < live + B; n++) {
      const i = n < live ? n : N + n - live, leaf = n < live ? leaves[n] : thrown[n - live];
      if (leaf.burst && leaf.wait > 0) { dummy.scale.setScalar(0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); continue; }
      if (leaf.wait > 0) { if ((leaf.wait -= step) <= 0) launch(leaf); else { dummy.scale.setScalar(0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); continue; } }
      leaf.phase += leaf.rate * step; leaf.grow = Math.min(1, leaf.grow + step * (leaf.burst ? 6 : 2));
      const side = Math.cos(leaf.phase);
      // a falling leaf: quick across the middle of its swing and slow at the ends, where it drops
      leaf.p.x += (side * leaf.swing * leaf.rate + blow + leaf.kick.x) * step;
      leaf.p.z += (Math.sin(leaf.phase * 0.63 + 1.3) * leaf.swing * 0.5 + leaf.inward * (0.6 + wind) + leaf.kick.z) * step;
      // (the porch roof: one up by it that drifts in is kept outside, as if it had brushed the eaves)
      if (leaf.p.y > PORCH.roof - 0.1 && leaf.p.z > PORCH.edge - 0.1) leaf.p.z = PORCH.edge - 0.1;
      leaf.p.y += (-leaf.fall * (0.55 + 0.75 * Math.abs(Math.sin(leaf.phase))) + leaf.kick.y) * step;
      leaf.kick.multiplyScalar(Math.exp(-step * 1.9));
      if (swung && blade) {
        const near = local.copy(leaf.p).sub(tip).length();
        if (near < leafTune.reach) {
          const by = (1 - near / leafTune.reach) * Math.min(1, blade.speed / 5);
          leaf.kick.addScaledVector(blade.velocity, 0.5 * by).add(push.set(random() - 0.5, random() * 0.6, random() - 0.5).multiplyScalar(1.6 * by));
          leaf.spin.multiplyScalar(1 + 0.6 * by).clampLength(0, 9);
        }
      }
      for (const b of blasts) {
        const away = local.copy(leaf.p).sub(b.at), far = away.length();
        if (far < leafTune.blast) leaf.kick.addScaledVector(away.normalize(), (1 - far / leafTune.blast) * 3.2 * b.power).y += (1 - far / leafTune.blast) * 1.1 * b.power;
      }
      const turning = 1 + leaf.kick.length() * 1.5;
      leaf.turn.x += leaf.spin.x * turning * step; leaf.turn.y += leaf.spin.y * turning * step; leaf.turn.z = side * 0.9 + leaf.spin.z * 0.3;
      // gone at the ground (fading over its last 30 cm), or blown out of the air it falls through
      if (leaf.p.y < 0.02 || leaf.p.x > BOX.x[1] + 1.5 || leaf.p.x < BOX.x[0] - 1.5 || leaf.p.z > BOX.z[1] + 1.2 || leaf.p.z < BOX.z[0] - 2) {
        leaf.wait = leaf.burst ? Infinity : 0.2 + random() * 5;
        if (leaf.burst) { dummy.scale.setScalar(0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); }
        continue;
      }
      const low = Math.min(1, leaf.p.y / 0.3), top = Math.min(1, (BOX.y[1] + 0.3 - leaf.p.y) / 0.5);
      // (and never in the face: one that comes within arm's bend of the eye shrinks away)
      // (a chop's leaves start at arm's length, so they are let nearer: only right at the face do they shrink away)
      const close = leaf.burst ? Math.min(1, Math.max(0, (local.copy(leaf.p).sub(eyeLocal).length() - 0.16) / 0.2)) : Math.min(1, Math.max(0, (local.copy(leaf.p).sub(eyeLocal).length() - 0.3) / 0.4));
      dummy.position.copy(leaf.p); dummy.rotation.copy(leaf.turn); dummy.scale.setScalar(leaf.size * leaf.grow * Math.max(0, Math.min(low, top)) * close);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    }
    blasts.length = 0;
    for (const p of puffs) puff(p.at, p.count);
    puffs.length = 0;
    mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    group, update,
    // a letter chopped: the leaves round it are blown outwards
    onLetter(kind, at) {
      if (kind !== 'cut') return;
      const here = at.clone().sub(group.position);
      blasts.push({ at: here, power: 1 });
      if (settings.motion) puffs.push({ at: here, count: settings.quality === 'low' ? Math.ceil(leafTune.burst / 2) : leafTune.burst });
    },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
