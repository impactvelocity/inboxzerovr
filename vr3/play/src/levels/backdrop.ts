import * as THREE from 'three';
import type { BladeTracker } from '../blade';
import { settings } from '../garden';
import { levelLights, type LevelId } from './lights';

/**
 * A painted level, the way Kyoto is one (../garden.ts), made general: two matching 270 degree
 * panoramas (its start and end lighting) blended in one shader on a sphere that follows the head,
 * with the level's own depth, moving lights and weather written as a few lines of GLSL, and a
 * little real 3D in front (things in the air, the lights the held weapon is seen by).
 *
 * A level file (office.ts, castle.ts, lab.ts) supplies a StageDef; this builds it.
 */

export interface MoteDef {
  name: string; count: number;
  /** A box of air, metres: its size, and its middle measured from the seat (y from the floor). */
  box: [number, number, number]; centre: [number, number, number];
  /** Point size in pixels at one metre, colour and opacity at the level's start and end lighting. */
  size: number; colour: [string, string]; opacity: [number, number];
  /** m/s upwards (embers, bubbles) or downwards, how far each wanders sideways, how much it twinkles (0 to 1). */
  rise: number; sway: number; twinkle: number;
  additive: boolean;
}

/** Where the rounds have got to (letters.ts), for a level whose things show it. */
export interface RoundProgress { readonly phase: 'ready' | 'intro' | 'play' | 'summary'; readonly round: number; readonly total: number; readonly beat: number; readonly marks: readonly string[] }
/**
 * Real things standing in a painted level (the second office's monitor and what is on its desk):
 * built once into a group, moved every frame, and told what the game is doing.
 */
export interface StageProps {
  group: THREE.Object3D;
  /** `seat` is the eye where the player sat down: the painting's floor and furniture are measured from it. */
  update(dt: number, c: { time: number; blend: number; seat: THREE.Vector3; eye: THREE.Vector3; pixelRatio: number; blade?: BladeTracker }): void;
  /** Something happened to a letter (letters.ts' events), there. */
  onLetter?(kind: string, at: THREE.Vector3): void;
  /** Every frame while its level is shown: the rounds. */
  game?(progress: RoundProgress): void;
  dispose?(): void;
}
/** What a level's things are given to work with. */
export interface StageContext {
  renderer: THREE.WebGLRenderer;
  /** The painting's `lamp` (0 to 1): how much light the things are throwing on it just now. */
  lamp: { value: number };
  /** A place in the painting the things want it to answer at: x, y its u, v; z how strongly, 0 to 1 (the glsl's `spot`: Knockout's ropes, where something has just hit them). */
  spot: THREE.Vector3;
  /** One of the level's sounds, heard from `at` (nothing until main.ts has joined it up). */
  play(name: string, pitch?: number, volume?: number, at?: THREE.Vector3): void;
}

export interface StageDef {
  id: Exclude<LevelId, 'kyoto'>;
  name: string;
  /** The start and end paintings, under public/. */
  art: [string, string];
  /**
   * GLSL for what is particular to the painting. It must define
   *   float inverseDepthAt(vec3 d, vec2 uv)   one over the distance, 1/m, to what is painted in direction d
   *   vec3 scene(vec3 col, vec2 uv)           the painting's moving lights and weather
   * and may use: time, blend (0 start, 1 end), breeze, pulse (a moment's flash from the game, decaying),
   * hot (0 to 1, set by the game), and softNoise, oval, box, band, hash, flame. It may also define
   *   vec2 warp(vec2 uv)                      where to read the painting from instead of uv (liquid that moves, glass that wobbles)
   */
  glsl: string;
  /**
   * Real things standing in it (the second office's monitor). The glsl of a stage that has them may
   * also use `lamp` (0 to 1, the light they throw on the painting) and `depthScale` (the Depth setting).
   */
  props?(context: StageContext): StageProps;
  /** What fills the quarter turn behind the player, at start and end lighting. */
  rear: [string, string];
  motes: MoteDef[];
  /** Flat things adrift in the far air (the office's loose paper): how many, and their colours. */
  sheets?: { count: number; colour: [string, string] };
  /** How the level's fill light wavers (a flame, a failing tube), about 1. */
  flicker?(time: number, blend: number): number;
  /**
   * Metres the view is stepped back from where the painting was made: near things come out smaller
   * and further, far ones barely change. 0 is the painting as painted. A stage that steps back must
   * also define `float dollyDepthAt(vec3 d, vec2 uv)` in its glsl: a smooth version of its depth
   * (no sudden steps from near to far, which would fold the picture over and double its edges).
   */
  dolly?: number;
  /**
   * Real mist: so many soft sheets standing across the room one behind another, from `from` to `to`
   * metres ahead, each `width` by `height` metres with its foot on the floor. Colour and opacity at
   * the level's start and end lighting.
   */
  fog?: { cards: number; from: number; to: number; width: number; height: number; colour: [string, string]; opacity: [number, number] };
}

const helpers = /* glsl */ `
  float softNoise(vec2 p){ return .5+.22*sin(p.x+sin(p.y*1.3))+.16*sin(p.y*1.7+sin(p.x*.6))+.10*sin(p.x*2.3+p.y*.9); }
  float oval(vec2 uv, vec2 centre, vec2 radius){ vec2 p=(uv-centre)/radius; return exp(-dot(p,p)*2.); }
  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float band(float x, float from, float to){ return smoothstep(from-.004,from+.002,x)*(1.-smoothstep(to-.002,to+.004,x)); }
  // 1 inside the rectangle centre +- half, falling to 0 over 'soft' outside it
  float box(vec2 uv, vec2 centre, vec2 half_, float soft){ vec2 q=abs(uv-centre)-half_; return 1.-smoothstep(0.,soft,max(q.x,q.y)); }
  // A flame's brightness about 1: a slow breathing, a quick flutter, and now and then a gutter.
  float flame(float seed){
    float slow=sin(time*1.3+seed)*.5+sin(time*2.7+seed*1.7)*.3;
    float quick=sin(time*11.+seed*3.1)*sin(time*7.3+seed)*.5;
    float gutter=smoothstep(.72,1.,sin(time*.61+seed*5.)*sin(time*.37+seed*2.));
    return 1.+.10*slow+.08*quick-.24*gutter*(.6+.4*sin(time*23.+seed));
  }
`;

function createMotes(def: MoteDef) {
  const positions = new Float32Array(def.count * 3), seeds = new Float32Array(def.count);
  let seed = 4127 + def.count * 7 + Math.round(def.size * 13);
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < def.count; i++) { positions[i * 3] = random(); positions[i * 3 + 1] = random(); positions[i * 3 + 2] = random(); seeds[i] = random(); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: def.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { time: { value: 0 }, blend: { value: 0 }, pixelRatio: { value: 1 }, breeze: { value: 0.35 },
      size: { value: def.size }, rise: { value: def.rise }, sway: { value: def.sway }, twinkle: { value: def.twinkle },
      extent: { value: new THREE.Vector3(...def.box) }, middle: { value: new THREE.Vector3(...def.centre) },
      colourA: { value: new THREE.Color(def.colour[0]) }, colourB: { value: new THREE.Color(def.colour[1]) }, opacity: { value: new THREE.Vector2(...def.opacity) } },
    vertexShader: /* glsl */ `
      attribute float seed; uniform float time,blend,pixelRatio,breeze,size,rise,sway,twinkle; uniform vec3 extent,middle; uniform vec2 opacity; varying float fade;
      void main(){
        // each wanders round its own place in the box, and climbs (or sinks) through it for ever
        vec3 p=position;
        p.y=fract(p.y+time*rise*(.55+.9*seed)/extent.y);
        float ends=smoothstep(0.,.1,p.y)*(1.-smoothstep(.88,1.,p.y));
        p=(p-.5)*extent+middle;
        p.x+=sin(time*(.13+.2*seed)+seed*40.)*sway*(.6+breeze);
        p.z+=cos(time*(.11+.17*seed)+seed*23.)*sway*.7;
        p.y+=sin(time*(.21+.2*seed)+seed*61.)*sway*.25;
        vec4 mv=modelViewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(size*(.6+.8*seed)*pixelRatio/-mv.z,1.,size*pixelRatio);
        float glint=.5+.5*sin(time*(.7+2.3*seed)+seed*90.);
        fade=mix(opacity.x,opacity.y,blend)*ends*mix(1.,glint*glint*1.6,twinkle);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 colourA,colourB; uniform float blend; varying float fade;
      void main(){
        float r=length(gl_PointCoord-.5)*2.;
        float a=exp(-r*r*5.)*(1.-smoothstep(.7,1.,r))*.5+exp(-r*r*40.)*.5;
        gl_FragColor=vec4(mix(colourA,colourB,blend),a*fade);
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geometry, material); points.name = def.name; points.frustumCulled = false;
  return { points, material, geometry, count: def.count };
}

export async function createStage(def: StageDef, renderer: THREE.WebGLRenderer) {
  const loader = new THREE.TextureLoader(), base = import.meta.env.BASE_URL;
  const [startMap, endMap] = await Promise.all(def.art.map(path => loader.loadAsync(base + path)));
  for (const texture of [startMap, endMap]) { texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; }
  const group = new THREE.Group(); group.name = def.name;
  const uniforms = { startMap: { value: startMap }, endMap: { value: endMap }, blend: { value: 0 }, time: { value: 0 }, breeze: { value: 0.35 }, depthScale: { value: 0.6 },
    pulse: { value: 0 }, hot: { value: 0 }, lamp: { value: 0 }, spot: { value: new THREE.Vector3(0.5, 0.5, 0) }, dolly: { value: def.dolly ?? 0 }, headLean: { value: new THREE.Vector3() }, rearA: { value: new THREE.Color(def.rear[0]) }, rearB: { value: new THREE.Color(def.rear[1]) } };
  const panorama = new THREE.Mesh(new THREE.SphereGeometry(45, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms,
    vertexShader: /* glsl */ `
      varying vec3 direction; varying vec3 eyeShift;
      void main(){
        direction=position;
        // Where this eye is from the sphere's centre (which follows the head): only its sideways
        // part, which is what gives the painting stereo depth. See ../garden.ts.
        mat3 toWorld=transpose(mat3(viewMatrix));
        vec3 eye=-(toWorld*viewMatrix[3].xyz);
        vec3 right=toWorld[0];
        eyeShift=right*dot(right,eye-modelMatrix[3].xyz);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D startMap,endMap; uniform float blend,time,breeze,depthScale,pulse,hot,lamp,dolly; uniform vec3 headLean,rearA,rearB,spot; varying vec3 direction; varying vec3 eyeShift;
      ${helpers}
      // 270 degrees across, 90 up and down, the eye line 48% of the way up: the same wrap as Kyoto's, without its squeeze.
      vec2 panoUv(vec3 d){ return vec2(.5+atan(d.x,-d.z)/4.71238898,.48+asin(clamp(d.y,-1.,1.))/1.57079633); }
      ${def.glsl}
      vec3 paint(vec2 uv, vec2 gx, vec2 gy){ return mix(textureGrad(startMap,uv,gx,gy).rgb,textureGrad(endMap,uv,gx,gy).rgb,blend); }
      // What lies past the painting's edges: the edge itself, blurred right out, so floor and ceiling carry on.
      vec3 beyond(vec2 uv){ vec2 c=clamp(uv,vec2(.012),vec2(.988)); return mix(textureLod(startMap,c,6.).rgb,textureLod(endMap,c,6.).rgb,blend); }
      void main(){
        vec3 d=normalize(direction);
        vec2 painted=panoUv(d);
        // Depth: seen from a little to one side, what is near slides further than what is far.
        // Stepped back (dolly): from an eye that far behind where the painting was made, what is seen in
        // direction d is what the painting shows in direction d + back*(1/distance). Found in two goes,
        // since the distance is of the thing seen, not of the direction looked in. Not clamped: it is
        // a fixed move the level asks for, not a lean.
        vec3 view=d;
        ${def.dolly ? `{
          vec3 back=vec3(0.,0.,dolly);
          vec3 first=normalize(d+back*dollyDepthAt(d,painted));
          view=normalize(d+back*dollyDepthAt(first,panoUv(first)));
          painted=panoUv(view);
        }` : ''}
        float inv=inverseDepthAt(view,painted);
        ${def.dolly ? 'inv/=1.+dolly*inv;          // and from back there, everything is that much further for the eyes too' : ''}
        vec3 shift=(headLean+eyeShift*depthScale)*inv;
        shift*=min(1.,.075/max(length(shift),1e-5));
        vec2 uv=panoUv(normalize(view+shift));
        vec2 gx=dFdx(uv), gy=dFdy(uv);
        ${def.glsl.includes('vec2 warp(') ? 'vec2 drawn=warp(uv);       // (things in the painting that move: liquid, glass)' : 'vec2 drawn=uv;'}
        vec3 col=scene(paint(clamp(drawn,0.,1.),gx,gy),uv);
        float sides=smoothstep(-.02,.012,uv.x)*(1.-smoothstep(.988,1.02,uv.x));
        float upright=smoothstep(-.03,.012,uv.y)*(1.-smoothstep(.988,1.03,uv.y));
        float behind=smoothstep(0.,.16,max(-uv.x,uv.x-1.));
        float over=smoothstep(0.,.5,max(-uv.y,uv.y-1.));
        vec3 rest=mix(beyond(uv)*(1.-.35*over),mix(rearA,rearB,blend),behind);
        gl_FragColor=vec4(mix(rest,col,sides*upright),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  panorama.name = `${def.name}: panorama`; panorama.position.y = 1.2; panorama.renderOrder = -10; group.add(panorama);

  const lights = levelLights(def.id); group.add(lights.group);
  const motes = def.motes.map(createMotes);
  for (const layer of motes) group.add(layer.points);

  // Loose sheets adrift in the far air: a bent quad each, turning over slowly.
  const SHEETS = def.sheets?.count ?? 0;
  let sheets: THREE.InstancedMesh | null = null;
  const sheetMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide });
  const sheetSeeds: { x: number; y: number; z: number; spin: number }[] = [];
  if (def.sheets && SHEETS > 0) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-.105,-.148,0, .105,-.148,.012, 0,0,.03,  .105,-.148,.012, .105,.148,0, 0,0,.03,  .105,.148,0, -.105,.148,.012, 0,0,.03,  -.105,.148,.012, -.105,-.148,0, 0,0,.03], 3));
    sheets = new THREE.InstancedMesh(g, sheetMaterial, SHEETS); sheets.name = `${SHEETS} loose sheets`; sheets.instanceMatrix.setUsage(THREE.DynamicDrawUsage); sheets.frustumCulled = false; group.add(sheets);
    let seed = 77123; const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < SHEETS; i++) sheetSeeds.push({ x: random(), y: random(), z: random(), spin: random() * 6.283 });
  }
  const dummy = new THREE.Object3D(), sheetA = new THREE.Color(def.sheets?.colour[0] ?? '#fff'), sheetB = new THREE.Color(def.sheets?.colour[1] ?? '#fff');

  // Mist in sheets: one instanced draw. Each sheet drifts its own way; none comes right up to the face.
  const fogGroup = new THREE.Group(); fogGroup.name = `${def.name}: mist`; group.add(fogGroup);
  let fogMaterial: THREE.ShaderMaterial | null = null;
  if (def.fog) {
    const f = def.fog, geometry = new THREE.PlaneGeometry(f.width, f.height).translate(0, f.height / 2 - 0.25, 0);
    const seeds = new Float32Array(f.cards); for (let i = 0; i < f.cards; i++) seeds[i] = (i * 0.618034 + 0.13) % 1;
    geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 1));
    fogMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, blend: { value: 0 }, colourA: { value: new THREE.Color(f.colour[0]) }, colourB: { value: new THREE.Color(f.colour[1]) }, opacity: { value: new THREE.Vector2(...f.opacity) } },
      vertexShader: /* glsl */ `
        attribute float seed; varying vec2 vUv; varying float vSeed; varying float away;
        void main(){ vUv=uv; vSeed=seed; vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.); away=-mv.z; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: /* glsl */ `
        uniform float time,blend; uniform vec3 colourA,colourB; uniform vec2 opacity; varying vec2 vUv; varying float vSeed; varying float away;
        float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y); }
        float fbm(vec2 p){ return .5*noise(p)+.3*noise(p*2.1+3.7)+.2*noise(p*4.3+9.1); }
        void main(){
          float way=vSeed>.5?1.:-1.;
          vec2 p=vUv*vec2(4.2,1.5)+vec2(vSeed*17.+time*(.035+.05*vSeed)*way,vSeed*9.);
          float n=fbm(p)*fbm(p*1.9+vec2(-time*.04*way,time*.02)+4.);
          float edge=smoothstep(0.,.28,vUv.x)*smoothstep(1.,.72,vUv.x)*smoothstep(0.,.3,vUv.y)*smoothstep(1.,.4,vUv.y);
          float alpha=smoothstep(.10,.42,n)*edge*smoothstep(1.3,3.4,away)*mix(opacity.x,opacity.y,blend);
          gl_FragColor=vec4(mix(colourA,colourB,blend),alpha);
          #include <colorspace_fragment>
        }`,
    });
    const fog = new THREE.InstancedMesh(geometry, fogMaterial, f.cards); fog.name = `${f.cards} sheets of mist`; fog.frustumCulled = false; fog.renderOrder = -5;
    const place = new THREE.Object3D();
    for (let i = 0; i < f.cards; i++) {
      const along = f.cards > 1 ? i / (f.cards - 1) : 0;
      place.position.set(Math.sin(i * 2.4) * 0.9, 0, -(f.from + (f.to - f.from) * along)); place.rotation.set(0, Math.sin(i * 1.7) * 0.22, 0); place.scale.setScalar(1 + along * 0.5);
      place.updateMatrix(); fog.setMatrixAt(i, place.matrix);
    }
    fogGroup.add(fog);
  }
  // The level's real things, if it has any.
  const hear: { play: ((name: string, pitch?: number, volume?: number, at?: THREE.Vector3) => void) | null } = { play: null };
  const props = def.props?.({ renderer, lamp: uniforms.lamp, spot: uniforms.spot.value, play: (name, pitch, volume, at) => hear.play?.(name, pitch, volume, at) }) ?? null;
  if (props) group.add(props.group);
  const viewPosition = new THREE.Vector3(), seatedOrigin = new THREE.Vector3();
  let settleOriginFrames = 1, animationTime = 0, pulse = 0, hot = 0, hotWanted = 0;
  function recenterDepth() { settleOriginFrames = 12; }
  function update(dt: number, eye: THREE.Vector3, pixelRatio: number, blade?: BladeTracker) {
    if (settings.motion) animationTime += dt;
    pulse *= Math.exp(-dt * 3.2); hot += (hotWanted - hot) * Math.min(1, dt * 3);
    uniforms.time.value = animationTime; uniforms.blend.value = settings.blend; uniforms.breeze.value = settings.motion ? settings.wind : 0;
    uniforms.pulse.value = pulse; uniforms.hot.value = hot;
    panorama.position.copy(eye);
    if (settleOriginFrames > 0) { seatedOrigin.copy(eye); settleOriginFrames--; }
    uniforms.headLean.value.copy(eye).sub(seatedOrigin).clampLength(0, 0.18).multiplyScalar(settings.motion ? settings.depth : 0);
    uniforms.depthScale.value = settings.depth;
    lights.update(settings.blend, def.flicker ? def.flicker(animationTime, settings.blend) : 1);
    // the mist stands on the painted floor, 1.2 m under where the player sat down
    fogGroup.position.set(seatedOrigin.x, seatedOrigin.y - 1.2, seatedOrigin.z); fogGroup.visible = settings.quality !== 'low';
    if (fogMaterial) { fogMaterial.uniforms.time.value = animationTime; fogMaterial.uniforms.blend.value = settings.blend; }
    props?.update(dt, { time: animationTime, blend: settings.blend, seat: seatedOrigin, eye, pixelRatio, blade });
    const light = settings.quality === 'low';
    for (const layer of motes) {
      const u = layer.material.uniforms;
      u.time.value = animationTime; u.blend.value = settings.blend; u.pixelRatio.value = pixelRatio; u.breeze.value = settings.wind;
      layer.geometry.setDrawRange(0, light ? Math.ceil(layer.count * 0.4) : layer.count);
    }
    if (sheets) {
      const t = animationTime, wind = settings.wind;
      for (let i = 0; i < SHEETS; i++) {
        const s = sheetSeeds[i], wide = 26, tall = 3.4;
        const across = (s.x * wide + t * (0.05 + wind * 0.22) * (0.6 + s.z)) % wide, down = (s.y * tall + t * (0.02 + s.z * 0.03)) % tall;
        const edge = Math.min(1, across / (wide * 0.06), (wide - across) / (wide * 0.06), down / (tall * 0.1), (tall - down) / (tall * 0.1));
        dummy.position.set(across - wide / 2 + Math.sin(t * 0.4 + s.spin) * 0.3, 3.3 - down + Math.sin(t * 0.7 + s.spin * 2) * 0.12, -4.5 - s.z * 11);
        dummy.rotation.set(s.spin + t * 0.5 * (0.5 + s.x), s.spin * 1.7 + t * 0.33, Math.sin(t * 0.6 + s.spin) * 0.9);
        dummy.scale.setScalar(Math.max(0, edge) * 1.25); dummy.updateMatrix(); sheets.setMatrixAt(i, dummy.matrix);
      }
      sheets.count = light ? Math.ceil(SHEETS / 2) : SHEETS; sheets.instanceMatrix.needsUpdate = true;
      sheetMaterial.color.copy(sheetA).lerp(sheetB, settings.blend);
    }
  }
  return { group, update, viewPosition, recenterDepth,
    /** A moment's flash in the painting (mail leaving the screen, a frame waking, something melting). */
    pulse: (amount = 1) => { pulse = Math.max(pulse, amount); },
    /** A slower state the painting answers to: how much radioactive mail is about. */
    setHot: (level: number) => { hotWanted = level; },
    /** For the level's real things: what happened to a letter, where the rounds are, and how they make themselves heard. */
    onLetter: (kind: string, at: THREE.Vector3) => props?.onLetter?.(kind, at),
    setGame: (progress: RoundProgress) => props?.game?.(progress),
    hear, props };
}
export type Stage = Awaited<ReturnType<typeof createStage>>;
