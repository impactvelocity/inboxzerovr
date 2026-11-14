import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { levelLights } from './levels/lights';
import { Emails, type Email } from './mail/emails';

/**
 * One level at a glance, for the site's front page (vr3/app, "the levels"): on a see-through
 * canvas, the level's own weapon on the right, one of its emails floating in the middle, a Quest
 * hand on the left, and the level's air (petals, embers, bubbles, stars). The site lays this over
 * the level's painting in an iframe: /play/showcase.html?level=castle.
 *
 * Everything shown is the game's own: the weapon is built by the same file that builds it for the
 * hand, and the email is painted by the level's own card painter.
 *
 * The page it sits in tells it where the pointer is (a message: { type: 'vr3-show', x, y, hover },
 * x and y from -1 to 1). Hovering is a taste of the level: the weapon comes alive and hits the
 * email (a swing, a punch, or a jet from a nozzle), the email takes it, the air picks up. Opened
 * by itself it follows its own pointer. `?hover=1` holds it hovered, for a look.
 */
type Mesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
interface Held {
  model: THREE.Object3D;
  hit?: { base: THREE.Vector3; tip: THREE.Vector3 };
  aim?: { origin: THREE.Vector3; direction: THREE.Vector3 };
  desktop?: { punch?: boolean };
  onLive?(level: number, clock: number): void;
  onUpdate?(dt: number, clock: number, speed: number, night: number): void;
  onArmed?(ready: boolean): void;
  onImpact?(strength: number): void;
}
type Paint = (canvas: HTMLCanvasElement, email: Email) => void | Promise<void>;
interface Air { colours: string[]; count: number; size: [number, number]; drift: [number, number]; sway: number; glow: boolean; twinkle: number }
interface Show {
  lights: 'kyoto' | Parameters<typeof levelLights>[0];
  weapon(renderer: THREE.WebGLRenderer): Promise<Held>;
  /** How long it is drawn, as a share of the picture's height. */
  long: number;
  card(): Promise<Paint>;
  email: (e: Email) => boolean;
  /** The colour of a hit: the streak across the email and the flash. */
  hot: string;
  air: Air;
  /** What comes out of a nozzle, first colour hottest. */
  jet?: string[];
}

const base = import.meta.env.BASE_URL;
const from = (category: Email['category'], kind?: Email['kind']) => (e: Email) => e.category === category && (!kind || e.kind === kind);
const painted = (load: () => Promise<(g: CanvasRenderingContext2D, email: Email | null, hazard: boolean) => void>, hazard = false) => async (): Promise<Paint> => {
  const paint = await load();
  return (canvas, email) => paint(canvas.getContext('2d')!, email, hazard);
};

const SHOWS: Record<string, Show> = {
  kyoto: { lights: 'kyoto', weapon: katana, long: 0.7, card: async () => inkCard, email: from('Personal'), hot: '#ffc3dd',
    air: { colours: ['#ffc4d8', '#ff9fc0', '#fff0f5'], count: 46, size: [7, 15], drift: [-0.16, -0.22], sway: 0.12, glow: false, twinkle: 0 } },
  office: { lights: 'office', weapon: r => import('./weapons/keyboard').then(m => m.buildKeyboard(r)), long: 0.7, card: painted(() => import('./levels/cards').then(m => m.officeCard)), email: from('Work'), hot: '#b8ffe4',
    air: { colours: ['#7dffc9', '#b8ffe4', '#f2e2bd'], count: 44, size: [4, 9], drift: [0, 0.1], sway: 0.03, glow: true, twinkle: 0.8 } },
  castle: { lights: 'castle', weapon: r => import('./weapons/knightsword').then(m => m.buildKnightSword(r)), long: 0.78, card: painted(() => import('./levels/cards').then(m => m.castleCard)), email: from('Bill'), hot: '#d9c8ff',
    air: { colours: ['#ffc457', '#ff8a3d', '#b79cff', '#fff1c4'], count: 46, size: [4, 10], drift: [0.03, 0.2], sway: 0.1, glow: true, twinkle: 0.5 } },
  lab: { lights: 'lab', weapon: r => import('./weapons/sprayer').then(m => m.buildSprayer(r)), long: 0.4, card: painted(() => import('./levels/cards').then(m => m.labCard), true), email: from('Spam'), hot: '#c8ff9a',
    air: { colours: ['#a6ff3d', '#5dffa1', '#e9ffd0'], count: 40, size: [5, 13], drift: [0, 0.17], sway: 0.08, glow: true, twinkle: 0.2 }, jet: ['#f4ffe6', '#b6ff6a', '#5dffa1'] },
  space: { lights: 'space', weapon: r => import('./weapons/saber').then(m => m.buildSaber(r)), long: 0.76, card: painted(() => import('./levels/spacecard').then(m => m.spaceCard)), email: from('Alert'), hot: '#9ff6ff',
    air: { colours: ['#ffffff', '#7df3ff', '#ff8ae6', '#cfc4ff'], count: 70, size: [3, 8], drift: [-1.5, 0], sway: 0, glow: true, twinkle: 0.4 } },
  inferno: { lights: 'inferno', weapon: r => import('./weapons/flamethrower').then(m => m.buildFlameThrower(r)), long: 0.36, card: painted(() => import('./levels/infernocard').then(m => m.infernoCard), true), email: from('Promo'), hot: '#ffd27a',
    air: { colours: ['#ffc23d', '#ff7a1e', '#ff3d2e', '#fff1c4'], count: 56, size: [4, 10], drift: [0.05, 0.42], sway: 0.14, glow: true, twinkle: 0.6 }, jet: ['#fff3c2', '#ffc23d', '#ff7a1e', '#ff3d2e'] },
  lumber: { lights: 'lumber', weapon: r => import('./weapons/axe').then(m => m.buildAxe(r)), long: 0.72, card: painted(() => import('./levels/lumbercard').then(m => m.lumberCard)), email: from('Tracking'), hot: '#ffe2a0',
    air: { colours: ['#f6a81c', '#ee7a1a', '#d9471c', '#f3c53a'], count: 40, size: [8, 16], drift: [-0.24, -0.2], sway: 0.16, glow: false, twinkle: 0 } },
};

/** Kyoto's katana is its own file, written for the game's world: handed just enough of one to build it. */
async function katana(renderer: THREE.WebGLRenderer): Promise<Held> {
  const { createSword } = await import('./sword');
  const made: THREE.Object3D[] = [];
  const world = { renderer, camera: new THREE.PerspectiveCamera(), createTransformEntity: (object: THREE.Object3D) => { made.push(object); return {}; } };
  createSword(world as never);
  const model = made[0]; model.visible = true;
  return { model, hit: { base: new THREE.Vector3(0.002, 0.16, 0), tip: new THREE.Vector3(0.125, 0.86, 0) } };
}

/** Kyoto's email: the game's card as ink on washi paper, mixed here as the letter's shader mixes it (letters.ts, paperMaterial). */
const inkCard: Paint = async (canvas, email) => {
  const [{ makeSurface, Painter }, { emailCard }] = await Promise.all([import('./mail/painter'), import('./mail/cardArt')]);
  const surface = makeSurface(canvas.width, canvas.height, { texture: false });
  emailCard(new Painter(), surface, email);
  const g = canvas.getContext('2d')!, w = canvas.width, h = canvas.height;
  const paper = new Image(); paper.src = `${base}mail/washi.webp`;
  await paper.decode().catch(() => undefined);
  g.fillStyle = '#f5ebd4'; g.fillRect(0, 0, w, h);
  if (paper.naturalWidth) { g.globalAlpha = 0.22; g.globalCompositeOperation = 'soft-light'; g.drawImage(paper, 0, 0, w, h); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
  const sheet = g.getImageData(0, 0, w, h), drawn = surface.g.getImageData(0, 0, w, h).data, out = sheet.data;
  const step = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const ink = [0x1a, 0x17, 0x21];
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
    const r = drawn[i] / 255, gr = drawn[i + 1] / 255, b = drawn[i + 2] / 255;
    const bright = Math.max(r, gr, b), dull = Math.min(r, gr, b);
    const u = x / w, v = y / h, edge = Math.min(Math.min(u, 1 - u), Math.min(v, 1 - v) * 1.6);
    const amount = step(0.34, 0.7, bright) * step(0.018, 0.04, edge);      // (a little higher than the shader's: here the card's dark glass must leave the paper clean)
    if (amount <= 0) continue;
    const hue = Math.max(0, Math.min(1, (bright - dull) * 1.6)) * 0.85;      // coloured labels keep a trace of their hue
    for (let c = 0; c < 3; c++) {
      const colour = ink[c] + (drawn[i + c] * 0.42 - ink[c]) * hue;
      out[i + c] = out[i + c] + (colour - out[i + c]) * amount;
    }
  }
  g.putImageData(sheet, 0, 0);
};

/** The hand a controller-free player sees: the same open hand model the game's SDK loads, dark and see-through with a lit rim. */
const HAND = 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/generic-hand/left.glb';
function handMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: '#0d0f16', transparent: true, roughness: 1, metalness: 0 });
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', /* glsl */ `#include <dithering_fragment>
      float rim = pow(1. - abs(dot(normalize(vNormal), normalize(vViewPosition))), 1.25);
      gl_FragColor = vec4(mix(vec3(.11, .13, .2), vec3(.9, .96, 1.), rim), mix(.4, 1., rim));`);
  };
  return material;
}

async function main() {
  const query = new URLSearchParams(location.search);
  const id = query.get('level') ?? 'kyoto', show = SHOWS[id] ?? SHOWS.kyoto;
  const held = query.get('hover') === '1';
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(0x000000, 0); renderer.toneMapping = THREE.NoToneMapping;
  document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 40);
  const DISTANCE = 3.2, tall = 2 * DISTANCE * Math.tan(15 * Math.PI / 180);
  let wide = tall * 16 / 9;

  // ── light
  let lights: { update(blend: number): void } | null = null;
  if (show.lights === 'kyoto') {
    scene.add(new THREE.HemisphereLight('#d7dcff', '#5a4660', 1.25));
    const key = new THREE.DirectionalLight('#ffe6ef', 2.4); key.position.set(-1.2, 2, 2.4); scene.add(key);
    const lantern = new THREE.PointLight('#ffb36b', 2.2, 6, 1.6); lantern.position.set(1.6, 0.2, 1.4); scene.add(lantern);
  } else { const rig = levelLights(show.lights); scene.add(rig.group); lights = rig; }
  // (the levels' lights are set for a room; a prop by itself in front of a painting wants a little more)
  scene.add(new THREE.AmbientLight('#ffffff', 0.55));

  // ── the email, in the middle
  const email = Emails.find(show.email) ?? Emails[0];
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 640;
  await (await show.card())(canvas, email);
  const face = new THREE.CanvasTexture(canvas); face.colorSpace = THREE.SRGBColorSpace; face.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const letter = new THREE.Group(); scene.add(letter);
  const sheet: Mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.625), new THREE.MeshBasicMaterial({ map: face, transparent: true, side: THREE.DoubleSide }));
  const halo: Mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.5), new THREE.MeshBasicMaterial({ map: glowTexture(), color: show.hot, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.position.z = -0.02; halo.renderOrder = -1;
  // a hit: a bright streak across it and a flash over it
  const streak: Mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.05), new THREE.MeshBasicMaterial({ map: glowTexture(), color: show.hot, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  streak.position.z = 0.02; streak.rotation.z = -0.5;
  const flash: Mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.625), new THREE.MeshBasicMaterial({ color: show.hot, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.position.z = 0.01;
  letter.add(halo, sheet, flash, streak);

  // ── the weapon, on the right
  const spec = await show.weapon(renderer);
  const kind: 'rod' | 'punch' | 'aim' = spec.aim ? 'aim' : spec.desktop?.punch ? 'punch' : 'rod';
  const along = spec.aim ? spec.aim.direction.clone().normalize() : spec.hit ? spec.hit.tip.clone().sub(spec.hit.base).normalize() : new THREE.Vector3(0, 1, 0);
  // a rod leans in towards the email; a nozzle or a fist points at it, turned a little to show its side
  const towards = (kind === 'rod' ? new THREE.Vector3(-0.42, 0.9, 0.12) : new THREE.Vector3(-0.92, 0.1, -0.34)).normalize();
  const holder = new THREE.Group(); holder.quaternion.setFromUnitVectors(along, towards); holder.add(spec.model);
  const pivot = new THREE.Group(); pivot.add(holder); scene.add(pivot);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder), size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
  const scale = show.long * tall / Math.max(size.x, size.y, size.z);
  holder.scale.setScalar(scale);
  const middle = centre.clone().multiplyScalar(scale);      // (the model's middle from its grip, as drawn)
  spec.onArmed?.(true);

  // ── the hand, on the left
  const hand = new THREE.Group(); scene.add(hand);
  new GLTFLoader().loadAsync(HAND).then(gltf => {
    const model = gltf.scene, material = handMaterial();
    model.traverse(node => { const mesh = node as Mesh; if (mesh.isMesh) { mesh.material = material; mesh.frustumCulled = false; } });
    const bounds = new THREE.Box3().setFromObject(model), span = bounds.getSize(new THREE.Vector3());
    model.position.sub(bounds.getCenter(new THREE.Vector3()));      // (it turns about its own middle)
    // In the model the fingers run along -Y, the back of the hand faces -X and the thumb is on -Z.
    // Shown as a player sees their own left hand held up: its back to the viewer, the thumb on the
    // right, the fingers up and leaning in towards the email and a little into the picture.
    const fingers = new THREE.Vector3(0.5, 0.82, -0.25).normalize(), thumb = new THREE.Vector3().crossVectors(fingers, new THREE.Vector3(0, 0, 1)).normalize(), back = new THREE.Vector3().crossVectors(thumb, fingers);
    const turn = new THREE.Group(); turn.add(model);
    turn.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(back.negate(), fingers.negate(), thumb.negate()));
    turn.scale.setScalar(0.5 * tall / Math.max(span.x, span.y, span.z));
    hand.add(turn);
  }).catch(() => { /* no hand: the rest stands without it */ });

  // ── the air
  const air = show.air, AMBIENT = air.count, POOL = AMBIENT + 90;
  const at = new Float32Array(POOL * 3), tint = new Float32Array(POOL * 4), big = new Float32Array(POOL);
  const speed = new Float32Array(POOL * 3), life = new Float32Array(POOL), span = new Float32Array(POOL), seed = new Float32Array(POOL);
  const spot = new Float32Array(AMBIENT * 2);      // where each drifting one is, as a share of the picture (-0.56 to 0.56 each way)
  const palette = air.colours.map(c => new THREE.Color(c));
  const points = new THREE.BufferGeometry();
  points.setAttribute('position', new THREE.BufferAttribute(at, 3).setUsage(THREE.DynamicDrawUsage));
  points.setAttribute('tint', new THREE.BufferAttribute(tint, 4).setUsage(THREE.DynamicDrawUsage));
  points.setAttribute('big', new THREE.BufferAttribute(big, 1).setUsage(THREE.DynamicDrawUsage));
  const dust = new THREE.Points(points, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: air.glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { ratio: { value: renderer.getPixelRatio() }, high: { value: 1 } },
    vertexShader: /* glsl */ `attribute vec4 tint; attribute float big; uniform float ratio, high; varying vec4 vTint;
      void main(){ vTint = tint; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_PointSize = big * ratio * high / 360.; }`,
    // square, soft at the edge: a hint of pixels
    fragmentShader: /* glsl */ `varying vec4 vTint; void main(){ vec2 d = abs(gl_PointCoord - .5); float a = smoothstep(.5, .34, max(d.x, d.y)); gl_FragColor = vec4(vTint.rgb, vTint.a * a); }`,
  }));
  dust.frustumCulled = false; dust.renderOrder = 5; scene.add(dust);
  const random = (a: number, b: number) => a + Math.random() * (b - a);
  for (let i = 0; i < POOL; i++) {
    seed[i] = Math.random() * 100;
    const colour = palette[i % palette.length]; tint[i * 4] = colour.r; tint[i * 4 + 1] = colour.g; tint[i * 4 + 2] = colour.b; tint[i * 4 + 3] = 0;
    if (i < AMBIENT) { spot[i * 2] = random(-0.56, 0.56); spot[i * 2 + 1] = random(-0.56, 0.56); at[i * 3 + 2] = random(-0.5, 0.4); big[i] = random(air.size[0], air.size[1]); }
    else life[i] = -1;
  }
  let next = AMBIENT;
  const mix = new THREE.Color();
  /** One spark from `x, y, z`, flying at `vx, vy, vz`, in one of `colours` (hottest first: it cools through them as it goes). */
  function spark(x: number, y: number, z: number, vx: number, vy: number, vz: number, seconds: number, px: number, colours: THREE.Color[]) {
    const i = next; next = next + 1 < POOL ? next + 1 : AMBIENT;
    at[i * 3] = x; at[i * 3 + 1] = y; at[i * 3 + 2] = z; speed[i * 3] = vx; speed[i * 3 + 1] = vy; speed[i * 3 + 2] = vz;
    life[i] = seconds; span[i] = seconds; big[i] = px; seed[i] = Math.floor(Math.random() * colours.length);
  }
  const hot = [new THREE.Color('#ffffff'), new THREE.Color(show.hot), ...palette], jet = (show.jet ?? []).map(c => new THREE.Color(c));

  // ── where things stand, for a picture this wide
  const home = { letter: new THREE.Vector3(), weapon: new THREE.Vector3(), hand: new THREE.Vector3() };
  function layout() {
    const w = innerWidth, h = Math.max(1, innerHeight);
    renderer.setSize(w, h, false);
    camera.aspect = Math.max(0.1, w / h); camera.updateProjectionMatrix(); wide = tall * camera.aspect;
    (dust.material as THREE.ShaderMaterial).uniforms.high.value = h;
    // (the level's logo is across the top of the painting: everything sits a little below the middle)
    home.letter.set(0, -0.1 * tall, 0);
    home.weapon.set(0.31 * wide, -0.03 * tall, 0.1);
    home.hand.set(-0.31 * wide, -0.2 * tall, 0.05);
    letter.scale.setScalar(Math.min(0.3 * wide, 0.62 * tall / 0.625));
  }
  layout(); addEventListener('resize', layout);

  // ── the pointer: the page this sits in says where it is; by itself, its own
  const pointer = { x: 0, y: 0, over: held };
  addEventListener('message', event => {
    if (event.origin !== location.origin) return;
    const data = event.data as { type?: string; x?: number; y?: number; hover?: boolean } | null;
    if (data?.type !== 'vr3-show') return;
    pointer.x = data.x ?? 0; pointer.y = data.y ?? 0; pointer.over = held || !!data.hover;
  });
  if (parent === window) {
    addEventListener('pointermove', event => { pointer.x = event.clientX / innerWidth * 2 - 1; pointer.y = event.clientY / innerHeight * 2 - 1; pointer.over = true; });
    document.documentElement.addEventListener('pointerleave', () => { pointer.over = held; pointer.x = 0; pointer.y = 0; });
  }

  // ── every frame
  const BEAT = 1.7;      // seconds from one hit to the next while hovered
  const state = { clock: 0, live: 0, look: new THREE.Vector2(), beat: 0, struck: false, kick: new THREE.Vector3(), kickV: new THREE.Vector3(), spin: 0, spinV: 0, flash: 0, streak: 1 };
  const nozzle = new THREE.Vector3(), aimed = new THREE.Vector3(), to = new THREE.Vector3();
  const ease = (t: number) => t * t * (3 - 2 * t);
  function hit(strength: number) {
    state.kickV.set(-1.5 * strength, 0.5 * strength, -1.3 * strength); state.spinV += (kind === 'punch' ? 7 : 3.4) * strength;
    state.flash = 1; if (kind !== 'aim') state.streak = 0;
    spec.onImpact?.(strength);
    for (let n = 0; n < 26; n++) {
      const angle = Math.random() * Math.PI * 2, fast = random(0.5, 1.9);
      spark(letter.position.x + random(-0.2, 0.2), letter.position.y + random(-0.12, 0.12), 0.1, Math.cos(angle) * fast, Math.sin(angle) * fast + 0.3, random(-0.2, 0.4), random(0.35, 0.8), random(6, 15), hot);
    }
  }
  let last = performance.now(), told = false;
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (document.hidden || innerWidth < 2 || innerHeight < 2) return;
    tick(dt);
  }
  function tick(dt: number) {
    state.clock += dt;
    const t = state.clock, over = pointer.over;
    state.live += ((over ? 1 : 0) - state.live) * Math.min(1, dt * 5);
    state.look.x += (pointer.x - state.look.x) * Math.min(1, dt * 4); state.look.y += (pointer.y - state.look.y) * Math.min(1, dt * 4);
    lights?.update(state.live * 0.45);

    // the view leans a little with the pointer
    camera.position.set(state.look.x * 0.16, -state.look.y * 0.1, DISTANCE); camera.lookAt(0, 0, 0);

    // the hit, in beats while hovered: wind up, strike, come back
    let swing = 0, reach = 0;
    if (over) {
      state.beat += dt / BEAT; if (state.beat >= 1) { state.beat -= 1; state.struck = false; }
      const b = state.beat;
      if (kind === 'aim') {
        if (!state.struck && b > 0.5) { state.struck = true; hit(0.35); }
      } else {
        const wind = b < 0.3 ? ease(b / 0.3) : 0, strike = b >= 0.3 && b < 0.42 ? ease((b - 0.3) / 0.12) : b >= 0.42 ? 1 : 0, back = b > 0.62 ? ease((b - 0.62) / 0.38) : 0;
        swing = (-0.42 * (b < 0.3 ? wind : 1) + 1.5 * strike) * (1 - back);
        reach = (strike - (b < 0.3 ? wind * 0.25 : 0.25 * (1 - strike))) * (1 - back);
        if (!state.struck && b >= 0.4) { state.struck = true; hit(1); }
      }
    } else { state.beat = 0; state.struck = false; }

    // the weapon: turning slowly to be looked at; hovered, live and hitting
    const idle = 1 - state.live;
    pivot.rotation.set(0, 0, 0);
    if (kind === 'rod') { pivot.rotation.z = swing * 0.62 + Math.sin(t * 0.7) * 0.03; pivot.rotation.y = Math.sin(t * 0.55) * 0.5 * idle - 0.25 * state.live; }
    else { pivot.rotation.y = Math.sin(t * 0.55) * 0.38 * idle; pivot.rotation.z = Math.sin(t * 0.8) * 0.04 - (kind === 'punch' ? swing * 0.08 : 0); }
    // (it turns about its own middle: its grip is moved so that the middle stays where the weapon stands)
    to.copy(middle).applyEuler(pivot.rotation);
    pivot.position.copy(home.weapon).sub(to);
    pivot.position.y += Math.sin(t * 1.1) * 0.02 * tall;
    pivot.position.x -= reach * (kind === 'punch' ? 0.17 : 0.1) * wide;
    if (kind === 'aim') { pivot.position.x += Math.sin(t * 31) * 0.004 * state.live; pivot.position.y += Math.sin(t * 27) * 0.004 * state.live; }      // (it shakes as it fires)
    spec.onLive?.(state.live, t); spec.onUpdate?.(dt, t, over ? 2 + reach * 6 : 0, state.live * 0.45);

    // a nozzle's jet, at the email
    if (kind === 'aim' && spec.aim && state.live > 0.5 && jet.length) {
      pivot.updateMatrixWorld(true);
      nozzle.copy(spec.aim.origin); spec.model.localToWorld(nozzle);
      aimed.copy(letter.position).sub(nozzle).normalize();
      for (let n = 0; n < 3; n++) spark(nozzle.x, nozzle.y, nozzle.z, aimed.x * random(1.6, 2.4) + random(-0.12, 0.12), aimed.y * random(1.6, 2.4) + random(-0.12, 0.2), aimed.z * 2 + random(-0.1, 0.1), random(0.3, 0.55), random(9, 22), jet);
    }

    // the email: floating, turned a little to the pointer, knocked about when hit (a spring brings it back)
    state.kickV.addScaledVector(state.kick, -60 * dt).multiplyScalar(Math.exp(-7 * dt)); state.kick.addScaledVector(state.kickV, dt);
    state.spinV += -70 * state.spin * dt; state.spinV *= Math.exp(-6 * dt); state.spin += state.spinV * dt;
    const burning = kind === 'aim' ? state.live : 0;
    letter.position.copy(home.letter).addScaledVector(state.kick, 0.1 * tall);
    letter.position.y += Math.sin(t * 1.3) * 0.022 * tall; letter.position.x += Math.sin(t * 37) * 0.003 * burning;
    letter.rotation.set(-state.look.y * 0.16 + Math.sin(t * 0.9) * 0.04, state.look.x * 0.26 + Math.sin(t * 0.7) * 0.07, Math.sin(t * 0.8) * 0.025 + state.spin * 0.16);
    state.flash = Math.max(0, state.flash - dt * 3.2); state.streak = Math.min(1, state.streak + dt * 3.4);
    flash.material.opacity = state.flash * 0.5 + burning * (0.1 + 0.06 * Math.sin(t * 23));
    streak.material.opacity = (1 - state.streak) * 0.95; streak.scale.set(0.2 + state.streak * 1.2, 1 + (1 - state.streak) * 2, 1);
    halo.material.opacity = 0.22 + 0.2 * state.live + 0.05 * Math.sin(t * 2);

    // the hand: open, waiting; hovered, it reaches for the email
    hand.position.copy(home.hand); hand.position.x += state.live * 0.05 * wide; hand.position.y += Math.sin(t * 1.0 + 1) * 0.018 * tall + state.live * 0.05 * tall;
    hand.rotation.set(Math.sin(t * 0.8) * 0.05, state.look.x * 0.12 + Math.sin(t * 0.6) * 0.06, -state.live * 0.12 + Math.sin(t * 0.9) * 0.03);

    // the air: drifting; quicker and brighter while hovered
    const rush = 1 + state.live * 1.6;
    for (let i = 0; i < POOL; i++) {
      const p = i * 3, c = i * 4;
      if (i < AMBIENT) {
        let u = spot[i * 2] + (air.drift[0] * rush + Math.sin(t * 0.9 + seed[i]) * air.sway) * dt / wide, v = spot[i * 2 + 1] + (air.drift[1] * rush + Math.cos(t * 0.7 + seed[i] * 1.7) * air.sway * 0.5) * dt / tall;
        if (u < -0.56) u += 1.12; else if (u > 0.56) u -= 1.12;
        if (v < -0.56) v += 1.12; else if (v > 0.56) v -= 1.12;
        spot[i * 2] = u; spot[i * 2 + 1] = v; at[p] = u * wide; at[p + 1] = v * tall;
        const blink = 1 - air.twinkle * (0.5 + 0.5 * Math.sin(t * (2 + seed[i] % 3) + seed[i]));
        tint[c + 3] = (air.glow ? 0.75 : 0.9) * blink * (0.75 + 0.25 * state.live);
      } else if (life[i] > 0) {
        life[i] -= dt;
        at[p] += speed[p] * dt; at[p + 1] += speed[p + 1] * dt; at[p + 2] += speed[p + 2] * dt; speed[p + 1] += (jet.length ? 0.9 : -1.6) * dt;      // (sparks fall; a jet's heat rises)
        const age = 1 - Math.max(0, life[i]) / span[i], set = jet.length && kind === 'aim' ? jet : hot;
        const from = Math.min(set.length - 1, Math.floor(age * set.length)), into = Math.min(set.length - 1, from + 1);
        mix.copy(set[from]).lerp(set[into], age * set.length - from);
        tint[c] = mix.r; tint[c + 1] = mix.g; tint[c + 2] = mix.b; tint[c + 3] = life[i] > 0 ? (1 - age * age) : 0;
      } else tint[c + 3] = 0;
    }
    points.attributes.position.needsUpdate = true; points.attributes.tint.needsUpdate = true; points.attributes.big.needsUpdate = true;

    renderer.render(scene, camera);
    if (!told) { told = true; document.body.classList.add('ready'); if (parent !== window) parent.postMessage({ type: 'vr3-show-ready', level: id }, location.origin); }
  }
  const loop = (now: number) => { frame(now); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  // (for a look from the console where no frames come, as in a hidden pane: __show.step(1.2) runs that many seconds)
  Object.assign(window, { __show: { scene, camera, spec, pointer, state, hand, pivot, step: (seconds = 1 / 60) => { for (let left = seconds; left > 0; left -= 1 / 60) tick(1 / 60); } } });
}

/** A soft round glow, for the light behind the email and the streak of a hit. */
function glowTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!, fade = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  fade.addColorStop(0, 'rgba(255,255,255,1)'); fade.addColorStop(0.35, 'rgba(255,255,255,.45)'); fade.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = fade; g.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

main().catch(error => { console.error(error); });
