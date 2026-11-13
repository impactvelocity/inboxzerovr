import * as THREE from 'three';
import type { World } from '@iwsdk/core';
import { settings } from './garden';

/**
 * Inferno's fire: the jet from the flame thrower for as long as its trigger is held, the pilot
 * light at its muzzle the rest of the time, and the flames on a letter that has caught. Three
 * draws from fixed pools (licks of flame, embers, smoke) and one real light, so that the thing in
 * the hand is lit by what it throws. What the fire does to a letter is letters.ts; this is only
 * what is seen.
 *
 * Sizes are in metres: a point's size is worked out from the view's real height (as props/puffs.ts
 * does), so the fire is the same size on a monitor and in a headset.
 */
const FIRE = 380, HALOS = 3, EMBERS = 180, SMOKE = 56, SITES = 6;
/** The jet's numbers: one place to change how it feels. */
export const jet = {
  rate: 250,                // licks of flame a second while the trigger is held
  speed: [5.6, 8.6],        // m/s out of the muzzle
  cone: 0.07,               // how far it spreads, radians
  life: [0.26, 0.52],       // seconds each lick lasts
  drag: 2.6,                // how fast it loses speed, per second: it reaches about 1.8 m
  lift: 2.6,                // m/s2 it rises at once it has slowed: fire climbs
  size: [0.036, 0.06],      // metres across as it leaves
  grow: [0.55, 0.85],       // and how much it opens out, m/s
};

export function createFlame(world: World) {
  const group = new THREE.Group(); group.name = 'Fire';
  const rand = (spread: number) => (Math.random() - 0.5) * 2 * spread;
  const between = (range: number[]) => range[0] + Math.random() * (range[1] - range[0]);

  // ---------------------------------------------------------------- licks of flame (and three soft halos: the bloom round the jet)
  const N = FIRE + HALOS;
  const firePos = new Float32Array(N * 3), fireAge = new Float32Array(N).fill(1), fireSize = new Float32Array(N), fireSeed = new Float32Array(N), fireKind = new Float32Array(N);
  const fireVel = new Float32Array(N * 3), fireLife = new Float32Array(N).fill(1), fireBorn = new Float32Array(N).fill(1e3), fireGrow = new Float32Array(N), fireLift = new Float32Array(N);
  for (let i = 0; i < N; i++) fireSeed[i] = Math.random();
  for (let i = FIRE; i < N; i++) fireKind[i] = 2;
  const fireGeometry = new THREE.BufferGeometry();
  fireGeometry.setAttribute('position', new THREE.BufferAttribute(firePos, 3).setUsage(THREE.DynamicDrawUsage));
  fireGeometry.setAttribute('age', new THREE.BufferAttribute(fireAge, 1).setUsage(THREE.DynamicDrawUsage));
  fireGeometry.setAttribute('metres', new THREE.BufferAttribute(fireSize, 1).setUsage(THREE.DynamicDrawUsage));
  fireGeometry.setAttribute('seed', new THREE.BufferAttribute(fireSeed, 1));
  fireGeometry.setAttribute('kind', new THREE.BufferAttribute(fireKind, 1).setUsage(THREE.DynamicDrawUsage));
  const sized = /* glsl */ `gl_PointSize=age<1.?clamp(metres*projectionMatrix[1][1]*viewHalf/max(.05,gl_Position.w),1.,440.):0.;`;
  const noise = /* glsl */ `
    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y); }`;
  const fireMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { viewHalf: { value: 400 }, time: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float age,metres,seed,kind; uniform float viewHalf; varying float k; varying float vSeed; varying float vKind;
      void main(){
        vec4 mv=modelViewMatrix*vec4(position,1.);
        gl_Position=projectionMatrix*mv;
        ${sized}
        k=age; vSeed=seed; vKind=kind;
      }`,
    fragmentShader: /* glsl */ `
      uniform float time; varying float k; varying float vSeed; varying float vKind;
      ${noise}
      void main(){
        vec2 p=(gl_PointCoord-.5)*2.; float r=length(p);
        if(vKind>1.5){
          // a halo: the light the jet throws into the air round it
          float a=exp(-r*r*3.4)*(1.-smoothstep(.8,1.,r))*(1.-k)*.2;
          gl_FragColor=vec4(vec3(1.,.5,.14),a); return;
        }
        // Each lick is turned its own way and its edge is eaten by noise that climbs through it,
        // more as it ages: a tongue of flame, not a ball.
        float turn=vSeed*6.283, c=cos(turn), s=sin(turn); vec2 q=vec2(p.x*c-p.y*s,p.x*s+p.y*c);
        float n=noise(q*2.3+vec2(vSeed*31.,vSeed*17.-time*3.2))*.62+noise(q*5.1+vec2(vSeed*9.,-time*5.5))*.38;
        float body=1.-smoothstep(.22,1.,r+(n-.5)*(.5+.75*k));
        // white-hot in the middle and when young, through yellow and orange to a deep red at the edge and with age
        float heat=clamp(body*(1.3-k*1.1)+(1.-k)*.12,0.,1.);
        vec3 col=mix(vec3(.5,.03,0.),vec3(1.,.27,.02),smoothstep(0.,.34,heat));
        col=mix(col,vec3(1.,.7,.15),smoothstep(.3,.68,heat));
        col=mix(col,vec3(1.,.96,.8),smoothstep(.72,1.,heat));
        // the pilot light burns blue at its root
        col=mix(col,mix(vec3(.12,.36,1.),vec3(.62,.82,1.),heat),vKind*(1.-k)*.9);
        float a=body*smoothstep(0.,.07,k)*pow(1.-k,1.25)*.62;
        gl_FragColor=vec4(col,a);
      }`,
  });
  const fire = new THREE.Points(fireGeometry, fireMaterial); fire.name = 'Licks of flame'; fire.frustumCulled = false; fire.visible = false; fire.renderOrder = 7;
  group.add(fire);
  let nextFire = 0;
  function lick(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grow: number, lift: number, kind = 0) {
    const i = nextFire; nextFire = (nextFire + 1) % FIRE;
    firePos[i * 3] = x; firePos[i * 3 + 1] = y; firePos[i * 3 + 2] = z;
    fireVel[i * 3] = vx; fireVel[i * 3 + 1] = vy; fireVel[i * 3 + 2] = vz;
    fireBorn[i] = 0; fireLife[i] = life; fireSize[i] = size; fireGrow[i] = grow; fireLift[i] = lift; fireKind[i] = kind; fireAge[i] = 0;
  }

  // ---------------------------------------------------------------- embers
  const emberPos = new Float32Array(EMBERS * 3), emberAge = new Float32Array(EMBERS).fill(1), emberSize = new Float32Array(EMBERS), emberSeed = new Float32Array(EMBERS);
  const emberVel = new Float32Array(EMBERS * 3), emberLife = new Float32Array(EMBERS).fill(1), emberBorn = new Float32Array(EMBERS).fill(1e3);
  for (let i = 0; i < EMBERS; i++) emberSeed[i] = Math.random();
  const emberGeometry = new THREE.BufferGeometry();
  emberGeometry.setAttribute('position', new THREE.BufferAttribute(emberPos, 3).setUsage(THREE.DynamicDrawUsage));
  emberGeometry.setAttribute('age', new THREE.BufferAttribute(emberAge, 1).setUsage(THREE.DynamicDrawUsage));
  emberGeometry.setAttribute('metres', new THREE.BufferAttribute(emberSize, 1));
  emberGeometry.setAttribute('seed', new THREE.BufferAttribute(emberSeed, 1));
  const emberMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { viewHalf: { value: 400 }, time: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float age,metres,seed; uniform float viewHalf,time; varying float k; varying float glint;
      void main(){
        vec4 mv=modelViewMatrix*vec4(position,1.);
        gl_Position=projectionMatrix*mv;
        ${sized}
        gl_PointSize=max(gl_PointSize,age<1.?1.6:0.);
        k=age; glint=.65+.35*sin(time*(18.+22.*seed)+seed*90.);
      }`,
    fragmentShader: /* glsl */ `
      varying float k; varying float glint;
      void main(){
        float r=length(gl_PointCoord-.5)*2.;
        float glow=exp(-r*r*5.)*(1.-smoothstep(.7,1.,r))*.55+exp(-r*r*36.);
        vec3 col=mix(vec3(1.,.86,.5),vec3(1.,.3,.04),smoothstep(0.,.6,k));
        gl_FragColor=vec4(col,glow*glint*smoothstep(0.,.05,k)*(1.-k*k));
      }`,
  });
  const embers = new THREE.Points(emberGeometry, emberMaterial); embers.name = 'Embers'; embers.frustumCulled = false; embers.visible = false; embers.renderOrder = 7;
  group.add(embers);
  let nextEmber = 0;
  function ember(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number) {
    const i = nextEmber; nextEmber = (nextEmber + 1) % EMBERS;
    emberPos[i * 3] = x; emberPos[i * 3 + 1] = y; emberPos[i * 3 + 2] = z;
    emberVel[i * 3] = vx; emberVel[i * 3 + 1] = vy; emberVel[i * 3 + 2] = vz;
    emberBorn[i] = 0; emberLife[i] = life; emberSize[i] = 0.007 + Math.random() * 0.011; emberAge[i] = 0;
    emberGeometry.attributes.metres.needsUpdate = true;
  }

  // ---------------------------------------------------------------- smoke
  const smokePos = new Float32Array(SMOKE * 3), smokeAge = new Float32Array(SMOKE).fill(1), smokeSize = new Float32Array(SMOKE), smokeSeed = new Float32Array(SMOKE);
  const smokeVel = new Float32Array(SMOKE * 3), smokeLife = new Float32Array(SMOKE).fill(1), smokeBorn = new Float32Array(SMOKE).fill(1e3);
  for (let i = 0; i < SMOKE; i++) smokeSeed[i] = Math.random();
  const smokeGeometry = new THREE.BufferGeometry();
  smokeGeometry.setAttribute('position', new THREE.BufferAttribute(smokePos, 3).setUsage(THREE.DynamicDrawUsage));
  smokeGeometry.setAttribute('age', new THREE.BufferAttribute(smokeAge, 1).setUsage(THREE.DynamicDrawUsage));
  smokeGeometry.setAttribute('metres', new THREE.BufferAttribute(smokeSize, 1).setUsage(THREE.DynamicDrawUsage));
  smokeGeometry.setAttribute('seed', new THREE.BufferAttribute(smokeSeed, 1));
  const smokeMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    uniforms: { viewHalf: { value: 400 }, time: { value: 0 }, blend: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float age,metres,seed; uniform float viewHalf; varying float k; varying float vSeed;
      void main(){
        vec4 mv=modelViewMatrix*vec4(position,1.);
        gl_Position=projectionMatrix*mv;
        ${sized}
        k=age; vSeed=seed;
      }`,
    fragmentShader: /* glsl */ `
      uniform float time,blend; varying float k; varying float vSeed;
      ${noise}
      void main(){
        vec2 p=(gl_PointCoord-.5)*2.; float r=length(p);
        float n=noise(p*1.8+vec2(vSeed*23.,vSeed*11.-time*.5))*.6+noise(p*4.+vec2(vSeed*7.,-time*.9))*.4;
        float body=1.-smoothstep(.2,1.,r+(n-.5)*.7);
        // lit from below by the fire while it is young, then grey, then gone
        vec3 col=mix(vec3(.5,.2,.07),mix(vec3(.2,.16,.15),vec3(.09,.08,.11),blend),smoothstep(0.,.35,k));
        gl_FragColor=vec4(col,body*smoothstep(0.,.15,k)*(1.-k)*.3);
      }`,
  });
  const smoke = new THREE.Points(smokeGeometry, smokeMaterial); smoke.name = 'Smoke'; smoke.frustumCulled = false; smoke.visible = false; smoke.renderOrder = 6;
  group.add(smoke);
  let nextSmoke = 0;
  function puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number) {
    const i = nextSmoke; nextSmoke = (nextSmoke + 1) % SMOKE;
    smokePos[i * 3] = x; smokePos[i * 3 + 1] = y; smokePos[i * 3 + 2] = z;
    smokeVel[i * 3] = vx; smokeVel[i * 3 + 1] = vy; smokeVel[i * 3 + 2] = vz;
    smokeBorn[i] = 0; smokeLife[i] = life; smokeSize[i] = size; smokeAge[i] = 0;
  }

  // ---------------------------------------------------------------- its light
  const light = new THREE.PointLight('#ff8a3a', 0, 3.2, 1.6); light.name = 'Firelight';
  group.add(light);
  world.createTransformEntity(group);

  // ---------------------------------------------------------------- things alight
  /** A letter that has caught: `at` is the letter's own position (it is followed as it drifts), for so long. */
  const sites: { at: THREE.Vector3; left: number; total: number; size: number }[] = [];
  /** A letter has caught fire there. `at` is kept, not copied, so the flames stay on it as it moves. */
  function ignite(at: THREE.Vector3, seconds = 1.5, size = 1) {
    if (sites.length >= SITES) sites.shift();
    sites.push({ at, left: seconds, total: seconds, size });
    for (let n = 0; n < 16; n++) ember(at.x + rand(0.12), at.y + rand(0.08), at.z + rand(0.04), rand(1.6), 0.4 + Math.random() * 1.8, rand(1.2), 0.5 + Math.random() * 0.9);
  }
  /** It is burning right through: a last flare, a shower of embers, smoke. */
  function flare(at: THREE.Vector3) {
    for (let n = 0; n < 26; n++) lick(at.x + rand(0.22), at.y + rand(0.13), at.z + rand(0.03), rand(0.5), 0.5 + Math.random() * 1.3, rand(0.4), 0.3 + Math.random() * 0.35, 0.06 + Math.random() * 0.06, 0.25, 1.5);
    for (let n = 0; n < 40; n++) ember(at.x + rand(0.2), at.y + rand(0.12), at.z + rand(0.04), rand(1.9), 0.3 + Math.random() * 2.2, rand(1.5), 0.6 + Math.random() * 1.1);
    if (settings.quality !== 'low') for (let n = 0; n < 5; n++) puff(at.x + rand(0.16), at.y + 0.05 + rand(0.08), at.z + rand(0.03), rand(0.2), 0.5 + Math.random() * 0.4, rand(0.15), 1.1 + Math.random() * 0.7, 0.14 + Math.random() * 0.08);
  }

  const side = new THREE.Vector3(), up = new THREE.Vector3(), ref = new THREE.Vector3(), buffer = new THREE.Vector2();
  let clock = 0, owed = 0, owedPilot = 0, owedEmbers = 0, shown = 0, liveFire = 0, liveEmbers = 0, liveSmoke = 0;

  /**
   * Every frame: the muzzle (world space) and how hard the trigger is held, or null when the flame
   * thrower is not in the hand; and the eye, which the flames on a letter are spread across the view of.
   */
  function update(dt: number, nozzle: { origin: THREE.Vector3; direction: THREE.Vector3; valid: boolean; on: number } | null, eye: THREE.Vector3) {
    clock += dt;
    const renderer = world.renderer, light_ = settings.quality === 'low';
    const firing = !!nozzle && nozzle.valid && nozzle.on > 0.25;
    shown += ((firing ? 1 : 0) - shown) * (1 - Math.exp(-dt * (firing ? 22 : 9)));
    if (nozzle && nozzle.valid) {
      const o = nozzle.origin, d = nozzle.direction;
      side.crossVectors(d, ref.set(0, 1, 0)); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize(); up.crossVectors(side, d);
      if (firing) {
        owed += jet.rate * (light_ ? 0.6 : 1) * dt; owedPilot = 0;
        for (; owed >= 1; owed--) {
          const speed = between(jet.speed), a = rand(jet.cone), b = rand(jet.cone), lead = Math.random() * dt * speed;
          const vx = (d.x + side.x * a + up.x * b) * speed, vy = (d.y + side.y * a + up.y * b) * speed, vz = (d.z + side.z * a + up.z * b) * speed;
          lick(o.x + d.x * lead, o.y + d.y * lead, o.z + d.z * lead, vx, vy, vz, between(jet.life), between(jet.size), between(jet.grow), jet.lift);
        }
        // embers torn off the jet along its length
        owedEmbers += 46 * dt;
        for (; owedEmbers >= 1; owedEmbers--) {
          const along = 0.15 + Math.random() * 1.3, speed = 1 + Math.random() * 2.6;
          ember(o.x + d.x * along + rand(0.05), o.y + d.y * along + rand(0.05), o.z + d.z * along + rand(0.05),
            d.x * speed + rand(1.1), d.y * speed + 0.3 + rand(1.1), d.z * speed + rand(1.1), 0.5 + Math.random() * 1);
        }
      } else {
        owed = 0; owedPilot += 42 * dt;
        for (; owedPilot >= 1; owedPilot--)
          lick(o.x + d.x * 0.004 + rand(0.006), o.y + d.y * 0.004 + rand(0.006), o.z + d.z * 0.004 + rand(0.006),
            d.x * 0.3 + rand(0.05), d.y * 0.3 + 0.32 + rand(0.05), d.z * 0.3 + rand(0.05), 0.14 + Math.random() * 0.14, 0.02 + Math.random() * 0.012, 0.03, 0.6, 1);
      }
      // the halos ride along the jet, and the light sits in it
      const flutter = 0.8 + 0.2 * Math.sin(clock * 31) * Math.sin(clock * 19.7);
      const reach = [0.14, 0.6, 1.15], wide = [0.4, 0.8, 1.1];
      for (let h = 0; h < HALOS; h++) {
        const i = FIRE + h;
        firePos[i * 3] = o.x + d.x * reach[h]; firePos[i * 3 + 1] = o.y + d.y * reach[h] + 0.03 * h; firePos[i * 3 + 2] = o.z + d.z * reach[h];
        fireSize[i] = wide[h]; fireAge[i] = 1 - Math.min(0.999, shown * flutter * (h === 0 ? 1 : 0.75));
      }
      light.position.copy(o).addScaledVector(d, 0.22); light.position.y += 0.05;
      light.intensity = (0.25 + 3.4 * shown) * flutter;
    } else {
      owed = owedPilot = owedEmbers = 0; light.intensity = 0;
      for (let h = 0; h < HALOS; h++) fireAge[FIRE + h] = 1;
    }

    // a letter alight: flames climb off it, all across it
    for (let s = sites.length - 1; s >= 0; s--) {
      const site = sites[s], at = site.at;
      site.left -= dt;
      if (site.left <= 0) { sites.splice(s, 1); continue; }
      const grown = Math.min(1, (site.total - site.left) / 0.4) * Math.min(1, site.left / 0.25);
      // (across the view: at right angles to the line from the eye, level)
      side.set(at.z - eye.z, 0, -(at.x - eye.x)); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
      let count = (light_ ? 44 : 80) * grown * dt;
      for (; count > Math.random(); count--) {
        const x = rand(0.23 * site.size * grown), y = rand(0.14 * site.size);
        lick(at.x + side.x * x, at.y + y, at.z + side.z * x + 0.01, rand(0.22), 0.55 + Math.random() * 1.1, rand(0.22), 0.28 + Math.random() * 0.34, 0.05 + Math.random() * 0.05, 0.22, 1.6);
      }
      if (Math.random() < dt * 34 * grown) { const x = rand(0.22 * site.size); ember(at.x + side.x * x, at.y + rand(0.14), at.z + side.z * x, rand(0.9), 0.5 + Math.random() * 1.6, rand(0.9), 0.6 + Math.random() * 1.2); }
      if (!light_ && Math.random() < dt * 7 * grown) puff(at.x + rand(0.15), at.y + 0.1 + rand(0.05), at.z + rand(0.03), rand(0.15), 0.45 + Math.random() * 0.35, rand(0.1), 1 + Math.random() * 0.8, 0.12 + Math.random() * 0.08);
    }

    // ---- everything in the air
    const drag = Math.exp(-dt * jet.drag);
    liveFire = 0;
    for (let i = 0; i < FIRE; i++) {
      if (fireAge[i] >= 1) continue;
      const t = (fireBorn[i] += dt), k = t / fireLife[i], x = i * 3;
      if (k >= 1) {
        fireAge[i] = 1;
        // where the jet gives out it leaves smoke, now and then
        if (!light_ && fireKind[i] < 0.5 && fireLift[i] > 2 && Math.random() < 0.07) puff(firePos[x], firePos[x + 1], firePos[x + 2], fireVel[x] * 0.3, 0.35 + Math.random() * 0.3, fireVel[x + 2] * 0.3, 0.9 + Math.random() * 0.7, 0.13 + Math.random() * 0.1);
        continue;
      }
      liveFire++;
      const seed = fireSeed[i], swirl = 1.6 * k;
      fireVel[x] = fireVel[x] * drag + Math.sin(clock * 13 + seed * 40) * swirl * dt;
      fireVel[x + 1] = fireVel[x + 1] * drag + (fireLift[i] * k + Math.cos(clock * 11 + seed * 23) * swirl) * dt;
      fireVel[x + 2] = fireVel[x + 2] * drag + Math.sin(clock * 9 + seed * 61) * swirl * dt;
      firePos[x] += fireVel[x] * dt; firePos[x + 1] += fireVel[x + 1] * dt; firePos[x + 2] += fireVel[x + 2] * dt;
      fireSize[i] += fireGrow[i] * dt; fireAge[i] = k;
    }
    const slow = Math.exp(-dt * 1.3);
    liveEmbers = 0;
    for (let i = 0; i < EMBERS; i++) {
      if (emberAge[i] >= 1) continue;
      const t = (emberBorn[i] += dt), k = t / emberLife[i], x = i * 3;
      if (k >= 1) { emberAge[i] = 1; continue; }
      liveEmbers++;
      const seed = emberSeed[i];
      emberVel[x] = emberVel[x] * slow + Math.sin(clock * 5 + seed * 40) * 0.9 * dt;
      emberVel[x + 1] = emberVel[x + 1] * slow + (0.5 - 1.1 * k) * dt;            // carried up by the heat, then they tire and fall
      emberVel[x + 2] = emberVel[x + 2] * slow + Math.cos(clock * 4.3 + seed * 23) * 0.9 * dt;
      emberPos[x] += emberVel[x] * dt; emberPos[x + 1] += emberVel[x + 1] * dt; emberPos[x + 2] += emberVel[x + 2] * dt;
      emberAge[i] = k;
    }
    const still = Math.exp(-dt * 0.9);
    liveSmoke = 0;
    for (let i = 0; i < SMOKE; i++) {
      if (smokeAge[i] >= 1) continue;
      const t = (smokeBorn[i] += dt), k = t / smokeLife[i], x = i * 3;
      if (k >= 1) { smokeAge[i] = 1; continue; }
      liveSmoke++;
      smokeVel[x] *= still; smokeVel[x + 2] *= still;
      smokePos[x] += smokeVel[x] * dt; smokePos[x + 1] += smokeVel[x + 1] * dt; smokePos[x + 2] += smokeVel[x + 2] * dt;
      smokeSize[i] += 0.22 * dt; smokeAge[i] = k;
    }

    fire.visible = liveFire > 0 || shown > 0.01; embers.visible = liveEmbers > 0; smoke.visible = liveSmoke > 0;
    if (!fire.visible && !embers.visible && !smoke.visible) return;
    // half the height of what is being drawn into, in real pixels: one eye's view in a headset, the canvas otherwise
    const view = renderer.xr.isPresenting ? renderer.xr.getCamera().cameras[0]?.viewport : null;
    const viewHalf = (view ? view.w : renderer.getDrawingBufferSize(buffer).y) / 2;
    for (const [points, material] of [[fire, fireMaterial], [embers, emberMaterial], [smoke, smokeMaterial]] as const) {
      if (!points.visible) continue;
      material.uniforms.viewHalf.value = viewHalf; material.uniforms.time.value = clock;
      const a = points.geometry.attributes;
      a.position.needsUpdate = true; a.age.needsUpdate = true;
    }
    fireGeometry.attributes.metres.needsUpdate = true; fireGeometry.attributes.kind.needsUpdate = true;
    smokeGeometry.attributes.metres.needsUpdate = true;
    smokeMaterial.uniforms.blend.value = settings.blend;
  }

  return { update, ignite, flare, jet,
    diagnostics: () => ({ fire: liveFire, embers: liveEmbers, smoke: liveSmoke, alight: sites.length, light: Number(light.intensity.toFixed(2)) }),
    dispose: () => { for (const g of [fireGeometry, emberGeometry, smokeGeometry]) g.dispose(); for (const m of [fireMaterial, emberMaterial, smokeMaterial]) m.dispose(); group.removeFromParent(); } };
}
