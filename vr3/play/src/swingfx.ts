import { AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, Group, IcosahedronGeometry, InstancedMesh, MeshBasicMaterial, Object3D, Points, ShaderMaterial, Vector3, type World } from '@iwsdk/core';
import type { BladeTracker } from './blade';
import type { FxStyle } from './levels/types';

/** Kyoto's: cherry petals and warm lights, as this was first written. Each level has its own (levels/*.ts). */
export const KYOTO_FX: FxStyle = { bit: 'petal', bits: ['#f7c4d8', '#c9a6e6'], paper: ['#f3e9d2', '#b9b1d8'], sparks: ['#ffe7ce', '#efdaff'], shedBits: 1, shedSparks: 1, gravity: 0.62, drag: 1.7, flutter: 1, size: 1 };

/**
 * What a swing of the katana throws into the air: cherry petals shed along the blade, which tumble,
 * catch the breeze and settle on the deck, and a scatter of small lights that hang for a moment
 * where the edge passed. The harder the swing, the more of both.
 *
 * Two draws (one instanced mesh, one point cloud) from fixed pools; nothing is allocated while it
 * runs. The Motion control turns it off.
 */

const PETALS = 96, SPARKS = 170;
/** Blade-tip speed, m/s, above which the blade sheds sparks, and petals. */
const SPARK_FROM = 1.8, PETAL_FROM = 2.6;

export function createSwingFx(world: World) {
  const group = new Group(); group.name = 'Swing petals and sparks';

  // The same six-triangle petal the garden drifts (garden.ts), unlit so it reads at twilight too.
  const petalGeometry = new BufferGeometry();
  petalGeometry.setAttribute('position', new Float32BufferAttribute([
    0,0,.12, -.44,.28,0, -.32,.70,0,
    0,0,.12, -.32,.70,0, -.08,1,0,
    0,0,.12, -.08,1,0, .07,.85,.04,
    0,0,.12, .07,.85,.04, .26,.99,0,
    0,0,.12, .26,.99,0, .48,.59,0,
    0,0,.12, .48,.59,0, .31,.19,0,
  ], 3));
  // White: each petal carries its own colour (pink from the blade, cream for a cut letter's shreds).
  const petalMaterial = new MeshBasicMaterial({ color: '#ffffff', side: DoubleSide });
  const petals = new InstancedMesh(petalGeometry, petalMaterial, PETALS);
  petals.name = 'Petals shed by a swing'; petals.instanceMatrix.setUsage(DynamicDrawUsage); petals.frustumCulled = false; petals.count = 0;
  group.add(petals);
  const duskPink = new Color('#f7c4d8'), nightPink = new Color('#c9a6e6');
  const duskPaper = new Color('#f3e9d2'), nightPaper = new Color('#b9b1d8'), tint = new Color();
  // What the bits are in each level: a petal, a key cap, a splinter, a droplet.
  let style = KYOTO_FX;
  const splinter = new BufferGeometry();
  splinter.setAttribute('position', new Float32BufferAttribute([0,0,0, .16,.1,.05, .04,1.5,0,  0,0,0, .04,1.5,0, -.13,.2,-.05,  .16,.1,.05, -.13,.2,-.05, .04,1.5,0], 3));
  // (Knockout's: a five-pointed star, the kind a cartoon punch knocks loose)
  const starGeometry = new BufferGeometry();
  { const points: number[] = [];
    for (let i = 0; i < 10; i++) {
      const a0 = i / 10 * Math.PI * 2, a1 = (i + 1) / 10 * Math.PI * 2, r0 = i % 2 ? 0.26 : 0.62, r1 = i % 2 ? 0.62 : 0.26;
      points.push(0, 0.5, 0.14, Math.sin(a0) * r0, 0.5 + Math.cos(a0) * r0, 0, Math.sin(a1) * r1, 0.5 + Math.cos(a1) * r1, 0);
    }
    starGeometry.setAttribute('position', new Float32BufferAttribute(points, 3)); }
  const bitGeometry = { star: starGeometry, petal: petalGeometry, cap: new BoxGeometry(1, 0.55, 1), shard: splinter, drop: new IcosahedronGeometry(0.5, 0) };
  let evening = 0;
  for (let i = 0; i < PETALS; i++) petals.setColorAt(i, duskPink);

  const p = { pos: new Float32Array(PETALS * 3), vel: new Float32Array(PETALS * 3), age: new Float32Array(PETALS).fill(1e3),
    life: new Float32Array(PETALS).fill(1), size: new Float32Array(PETALS), spin: new Float32Array(PETALS) };
  let nextPetal = 0, livePetals = 0;

  const sparkPos = new Float32Array(SPARKS * 3), sparkAlpha = new Float32Array(SPARKS), sparkSize = new Float32Array(SPARKS);
  const s = { vel: new Float32Array(SPARKS * 3), age: new Float32Array(SPARKS).fill(1e3), life: new Float32Array(SPARKS).fill(1) };
  const sparkGeometry = new BufferGeometry();
  sparkGeometry.setAttribute('position', new BufferAttribute(sparkPos, 3).setUsage(DynamicDrawUsage));
  sparkGeometry.setAttribute('alpha', new BufferAttribute(sparkAlpha, 1).setUsage(DynamicDrawUsage));
  sparkGeometry.setAttribute('size', new BufferAttribute(sparkSize, 1).setUsage(DynamicDrawUsage));
  const sparkMaterial = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { pixelRatio: { value: 1 }, night: { value: 0 }, warm: { value: new Color(KYOTO_FX.sparks[0]) }, cool: { value: new Color(KYOTO_FX.sparks[1]) } },
    vertexShader: /* glsl */ `
      attribute float alpha, size; uniform float pixelRatio; varying float fade;
      void main(){
        vec4 mv=modelViewMatrix*vec4(position,1.);
        gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(size*pixelRatio/-mv.z,1.5,34.*pixelRatio);
        fade=alpha;
      }`,
    fragmentShader: /* glsl */ `
      uniform float night; uniform vec3 warm,cool; varying float fade;
      void main(){
        float r=length(gl_PointCoord-.5)*2.;
        float glow=exp(-r*r*4.5)*(1.-smoothstep(.75,1.,r))*.6+exp(-r*r*32.);
        // warm at dusk, the trail's lavender as it gets dark
        gl_FragColor=vec4(mix(warm,cool,.35+.65*night),fade*glow);
        #include <colorspace_fragment>
      }`,
  });
  const sparks = new Points(sparkGeometry, sparkMaterial);
  sparks.name = 'Lights left by a swing'; sparks.frustumCulled = false; sparks.visible = false;
  group.add(sparks);
  let nextSpark = 0, liveSparks = 0;
  world.createTransformEntity(group);

  const dummy = new Object3D(), at = new Vector3();
  let owedPetals = 0, owedSparks = 0, clock = 0;
  const rand = (spread: number) => (Math.random() - 0.5) * 2 * spread;

  /** One petal from somewhere along the blade, thrown the way the blade is going. */
  function shedPetal(blade: BladeTracker, kick: number) {
    const i = nextPetal; nextPetal = (nextPetal + 1) % PETALS;
    const along = 0.3 + 0.7 * Math.random();
    at.lerpVectors(blade.base, blade.tip, along);
    p.pos[i*3] = at.x; p.pos[i*3+1] = at.y; p.pos[i*3+2] = at.z;
    // the middle of the blade moves slower than its tip
    p.vel[i*3] = blade.velocity.x * along * kick + rand(.45);
    p.vel[i*3+1] = blade.velocity.y * along * kick + rand(.45) + .25;
    p.vel[i*3+2] = blade.velocity.z * along * kick + rand(.45);
    p.age[i] = 0; p.life[i] = 2.2 + Math.random() * 2.2; p.size[i] = (.018 + Math.random() * .018) * style.size; p.spin[i] = Math.random() * 6.283;
    petals.setColorAt(i, tint.copy(duskPink).lerp(nightPink, evening)); petals.instanceColor!.needsUpdate = true;
  }
  function shedSpark(blade: BladeTracker) {
    const i = nextSpark; nextSpark = (nextSpark + 1) % SPARKS;
    const along = 0.25 + 0.75 * Math.random();
    at.lerpVectors(blade.base, blade.tip, along);
    sparkPos[i*3] = at.x + rand(.012); sparkPos[i*3+1] = at.y + rand(.012); sparkPos[i*3+2] = at.z + rand(.012);
    s.vel[i*3] = blade.velocity.x * along * .16 + rand(.22);
    s.vel[i*3+1] = blade.velocity.y * along * .16 + rand(.22) + .08;
    s.vel[i*3+2] = blade.velocity.z * along * .16 + rand(.22);
    s.age[i] = 0; s.life[i] = .55 + Math.random() * .9; sparkSize[i] = 11 + Math.random() * 20;
  }

  /**
   * Something has happened at a place (a letter cut along `span`, or kept): a spray from along the
   * line `from` to `to`, thrown the way `push` points, m/s. `paper` makes the petals shreds of the
   * letter instead; `gold` warms the lights. For letters.ts.
   */
  function spray(from: Vector3, to: Vector3, push: Vector3, petalCount: number, sparkCount: number, paper = false, scatter = 1) {
    for (let n = petalCount; n > 0; n--) {
      const i = nextPetal; nextPetal = (nextPetal + 1) % PETALS;
      at.lerpVectors(from, to, Math.random());
      p.pos[i*3] = at.x; p.pos[i*3+1] = at.y; p.pos[i*3+2] = at.z;
      p.vel[i*3] = push.x + rand(.9 * scatter); p.vel[i*3+1] = push.y + rand(.9 * scatter) + .5; p.vel[i*3+2] = push.z + rand(.9 * scatter);
      p.age[i] = 0; p.life[i] = 1.8 + Math.random() * 2.4; p.size[i] = paper ? .012 + Math.random() * .018 : (.018 + Math.random() * .018) * style.size; p.spin[i] = Math.random() * 6.283;
      petals.setColorAt(i, paper ? tint.copy(duskPaper).lerp(nightPaper, evening) : tint.copy(duskPink).lerp(nightPink, evening));
    }
    if (petalCount > 0) petals.instanceColor!.needsUpdate = true;
    for (let n = sparkCount; n > 0; n--) {
      const i = nextSpark; nextSpark = (nextSpark + 1) % SPARKS;
      at.lerpVectors(from, to, Math.random());
      sparkPos[i*3] = at.x; sparkPos[i*3+1] = at.y; sparkPos[i*3+2] = at.z;
      s.vel[i*3] = push.x * .5 + rand(.7 * scatter); s.vel[i*3+1] = push.y * .5 + rand(.7 * scatter) + .15; s.vel[i*3+2] = push.z * .5 + rand(.7 * scatter);
      s.age[i] = 0; s.life[i] = .45 + Math.random() * .9; sparkSize[i] = 10 + Math.random() * 22;
    }
  }

  /** A swing has been made (ambience.ts calls it as the swing's sound starts): a handful at once. */
  function burst(strength: number, blade: BladeTracker, motion: boolean) {
    if (!motion || !blade.moving) return;
    for (let n = Math.round((5 + 12 * strength) * style.shedBits); n > 0; n--) shedPetal(blade, .34);
    for (let n = Math.round((14 + 30 * strength) * style.shedSparks); n > 0; n--) shedSpark(blade);
  }

  function update(dt: number, blade: BladeTracker, motion: boolean, night: number, breeze: number, pixelRatio: number) {
    clock += dt; evening = night;
    if (motion && blade.moving) {
      // while the blade is moving fast it keeps shedding, so a long cut leaves a long wake
      owedSparks += Math.max(0, blade.speed - SPARK_FROM) * 34 * dt * style.shedSparks;
      owedPetals += Math.max(0, blade.speed - PETAL_FROM) * 4.5 * dt * style.shedBits;
      for (; owedSparks >= 1; owedSparks--) shedSpark(blade);
      for (; owedPetals >= 1; owedPetals--) shedPetal(blade, .3);
    } else { owedSparks = 0; owedPetals = 0; }

    livePetals = 0;
    const drag = Math.exp(-dt * style.drag), wind = (.12 + breeze * .5) * style.flutter, flutter = style.flutter;
    for (let i = 0; i < PETALS; i++) {
      const age = (p.age[i] += dt), life = p.life[i];
      if (age >= life) { if (age - dt < life) { dummy.scale.setScalar(0); dummy.updateMatrix(); petals.setMatrixAt(i, dummy.matrix); } continue; }
      livePetals++;
      const x = i*3, y = x+1, z = x+2;
      const landed = p.pos[y] <= .012;
      if (!landed) {
        // falls like a petal: slowly, side to side, and off with the breeze
        p.vel[x] = p.vel[x] * drag + (wind + Math.sin(clock * 2.3 + p.spin[i]) * .35 * flutter) * dt;
        p.vel[y] = p.vel[y] * drag - style.gravity * dt;
        p.vel[z] = p.vel[z] * drag + Math.cos(clock * 1.9 + p.spin[i] * 1.7) * .3 * flutter * dt;
        p.pos[x] += p.vel[x] * dt; p.pos[y] = Math.max(.012, p.pos[y] + p.vel[y] * dt); p.pos[z] += p.vel[z] * dt;
      }
      dummy.position.set(p.pos[x], p.pos[y], p.pos[z]);
      const turn = landed ? 0 : age;                       // lying on the deck, it lies still and flat
      if (landed) dummy.rotation.set(-Math.PI / 2, 0, p.spin[i]);
      else dummy.rotation.set(p.spin[i] + turn * 3.1, p.spin[i] * 1.3 + turn * 2.2, p.spin[i] + Math.sin(turn * 4 + p.spin[i]) * .8);
      dummy.scale.setScalar(p.size[i] * Math.min(1, age / .07) * Math.min(1, (life - age) / .6));
      dummy.updateMatrix(); petals.setMatrixAt(i, dummy.matrix);
    }
    petals.count = PETALS; petals.visible = livePetals > 0;
    if (livePetals > 0) petals.instanceMatrix.needsUpdate = true;

    liveSparks = 0;
    const sparkDrag = Math.exp(-dt * 3.2);
    for (let i = 0; i < SPARKS; i++) {
      const age = (s.age[i] += dt), life = s.life[i];
      if (age >= life) { sparkAlpha[i] = 0; continue; }
      liveSparks++;
      const x = i*3;
      s.vel[x] = s.vel[x] * sparkDrag + wind * .4 * dt; s.vel[x+1] = s.vel[x+1] * sparkDrag + .05 * dt; s.vel[x+2] *= sparkDrag;
      sparkPos[x] += s.vel[x] * dt; sparkPos[x+1] += s.vel[x+1] * dt; sparkPos[x+2] += s.vel[x+2] * dt;
      const left = 1 - age / life;
      sparkAlpha[i] = left * left * (.7 + .3 * Math.sin(age * 31 + i));
    }
    sparks.visible = liveSparks > 0;
    if (liveSparks > 0) {
      sparkGeometry.attributes.position.needsUpdate = true; sparkGeometry.attributes.alpha.needsUpdate = true; sparkGeometry.attributes.size.needsUpdate = true;
      sparkMaterial.uniforms.pixelRatio.value = pixelRatio; sparkMaterial.uniforms.night.value = night;
    }
  }

  /** Change level: what the bits are, their colours and how they fall. Whatever is in the air goes. */
  function setStyle(next: FxStyle) {
    style = next;
    petals.geometry = bitGeometry[next.bit];
    duskPink.set(next.bits[0]); nightPink.set(next.bits[1]); duskPaper.set(next.paper[0]); nightPaper.set(next.paper[1]);
    sparkMaterial.uniforms.warm.value.set(next.sparks[0]); sparkMaterial.uniforms.cool.value.set(next.sparks[1]);
    p.age.fill(1e3); s.age.fill(1e3); sparkAlpha.fill(0); sparkGeometry.attributes.alpha.needsUpdate = true;
    for (let i = 0; i < PETALS; i++) { dummy.scale.setScalar(0); dummy.updateMatrix(); petals.setMatrixAt(i, dummy.matrix); }
    petals.instanceMatrix.needsUpdate = true; owedPetals = 0; owedSparks = 0;
  }

  return { update, burst, spray, setStyle, diagnostics: () => ({ petals: livePetals, sparks: liveSparks }),
    dispose: () => { petalGeometry.dispose(); petalMaterial.dispose(); sparkGeometry.dispose(); sparkMaterial.dispose(); } };
}
