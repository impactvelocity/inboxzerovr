import { BufferAttribute, BufferGeometry, DynamicDrawUsage, NormalBlending, Points, ShaderMaterial, Vector3, type World } from '@iwsdk/core';

/**
 * The sprayer's mist: a soft cone of greens (lime, emerald, mint, chartreuse, teal) with a little white and yellow, some puffs faint and some nearly solid, from the nozzle for as long as the trigger is
 * held, thinning and slowing as it goes. One draw from a fixed pool. What it does to a letter is
 * letters.ts; this is only what is seen.
 */
const MIST = 320;
// its colours (linear): greens through and through, with a little white and yellow (2026-11-13: "particles from spray
// more greenish, and variations of that"; before it the mist had pinks, purples, cyans and oranges too)
const WHITE = [[0.92, 1, 0.95], [0.85, 1, 0.9], [0.95, 1, 0.88]];
const LIME = [[0.45, 1, 0.08], [0.6, 1, 0.15], [0.35, 0.95, 0.05]];
const EMERALD = [[0.05, 0.85, 0.3], [0.1, 1, 0.4], [0.02, 0.7, 0.25]];
const MINT = [[0.5, 1, 0.7], [0.65, 1, 0.8], [0.4, 0.95, 0.6]];
const CHARTREUSE = [[0.8, 1, 0.15], [0.9, 1, 0.3], [0.7, 0.95, 0.1]];
const TEAL = [[0.05, 0.9, 0.65], [0.15, 1, 0.75], [0.03, 0.75, 0.55]];
const YELLOW = [[1, 0.95, 0.15], [1, 0.88, 0.1]];
/** Each puff's colour: [chance, set], in order. */
const MIX: [number, number[][]][] = [[0.18, WHITE], [0.2, LIME], [0.16, EMERALD], [0.16, MINT], [0.14, CHARTREUSE], [0.1, TEAL], [0.06, YELLOW]];
/**
 * How opaque a puff gets at its fullest (2026-11-13: "more from 10% to 90% for particles", then "larger variety of opacities").
 * Not spread evenly, which reads as one middling haze: nearly half are faint wisps, a third middling, and the rest nearly solid
 * dabs of paint that also hold their opacity longer and have a firmer edge. [share, faintest, fullest]
 */
const OPACITY: [number, number, number][] = [[0.45, 0.04, 0.2], [0.33, 0.25, 0.6], [0.22, 0.8, 1]];

export function createMist(world: World) {
  const pos = new Float32Array(MIST * 3), vel = new Float32Array(MIST * 3), age = new Float32Array(MIST).fill(1e3), life = new Float32Array(MIST).fill(1);
  const alpha = new Float32Array(MIST), size = new Float32Array(MIST), tint = new Float32Array(MIST * 3).fill(1), strong = new Float32Array(MIST).fill(0.5), hold = new Float32Array(MIST).fill(1);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage));
  geometry.setAttribute('alpha', new BufferAttribute(alpha, 1).setUsage(DynamicDrawUsage));
  geometry.setAttribute('size', new BufferAttribute(size, 1).setUsage(DynamicDrawUsage));
  geometry.setAttribute('tint', new BufferAttribute(tint, 3).setUsage(DynamicDrawUsage));
  const material = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: NormalBlending, uniforms: { pixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float alpha,size; attribute vec3 tint; uniform float pixelRatio; varying float fade; varying vec3 vTint;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(size*pixelRatio/-mv.z,1.5,90.*pixelRatio); fade=alpha; vTint=tint; }`,
    fragmentShader: /* glsl */ `
      varying float fade; varying vec3 vTint;
      void main(){
        float r=length(gl_PointCoord-.5)*2.;
        float a=exp(-r*r*mix(4.5,1.3,fade*fade))*(1.-smoothstep(.72,1.,r));      // (the fuller it is, the firmer its edge: a solid dab, where a faint one is a wisp)
        gl_FragColor=vec4(mix(vTint,min(vec3(1.),vTint*.35+.75),a*.22),a*fade);      // (its own colour, only a touch paler at the heart: it was .45, which washed the colours out)
        #include <colorspace_fragment>
      }`,
  });
  const points = new Points(geometry, material); points.name = 'Disinfectant mist'; points.frustumCulled = false; points.visible = false; points.renderOrder = 6;
  world.createTransformEntity(points);
  const side = new Vector3(), up = new Vector3(), ref = new Vector3();
  let next = 0, owed = 0, live = 0;
  const rand = (spread: number) => (Math.random() - 0.5) * 2 * spread;

  /** Every frame: the nozzle (world space) and how hard the trigger is held, or null when there is no sprayer. */
  function update(dt: number, nozzle: { origin: Vector3; direction: Vector3; valid: boolean; on: number } | null, pixelRatio: number) {
    if (nozzle && nozzle.valid && nozzle.on > 0.25) {
      // two directions across the nozzle's line, to spread the cone over
      side.crossVectors(nozzle.direction, ref.set(0, 1, 0)); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize(); up.crossVectors(side, nozzle.direction);
      owed += 220 * dt;
      for (; owed >= 1; owed--) {
        const i = next; next = (next + 1) % MIST;
        const speed = 3.2 + Math.random() * 2.6, a = rand(0.11), b = rand(0.11);
        pos[i * 3] = nozzle.origin.x; pos[i * 3 + 1] = nozzle.origin.y; pos[i * 3 + 2] = nozzle.origin.z;
        vel[i * 3] = (nozzle.direction.x + side.x * a + up.x * b) * speed; vel[i * 3 + 1] = (nozzle.direction.y + side.y * a + up.y * b) * speed; vel[i * 3 + 2] = (nozzle.direction.z + side.z * a + up.z * b) * speed;
        age[i] = 0; life[i] = 0.4 + Math.random() * 0.5; size[i] = 12 + Math.random() * 30;
        // white and a spray-paint box of colours (2026-11-12: "mostly white but some times have bright greens and yellows";
        // 2026-11-13: "more vibrant, more fun"); the coloured ones a little smaller, so they read as specks of colour
        let roll = Math.random(), set = MIX[MIX.length - 1][1];
        for (const [chance, s] of MIX) { if (roll < chance) { set = s; break; } roll -= chance; }
        const c = set[Math.floor(Math.random() * set.length)];
        tint[i * 3] = c[0]; tint[i * 3 + 1] = c[1]; tint[i * 3 + 2] = c[2];
        if (set !== WHITE) size[i] *= 0.8;
        // its fullest, faint wisp to nearly solid dab; the fuller ones keep it for longer before they fade
        let pick = Math.random(), band = OPACITY[OPACITY.length - 1];
        for (const b of OPACITY) { if (pick < b[0]) { band = b; break; } pick -= b[0]; }
        strong[i] = band[1] + (band[2] - band[1]) * Math.random();
        hold[i] = 1 + 3 * strong[i] * strong[i];
      }
    } else owed = 0;
    live = 0;
    const drag = Math.exp(-dt * 2.4);
    for (let i = 0; i < MIST; i++) {
      const t = (age[i] += dt);
      if (t >= life[i]) { alpha[i] = 0; continue; }
      live++;
      const x = i * 3;
      vel[x] *= drag; vel[x + 1] = vel[x + 1] * drag - 0.5 * dt; vel[x + 2] *= drag;
      pos[x] += vel[x] * dt; pos[x + 1] += vel[x + 1] * dt; pos[x + 2] += vel[x + 2] * dt;
      const k = t / life[i];
      alpha[i] = Math.min(1, k * 10) * (1 - Math.pow(k, hold[i])) * strong[i]; size[i] += dt * 150;       // it opens out as it goes
    }
    points.visible = live > 0;
    if (live > 0) { geometry.attributes.position.needsUpdate = true; geometry.attributes.alpha.needsUpdate = true; geometry.attributes.size.needsUpdate = true; geometry.attributes.tint.needsUpdate = true; material.uniforms.pixelRatio.value = pixelRatio; }
  }
  return { update, diagnostics: () => ({ mist: live }), dispose: () => { geometry.dispose(); material.dispose(); points.removeFromParent(); } };
}
