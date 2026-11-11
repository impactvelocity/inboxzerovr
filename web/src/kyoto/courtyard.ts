import * as THREE from 'three';
import { globals, makeFireflies, makeHalo, makeKatanaPart, makePetals, makeSky, makeSurface, makeWater, type SurfaceKind } from './shaders';
import { clamp01, gammaToLinear, hex, inverseLerp, lerp, lookRotation, mix3, mixColor3, moveTowards, perlin, shaderColor, smoothstep01, unityEuler } from './unitymath';

/**
 * Kyoto v2 in the browser: the courtyard the Unity project exports
 * (unity: Assets/Editor/WebExport.cs -> public/kyoto), and a port of
 * KyotoCourtyard.cs, which owns everything that changes as the sun goes down:
 * the sun sinking behind the gate, the sky, the mist, the lamps, the wind.
 *
 * Everything here is in the Unity scene's space; `root` goes under a group
 * whose scale is (1, 1, -1).
 */

const BASE = `${import.meta.env.BASE_URL}kyoto/`;

interface GroupInfo {
  name: string; kind: SurfaceKind | 'water'; vertices: number; indices: number; min: number[]; max: number[];
  position: number; normal: number; uv: number; mul: number; add: number; lamp: number; objY: number; index: number;
  texture?: string; cutoff?: number; emissionMap?: string; emission?: number[]; glowDusk?: number[]; glowNight?: number[]; flicker?: number;
  windForce?: number; windScale?: number; windSpeed?: number; shake?: number; shakeSpeed?: number; shakeScale?: number;
  sssColor?: number[]; sssOffset?: number; sssFade?: number; sssAgainstSun?: number;
  layers?: { texture: string; tile: number; tint: number[] }[]; splat?: string;
  shallow?: number[]; deep?: number[]; normalMap?: string; normalStrength?: number; wavesSpeed?: number; depthFade?: number; coastFade?: number; foamDistance?: number;
}
interface HaloInfo { name: string; kind: 'halo' | 'shaft' | 'veil'; position: number[]; rotation: number[]; scale: number[]; core: number; dusk?: number[]; night?: number[]; flicker?: number; sunlit?: boolean }
interface PropInfo { name: string; vertices: number; indices: number; position: number; normal: number; uv: number; index: number }
interface Manifest {
  groups: GroupInfo[]; halos: HaloInfo[]; props: PropInfo[];
  startAt: number; endAt: number; fieldOfView: number; sunVeil: number[];
  petal: { texture: string; color: number[]; emission: number[] };
}

const loader = new THREE.TextureLoader();
function texture(name: string, options: { color?: boolean; repeat?: boolean; mipmaps?: boolean; anisotropy?: number } = {}): Promise<THREE.Texture> {
  return loader.loadAsync(`${BASE}tex/${name}.webp`).then((t) => {
    t.colorSpace = options.color === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = options.repeat === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    if (options.mipmaps === false) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
    t.anisotropy = options.anisotropy ?? 4;
    return t;
  });
}

function geometry(bin: ArrayBuffer, g: { vertices: number; indices: number; position: number; normal: number; uv: number; index: number; mul?: number; add?: number; lamp?: number; objY?: number }): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const n = g.vertices;
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, g.position, n * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(bin, g.normal, n * 4), 4, true));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bin, g.uv, n * 2), 2));
  if (g.mul !== undefined) geo.setAttribute('aMul', new THREE.BufferAttribute(new Uint8Array(bin, g.mul, n * 4), 4, true));
  if (g.add !== undefined) geo.setAttribute('aAdd', new THREE.BufferAttribute(new Uint8Array(bin, g.add, n * 4), 4, true));
  if (g.lamp !== undefined) geo.setAttribute('aLamp', new THREE.BufferAttribute(new Uint8Array(bin, g.lamp, n * 4), 4, true));
  if (g.objY !== undefined) geo.setAttribute('aObjY', new THREE.BufferAttribute(new Float32Array(bin, g.objY, n), 1));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(bin, g.index, g.indices), 1));
  return geo;
}

interface Glow { uniform: THREE.Color; dusk: THREE.Color; night: THREE.Color; flicker: number; seed: number }
interface HaloRow { info: HaloInfo; dusk: THREE.Color; night: THREE.Color; seed: number }

/** How wet or polished a surface is (after the Unity materials' smoothness): how much sky it mirrors. */
const SHEEN: Record<string, number> = { 'Stone Wet': 0.78, Tile: 0.5, Deck: 0.3, Stone: 0.2, Wood: 0.2, Plaster: 0.06, SmallStones: 0.35, Metal: 0.5 };

const C = (rgb: number[]) => new THREE.Color(rgb[0], rgb[1], rgb[2]);

/** Where the sun stands at the start: a little right of straight ahead, low over the gate (degrees). */
const SUN_AZIMUTH = 8, SUN_HEIGHT = 15;
/** Pitch and yaw of its light, and the moon's. */
const SUN_LIGHT = { x: 22, y: 180 + SUN_AZIMUTH };
const MOON_LIGHT = unityEuler(34, 152, 0);
/** Where the sun is in the Meadow panorama. */
const PANORAMA_SUN = new THREE.Vector3(0, 0, 1).applyQuaternion(unityEuler(-36.56, -68.55, 0));
const FORWARD = new THREE.Vector3(0, 0, 1);
/** Panes and paper windows burn this much of what Unity gives them: its bloom takes the rest, and ours is gentler. */
const GLOW = 1;
/**
 * Unity gives a paper window an emission far over white (about 15 in red) and its ACES curve
 * brings that back to a deep orange. The curve here turns anything that bright to white, so the
 * colour is brought into range first, keeping the orange Unity ends up showing.
 */
function hot(c: THREE.Color): THREE.Color {
  const top = Math.max(c.r, c.g, c.b);
  if (top <= 0.95) return c;
  c.multiplyScalar((0.95 + 0.06 * Math.log2(top / 0.95)) / top);
  c.g = Math.max(c.g, 0.23 * c.r);
  c.b = Math.max(c.b, 0.05 * c.r);
  return c;
}
/** The same for the light round the sun. */
const GLARE = 1;

export interface CourtyardStats { groups: number; triangles: number; vertices: number; textures: number }

export class Courtyard {
  readonly root = new THREE.Group();
  readonly stats: CourtyardStats = { groups: 0, triangles: 0, vertices: 0, textures: 0 };
  startAt = 0.28;
  endAt = 0.5;
  fieldOfView = 56;
  /** How far the evening has gone, 0 (the sun up) to 1 (night). */
  night = 0;
  /** The same, eased: Unity's _KyotoNight. */
  eased = 0;

  private clock = 0;
  private gust = 0;
  /** The wind as the trees feel it, for the ambience: its slow rise and fall (0..1) and its strength (0.85 still air). */
  windSwell = 0;
  windForce = 0.85;
  /** The scene's own time, in seconds. */
  get time(): number { return this.clock; }
  private sky!: THREE.Mesh;
  private skyMaterial!: THREE.ShaderMaterial;
  private glows: Glow[] = [];
  private halos: HaloRow[] = [];
  private haloMesh!: THREE.InstancedMesh;
  private haloColor!: THREE.InstancedBufferAttribute;
  private veilIndex = -1;
  private veilColour = new THREE.Color();
  private petals!: Petals;
  private fireflies!: Fireflies;
  private dayOnly: THREE.Object3D[] = [];

  // what the game holds
  katana = new THREE.Group();
  letter = new THREE.BufferGeometry();

  static async load(onProgress?: (done: number, total: number) => void): Promise<Courtyard> {
    const yard = new Courtyard();
    const [manifest, bin, props] = await Promise.all([
      fetch(`${BASE}courtyard.json`).then((r) => r.json() as Promise<Manifest>),
      fetch(`${BASE}courtyard.bin`).then((r) => r.arrayBuffer()),
      fetch(`${BASE}props.bin`).then((r) => r.arrayBuffer()),
    ]);
    yard.startAt = manifest.startAt; yard.endAt = manifest.endAt; yard.fieldOfView = manifest.fieldOfView;

    // every picture the scene needs, once each
    const wanted = new Map<string, { color?: boolean; repeat?: boolean; mipmaps?: boolean; anisotropy?: number }>();
    for (const g of manifest.groups) {
      if (g.texture) wanted.set(g.texture, { anisotropy: g.texture === 'Architecture' ? 8 : 4 });
      if (g.emissionMap) wanted.set(g.emissionMap, {});
      if (g.splat) wanted.set(g.splat, { color: false, repeat: false });
      if (g.normalMap) wanted.set(g.normalMap, { color: false });
      for (const layer of g.layers ?? []) wanted.set(layer.texture, { anisotropy: 8 });
    }
    wanted.set('Sky', { mipmaps: false, anisotropy: 1 });
    wanted.set(manifest.petal.texture, { repeat: false });
    wanted.set('Brush', { color: false });
    let done = 0;
    const loaded = new Map<string, THREE.Texture>();
    await Promise.all([...wanted].map(([name, options]) => texture(name, options).then((t) => { loaded.set(name, t); onProgress?.(++done, wanted.size); })));
    yard.stats.textures = loaded.size;
    const tex = (name?: string) => (name ? loaded.get(name) ?? null : null);

    // ---- the meshes, one draw each
    for (const g of manifest.groups) {
      const geo = geometry(bin, g);
      geo.boundingBox = new THREE.Box3(new THREE.Vector3(...g.min), new THREE.Vector3(...g.max));
      geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
      let material: THREE.ShaderMaterial;
      if (g.kind === 'water') {
        material = makeWater({
          normalMap: tex(g.normalMap)!, shallow: C(g.shallow!), deep: C(g.deep!),
          normalStrength: g.normalStrength!, wavesSpeed: g.wavesSpeed!, depthFade: g.depthFade!, coastFade: g.coastFade!, foamDistance: g.foamDistance!,
        });
      } else {
        const leafy = g.kind === 'leaf';
        material = makeSurface({
          kind: g.kind,
          map: tex(g.texture),
          cutoff: g.cutoff,
          emissionMap: tex(g.emissionMap),
          glow: !g.emissionMap && !!g.glowDusk,
          wind: g.windForce !== undefined ? { force: g.windForce, scale: g.windScale ?? 1, speed: g.windSpeed ?? 1 } : undefined,
          shake: leafy && g.shake ? { amount: g.shake, speed: g.shakeSpeed ?? 1, scale: g.shakeScale ?? 1 } : undefined,
          sss: leafy && g.sssColor ? { color: C(g.sssColor), offset: g.sssOffset ?? 0, fade: g.sssFade ?? 0, against: g.sssAgainstSun ?? 1 } : undefined,
          sheen: SHEEN[g.name] ?? (g.kind === 'lit' ? 0.3 : undefined),
          tint: g.kind === 'mountain' ? new THREE.Color(0.5, 0.48, 0.5) : g.kind === 'rock' ? new THREE.Color(1.6, 1.6, 1.6) : undefined,
          addGain: g.kind === 'rock' ? 1.8 : 1,
          terrain: g.kind === 'terrain' ? { splat: tex(g.splat)!, layers: g.layers!.map((l) => ({ map: tex(l.texture)!, tile: l.tile, tint: C(l.tint) })) } : undefined,
        });
        if (g.glowDusk) {
          // a window brighter than white is all glow; a dim one is still paper with lamplight on it
          if (!g.emissionMap && Math.max(...g.glowDusk) > 1) material.uniforms.uLit.value = 0.05;
          yard.glows.push({ uniform: material.uniforms.uGlow.value as THREE.Color, dusk: C(g.glowDusk), night: C(g.glowNight!), flicker: g.flicker ?? 0, seed: yard.glows.length + 31 });
        }
      }
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = g.name;
      mesh.matrixAutoUpdate = false;
      // moving leaves leave their boxes; the big things are always in view anyway
      mesh.frustumCulled = !(g.kind === 'leaf' || g.kind === 'trunk' || g.kind === 'terrain');
      if (g.kind === 'water') mesh.renderOrder = 5;
      yard.root.add(mesh);
      yard.stats.groups++; yard.stats.triangles += g.indices / 3; yard.stats.vertices += g.vertices;
    }

    // ---- the sky
    yard.skyMaterial = makeSky(tex('Sky')!);
    yard.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), yard.skyMaterial);
    yard.sky.name = 'Sky';
    yard.sky.frustumCulled = false;
    yard.sky.renderOrder = -10;
    yard.sky.scale.setScalar(350);
    yard.root.add(yard.sky);

    // ---- light in the air: every halo, shaft and the sun's veil in one draw
    {
      const quad = new THREE.BufferGeometry();
      quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]), 3));
      quad.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
      quad.setIndex([0, 2, 1, 2, 3, 1]);
      const count = manifest.halos.length;
      const mesh = new THREE.InstancedMesh(quad, makeHalo(), count);
      const core = new Float32Array(count);
      yard.haloColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
      yard.haloColor.setUsage(THREE.DynamicDrawUsage);
      const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      manifest.halos.forEach((info, i) => {
        m.compose(p.fromArray(info.position), q.fromArray(info.rotation), s.fromArray(info.scale));
        mesh.setMatrixAt(i, m);
        core[i] = info.core;
        if (info.kind === 'veil') yard.veilIndex = i;
        yard.halos.push({ info, dusk: C(info.dusk ?? [0, 0, 0]), night: C(info.night ?? [0, 0, 0]), seed: i });
      });
      quad.setAttribute('aCore', new THREE.InstancedBufferAttribute(core, 1));
      quad.setAttribute('aColor', yard.haloColor);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = 20;            // after the pond, before the game's own see-through things
      mesh.name = 'Halos';
      yard.haloMesh = mesh;
      yard.veilColour.fromArray(manifest.sunVeil);
      yard.root.add(mesh);
    }

    yard.petals = new Petals(tex(manifest.petal.texture)!, C(manifest.petal.color), shaderColor(C(manifest.petal.emission)));
    yard.root.add(yard.petals.mesh);
    yard.fireflies = new Fireflies();
    yard.root.add(yard.fireflies.mesh);

    // ---- the katana and the letter
    const brush = tex('Brush')!;
    const paint = (blade: boolean, colour: number, gain = 1) => makeKatanaPart(blade, hex(colour).multiplyScalar(gain), brush, 0.66 / 0.86);
    const steel = paint(true, 0xffffff), bevel = paint(true, 0xffffff);
    shaderColor((bevel.uniforms.uColor.value as THREE.Color).setRGB(1.16, 1.15, 1.18));
    const iron = paint(false, 0x4a3a30), brass = paint(false, 0xb08a50), wrap = paint(false, 0x2e2b3c), cream = paint(false, 0xe6d6aa), red = paint(false, 0xb03a2c);
    for (const part of manifest.props) {
      const geo = geometry(props, part);
      if (part.name === 'Letter') { yard.letter = geo; geo.computeBoundingBox(); geo.computeBoundingSphere(); continue; }
      const [name, slot] = part.name.split('#');
      const material = name.includes('Blade') ? (slot === '0' ? steel : bevel)
        : name.includes('Collar') ? brass : name.includes('Diamonds') ? cream : name.includes('Accent') ? red : name.includes('Grip') ? wrap : iron;
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = part.name;
      yard.katana.add(mesh);
    }
    yard.katana.name = 'Katana';

    yard.apply(yard.startAt);
    return yard;
  }

  /** `fade` runs 0..1 over the round: the part of the evening a round plays (KyotoCourtyard.Step). */
  step(dt: number, fade: number, eye: THREE.Vector3): void {
    this.stepAt(dt, lerp(this.startAt, this.endAt, fade), eye);
  }

  /** As step, but at a point on the whole evening (0 the sun up, 1 full night). */
  stepAt(dt: number, at: number, eye: THREE.Vector3): void {
    this.clock += dt;
    this.gust = moveTowards(this.gust, 0, dt * 0.7);
    globals.uTime.value = this.clock;
    globals.uEye.value.copy(eye);
    this.sky.position.copy(eye);
    this.sky.updateMatrix();
    this.apply(at);
    this.petals.step(dt, this.gust);
    this.fireflies.step(dt, lerp(5, 9, this.eased), this.eased);
  }

  /** A cut stirs the tree: a gust through the leaves and a few petals shaken loose. */
  stir(strength: number, count = 0): void {
    this.gust = Math.max(this.gust, clamp01(strength) * 0.5);
    if (count > 0) this.petals.burst(Math.min(Math.max(count, 1), 12));
  }

  private readonly tmp = {
    sunDir: new THREE.Vector3(), light: new THREE.Quaternion(), turn: new THREE.Quaternion(), a: new THREE.Quaternion(), b: new THREE.Quaternion(),
    m4: new THREE.Matrix4(), c: new THREE.Color(), c2: new THREE.Color(), c3: new THREE.Color(), v: new THREE.Vector3(), m: new THREE.Matrix4(), s: new THREE.Vector3(),
  };

  private flicker(seed: number, amount: number): number {
    if (amount <= 0) return 1;
    const a = perlin(this.clock * 5.3, seed * 7.31) - 0.5;
    const b = perlin(this.clock * 13.7, seed * 3.17 + 40) - 0.5;
    return 1 + amount * (a * 1.5 + b * 0.7);
  }

  apply(value: number): void {
    const T = this.tmp;
    this.night = clamp01(value);
    const t = smoothstep01(this.night);
    this.eased = t;
    const dark = inverseLerp(0.45, 1, t);

    // ---- the sun, then the moon: one lamp, handed over while it is at its dimmest
    const sink = clamp01(t * 2);
    const sunHeight = lerp(SUN_HEIGHT, -9, sink);
    const sunUp = smoothstep01(inverseLerp(-5, 7, sunHeight));
    const lastLight = (1 - sink * sink) * lerp(0.35, 1, sunUp);
    const moonLight = t < 0.5 ? 0 : Math.sqrt(t * 2 - 1);
    const sunDirection = T.sunDir.copy(FORWARD).applyQuaternion(unityEuler(-sunHeight, SUN_AZIMUTH, 0, T.a));
    if (t < 0.5) {
      globals.uSunColor.value.copy(hex(0xffc890, T.c)).lerp(hex(0xff7a58, T.c2), sink).multiplyScalar(2.5 * lastLight);
      unityEuler(lerp(SUN_LIGHT.x, 5, sink), SUN_LIGHT.y, 0, T.light);
    } else {
      globals.uSunColor.value.copy(hex(0x8fa2ff, T.c)).multiplyScalar(1.05 * moonLight);
      T.light.copy(MOON_LIGHT);
    }
    globals.uSunDir.value.copy(FORWARD).applyQuaternion(T.light).negate();

    // ---- the sky: the panorama turned so its sun is ours
    const sky = this.skyMaterial.uniforms;
    lookRotation(sunDirection, undefined, T.a);
    lookRotation(PANORAMA_SUN, undefined, T.b).invert();
    T.turn.copy(T.a).multiply(T.b).invert();
    (sky.uTurn.value as THREE.Matrix3).setFromMatrix4(T.m4.makeRotationFromQuaternion(T.turn));
    (sky.uSkySun.value as THREE.Vector3).copy(sunDirection);
    sky.uSkyExposure.value = lerp(0.92, 0.75, sink) * 1.2;
    shaderColor((sky.uTint.value as THREE.Color).setRGB(1, lerp(0.86, 0.66, sink), lerp(0.98, 0.78, sink)));
    shaderColor((sky.uGlare.value as THREE.Color).setRGB(lerp(1.2, 1.4, sink), lerp(0.7, 0.4, sink), lerp(0.56, 0.4, sink)).multiplyScalar(sunUp)).multiplyScalar(GLARE);
    sky.uFade.value = smoothstep01(inverseLerp(0.3, 0.85, t));
    sky.uStars.value = dark;
    globals.uSunGlow.value.copy(sky.uGlare.value as THREE.Color);

    // ---- the air. The shade is lavender, not black: the sky still fills it.
    mixColor3(hex(0x7d78d2, T.c), hex(0x4a4cae, T.c2), hex(0x34369a, T.c3), t, globals.uAmbSky.value);
    mixColor3(hex(0xa870a6, T.c), hex(0x62458e, T.c2), hex(0x46307e, T.c3), t, globals.uAmbEquator.value);
    mixColor3(hex(0x3e3060, T.c), hex(0x24204a, T.c2), hex(0x161434, T.c3), t, globals.uAmbGround.value);
    mixColor3(hex(0xf2a8b4, T.c), hex(0x8468b8, T.c2), hex(0x35287a, T.c3), t, globals.uFogColor.value);
    globals.uFogDensity.value = mix3(0.0085, 0.011, 0.013, t);
    // what still water mirrors
    globals.uSkyLow.value.copy(globals.uFogColor.value).multiplyScalar(lerp(1.0, 0.6, t));
    globals.uSkyHigh.value.copy(globals.uAmbSky.value).multiplyScalar(lerp(1.5, 0.9, t));

    // ---- lamps and everything that glows. The lamps' light is baked as it stands at dusk;
    // by night they burn about a third brighter.
    globals.uLampGain.value = lerp(1, 1.37, t) * this.flicker(3, 0.07);
    globals.uSssGain.value = lerp(0.85, 0.5, t);
    globals.uGrade.value.w = t;
    // the Unity volumes: exposure +0.45 stops at dusk to +1.05 at night, saturation +16 to +30
    globals.uGrade.value.x = 1.3 * Math.pow(2, 0.6 * t);
    globals.uGrade.value.y = lerp(1.1, 1.22, t);
    for (const glow of this.glows) hot(shaderColor(glow.uniform.copy(glow.dusk).lerp(glow.night, t).multiplyScalar(this.flicker(glow.seed, glow.flicker)))).multiplyScalar(GLOW);
    for (let i = 0; i < this.halos.length; i++) {
      const row = this.halos[i];
      if (i === this.veilIndex) {
        // the glare itself: a wide sheet of light kept in front of the sun
        const eye = globals.uEye.value;
        T.v.copy(sunDirection).multiplyScalar(4.6).add(eye);
        lookRotation(T.s.copy(T.v).sub(eye), undefined, T.a);
        T.m.compose(T.v, T.a, T.s.set(8, 8, 1));
        this.haloMesh.setMatrixAt(i, T.m);
        T.c.copy(this.veilColour).multiplyScalar((1 - sink) * sunUp);
      } else if (row.info.sunlit) {
        // a shaft of light comes and goes slowly, as the leaves it passes through move
        T.c.copy(row.dusk).multiplyScalar(lastLight).add(T.c2.copy(row.night).multiplyScalar(moonLight)).multiplyScalar(0.7 + 0.6 * perlin(this.clock * 0.28, i * 9.1));
      } else {
        T.c.copy(row.dusk).lerp(row.night, t).multiplyScalar(this.flicker(row.seed + 31, row.info.flicker ?? 0));
      }
      this.haloColor.setXYZ(i, gammaToLinear(T.c.r), gammaToLinear(T.c.g), gammaToLinear(T.c.b));
    }
    this.haloColor.needsUpdate = true;
    this.haloMesh.instanceMatrix.needsUpdate = true;
    for (const creature of this.dayOnly) creature.visible = t < 0.42;

    // ---- the wind: a slow swell and lull with a quicker breath on top, and the gust a cut sends
    const swell = perlin(this.clock * 0.09, 3.7), breath = perlin(this.clock * 0.31, 8.2);
    const wind = 0.85 + 1.5 * swell * swell + 0.45 * breath + this.gust * 1.6;
    this.windSwell = swell; this.windForce = wind;
    globals.uTreeWind.value.set(wind, 1.3, 1.7, 0.22 + 0.3 * perlin(this.clock * 0.06, 1.3));
    globals.uGrassWind.value.set(0.2 + 0.3 * swell + 0.1 * breath + this.gust * 0.6, 0.8);
    this.petals.wind = wind;
    this.fireflies.setColour(shaderColor(T.c.setRGB(2.0, 1.5, 1.0).lerp(T.c2.setRGB(1.7, 2.0, 0.55), t)));
  }
}

// ----------------------------------------------------------------- petals

const DUMMY = new THREE.Object3D();

interface Petal { alive: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; age: number; size: number; spin: number; phase: number; drift: boolean; ax: number; ay: number; az: number }

/**
 * Petals off the tree: two falls under the canopy and a thinner drift carried
 * on the wind right across the garden (the builder's three particle systems,
 * as one instanced draw).
 */
class Petals {
  readonly mesh: THREE.InstancedMesh;
  wind = 1;
  private readonly pool: Petal[] = [];
  private readonly owed = [0, 0, 0];
  private static readonly MAX = 260;
  private static readonly FALLS = [new THREE.Vector3(-3.6, 5.6, 8.2), new THREE.Vector3(-1.2, 5.0, 6.0)];

  constructor(map: THREE.Texture, color: THREE.Color, emission: THREE.Color) {
    // one petal of the two in the picture, about its own middle
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0.04, 0.34, 0.66, 0.34, 0.04, 0.98, 0.66, 0.98]), 2));
    geo.setIndex([0, 2, 1, 2, 3, 1]);
    this.mesh = new THREE.InstancedMesh(geo, makePetals(map, color, emission), Petals.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'Petals';
    this.mesh.count = 0;
    for (let i = 0; i < Petals.MAX; i++) this.pool.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, age: 0, size: 0.03, spin: 1, phase: 0, drift: false, ax: 0, ay: 0, az: 0 });
    // the garden is never empty of them
    for (let i = 0; i < 60; i++) this.step(0.25, 0);
  }

  private spawn(kind: number): void {
    const p = this.pool.find((q) => !q.alive);
    if (!p) return;
    const r = Math.random;
    p.alive = true; p.age = 0; p.phase = r() * 100; p.spin = (r() < 0.5 ? -1 : 1) * (1.2 + r() * 2.4);
    p.ax = r() * 6.28; p.ay = r() * 6.28; p.az = r() * 6.28;
    if (kind < 2) {
      // shaken out of the canopy, somewhere within a few metres of the fall's middle
      const c = Petals.FALLS[kind], a = r() * 6.28, d = Math.sqrt(r()) * 3.4;
      p.x = c.x + Math.cos(a) * d; p.y = c.y + (r() - 0.5) * 1.6; p.z = c.z + Math.sin(a) * d * 0.8;
      p.vx = 0.1 + r() * 0.25; p.vy = -(0.32 + r() * 0.3); p.vz = -(r() * 0.12);
      p.life = 9 + r() * 5; p.size = 0.024 + r() * 0.016; p.drift = false;
    } else {
      p.x = -4.6 + (r() - 0.5) * 3; p.y = 3.0 + (r() - 0.5) * 3.4; p.z = 7.6 + (r() - 0.5) * 11;
      p.vx = 0.45 + r() * 0.55; p.vy = -0.16 + r() * 0.18; p.vz = -0.4 + r() * 0.35;
      p.life = 11 + r() * 5; p.size = 0.032 + r() * 0.022; p.drift = true;
    }
  }

  /** A few shaken loose at once, by a cut. */
  burst(count: number): void {
    for (let i = 0; i < count; i++) this.spawn(i % 2);
  }

  step(dt: number, gust: number): void {
    const rates = [7, 7, 4.5];
    for (let k = 0; k < 3; k++) {
      this.owed[k] += rates[k] * dt * (k < 2 ? 0.75 : 1);
      while (this.owed[k] >= 1) { this.owed[k]--; this.spawn(k); }
    }
    const push = 0.35 * (this.wind - 0.85) + gust * 1.2;
    let shown = 0;
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.age += dt;
      const ground = p.drift ? -0.3 : 0.02;
      if (p.age > p.life || p.y < ground - 0.4) { p.alive = false; continue; }
      const landed = !p.drift && p.y <= 0.06;
      if (!landed) {
        // a slow tumble: side to side as it falls, carried by the wind
        const sway = Math.sin(p.age * 1.7 + p.phase), sway2 = Math.cos(p.age * 1.1 + p.phase * 1.3);
        p.x += (p.vx + push * 0.55 + sway * 0.22) * dt;
        p.y += (p.vy + sway2 * 0.1) * dt;
        p.z += (p.vz - push * 0.2 + sway2 * 0.18) * dt;
        p.ax += p.spin * dt; p.ay += p.spin * 0.7 * dt; p.az += p.spin * 0.45 * dt;
      }
      // in and out softly
      const fadeIn = Math.min(p.age / 0.6, 1), fadeOut = Math.min((p.life - p.age) / 1.2, 1);
      DUMMY.position.set(p.x, landed ? 0.05 : p.y, p.z);
      DUMMY.rotation.set(landed ? -Math.PI / 2 : p.ax, p.ay, landed ? 0 : p.az);
      DUMMY.scale.setScalar(p.size * fadeIn * fadeOut);
      DUMMY.updateMatrix();
      this.mesh.setMatrixAt(shown++, DUMMY.matrix);
    }
    this.mesh.count = shown;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// -------------------------------------------------------------- fireflies

interface Fly { alive: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; age: number; size: number; seed: number }

/** Motes of gold in the last sun, then fireflies: a few at dusk and more with the dark. */
class Fireflies {
  readonly mesh: THREE.Mesh;
  private readonly pool: Fly[] = [];
  private readonly spark: THREE.InstancedBufferAttribute;
  private readonly bright: THREE.InstancedBufferAttribute;
  private readonly geo: THREE.InstancedBufferGeometry;
  private owed = 0;
  private static readonly MAX = 80;
  // KyotoCourtyardBuilder's blink: alpha keys over a life
  private static readonly BLINK = [[0, 0], [0.12, 1], [0.38, 0.15], [0.55, 1], [0.78, 0.2], [0.9, 0.9], [1, 0]];

  constructor() {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]), 3));
    geo.setIndex([0, 1, 2, 2, 1, 3]);
    this.spark = new THREE.InstancedBufferAttribute(new Float32Array(Fireflies.MAX * 4), 4);
    this.bright = new THREE.InstancedBufferAttribute(new Float32Array(Fireflies.MAX), 1);
    this.spark.setUsage(THREE.DynamicDrawUsage); this.bright.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aSpark', this.spark); geo.setAttribute('aBright', this.bright);
    geo.instanceCount = 0;
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, makeFireflies());
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 21;
    this.mesh.name = 'Fireflies';
    for (let i = 0; i < Fireflies.MAX; i++) this.pool.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, age: 0, size: 0.05, seed: i });
    for (let i = 0; i < 40; i++) this.step(0.2, 5, 0);
  }

  setColour(c: THREE.Color): void {
    ((this.mesh.material as THREE.ShaderMaterial).uniforms.uColor.value as THREE.Color).copy(c);
  }

  step(dt: number, rate: number, night: number): void {
    const r = Math.random;
    this.owed += rate * dt;
    while (this.owed >= 1) {
      this.owed--;
      const f = this.pool.find((q) => !q.alive);
      if (!f) break;
      f.alive = true; f.age = 0; f.life = 5 + r() * 4; f.size = 0.04 + r() * 0.035;
      // out in the garden, never up against the seat
      f.x = -1.3 + (r() - 0.5) * 9; f.y = 0.8 + (r() - 0.5) * 1.1; f.z = 8.6 + (r() - 0.5) * 8;
      const speed = 0.03 + r() * 0.09, a = r() * 6.28, b = (r() - 0.5) * 2;
      f.vx = Math.cos(a) * speed; f.vy = b * speed * 0.6; f.vz = Math.sin(a) * speed;
    }
    let shown = 0;
    const t = performance.now() / 1000;
    for (const f of this.pool) {
      if (!f.alive) continue;
      f.age += dt;
      if (f.age > f.life) { f.alive = false; continue; }
      // wandering: a slow turbulence laid over its own heading
      f.x += (f.vx + 0.12 * (perlin(t * 0.35 + f.seed, f.seed * 1.7) - 0.5)) * dt;
      f.y += (f.vy + 0.10 * (perlin(t * 0.35 + f.seed * 2.3, 11) - 0.5)) * dt;
      f.z += (f.vz + 0.12 * (perlin(7, t * 0.35 + f.seed * 3.1) - 0.5)) * dt;
      const u = f.age / f.life;
      const keys = Fireflies.BLINK;
      let alpha = 0;
      for (let k = 1; k < keys.length; k++) {
        if (u <= keys[k][0]) { alpha = lerp(keys[k - 1][1], keys[k][1], (u - keys[k - 1][0]) / (keys[k][0] - keys[k - 1][0])); break; }
      }
      this.spark.setXYZW(shown, f.x, f.y, f.z, f.size * 1.25);
      this.bright.setX(shown, alpha * 0.55);
      shown++;
    }
    this.geo.instanceCount = shown;
    this.spark.needsUpdate = true; this.bright.needsUpdate = true;
  }
}
