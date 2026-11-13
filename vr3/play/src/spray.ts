import { BufferAttribute, BufferGeometry, DynamicDrawUsage, NormalBlending, Points, ShaderMaterial, Vector3, type World } from '@iwsdk/core';

/**
 * The sprayer's mist: a soft cone of mostly white, with specks of bright green, yellow, pink and purple, from the nozzle for as long as the trigger is
 * held, thinning and slowing as it goes. One draw from a fixed pool. What it does to a letter is
 * letters.ts; this is only what is seen.
 */
const MIST = 260;
// its colours (linear): white with a breath of mint, and the odd bright green or yellow
const WHITE = [[1, 1, 1], [0.92, 1, 0.95], [0.97, 1, 0.9]];
const GREEN = [[0.35, 1, 0.12], [0.55, 1, 0.2], [0.2, 0.95, 0.35]];
const YELLOW = [[1, 0.95, 0.15], [0.95, 1, 0.3], [1, 0.85, 0.1]];
// and pinks and purples too (2026-11-12: "some varients of pinks and purples too")
const PINK = [[1, 0.25, 0.7], [1, 0.45, 0.85], [0.95, 0.2, 0.5]];
const PURPLE = [[0.7, 0.3, 1], [0.55, 0.2, 1], [0.85, 0.45, 1]];

export function createMist(world: World) {
  const pos = new Float32Array(MIST * 3), vel = new Float32Array(MIST * 3), age = new Float32Array(MIST).fill(1e3), life = new Float32Array(MIST).fill(1);
  const alpha = new Float32Array(MIST), size = new Float32Array(MIST), tint = new Float32Array(MIST * 3).fill(1), strong = new Float32Array(MIST).fill(0.5);
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
        float a=exp(-r*r*3.2)*(1.-smoothstep(.7,1.,r));
        gl_FragColor=vec4(mix(vTint,min(vec3(1.),vTint*.35+.75),a*.45),a*fade);      // (its own colour, a little paler at the heart)
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
      owed += 190 * dt;
      for (; owed >= 1; owed--) {
        const i = next; next = (next + 1) % MIST;
        const speed = 3.2 + Math.random() * 2.6, a = rand(0.11), b = rand(0.11);
        pos[i * 3] = nozzle.origin.x; pos[i * 3 + 1] = nozzle.origin.y; pos[i * 3 + 2] = nozzle.origin.z;
        vel[i * 3] = (nozzle.direction.x + side.x * a + up.x * b) * speed; vel[i * 3 + 1] = (nozzle.direction.y + side.y * a + up.y * b) * speed; vel[i * 3 + 2] = (nozzle.direction.z + side.z * a + up.z * b) * speed;
        age[i] = 0; life[i] = 0.4 + Math.random() * 0.45; size[i] = 16 + Math.random() * 20;
        // mostly white, now and then a bright green or yellow (2026-11-12: "mostly white but some times have bright greens
        // and yellows, so more variety"); the coloured ones a little smaller and more solid, so they read as specks of colour
        const roll = Math.random(), pick = (set: number[][]) => set[Math.floor(Math.random() * set.length)];
        const c = roll < 0.66 ? pick(WHITE) : roll < 0.78 ? pick(GREEN) : roll < 0.87 ? pick(YELLOW) : roll < 0.94 ? pick(PINK) : pick(PURPLE);
        tint[i * 3] = c[0]; tint[i * 3 + 1] = c[1]; tint[i * 3 + 2] = c[2];
        strong[i] = roll < 0.66 ? 0.5 : 0.8; if (roll >= 0.66) size[i] *= 0.75;
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
      alpha[i] = Math.min(1, k * 8) * (1 - k) * strong[i]; size[i] += dt * 150;       // it opens out as it goes
    }
    points.visible = live > 0;
    if (live > 0) { geometry.attributes.position.needsUpdate = true; geometry.attributes.alpha.needsUpdate = true; geometry.attributes.size.needsUpdate = true; geometry.attributes.tint.needsUpdate = true; material.uniforms.pixelRatio.value = pixelRatio; }
  }
  return { update, diagnostics: () => ({ mist: live }), dispose: () => { geometry.dispose(); material.dispose(); points.removeFromParent(); } };
}
