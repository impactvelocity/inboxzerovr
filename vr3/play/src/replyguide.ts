import * as THREE from 'three';
import * as PixelFont from './mail/pixelFont';
import {
  buildHand, cardPiece, clamp01, dotTexture, easeIn, easeOut, glowing, paintCard, ramp, sample, smooth, sparks,
  CARD_H, CARD_W, L_REST, type HandGuide, type Key,
} from './handguide';

/**
 * How to Play, Round Two (2026-11-13, asked for: "make two cards for the reply - move to either side to reply",
 * "right side card - hold near to record message", "then under say throw or cut to leave unread for tomorrow").
 *
 * The same lit left hand as Round One's (handguide.ts), holding an email ahead of it on its thread, as in the game:
 *   left card    two replies come up either side (speech bubbles, as roundui.ts has them); the email is moved to one,
 *                a pixel loading ring low right of the hand fills, and the reply is sent: the email goes into it. Always the left reply.
 *   right card   the mic, low beside it (roundui.ts: low and close); the email is held near, the mic's spokes move with
 *                a voice and its ring fills; the message is recorded: the email goes into the mic.
 * The cards take turns, as Round One's do. Everything is a function of time: `__reply.frame(left, right, 'left')`.
 */

type Side = 'left' | 'right';
const TURN = 4.4;                 // seconds each card has the light
/** Which words light when: [from, to] in that card's own seconds. */
const STEPS: Record<string, [number, number]> = { 'left:0': [0.45, 1.4], 'left:1': [1.4, 2.85], 'right:0': [0.45, 1.3], 'right:1': [1.3, 3.3] };

// The hand holds an email from the start (it was grabbed in round one); it barely moves.
const HOLD = new THREE.Vector3(0.05, 0.135, -0.3);           // where the email hangs from the hand
/** Card one's email starts lower, so the hand is seen to lift it up and left to the reply (2026-11-13). */
const HOLD_LOW = new THREE.Vector3(0.14, 0.085, -0.3);      // (to the right of the middle: it is pulled over to the left, 2026-11-13)
const EMAIL = 0.78;                                         // its size here (smaller: there is more on the card)
const CURL: Key[] = [[0, [0.3]], [0.25, [1]], [2.95, [1]], [3.15, [0.25], easeOut], [TURN, [0.3]]];
/** Card one: the hand drifts toward the side it is answering (s: -1 left, 1 right). */
/** Card one's hand sits low in the bottom left (2026-11-13: "move hand lower to bottom left"); its email is held further off, so it starts where it did. */
const A_REST = [L_REST[0] - 0.035, L_REST[1] - 0.04, L_REST[2], L_REST[3], L_REST[4], L_REST[5]];
const replyPose = (s: number): Key[] => {
  // The hand hardly travels: it pivots at the wrist, turning up and toward the reply, and that swings the email over
  // (2026-11-13: "make the hand move less, more focus on the email moving", then "pivot the hand to move card left").
  // No overshoot (2026-11-13): one smooth turn, the email pulled from the right over to the reply.
  const to = [A_REST[0] + 0.006 * s, A_REST[1] + 0.008, A_REST[2], A_REST[3] + 0.16, A_REST[4] - 0.36 * s, A_REST[5] + 0.08 * s];
  return [[0, A_REST], [0.45, A_REST], [1.4, to], [A_SENT, to], [A_SENT + 0.2, [to[0] + 0.01 * s, to[1] + 0.01, to[2], to[3] + 0.08, to[4], to[5]], easeOut], [4.0, A_REST], [TURN, A_REST]];
};
const REPLY_X = 0.13, REPLY_Y = 0.068, REPLY_Z = -0.33, BUBBLE = 0.12;   // the two replies, either side of where the email hangs
/** Where the reply's loading ring sits: in the open space low and right of the hand, in the camera's own frame (x right, y up, metres ahead). */
const LOADING = new THREE.Vector3(0.11, -0.09, -0.8), LOADING_SIZE = 0.095;      // (a bit left, up and smaller: 2026-11-13; not used while the ring goes round the reply)
/** The loading ring round the reply instead: its size, so the ring clears the reply's corners. */
const RING_ROUND_REPLY = 0.155;      // (smaller, and behind the reply: 2026-11-13)
const SENT = 2.95;
/** Card one sends sooner: its loading takes about a second (2026-11-13: "make the loading a bit quicker"). */
const A_SENT = 2.95;      // (2.45 for a moment: back to 1.5 seconds of loading, 2026-11-13)
const curlTill = (release: number): Key[] => [[0, [0.3]], [0.25, [1]], [release, [1]], [release + 0.2, [0.25], easeOut], [TURN, [0.3]]];
const CURL_A = curlTill(A_SENT);
/** Card two: the hand brings the email down, near the mic. */
const MIC = new THREE.Vector3(0.095, -0.015, -0.27), MIC_SIZE = 0.15;
// (2026-11-13: "make email get bigger when pulling near mic, and make hand pull back to the left": the hand draws back and left,
//  toward the player, and the email comes in close by the mic, growing)
const MIC_BACK = [-0.08, -0.068, 0.055, 0.45, -0.18, 1.0];
const MIC_POSE: Key[] = [[0, L_REST], [0.5, L_REST], [1.3, MIC_BACK], [2.95, MIC_BACK],
  [3.15, [MIC_BACK[0] + 0.006, MIC_BACK[1] + 0.008, MIC_BACK[2], MIC_BACK[3] + 0.06, MIC_BACK[4], MIC_BACK[5]], easeOut], [4.0, L_REST], [TURN, L_REST]];
const NEAR_MIC = new THREE.Vector3(0.012, 0.045, -0.2);     // where the email is held: tucked up against the mic, behind it (the mic draws over it: "feels more behind it and touching")

/** A speech bubble in pixels, as the game's replies are: dark, outlined in the level's colour, a tail on its left, its letter (A or B: 2026-11-13) and three lines. */
function paintBubble(canvas: HTMLCanvasElement, accent: string, sent: boolean, tailRight = false, label = 'A') {
  const cell = 8, W = 26, H = 17; canvas.width = W * cell; canvas.height = (H + 3) * cell;
  const g = canvas.getContext('2d')!; g.clearRect(0, 0, canvas.width, canvas.height);
  const box = (x: number, y: number, w: number, h: number, colour: string) => { g.fillStyle = colour; g.fillRect(x * cell, y * cell, w * cell, h * cell); };
  const tail = (x: number, y: number, w: number, h: number, colour: string) => box(tailRight ? W - x - w : x, y, w, h, colour);      // (only the tail turns: the tick and lines read the right way round either side)
  const shape = (inset: number, colour: string) => {      // a rectangle with its corners stepped off
    const x0 = inset, y0 = inset, x1 = W - inset, y1 = H - inset;
    box(x0 + 2, y0, x1 - x0 - 4, y1 - y0, colour); box(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2, colour); box(x0, y0 + 2, x1 - x0, y1 - y0 - 4, colour);
  };
  const inside = sent ? accent : '#15121c', rim = accent;
  shape(0, rim); shape(1, inside);
  tail(3, H - 1, 3, 1, rim); tail(2, H, 3, 1, rim); tail(1, H + 1, 2, 1, rim); tail(3, H - 1, 2, 1, inside); tail(3, H, 1, 1, inside);   // the tail
  const ink = sent ? '#14121a' : '#f3eef8';
  if (sent) {      // a pixel tick
    for (const [x, y] of [[8, 9], [9, 10], [10, 11], [11, 10], [12, 9], [13, 8], [14, 7], [15, 6], [16, 5]]) box(x, y, 2, 2, ink);
  } else {
    PixelFont.cells(label, 3 * cell, 5 * cell, cell, (x, y, w, h) => { g.fillStyle = accent; g.fillRect(x, y, w, h); });
    box(10, 6, 12, 2, ink); box(10, 10, 9, 2, ink);      // (two solid lines: 2026-11-13)
  }
}
/** The mic, as roundui.ts draws it: a pixel disc outlined in the level's colour, a microphone on it, and while it records, spokes of blocks that move with the voice. */
function paintMic(canvas: HTMLCanvasElement, accent: string, level: number, clock: number) {
  const size = 320, cell = 10; canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!; g.clearRect(0, 0, size, size);
  const c = size / 2, R = 7.5;
  const fill = (x: number, y: number, colour: string) => { g.fillStyle = colour; g.fillRect(Math.round(c + x * cell - cell / 2), Math.round(c + y * cell - cell / 2), cell, cell); };
  for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) { const d = Math.hypot(x, y); if (d <= R + 0.5) fill(x, y, d > R - 0.6 ? accent : '#15121c'); }
  if (level > 0) for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, wave = 0.5 + 0.5 * Math.sin(clock * 11 + i * 2.3) * Math.sin(clock * 5.3 + i * 0.7);
    const blocks = Math.round(1 + 4 * level * wave * wave);
    for (let k = 0; k < blocks; k++) { const r = R + 2 + k * 1.15; fill(Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r), accent); }
  }
  const mic = ['.###.', '#####', '#####', '#####', '#####', '.###.', '#...#', '.###.', '..#..', '.###.'];
  mic.forEach((row, y) => [...row].forEach((on, x) => { if (on === '#') fill(x - 2, y - 5, '#f3eef8'); }));
}
/**
 * A loading ring in pixels (2026-11-13: "make it a circle around, but pixelated"): a ring of square cells on a grid,
 * lit one by one round from the top, clockwise, as `progress` goes 0 to 1; those still to come dim. A gap between cells.
 */
function ringMaterial(colour: { value: THREE.Color }, cells = 21) {
  return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { colour, progress: { value: 0 }, fade: { value: 0 }, cells: { value: cells } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */ `uniform vec3 colour; uniform float progress; uniform float fade; uniform float cells; varying vec2 vUv;
      void main() {
        vec2 cell = floor(vUv * cells), inCell = fract(vUv * cells);
        vec2 p = (cell + .5) / cells * 2. - 1.; float r = length(p);
        float band = step(.7, r) * step(r, .96);
        float gap = step(.1, inCell.x) * step(.1, inCell.y);
        float turn = fract(atan(p.x, p.y) / 6.2831853 + 1.), done = step(turn, progress);
        gl_FragColor = vec4(mix(colour * .55, mix(colour, vec3(1.), .3), done), band * gap * fade * mix(.35, 1., done));
        #include <colorspace_fragment>
      }` });
}

export async function createReplyGuide(host: HTMLElement): Promise<HandGuide> {
  const canvas = host.querySelector('canvas')!;
  const steps = Array.from(host.querySelectorAll<HTMLElement>('[data-step]'));
  const cards = { left: host.querySelector<HTMLElement>('[data-hand=left]')!, right: host.querySelector<HTMLElement>('[data-hand=right]')! };
  const views = { left: cards.left.querySelector<HTMLElement>('.hand-view')!, right: cards.right.querySelector<HTMLElement>('.hand-view')! };
  const tint = { value: new THREE.Color('#f6b3cc') }, hot = { value: new THREE.Color() };
  const [handA, handB] = await Promise.all([buildHand('left', tint), buildHand('left', tint)]);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0); renderer.toneMapping = THREE.NoToneMapping; renderer.setScissorTest(true);
  const scene = new THREE.Scene();
  const backdrop = document.createElement('canvas'); backdrop.width = backdrop.height = 256;
  const backing = new THREE.CanvasTexture(backdrop); backing.colorSpace = THREE.SRGBColorSpace; scene.background = backing;
  const dot = dotTexture();
  const texture = (art: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(art); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.anisotropy = 4; return t; };
  const cardArt = document.createElement('canvas'), cardMap = texture(cardArt); cardMap.magFilter = THREE.LinearFilter;
  // a reply's art for each side: the tail toward the email (the left one's on its right), and sent, a tick that reads the right way round
  const art = () => { const a = document.createElement('canvas'); return { a, map: texture(a) }; };
  const bubbleArt = { left: { plain: art(), sent: art() }, right: { plain: art(), sent: art() } };
  const micArt = document.createElement('canvas'), micMap = texture(micArt);
  let accentCss = '#f6b3cc';

  const stageA = new THREE.Group(), stageB = new THREE.Group(); stageA.position.x = -10; stageB.position.x = 10; scene.add(stageA, stageB);
  const eye = (stage: THREE.Group) => { const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20); camera.position.set(0.02, 0.2, 0.66); camera.lookAt(0.01, 0.03, 0); stage.add(camera); return camera; };
  const cameraA = eye(stageA), cameraB = eye(stageB);
  const flat = (map: THREE.Texture, w: number, h: number) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide }));

  /** What both cards have: the hand, its email and the thread between them, a flash and sparks for when it is done. */
  function kit(stage: THREE.Group, hand: typeof handA) {
    stage.add(hand.root);
    const email = cardPiece([[-1, -1], [1, -1], [1, 1], [-1, 1]], cardMap); stage.add(email);
    const look = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { fade: { value: 0 }, near: tint, far: { value: new THREE.Color('#ffffff') } },
      vertexShader: /* glsl */ `varying float along; void main() { along = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: /* glsl */ `uniform float fade; uniform vec3 near; uniform vec3 far; varying float along;
        void main() { gl_FragColor = vec4(mix(near, far, along * .6), fade * (.18 + .82 * along * along));
          #include <colorspace_fragment>
        }` });
    const geometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0);
    const threads = [[0.0011, 1], [0.0045, 0.28]].map(([width, strength]) => { const m = new THREE.Mesh(geometry, look.clone()); m.material.uniforms.near = tint; m.frustumCulled = false; stage.add(m); return { m, width, strength }; });
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowing('#ffffff')); (flash.material as THREE.MeshBasicMaterial).map = dot; stage.add(flash);
    const burst = sparks(20, '#ffffff', dot, 0.022); stage.add(burst.points);
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMaterial(hot)); stage.add(ring);
    const handAt = new THREE.Vector3(), span = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
    return { hand, email, flash, burst, ring,
      /** The thread from the fist to the email, at a strength. */
      thread(on: number) {
        hand.root.updateMatrix(); handAt.copy(hand.grip.centre).applyMatrix4(hand.root.matrix);
        span.subVectors(email.position, handAt); const length = span.length() - CARD_H * 0.35 * email.scale.x; span.normalize();
        for (const { m, width, strength } of threads) {
          m.visible = on > 0.01 && length > 0.01 && email.visible; if (!m.visible) continue;
          m.position.copy(handAt); m.quaternion.setFromUnitVectors(UP, span); m.scale.set(width, length, width); m.material.uniforms.fade.value = on * strength;
        }
      } };
  }
  const A = kit(stageA, handA), B = kit(stageB, handB);
  const bubbles = [-1, 1].map(s => {
    const looks = bubbleArt[s < 0 ? 'left' : 'right'];
    const group = new THREE.Group(), plain = flat(looks.plain.map, BUBBLE, BUBBLE * 20 / 26), sent = flat(looks.sent.map, BUBBLE, BUBBLE * 20 / 26);
    group.add(plain, sent); group.position.set(0.005 + REPLY_X * s, REPLY_Y, REPLY_Z);
    stageA.add(group); return { s, group, plain, sent };
  });
  const mic = flat(micMap, MIC_SIZE, MIC_SIZE); mic.position.copy(MIC); stageB.add(mic);
  // the mic and its ring draw over the email (2026-11-13: "keep mic icon above email")
  for (const [mesh, order] of [[mic, 10], [B.ring, 11]] as const) { mesh.renderOrder = order; (mesh.material as THREE.Material).depthTest = false; }

  const v: number[] = [], w: number[] = [], ghost = new THREE.Object3D(), at = new THREE.Vector3(), to = new THREE.Vector3();
  const place = (target: THREE.Object3D, keys: Key[], t: number) => {
    sample(keys, t, v);
    target.position.set(v[0], v[1] + Math.sin(t * 2.4) * 0.003, v[2]); target.rotation.set(v[3] + Math.sin(t * 1.9) * 0.015, v[4], v[5]);
  };
  const faceCamera = (mesh: THREE.Object3D, camera: THREE.Camera, size: number) => { mesh.quaternion.copy(camera.quaternion); mesh.scale.setScalar(size); };
  const opacity = (mesh: THREE.Mesh, a: number) => { (mesh.material as THREE.MeshBasicMaterial).opacity = a; mesh.visible = a > 0.01; };
  const glow = (mesh: THREE.Mesh, where: THREE.Vector3, age: number, life: number, size: number, camera: THREE.Camera) => {
    const a = age > 0 && age < life ? (1 - age / life) ** 2 : 0; opacity(mesh, a * 0.6);
    if (a > 0) { mesh.position.copy(where); mesh.position.z += 0.01; mesh.quaternion.copy(camera.quaternion); mesh.scale.setScalar(size * (0.6 + 0.8 * easeOut(clamp01(age / life)))); }
  };
  let side = -1;      // which reply card one takes: always the left (2026-11-13: "always make it go to the left side email so loading is visible")

  /** The email's place for a card at a time: hanging from its hand, eased toward `goal` by `k`, and its size. */
  function hang(kitted: typeof A, keys: Key[], t: number, goal: THREE.Vector3, k: number, size: number, hold = HOLD, curl = CURL) {
    place(kitted.hand.root, keys, t); kitted.hand.curl(sample(curl, t, w)[0]);
    place(ghost, keys, t); at.copy(ghost.position).add(hold);
    kitted.email.position.lerpVectors(at, goal, k); kitted.email.scale.setScalar(size);
  }

  function draw(ta: number, tb: number, lit: Side | 'both' = 'both') {
    cards.left.classList.toggle('on', lit !== 'right'); cards.right.classList.toggle('on', lit !== 'left');
    // ── card one: to a reply at one side; its ring fills; sent
    const s = side, chosen = bubbles.find(b => b.s === s)!, other = bubbles.find(b => b.s !== s)!;
    to.copy(chosen.group.position); to.z += 0.012; to.x -= 0.06 * s; to.y -= 0.026;      // (over the reply's inner, lower part: in it, but most of the reply still shows, 2026-11-13)      // (beside the reply, over its inner edge: the reply still shows, as in the game)
    const dock = ramp(0.55, 1.4, ta), gone = ramp(A_SENT, A_SENT + 0.22, ta);
    to.lerp(chosen.group.position, gone); hang(A, replyPose(s), ta, to, Math.max(dock, gone), EMAIL * 1.15 * (1 - 0.06 * dock) * (1 - gone), HOLD_LOW, CURL_A);
    A.email.position.y += Math.sin(Math.PI * dock) * 0.02 * (1 - gone);      // (it swings over in an arc, not a straight slide)      // (it hardly shrinks: "make the email not get so small")
    faceCamera(A.email, cameraA, A.email.scale.x); A.email.rotateZ(-0.04 - 0.06 * dock * s - Math.sin(Math.PI * dock) * 0.14 * s);      // (it leans into the swing)
    opacity(A.email, clamp01(ta / 0.25)); if (A.email.scale.x < 0.02) A.email.visible = false;
    A.thread(ramp(0.05, 0.3, ta) * (1 - ramp(A_SENT - 0.05, A_SENT + 0.05, ta)));
    for (const b of bubbles) {
      const shown = ramp(0.15, 0.5, ta) * (1 - ramp(b === chosen ? 3.7 : A_SENT, b === chosen ? 4.0 : A_SENT + 0.3, ta));
      const near = b === chosen ? dock : 0, pop = b === chosen ? Math.max(0, 1 - Math.abs(ta - A_SENT - 0.08) / 0.18) : 0;
      b.group.quaternion.copy(cameraA.quaternion); b.group.scale.setScalar((0.7 + 0.3 * easeOut(shown)) * (1 + 0.1 * near + 0.18 * pop));
      const isSent = b === chosen && ta >= A_SENT;
      // (it breathed while held at, for a while: now it stays solid, the ring behind it shows the hold, 2026-11-13)
      opacity(b.plain, shown * (isSent ? 0 : 1 - 0.35 * (b === other ? dock : 0))); opacity(b.sent, isSent ? shown : 0);
    }
    const fill = clamp01((ta - 1.4) / (A_SENT - 1.4));
    // the reply's loading ring, in pixels, round the reply itself (2026-11-13: "try moving the loading circle around the reply A";
    // it sat in the open space low and right of the hand before: LOADING)
    const ringLook = A.ring.material as THREE.ShaderMaterial;
    ringLook.uniforms.progress.value = fill; ringLook.uniforms.fade.value = ramp(1.2, 1.45, ta) * (1 - ramp(A_SENT + 0.1, A_SENT + 0.35, ta));
    A.ring.position.copy(chosen.group.position); A.ring.position.z -= 0.006;      // (behind the reply: its corners show past it)
    faceCamera(A.ring, cameraA, RING_ROUND_REPLY * chosen.group.scale.x * (1 + 0.1 * Math.max(0, 1 - Math.abs(ta - A_SENT) / 0.2)));
    A.ring.visible = ringLook.uniforms.fade.value > 0.01;
    glow(A.flash, chosen.group.position, ta - A_SENT, 0.35, 0.12, cameraA);
    A.burst.at(chosen.group.position, ta - A_SENT, 0.6, 0.45);
    A.hand.lit.value = Math.max(0, 1 - Math.abs(ta - A_SENT) / 0.25) * 0.6;

    // ── card two: down by the mic; it hears; recorded
    const near = ramp(0.55, 1.3, tb), into = ramp(SENT, SENT + 0.22, tb);
    to.copy(NEAR_MIC).lerp(MIC, into);
    hang(B, MIC_POSE, tb, to, Math.max(near, into), EMAIL * (1 + 0.3 * near) * (1 - into));      // (it grows as it comes in)
    faceCamera(B.email, cameraB, B.email.scale.x); B.email.rotateZ(-0.04 - near * 0.12);
    opacity(B.email, clamp01(tb / 0.25)); if (B.email.scale.x < 0.02) B.email.visible = false;
    B.thread(ramp(0.05, 0.3, tb) * (1 - ramp(SENT - 0.05, SENT + 0.05, tb)));
    const recording = tb > 1.3 && tb < SENT ? ramp(1.3, 1.5, tb) : 0;
    paintMic(micArt, accentCss, recording, tb); micMap.needsUpdate = true;
    const micShown = ramp(0.1, 0.45, tb) * (1 - ramp(3.7, 4.0, tb)), micPop = Math.max(0, 1 - Math.abs(tb - SENT - 0.08) / 0.18);
    mic.quaternion.copy(cameraB.quaternion); mic.scale.setScalar((0.75 + 0.25 * easeOut(micShown)) * (1 + 0.08 * near + 0.2 * micPop)); opacity(mic, micShown);
    const heard = clamp01((tb - 1.3) / (SENT - 1.3));
    (B.ring.material as THREE.ShaderMaterial).uniforms.progress.value = heard; (B.ring.material as THREE.ShaderMaterial).uniforms.fade.value = ramp(1.15, 1.4, tb) * (1 - ramp(SENT, SENT + 0.2, tb));
    B.ring.position.copy(MIC); B.ring.position.z += 0.004; faceCamera(B.ring, cameraB, 0.16 * (1 + 0.15 * micPop));
    B.ring.visible = (B.ring.material as THREE.ShaderMaterial).uniforms.fade.value > 0.01;
    glow(B.flash, MIC, tb - SENT, 0.35, 0.12, cameraB);
    B.burst.at(MIC, tb - SENT, 0.6, 0.45);
    B.hand.lit.value = Math.max(0, 1 - Math.abs(tb - SENT) / 0.25) * 0.6;

    for (const step of steps) { const [card] = step.dataset.step!.split(':'), span = STEPS[step.dataset.step!], t = card === 'left' ? ta : tb; step.classList.toggle('on', !!span && moving && t >= span[0] && t < span[1]); }

    const box = canvas.getBoundingClientRect();
    renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);
    for (const [view, camera] of [[views.left, cameraA], [views.right, cameraB]] as const) {
      const r = view.getBoundingClientRect(), x = r.left - box.left, y = box.bottom - r.bottom;
      camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
      renderer.setViewport(x, y, r.width, r.height); renderer.setScissor(x, y, r.width, r.height); renderer.render(scene, camera);
    }
  }

  // ── running: card one, then card two
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let moving = false, frame = 0, began = 0;
  const fit = () => {
    const box = canvas.getBoundingClientRect(); if (box.width < 2) return false;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(box.width, box.height, false); return true;
  };
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    if (!fit()) return;
    const t = ((now - began) / 1000) % (2 * TURN);
    host.classList.toggle('still', still.matches);
    if (still.matches) { moving = false; draw(2.2, 2.2); }
    else if (t < TURN) draw(t, 0, 'left');
    else draw(0, t - TURN, 'right');
    canvas.classList.add('ready');
  };
  const guide: HandGuide = {
    start() { if (frame) return; moving = true; began = performance.now(); frame = requestAnimationFrame(tick); },
    stop() { cancelAnimationFrame(frame); frame = 0; moving = false; for (const step of steps) step.classList.remove('on'); cards.left.classList.remove('on'); cards.right.classList.remove('on'); },
    accent(colour) {
      accentCss = colour.trim() || '#f6b3cc';
      tint.value.set(accentCss); hot.value.copy(tint.value).lerp(new THREE.Color('#ffffff'), 0.25);
      A.burst.points.material.color.copy(hot.value); B.burst.points.material.color.copy(hot.value);
      paintCard(cardArt, accentCss); cardMap.needsUpdate = true;
      for (const [where, looks] of Object.entries(bubbleArt)) for (const sent of [false, true]) {
        const one = sent ? looks.sent : looks.plain; paintBubble(one.a, accentCss, sent, where === 'left', where === 'left' ? 'A' : 'B'); one.map.needsUpdate = true;
      }
      const g = backdrop.getContext('2d')!, pool = g.createRadialGradient(128, 138, 0, 128, 138, 180);
      pool.addColorStop(0, `color-mix(in srgb, ${accentCss} 16%, #17141f)`); pool.addColorStop(0.55, '#110f18'); pool.addColorStop(1, '#09080d');
      g.fillStyle = '#110f18'; g.fillRect(0, 0, 256, 256); g.fillStyle = pool; g.fillRect(0, 0, 256, 256); backing.needsUpdate = true;
    },
    frame(ta, tb, lit) { if (fit()) { moving = true; draw(ta, tb, lit); canvas.classList.add('ready'); } },
  };
  guide.accent(getComputedStyle(host).getPropertyValue('--accent'));
  if (import.meta.env.DEV) Object.assign(window, { __reply: { ...guide, cameraA, cameraB, bubbles, mic, setSide: (s: number) => { side = s; } } });
  void easeIn; void smooth; void CARD_W;
  return guide;
}
