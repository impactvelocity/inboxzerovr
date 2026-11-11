import * as THREE from 'three';
import type { Game, GameContext, World } from './api';
import { Ambience } from './kyoto/ambience';
import { Courtyard } from './kyoto/courtyard';
import { globals } from './kyoto/shaders';
import { GAME_LAYER, uiKit } from './kyoto/ui';
import { clamp01 } from './kyoto/unitymath';
import { Post } from './post';

/**
 * Inbox Zero VR in the browser: the Kyoto v2 level only.
 *
 * On a monitor the courtyard is drawn through a bloom chain and the game's
 * own things on top of it. In a headset (WebXR) everything is one pass with
 * the grade worked into each shader, which is what a mobile GPU can afford.
 *
 * Address bar switches, for looking at the scene and measuring it:
 *   ?at=0.4      hold the evening at one point (0 the sun up, 1 night)
 *   ?bloom=0     no bloom chain on a monitor (what a headset draws)
 *   ?game=0      the courtyard alone
 *   ?ambience=0  no wind, leaves, water, birds or crickets
 *   ?stats=1     frame times, draw calls and triangles in the corner (also the P key)
 *   ?scale=1.2   headset render scale (default 1)
 *   ?yaw=30&pitch=-10&fov=56   turn the monitor view
 *   ?slow=0.2    slow motion
 *   ?emulate=1   pretend to be a Quest 3 (the IWER runtime), to try the headset path at a desk
 */

const params = new URLSearchParams(location.search);
const number = (key: string, fallback: number) => (params.has(key) ? Number(params.get(key)) : fallback);

/** The seated eye in the game's space (SeatedRig.SeatedEyeHeight), and in the courtyard's (KyotoWorld.EyeInScene). */
const SEATED_EYE = 1.15, EYE_IN_SCENE = 1.55;

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;       // the courtyard's shaders carry their own grade
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFramebufferScaleFactor(number('scale', 1));
renderer.setClearColor(0x120c24, 1);

const scene = new THREE.Scene();
/** The play space. The camera is its child; in a headset it is moved to seat the player. */
const rig = new THREE.Group();
rig.name = 'Rig';
scene.add(rig);
const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.03, 600);
camera.position.set(0, SEATED_EYE, 0);
rig.add(camera);

/** Unity's world: left-handed, so mirrored in z (see api.ts). */
const unity = new THREE.Group();
unity.name = 'Unity space';
unity.scale.set(1, 1, -1);
scene.add(unity);
/** What the game makes goes here, so it can be told apart from the courtyard. */
const gameRoot = new THREE.Group();
gameRoot.name = 'Game';
unity.add(gameRoot);

const statsBox = document.getElementById('stats') as HTMLPreElement;
statsBox.hidden = params.get('stats') !== '1';
window.addEventListener('keydown', (e) => { if (e.code === 'KeyP' && !e.repeat) statsBox.hidden = !statsBox.hidden; });

async function start(): Promise<void> {
  if (params.get('emulate') === '1') {
    // A stand-in headset: stereo views, a seated head, two controllers. Drive it from the console as __xrDevice.
    const { XRDevice, metaQuest3 } = await import('iwer');
    const device = new XRDevice(metaQuest3, { stereoEnabled: true });
    device.installRuntime({ forceInstall: true } as Parameters<typeof device.installRuntime>[0]);
    device.position.set(0.1, 1.22, 0.15);
    (window as unknown as Record<string, unknown>).__xrDevice = device;
  }
  const progress = document.getElementById('progress') as HTMLElement;
  const yard = await Courtyard.load((done, total) => { progress.style.width = `${Math.round((done / total) * 100)}%`; });
  yard.root.position.set(0, SEATED_EYE - EYE_IN_SCENE, 0);
  unity.add(yard.root);
  // The garden's sound: wind, leaves, water, birds, crickets (?ambience=0 for none). It waits for a first click or key.
  const ambience = params.get('ambience') === '0' ? null : new Ambience(yard.root);
  if (ambience) {
    window.addEventListener('pointerdown', ambience.unlock);
    window.addEventListener('keydown', ambience.unlock);
    renderer.xr.addEventListener('sessionstart', ambience.unlock);
  }
  camera.fov = number('fov', yard.fieldOfView);
  camera.rotation.set(THREE.MathUtils.degToRad(number('pitch', 0)), THREE.MathUtils.degToRad(-number('yaw', 0)), 0, 'YXZ');
  camera.updateProjectionMatrix();

  // ---- the world as the game knows it (Unity: KyotoWorld)
  let underway = false, time = 0;
  const held = params.has('at') ? clamp01(Number(params.get('at'))) : null;
  const world: World = {
    round(on) { underway = on; if (!on) time = 0; },
    kick(strength) { yard.stir(strength, 2); },
    wish(count = 1) { yard.stir(0.5, count * 3); },
    get night() { return yard.eased; },
  };

  const loader = new THREE.TextureLoader();
  const picture = async (name: string, colour: boolean) => {
    const t = await loader.loadAsync(`${import.meta.env.BASE_URL}kyoto/tex/${name}.webp`);
    t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const [washi, brush, logo] = await Promise.all([picture('Letter_Washi', true), picture('Brush', false), picture('Logo', true)]);
  brush.wrapS = brush.wrapT = THREE.RepeatWrapping;

  const ctx: GameContext = {
    renderer, unity: gameRoot, camera, rig,
    eye: new THREE.Vector3(0, SEATED_EYE, 0),
    world,
    assets: { katana: yard.katana, letter: yard.letter, washi, brush, logo, audioUrl: (name) => `${import.meta.env.BASE_URL}kyoto/audio/${name}.wav` },
    inXR: () => renderer.xr.isPresenting,
    ui: uiKit,
  };

  let game: Game | null = null;
  if (params.get('game') !== '0') {
    try {
      const found = import.meta.glob<{ createGame(ctx: GameContext): Game }>('./game/index.ts');
      const load = found['./game/index.ts'];
      if (load) game = (await load()).createGame(ctx);
    } catch (error) {
      console.error('[game] could not start', error);
    }
  }
  /** ?slow=0.2: everything at a fifth of the speed, to look at a cut. Also __kyoto.pace.slow from the console. */
  const pace = { slow: number('slow', 1) };
  (window as unknown as Record<string, unknown>).__kyoto = { yard, renderer, scene, camera, globals, world, game, pace, ambience };

  globals.uDebug.value = number('debug', 0);
  const post = params.get('bloom') === '0' ? null : new Post(renderer, scene, camera);
  const resize = () => {
    if (renderer.xr.isPresenting) return;
    const ratio = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(ratio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    post?.setSize(window.innerWidth, window.innerHeight, ratio);
    camera.aspect = window.innerWidth / window.innerHeight;
    // as Unity's desktop lens: a window narrower than 16:9 widens the view, so the katana never crowds the letter
    const half = Math.tan(THREE.MathUtils.degToRad(number('fov', yard.fieldOfView)) / 2) * Math.max(1, 16 / 9 / camera.aspect);
    camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(half)), 30, 85);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  // ---- the seat (Unity: SeatedRig). In a headset the play space is turned and raised so the
  // head starts at the seated eye, facing the garden; a held change of posture re-seats.
  let seated = false, offTimer = 0, headsetFrames = 0;
  const head = new THREE.Vector3(), forward = new THREE.Vector3();
  const seat = (full: boolean) => {
    head.copy(camera.position);                   // the head within the play space
    if (head.y < 0.2) return false;               // no pose yet
    if (full) {
      forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      rig.rotation.set(0, -Math.atan2(-forward.x, -forward.z), 0);
      head.applyEuler(rig.rotation);
      rig.position.set(-head.x, SEATED_EYE - head.y, -head.z);
    } else {
      rig.position.y = SEATED_EYE - head.y;
    }
    return true;
  };
  renderer.xr.addEventListener('sessionstart', () => { seated = false; offTimer = 0; headsetFrames = 0; });
  renderer.xr.addEventListener('sessionend', () => {
    rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
    camera.position.set(0, SEATED_EYE, 0); camera.rotation.set(0, 0, 0);
    camera.fov = yard.fieldOfView;
    resize();
  });
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyC') seated = false; });

  // ---- measuring. In a headset the page's corner readout cannot be seen, so with ?stats=1 the
  // same lines hang low in the left of the view.
  const board = document.createElement('canvas');
  board.width = 512; board.height = 128;
  const boardTexture = new THREE.CanvasTexture(board);
  boardTexture.colorSpace = THREE.SRGBColorSpace;
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.09), new THREE.MeshBasicMaterial({ map: boardTexture, transparent: true, depthTest: false, fog: false, toneMapped: false }));
  boardMesh.position.set(-0.22, -0.2, -0.7);
  boardMesh.rotation.set(-0.25, 0.3, 0);
  boardMesh.renderOrder = 999;
  boardMesh.visible = false;
  camera.add(boardMesh);
  const drawBoard = (text: string) => {
    const g = board.getContext('2d')!;
    g.clearRect(0, 0, board.width, board.height);
    g.fillStyle = 'rgba(14, 8, 26, 0.7)';
    g.fillRect(0, 0, board.width, board.height);
    g.fillStyle = '#e8dcf2';
    g.font = '26px ui-monospace, Menlo, monospace';
    text.split('\n').forEach((line, i) => g.fillText(line, 14, 36 + i * 34));
    boardTexture.needsUpdate = true;
  };
  // How long the graphics card itself takes, where the browser will say (desktop Chrome does; a Quest does not).
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  let timing: WebGLQuery | null = null, waiting: WebGLQuery | null = null, gpuMs = -1;
  const gpuBegin = () => {
    if (!timer || statsBox.hidden && !boardMesh.visible) return;
    if (waiting) {
      if (!gl.getQueryParameter(waiting, gl.QUERY_RESULT_AVAILABLE)) return;
      if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) gpuMs = gl.getQueryParameter(waiting, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(waiting); waiting = null;
    }
    timing = gl.createQuery();
    gl.beginQuery(timer.TIME_ELAPSED_EXT, timing!);
  };
  const gpuEnd = () => {
    if (!timer || !timing) return;
    gl.endQuery(timer.TIME_ELAPSED_EXT);
    waiting = timing; timing = null;
  };
  const frames: number[] = [];
  let lastStats = 0, worst = 0;
  const report = (now: number, cpu: number) => {
    frames.push(cpu);
    worst = Math.max(worst, cpu);
    if (now - lastStats < 500) return;
    const fps = frames.length / ((now - lastStats) / 1000);
    const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
    const info = renderer.info.render;
    const text = `${fps.toFixed(0)} fps   script+submit ${mean.toFixed(1)} ms (worst ${worst.toFixed(1)})${gpuMs >= 0 ? `   gpu ${gpuMs.toFixed(1)} ms` : ''}\n${info.calls} draws   ${(info.triangles / 1000).toFixed(0)}k triangles${renderer.xr.isPresenting ? '   (headset: both eyes)' : ''}\nevening ${yard.night.toFixed(2)}   ${game ? game.status() : 'no game'}`;
    if (!statsBox.hidden) statsBox.textContent = text;
    boardMesh.visible = renderer.xr.isPresenting && params.get('stats') === '1';
    if (boardMesh.visible) drawBoard(`${fps.toFixed(0)} fps   ${mean.toFixed(1)} ms script\n${info.calls} draws  ${(info.triangles / 1000).toFixed(0)}k tris (2 eyes)\nevening ${yard.night.toFixed(2)}`);
    (window as unknown as Record<string, unknown>).__perf = { fps, mean, worst, gpuMs, calls: info.calls, triangles: info.triangles, xr: renderer.xr.isPresenting };
    frames.length = 0; worst = 0; lastStats = now;
  };

  const eyeInScene = new THREE.Vector3();
  const drawSize = new THREE.Vector2();
  let last = performance.now();
  renderer.info.autoReset = false;
  renderer.setAnimationLoop((now: number) => {
    const began = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1) * pace.slow;
    last = now;
    const inXR = renderer.xr.isPresenting;

    if (inXR) {
      // the head's pose arrives with the first frames drawn; seat the player once it has
      if (!seated) seated = ++headsetFrames > 3 && seat(true);
      else {
        // leaning and reaching are play; only a held change of posture re-seats
        const error = SEATED_EYE - (camera.position.y + rig.position.y);
        offTimer = Math.abs(error) > 0.22 ? offTimer + dt : 0;
        if (offTimer > 1.5) { offTimer = 0; seat(false); }
      }
    }

    if (underway) time += dt;
    const fade = held ?? clamp01((time - 6) / 70);
    // the viewer in the courtyard's own space: world -> Unity (mirror z) -> under the hung root
    camera.getWorldPosition(eyeInScene);
    eyeInScene.set(eyeInScene.x, eyeInScene.y - yard.root.position.y, -eyeInScene.z);
    if (held !== null) yard.stepAt(dt, held, eyeInScene);
    else yard.step(dt, fade, eyeInScene);

    ambience?.step(yard.eased, yard.windSwell, yard.windForce, yard.time, camera);
    game?.step(dt);
    // whatever the game has made is the game's layer
    gameRoot.traverse((o) => { if (o.layers.mask !== 1 << GAME_LAYER) o.layers.set(GAME_LAYER); });

    renderer.info.reset();
    gpuBegin();
    if (inXR || !post) {
      globals.uDirect.value = 1;
      camera.layers.enableAll();
      renderer.autoClear = true;
      renderer.render(scene, camera);
    } else {
      // the courtyard through the bloom chain, then the game's things over the finished picture
      globals.uDirect.value = 0;
      camera.layers.set(0);
      post.setNight(yard.eased);
      post.render(dt);
      globals.uDirect.value = 1;
      camera.layers.set(GAME_LAYER);
      renderer.autoClear = false;
      renderer.getDrawingBufferSize(drawSize);
      renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.autoClear = true;
    }
    gpuEnd();
    report(now, performance.now() - began);
  });

  document.getElementById('loading')!.classList.add('done');
  setupVrButton();
}

/** "Enter VR", when the browser can. */
function setupVrButton(): void {
  const button = document.getElementById('enter-vr') as HTMLButtonElement;
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  if (!xr) { button.textContent = window.isSecureContext ? 'VR not available' : 'VR needs https'; return; }
  let session: XRSession | null = null;
  xr.isSessionSupported('immersive-vr').then((ok) => {
    if (!ok) return;
    button.disabled = false;
    button.textContent = 'Enter VR';
    button.addEventListener('click', async () => {
      if (session) { await session.end(); return; }
      try {
        session = await xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'hand-tracking'] });
        session.addEventListener('end', () => { session = null; button.textContent = 'Enter VR'; });
        // a headset's refresh rates: take the smoothest the scene is likely to hold
        const rates = (session as XRSession & { supportedFrameRates?: Float32Array }).supportedFrameRates;
        const wanted = Number(new URLSearchParams(location.search).get('hz') ?? 72);
        if (rates && rates.includes(wanted)) (session as XRSession & { updateTargetFrameRate(rate: number): Promise<void> }).updateTargetFrameRate(wanted).catch(() => {});
        await renderer.xr.setSession(session);
        button.textContent = 'Exit VR';
      } catch (error) {
        console.error('[xr] could not start a session', error);
        session = null;
      }
    });
  }).catch(() => {});
}

start().catch((error) => {
  console.error(error);
  const box = document.querySelector('#loading .inner') as HTMLElement;
  box.textContent = 'Could not load the courtyard. See the console.';
});
