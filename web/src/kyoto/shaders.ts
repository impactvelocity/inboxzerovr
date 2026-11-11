import * as THREE from 'three';

/**
 * The courtyard's materials. Almost everything the Unity scene works out per
 * pixel (which lamps reach a surface, how much sky and sun it sees, the packs'
 * colour gradients) was worked out once per vertex by the exporter
 * (unity: Assets/Editor/WebExport.cs), so a pixel here costs one texture
 * read, a multiply and the mist. That is what lets it run in a headset's
 * browser.
 *
 * Positions, normals and every direction in these shaders are in the Unity
 * scene's own space (the meshes sit under a group whose scale is (1, 1, -1)).
 */

/** Values every courtyard material shares: one object, updated once a frame. */
export const globals = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 0.3, 1) },          // toward the light
  uSunColor: { value: new THREE.Color(1, 1, 1) },            // colour times strength
  uAmbSky: { value: new THREE.Color() },
  uAmbEquator: { value: new THREE.Color() },
  uAmbGround: { value: new THREE.Color() },
  uFogColor: { value: new THREE.Color() },
  uFogDensity: { value: 0.0085 },
  uLampGain: { value: 1 },
  uAoFloor: { value: 0.68 },
  uSssGain: { value: 1 },
  uEye: { value: new THREE.Vector3(0, 1.55, 0) },            // the viewer, in scene space
  uWindDir: { value: new THREE.Vector3(0.8, 0, -0.3) },
  uTreeWind: { value: new THREE.Vector4(1, 1.3, 1.7, 0.3) }, // force, speed, waves scale, flow density
  uGrassWind: { value: new THREE.Vector2(0.3, 0.8) },        // force, speed
  uDirect: { value: 1 },                                     // 1: drawn straight to the screen or headset (grade here); 0: into the bloom chain
  uGrade: { value: new THREE.Vector4(1.3, 1.1, 0.12, 0) },  // exposure, saturation, contrast, night
  uSkyLow: { value: new THREE.Color() },                     // what still water mirrors: the sky near the horizon...
  uSkyHigh: { value: new THREE.Color() },                    // ...and overhead
  uSunGlow: { value: new THREE.Color() },
  uDebug: { value: 0 },                                      // 1: the baked sun, 2: the baked sky, 3: the baked lamps, 4: no picture
};

const GLOBALS_GLSL = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbSky;
uniform vec3 uAmbEquator;
uniform vec3 uAmbGround;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uLampGain;
uniform float uAoFloor;
uniform float uSssGain;
uniform vec3 uEye;
uniform vec3 uWindDir;
uniform vec4 uTreeWind;
uniform vec2 uGrassWind;
uniform float uDirect;
uniform vec4 uGrade;
uniform vec3 uSkyLow;
uniform vec3 uSkyHigh;
uniform vec3 uSunGlow;
uniform float uDebug;
`;

/** The grade: exposure, a filmic curve (ACES, as the Unity volume uses), then colour. */
export const GRADE_GLSL = /* glsl */ `
vec3 kyotoAces(vec3 x) {
  // Stephen Hill's fit of the ACES reference transforms
  const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  x = inM * x;
  vec3 a = x * (x + 0.0245786) - 0.000090537;
  vec3 b = x * (0.983729 * x + 0.4329510) + 0.238081;
  return clamp(outM * (a / b), 0.0, 1.0);
}
vec3 kyotoGrade(vec3 c) {
  c = kyotoAces(max(c, 0.0) * uGrade.x);
  float night = uGrade.w;
  // shadows lean violet, more so as night comes on
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c *= mix(mix(vec3(0.98, 0.93, 1.03), vec3(0.9, 0.9, 1.08), night), vec3(1.0), smoothstep(0.0, 0.4, l));
  c = mix(vec3(l), c, uGrade.y);
  // a little more contrast about the middle, without crushing what is already dark
  c = mix(c, c * c * (3.0 - 2.0 * c), uGrade.z);
  return clamp(c, 0.0, 1.0);
}
`;

const FINISH_GLSL = /* glsl */ `
  if (uDirect > 0.5) gl_FragColor.rgb = kyotoGrade(gl_FragColor.rgb);
  #include <colorspace_fragment>
`;

const NOISE_GLSL = /* glsl */ `
// Unity Shader Graph's Gradient Noise and Simple Noise nodes
vec2 gnDir(vec2 p) {
  p = mod(p, 289.0);
  float x = mod((34.0 * p.x + 1.0) * p.x, 289.0) + p.y;
  x = mod((34.0 * x + 1.0) * x, 289.0);
  x = fract(x / 41.0) * 2.0 - 1.0;
  return normalize(vec2(x - floor(x + 0.5), abs(x) - 0.5));
}
float gradientNoise(vec2 uv, float scale) {
  vec2 p = uv * scale;
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float d00 = dot(gnDir(ip), fp);
  float d01 = dot(gnDir(ip + vec2(0.0, 1.0)), fp - vec2(0.0, 1.0));
  float d10 = dot(gnDir(ip + vec2(1.0, 0.0)), fp - vec2(1.0, 0.0));
  float d11 = dot(gnDir(ip + vec2(1.0, 1.0)), fp - vec2(1.0, 1.0));
  fp = fp * fp * fp * (fp * (fp * 6.0 - 15.0) + 10.0);
  return mix(mix(d00, d01, fp.y), mix(d10, d11, fp.y), fp.x) + 0.5;
}
float snRandom(vec2 uv) { return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453); }
float snValue(vec2 uv) {
  vec2 i = floor(uv);
  vec2 f = fract(uv);
  f = f * f * (3.0 - 2.0 * f);
  float r0 = snRandom(i), r1 = snRandom(i + vec2(1.0, 0.0)), r2 = snRandom(i + vec2(0.0, 1.0)), r3 = snRandom(i + vec2(1.0, 1.0));
  return mix(mix(r0, r1, f.x), mix(r2, r3, f.x), f.y);
}
float simpleNoise(vec2 uv, float scale) {
  return snValue(uv * scale) * 0.125 + snValue(uv * scale * 0.5) * 0.25 + snValue(uv * scale * 0.25) * 0.5;
}
`;

export type SurfaceKind = 'lit' | 'leaf' | 'trunk' | 'grass' | 'flower' | 'rock' | 'mountain' | 'terrain';

export interface SurfaceOptions {
  kind: SurfaceKind;
  map?: THREE.Texture | null;
  cutoff?: number;
  emissionMap?: THREE.Texture | null;
  /** Flat light of its own, added whatever the lamps do (paper windows). */
  glow?: boolean;
  wind?: { force: number; scale: number; speed: number };
  shake?: { amount: number; speed: number; scale: number };
  sss?: { color: THREE.Color; offset: number; fade: number; against: number };
  terrain?: { splat: THREE.Texture; layers: { map: THREE.Texture; tile: number; tint: THREE.Color }[] };
  doubleSide?: boolean;
  /** 0..1: how much of the sky it mirrors at a glancing angle. */
  sheen?: number;
  tint?: THREE.Color;
  addGain?: number;
}

const SURFACE_VERTEX = /* glsl */ `
${GLOBALS_GLSL}
${NOISE_GLSL}
attribute vec4 aMul;     // rgb: what the picture is multiplied by (square it); a: how much sky this corner sees
attribute vec4 aAdd;     // rgb: flat colour laid over the picture (square it); a: how much sun it sees
attribute vec4 aLamp;    // rgb: the lamps' light here at dusk (square, times 16); a: how far light wraps round (leaves)
attribute float aObjY;   // height in the model's own space, which the packs' wind bends by
uniform vec3 uWindMat;   // this material's multipliers: force, noise scale, noise speed
uniform vec3 uShake;     // amount, speed, noise scale
uniform vec3 uSss;
uniform vec3 uSssParams; // offset, fade, against the sun
uniform vec3 uTint;
uniform float uAddGain;
uniform float uSheen;    // smoothness, as the Unity material has it: how much of the sky it mirrors at a glancing angle
varying vec2 vUv;
varying vec3 vMul;
varying vec3 vAdd;
varying vec3 vLight;
varying float vFog;
#ifdef SSS
varying vec3 vSss;
#endif
#ifdef TERRAIN
varying vec2 vGround;
#endif
#ifdef SHEEN
varying vec3 vSheen;
#endif

void main() {
  vec3 p = position;
  #ifdef WIND_TREE
  {
    // Raygeas Global_Tree_Wind: a pattern of gusts sliding along the wind bends whatever it passes over,
    // further the higher up the tree.
    float force = uTreeWind.x * uWindMat.x;
    float h = aObjY * force / 100.0;
    float a = (h + 1.0) * (h + 1.0);
    float bend = pow(max(a * a - a, 0.0), 1.3);
    vec2 at = p.xz + (1.0 - uTime) * uTreeWind.y * uWindMat.z * uWindDir.xz;
    float n = gradientNoise(at, uTreeWind.z * 0.1 * uWindMat.y);
    float gust = clamp(mix(n, 1.0 - n, uTreeWind.w + 0.5), 0.0, 1.0);
    vec3 move = uWindDir * (bend * gust);
    #ifdef SHAKE
    float n1 = simpleNoise(p.xz + uWindDir.xz * ((1.0 - uTime) * uShake.y), uShake.z);
    float n2 = simpleNoise(p.yx + uWindDir.yx * ((1.0 - uTime) * uShake.y), uShake.z);
    move *= mix(1.0, n1 * n2 + 0.8, uShake.x);
    #endif
    p += move;
  }
  #endif
  #ifdef WIND_GRASS
  {
    float force = uGrassWind.x * uWindMat.x;
    vec2 at = p.xz + (1.0 - uTime) * (uGrassWind.y * force) * uWindDir.xz;
    float lean = sin((simpleNoise(at, 2.0) - 0.15) * force * 0.6);
    p.xz -= uWindDir.xz * (aObjY * lean);
  }
  #endif

  vec3 n = normalize(normal);
  float wrap = aLamp.a;
  // Unity fills every shadow with the sky's light and only darkens where things meet; keep that
  float sky = mix(uAoFloor, 1.0, sqrt(aMul.a));
  // ...but a canopy is dark inside (Unity's contact shadows do that to leaves)
  sky = mix(sky, mix(0.16, 1.0, aMul.a * aMul.a), wrap);
  vec3 ambient = mix(uAmbEquator, n.y >= 0.0 ? uAmbSky : uAmbGround, abs(n.y));
  ambient = mix(ambient, mix(uAmbEquator, uAmbSky, 0.6), wrap * 0.5);
  float facing = dot(n, uSunDir);
  float sun = mix(max(facing, 0.0), facing * 0.5 + 0.5, wrap * 0.35) * aAdd.a;
  vec3 lamp = aLamp.rgb * aLamp.rgb * 16.0;
  // (a lamp under a tree reaches fewer of its leaves than a wrap-round light would say)
  vLight = ambient * sky + uSunColor * sun + lamp * (uLampGain * mix(1.0, 0.45, wrap));
  if (uDebug > 0.5) vLight = uDebug < 1.5 ? vec3(aAdd.a) : uDebug < 2.5 ? vec3(aMul.a) : uDebug < 3.5 ? lamp : vLight;

  #ifdef SSS
  {
    // Raygeas Tree_Foliage: leaves glow with the light behind them
    vec3 view = normalize(uEye - p);
    float s = clamp(dot(uSunDir, n) * uSssParams.y + uSssParams.x, 0.0, 1.0);
    float against = clamp(dot(view, -uSunDir) - 0.3, 0.0, 1.0);
    vSss = uSss * (mix(s, s * uSssParams.z, against) * uSssGain * mix(0.3, 1.0, aAdd.a) * mix(0.35, 1.0, aMul.a));
  }
  #endif

  #ifdef SHEEN
  {
    // wet stone, tiles and worn boards: the sky's colour, mirrored at a glancing angle
    vec3 view = normalize(uEye - p);
    vec3 r = reflect(-view, n);
    // only what looks up and out into the garden mirrors the sky; a wall facing the seat mirrors the dark veranda
    vec3 mirrored = mix(uSkyLow, uSkyHigh, clamp(r.y * 1.5, 0.0, 1.0)) * (smoothstep(-0.05, 0.22, r.y) * mix(0.2, 1.0, smoothstep(-0.3, 0.3, r.z)));
    mirrored += uSunGlow * pow(max(dot(r, uSunDir), 0.0), 14.0) * 0.5;
    // how much, as URP's lit shader has it for a surface this smooth. (Unity mirrors its picture of the
    // garden even under the roof, and the deck's look comes from that more than from any light on it.)
    float rough = (1.0 - uSheen) * (1.0 - uSheen);
    float glance = pow(1.0 - max(dot(n, view), 0.0), 4.0);
    float amount = mix(0.04, clamp(uSheen + 0.04, 0.0, 1.0), glance) / (rough * rough + 1.0);
    vSheen = mirrored * (amount * mix(0.5, 1.0, sqrt(aMul.a))) + lamp * (uLampGain * uSheen * 0.1);
    // ...and the low sun glancing off it toward the seat (URP's direct specular), which is most of
    // what lights the deck and the wet stones while the sun is up
    float r2 = max(rough * rough, 0.05);
    vec3 halfway = normalize(uSunDir + view);
    float nh = clamp(dot(n, halfway), 0.0, 1.0), lh = clamp(dot(uSunDir, halfway), 0.0, 1.0);
    float d = nh * nh * (r2 - 1.0) + 1.00001;
    float glint = min(r2 / (d * d * max(0.1, lh * lh) * (sqrt(r2) * 4.0 + 2.0)), 12.0);
    vSheen += uSunColor * (max(facing, 0.0) * aAdd.a * glint * 0.04);
  }
  #endif
  vMul = aMul.rgb * aMul.rgb * uTint;
  vAdd = aAdd.rgb * aAdd.rgb * uAddGain;
  vUv = uv;
  #ifdef TERRAIN
  vGround = p.xz;
  #endif
  float d = uFogDensity * length(p - uEye);
  vFog = 1.0 - exp(-d * d);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
}
`;

const SURFACE_FRAGMENT = /* glsl */ `
${GLOBALS_GLSL}
${GRADE_GLSL}
uniform sampler2D map;
uniform float uCutoff;
uniform sampler2D emissionMap;
uniform vec3 uGlow;
uniform float uLit;
#ifdef TERRAIN
uniform sampler2D uSplat;
uniform sampler2D uLayer0;
uniform sampler2D uLayer1;
uniform sampler2D uLayer2;
uniform vec3 uTint0;
uniform vec3 uTint1;
uniform vec3 uTint2;
uniform vec3 uTile;
varying vec2 vGround;
#endif
varying vec2 vUv;
varying vec3 vMul;
varying vec3 vAdd;
varying vec3 vLight;
varying float vFog;
#ifdef SSS
varying vec3 vSss;
#endif
#ifdef SHEEN
varying vec3 vSheen;
#endif

void main() {
  float alpha = 1.0;
  #ifdef TERRAIN
  vec3 where = texture2D(uSplat, vUv).rgb;
  vec3 albedo = texture2D(uLayer0, vGround / uTile.x).rgb * uTint0 * where.r
              + texture2D(uLayer1, vGround / uTile.y).rgb * uTint1 * where.g
              + texture2D(uLayer2, vGround / uTile.z).rgb * uTint2 * where.b;
  #else
    #ifdef USE_PICTURE
    vec4 t = texture2D(map, vUv);
    #else
    vec4 t = vec4(1.0);
    #endif
    #ifdef CUTOUT
    // the cut-out's edge, a pixel wide, handed to multisampling
    alpha = (t.a - uCutoff) / max(fwidth(t.a), 0.0001) + 0.5;
    if (alpha <= 0.0) discard;
    alpha = min(alpha, 1.0);
    #endif
  vec3 albedo = t.rgb * vMul + vAdd;
  #endif
  if (uDebug > 0.5) albedo = vec3(0.5);
  vec3 c = albedo * vLight;
  #ifdef SSS
  c += albedo * vSss;
  #endif
  #ifdef SHEEN
  c += vSheen;
  #endif
  #ifdef EMISSION_MAP
  c += texture2D(emissionMap, vUv).rgb * uGlow;
  #endif
  #ifdef GLOW
  // lit paper: its own light is nearly all of it
  c = c * uLit + uGlow;
  #endif
  c = mix(c, uFogColor, vFog);
  gl_FragColor = vec4(c, alpha);
  ${FINISH_GLSL}
}
`;

export function makeSurface(o: SurfaceOptions): THREE.ShaderMaterial {
  const defines: Record<string, string> = {};
  const cut = o.cutoff !== undefined;
  if (o.map) defines.USE_PICTURE = '';
  if (cut) defines.CUTOUT = '';
  if (o.kind === 'leaf' || o.kind === 'trunk') defines.WIND_TREE = '';
  if (o.shake) defines.SHAKE = '';
  if (o.kind === 'grass' || o.kind === 'flower') defines.WIND_GRASS = '';
  if (o.sss) defines.SSS = '';
  if (o.emissionMap) defines.EMISSION_MAP = '';
  if (o.glow) defines.GLOW = '';
  if (o.terrain) defines.TERRAIN = '';
  if (o.sheen) defines.SHEEN = '';
  const uniforms: Record<string, THREE.IUniform> = {
    ...globals,
    map: { value: o.map ?? null },
    uCutoff: { value: o.cutoff ?? 0.5 },
    emissionMap: { value: o.emissionMap ?? null },
    uGlow: { value: new THREE.Color(0, 0, 0) },
    uLit: { value: 1 },
    uWindMat: { value: new THREE.Vector3(o.wind?.force ?? 1, o.wind?.scale ?? 1, o.wind?.speed ?? 1) },
    uShake: { value: new THREE.Vector3(o.shake?.amount ?? 0, o.shake?.speed ?? 1, o.shake?.scale ?? 1) },
    uSss: { value: o.sss?.color ?? new THREE.Color(0, 0, 0) },
    uSssParams: { value: new THREE.Vector3(o.sss?.offset ?? 0, o.sss?.fade ?? 0, o.sss?.against ?? 1) },
    uTint: { value: o.tint ?? new THREE.Color(1, 1, 1) },
    uAddGain: { value: o.addGain ?? 1 },
    uSheen: { value: o.sheen ?? 0 },
  };
  if (o.terrain) {
    const [a, b, c] = o.terrain.layers;
    Object.assign(uniforms, {
      uSplat: { value: o.terrain.splat },
      uLayer0: { value: a.map }, uLayer1: { value: b.map }, uLayer2: { value: c.map },
      uTint0: { value: a.tint }, uTint1: { value: b.tint }, uTint2: { value: c.tint },
      uTile: { value: new THREE.Vector3(a.tile, b.tile, c.tile) },
    });
  }
  const material = new THREE.ShaderMaterial({
    uniforms, defines,
    vertexShader: SURFACE_VERTEX,
    fragmentShader: SURFACE_FRAGMENT,
    side: cut || o.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    fog: false, toneMapped: false,
  });
  material.alphaToCoverage = cut;
  return material;
}

// ------------------------------------------------------------------- sky

/**
 * KyotoDuskSky.shader: the Meadow pack's sunset panorama, turned so its sun
 * stands over the gate and sinks, fading into a night made of the same clouds.
 * The panorama is stored as c / (1 + c), so eight bits hold its bright sun.
 */
export function makeSky(panorama: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...globals,
      uSky: { value: panorama },
      uTurn: { value: new THREE.Matrix3() },
      uSkySun: { value: new THREE.Vector3(0, 0.25, 1) },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uGlare: { value: new THREE.Color(1, 0.6, 0.45) },
      // (0.13, 0.13, 0.475) and (1, 0.16, 0.36) as Unity hands them to the shader
      uNightTint: { value: new THREE.Color(0.0152, 0.0152, 0.1912) },
      uAfterglow: { value: new THREE.Color(1, 0.0222, 0.1070) },
      uSkyExposure: { value: 1 },
      uFade: { value: 0 },
      uStars: { value: 0 },
      uSkyCeiling: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 at = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        gl_Position = at.xyww;      // as far away as anything can be
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLOBALS_GLSL}
      ${GRADE_GLSL}
      uniform sampler2D uSky;
      uniform mat3 uTurn;
      uniform vec3 uSkySun;
      uniform vec3 uTint;
      uniform vec3 uGlare;
      uniform vec3 uNightTint;
      uniform vec3 uAfterglow;
      uniform float uSkyExposure;
      uniform float uFade;
      uniform float uStars;
      uniform float uSkyCeiling;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        vec3 p = normalize(uTurn * d);
        vec2 uv = vec2(atan(p.x, p.z) / 6.2831853 + 0.5, asin(clamp(p.y, -1.0, 1.0)) / 3.14159265 + 0.5);
        vec3 soft = textureLod(uSky, uv, 0.0).rgb;
        // Unity imports the panorama clamped to 1, and the look was tuned on that: the glare is added below
        vec3 sky = min(soft / max(1.0 - soft, 0.02), vec3(uSkyCeiling));
        vec3 sun = normalize(uSkySun);
        float facing = clamp(dot(d, sun), 0.0, 1.0);
        // day: the panorama, and the air round the sun full of light
        vec3 day = sky * uSkyExposure * uTint;
        day += uGlare * (pow(facing, 9.0) * 0.16 + pow(facing, 48.0) * 0.5 + pow(facing, 400.0) * 2.0);
        // night: the same clouds, dimmed and blue, with the last red where the sun went
        float grey = dot(soft, vec3(0.2126, 0.7152, 0.0722));
        vec3 night = mix(vec3(grey), soft, 0.4) * uNightTint;
        float toward = clamp(dot(normalize(d.xz + 1e-5), normalize(sun.xz + 1e-5)) * 0.5 + 0.5, 0.0, 1.0);
        night += uAfterglow * pow(toward, 3.0) * exp(-max(d.y, 0.0) * 11.0);
        vec3 cell = d * 170.0;
        float rnd = hash(floor(cell));
        float spark = clamp(1.0 - length(fract(cell) - 0.5) * 2.8, 0.0, 1.0);
        float twinkle = 0.6 + 0.4 * sin(uTime * (1.2 + rnd * 3.0) + rnd * 90.0);
        night += step(0.9955, rnd) * spark * spark * twinkle * uStars * smoothstep(0.03, 0.3, d.y) * (1.0 - clamp(grey * 3.0, 0.0, 1.0)) * vec3(2.2, 2.1, 2.8);
        gl_FragColor = vec4(mix(day, night, uFade), 1.0);
        ${FINISH_GLSL}
      }
    `,
    side: THREE.DoubleSide, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
  });
}

// ------------------------------------------------------- light in the air

/**
 * KyotoHalo.shader, for every halo, shaft and the sun's veil at once: soft
 * round light that only ever adds. One instanced draw.
 */
export function makeHalo(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...globals },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aCore;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vCore;
      void main() {
        vUv = uv * 2.0 - 1.0;
        vColor = aColor;
        vCore = aCore;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLOBALS_GLSL}
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vCore;
      void main() {
        float r2 = dot(vUv, vUv);
        float edge = clamp(1.0 - r2, 0.0, 1.0);
        float falloff = exp(-r2 * vCore) * edge + edge * edge * 0.12;
        vec3 c = vColor * falloff;
        // Added in linear light when bloom follows; straight onto the finished picture otherwise.
        if (uDirect > 0.5) c *= uGrade.x * 1.15;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true,
    side: THREE.DoubleSide, fog: false, toneMapped: false,
  });
}

/** Fireflies and motes: the same soft light, turned to the eye, one draw for all of them. */
export function makeFireflies(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...globals, uColor: { value: new THREE.Color(2, 1.5, 1) } },
    vertexShader: /* glsl */ `
      attribute vec4 aSpark;      // xyz: where, w: size
      attribute float aBright;
      varying vec2 vUv;
      varying float vBright;
      void main() {
        vUv = position.xy * 2.0;
        vBright = aBright;
        vec4 at = viewMatrix * modelMatrix * vec4(aSpark.xyz, 1.0);
        at.xy += position.xy * aSpark.w;
        gl_Position = projectionMatrix * at;
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLOBALS_GLSL}
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vBright;
      void main() {
        float r2 = dot(vUv, vUv);
        float edge = clamp(1.0 - r2, 0.0, 1.0);
        float falloff = exp(-r2 * 9.0) * edge + edge * edge * 0.12;
        vec3 c = uColor * (vBright * falloff);
        if (uDirect > 0.5) c *= uGrade.x;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide, fog: false, toneMapped: false,
  });
}

/** Petals: one small cut-out leaf, drawn many times, lit by the sky and the last sun. */
export function makePetals(map: THREE.Texture, color: THREE.Color, emission: THREE.Color): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: { ...globals, map: { value: map }, uColor: { value: color }, uEmission: { value: emission } },
    vertexShader: /* glsl */ `
      ${GLOBALS_GLSL}
      varying vec2 vUv;
      varying float vFog;
      varying vec3 vLight;
      void main() {
        vUv = uv;
        vec4 at = instanceMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(instanceMatrix) * vec3(0.0, 0.0, 1.0));
        float facing = abs(dot(n, uSunDir));
        vLight = mix(uAmbEquator, uAmbSky, 0.5 + 0.5 * abs(n.y)) + uSunColor * (0.25 + 0.5 * facing);
        float d = uFogDensity * length(at.xyz - uEye);
        vFog = 1.0 - exp(-d * d);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * at;
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLOBALS_GLSL}
      ${GRADE_GLSL}
      uniform sampler2D map;
      uniform vec3 uColor;
      uniform vec3 uEmission;
      varying vec2 vUv;
      varying float vFog;
      varying vec3 vLight;
      void main() {
        vec4 t = texture2D(map, vUv);
        float alpha = (t.a - 0.4) / max(fwidth(t.a), 0.0001) + 0.5;
        if (alpha <= 0.0) discard;
        vec3 c = t.rgb * uColor * vLight + t.rgb * uEmission;
        c = mix(c, uFogColor, vFog);
        gl_FragColor = vec4(c, min(alpha, 1.0));
        ${FINISH_GLSL}
      }
    `,
    side: THREE.DoubleSide, fog: false, toneMapped: false,
  });
  material.alphaToCoverage = true;
  return material;
}

// ------------------------------------------------------------------ pond

export interface WaterOptions {
  normalMap: THREE.Texture;
  shallow: THREE.Color; deep: THREE.Color;
  normalStrength: number; wavesSpeed: number; depthFade: number; coastFade: number; foamDistance: number;
}

/**
 * The pond. Raygeas' water reads the camera's depth picture for its colour
 * and its shoreline; here each corner of the sheet knows how deep the water
 * under it is (aObjY), and what it mirrors is the sky's colours.
 */
export function makeWater(o: WaterOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...globals,
      uNormalMap: { value: o.normalMap },
      uShallow: { value: o.shallow }, uDeep: { value: o.deep },
      uWater: { value: new THREE.Vector4(o.normalStrength, o.wavesSpeed, o.depthFade, o.coastFade) },
      uFoam: { value: o.foamDistance },
    },
    vertexShader: /* glsl */ `
      ${GLOBALS_GLSL}
      attribute vec4 aMul;
      attribute vec4 aLamp;
      attribute float aObjY;
      varying vec3 vAt;
      varying float vDepth;
      varying vec3 vLight;
      varying vec3 vLamp;
      varying float vFog;
      void main() {
        vAt = position;
        vDepth = aObjY;
        vLamp = aLamp.rgb * aLamp.rgb * 16.0 * uLampGain;
        vLight = uAmbSky * mix(uAoFloor, 1.0, aMul.a) + vLamp;
        float d = uFogDensity * length(position - uEye);
        vFog = 1.0 - exp(-d * d);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLOBALS_GLSL}
      ${GRADE_GLSL}
      uniform sampler2D uNormalMap;
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec4 uWater;
      uniform float uFoam;
      varying vec3 vAt;
      varying float vDepth;
      varying vec3 vLight;
      varying vec3 vLamp;
      varying float vFog;
      void main() {
        vec2 uv = vAt.xz * 0.55;
        float t = uTime * uWater.y;
        vec2 a = texture2D(uNormalMap, uv + t * vec2(0.031, 0.017)).xy * 2.0 - 1.0;
        vec2 b = texture2D(uNormalMap, uv * 1.7 - t * vec2(0.019, 0.034)).xy * 2.0 - 1.0;
        vec3 n = normalize(vec3((a.x + b.x) * uWater.x, 1.0, (a.y + b.y) * uWater.x));
        vec3 view = normalize(uEye - vAt);
        float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(n, view), 0.0), 5.0);
        vec3 r = reflect(-view, n);
        vec3 mirrored = mix(uSkyLow, uSkyHigh, clamp(r.y * 1.6, 0.0, 1.0));
        mirrored += uSunGlow * pow(max(dot(r, uSunDir), 0.0), 24.0) * 0.6;
        mirrored += vLamp * 0.5;
        float deep = clamp(vDepth / uWater.z, 0.0, 1.0);
        vec3 body = mix(uShallow, uDeep, deep) * vLight * 1.3;
        vec3 c = mix(body, mirrored, clamp(fresnel * 0.55, 0.0, 1.0));
        float shore = 1.0 - smoothstep(0.0, uFoam, vDepth + (a.x + b.y) * 0.02);
        c += vLight * shore * 0.22;
        c = mix(c, uFogColor, vFog);
        float alpha = smoothstep(-0.01, uWater.w, vDepth) * mix(0.82, 1.0, fresnel);
        gl_FragColor = vec4(c, alpha);
        ${FINISH_GLSL}
      }
    `,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
  });
}

// ---------------------------------------------------------------- katana

/**
 * KyotoBlade.shader and KyotoGrip.shader: the katana painted rather than lit,
 * in flat brushed tones with its light painted in toward the eye. It reads
 * nothing from the scene; it only goes violet with the night.
 */
export function makeKatanaPart(blade: boolean, color: THREE.Color, brush: THREE.Texture, modelScale: number): THREE.ShaderMaterial {
  const srgb = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
  return new THREE.ShaderMaterial({
    uniforms: {
      ...globals,
      uColor: { value: color },
      uLow: { value: srgb(0.50, 0.48, 0.62) }, uHigh: { value: srgb(0.76, 0.74, 0.88) }, uTip: { value: srgb(0.62, 0.58, 0.74) },
      uWarm: { value: blade ? srgb(1, 0.9, 0.82) : srgb(1, 0.9, 0.8) },
      uBrushTex: { value: brush },
      uBrush: { value: blade ? 0.16 : 0.14 },
      uModelScale: { value: modelScale },
    },
    defines: blade ? { BLADE: '' } : {},
    vertexShader: /* glsl */ `
      uniform float uModelScale;
      varying vec3 vSeen;
      varying vec3 vView;
      varying vec3 vLocal;
      void main() {
        vec4 at = modelViewMatrix * vec4(position, 1.0);
        vSeen = normalize(normalMatrix * normal);
        vView = at.xyz;
        vLocal = position / uModelScale;
        gl_Position = projectionMatrix * at;
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLOBALS_GLSL}
      ${GRADE_GLSL}
      uniform vec3 uColor;
      uniform vec3 uLow;
      uniform vec3 uHigh;
      uniform vec3 uTip;
      uniform vec3 uWarm;
      uniform sampler2D uBrushTex;
      uniform float uBrush;
      varying vec3 vSeen;
      varying vec3 vView;
      varying vec3 vLocal;
      void main() {
        vec3 view = normalize(vView);
        vec3 seen = normalize(vSeen);
        if (dot(seen, view) > 0.0) seen = -seen;
        float night = uGrade.w;
        float lit = clamp(dot(seen, normalize(vec3(-0.35, 0.6, 0.72))), 0.0, 1.0);
        #ifdef BLADE
        float along = clamp((vLocal.y - 0.15) / 0.72, 0.0, 1.0);
        vec3 c = mix(uLow, uHigh, smoothstep(0.0, 0.55, along));
        c = mix(c, uTip, smoothstep(0.7, 1.0, along));
        c *= 0.8 + 0.3 * lit;
        c = mix(c, c * uWarm, lit * 0.6);
        c *= mix(vec3(1.0), vec3(0.72, 0.6, 0.98), night);
        vec2 at = vec2((vLocal.x + vLocal.z) * 9.0, vLocal.y * 0.9);
        vec3 paint = texture2D(uBrushTex, vec2(at.x * 0.8 - at.y * 0.6, at.x * 0.6 + at.y * 0.8) * 0.83).rgb;
        vec3 fine = texture2D(uBrushTex, at.yx * 2.7 + 0.37).rgb;
        c *= 1.0 + ((paint.r - 0.5) * 0.7 + (fine.r - 0.5) * 0.3) * uBrush * 1.6;
        c *= 1.0 + (fine.b - 0.5) * uBrush * 0.3;
        float sheen = pow(clamp(dot(seen, normalize(vec3(-0.2, 0.75, 0.63))), 0.0, 1.0), 6.0);
        c += sheen * 0.07 * uWarm;
        c += pow(1.0 - clamp(dot(-view, seen), 0.0, 1.0), 3.0) * mix(vec3(0.1, 0.07, 0.06), vec3(0.12, 0.05, 0.14), night);
        c *= uColor;
        #else
        vec3 c = uColor * (0.62 + 0.55 * lit);
        c = mix(c, c * uWarm, lit * 0.6);
        c *= mix(vec3(1.0), vec3(0.74, 0.62, 0.98), night);
        vec2 at = vec2((vLocal.x + vLocal.z) * 9.0, vLocal.y * 4.0);
        vec3 paint = texture2D(uBrushTex, vec2(at.x * 0.8 - at.y * 0.6, at.x * 0.6 + at.y * 0.8) * 0.83).rgb;
        c *= 1.0 + (paint.r - 0.5) * uBrush * 1.6;
        c += pow(1.0 - clamp(dot(-view, seen), 0.0, 1.0), 3.0) * uColor * 0.35;
        #endif
        // It is drawn with the game's own things, after any bloom, so it always carries the grade itself.
        gl_FragColor = vec4(kyotoGrade(c), 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.DoubleSide, fog: false, toneMapped: false,
  });
}
