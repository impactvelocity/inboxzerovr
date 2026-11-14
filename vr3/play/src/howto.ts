import * as THREE from 'three';
import type { World } from '@iwsdk/core';
import * as PixelFont from './mail/pixelFont';
import { labelEdge, labelGlow, labelGlowRoom, labelLetters } from './pixelLabel';
import { mail } from './mail/source';
import type { GuideScene } from './handguide';

/**
 * How to Play, in VR, before a real game (2026-11-14, asked for: "when playing a "Real" game, we need a quick intro
 * screen before starting the round, maybe shows the level with a quick voice over using the animation cards to explain
 * the parts", "maybe they can slash to skip", "after skipping / watching, it starts the level with announcement, etc",
 * "and stores localstorage to skip in future").
 *
 * A panel stands where the round's title will be, in the level itself: HOW TO PLAY, then the How to Play cards from
 * the home screen (the lit hands of handguide.ts and replyguide.ts, drawn by the game's own renderer into textures),
 * one card lit at a time as the user's voice says its part:
 *
 *   0.5   "How to play Inbox Zero"                                           HOW TO PLAY
 *   3.0   "Grab an email with your left hand to read, throw to keep,         ROUND ONE: the left card
 *          or use your right hand to smash it away"                                    then the right card
 *   9.0   "In round two grab and hover to pick a reply,                      ROUND TWO: the cards turn over; left
 *          or pull close to record your own message"                                   then right
 *  14.6   "Ready? Let's go!"                                                 READY? ... LET'S GO! and it goes
 *
 * A swing through it (the weapon's line, as a letter is cut), spraying it, or X / Space / Enter on a screen slashes it
 * apart and the game starts at once. A game from a code (an agent's round, or the mock one) always has it first; the
 * demo (Just Play, or any game with no code) has it the first time only, until the page is reloaded (2026-11-14:
 * "when playing a round from a code - always play the intro how to play scene, they can always slash to skip / if they
 * play the demo, show it once, and ignore on next demo plays"). `?howto=1` shows it every time (for checks).
 */

/** Has this page had How to Play before a demo game? Kept in memory only: a reload shows it again (2026-11-14: "skipping demo
 *  should just be in memory not localstoage or anything, just during that play"). */
let demoSeen = false;
export const howtoMemory = {
  seen: () => demoSeen,
  remember() { demoSeen = true; },
  forget() { demoSeen = false; },
};
const ALWAYS = new URLSearchParams(location.search).get('howto') === '1';

// ---------------------------------------------------------------- the timeline (seconds from when the panel is placed)
/** The user's lines, and when each starts. Their lengths: 2.35, 5.80, 5.41 and 1.88 s (each about 0.17 s more with the voice effect,
 *  tools/howtovoice.py); the pause in the second is at 3.0, in the third at 2.7; in the last, LET'S GO! is said from 0.81 s.
 *  (2026-11-14: the last was the user's i-ready-letsgo for a while, then their first take again, with the effect.) */
const VOICE = [
  { url: 'audio/howto/how-to-play.mp3', at: 0.5 },
  { url: 'audio/howto/round-one.mp3', at: 3.0 },
  { url: 'audio/howto/round-two.mp3', at: 9.0 },
  { url: 'audio/howto/lets-go.mp3', at: 14.6 },
];
const ROUND_ONE = VOICE[1].at, RIGHT_ONE = ROUND_ONE + 2.6;      // (the right card's blade lights on "right hand" and cuts on "smash")
const ROUND_TWO = VOICE[2].at, RIGHT_TWO = ROUND_TWO + 2.6;      // (the reply is sent just after "reply"; the mic records through "your own message")
const READY = VOICE[3].at, GO = READY + 0.78, END = READY + 1.75, OUT = 0.4;      // (GO just before "Let's go" is said; END as it finishes)
/** A moment for the headset to say where the head is before the panel is put out. */
const SETTLE = 0.35;
const FLIP = 0.42;

// ---------------------------------------------------------------- the panel, in metres
const PX = 0.00085;                     // metres per canvas pixel for the words
const CARD_W = 0.46, CARD_H = 0.58, CARD_X = 0.255, VIEW_W = 0.4, VIEW_H = VIEW_W * 0.92, WORD_Y = 0.236;
const TITLE_Y = 0.43, FOOT_Y = -0.42, AHEAD = 1.6;      // (as far out as the round's own title: roundui.ts place)
/** Where a swing counts as through the panel (its own half sizes, with a margin: a seated player swings from far). */
const HIT_X = 0.62, HIT_Y = 0.56, HIT_SPEED = 1.6, REACH = 1.3;
const ON_ORDER = 30;                    // drawn over the level and anything standing in it

/**
 * What each level's weapon does to an email, for the intro's words (2026-11-14: "make the intro how to play be "Slash, Burn, Chop,
 * etc" based on the level"): the right card's SLASH TO CLEAR and the skip line in VR. A level not named here slashes.
 */
export const WEAPON_VERB: Record<string, string> = { kyoto: 'Slash', office2: 'Smash', castle: 'Slash', lab: 'Spray', space: 'Slash', inferno: 'Burn', lumber: 'Chop' };

const CARDS: Record<'one' | 'two', Record<'left' | 'right', [string, string][]>> = {
  one: { left: [['Grab to read', 'left:0'], ['Throw to keep', 'left:2']], right: [['Grip to arm', 'right:0'], ['Slash to clear', 'right:1']] },
  two: { left: [['Move to choose', 'left:0'], ['Hold to send', 'left:1']], right: [['Bring to mic', 'right:0'], ['Say your reply', 'right:1']] },
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => { const k = clamp01(x); return k * k * (3 - 2 * k); };
const backOut = (x: number) => { const k = clamp01(x) - 1; return 1 + k * k * (2.7 * k + 1.7); };
const approach = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-dt * rate));

interface Opts {
  /** The level's colour and its two label colours (LetterTheme.bar). */
  accent: string; colours: [string, string];
  /** A level with something where the round's title goes moves it (LetterTheme.intro): up, nearer, smaller. */
  at?: { up: number; nearer: number; size: number };
  /** In a headset: "slash to skip"; on a screen: "press X to skip". */
  vr: boolean;
  /** The level's verb for its weapon (WEAPON_VERB): SLASH, BURN, CHOP... */
  verb?: string;
  /**
   * Skipped: the parts given over to the game's letters to be cut (or burnt, melted) like an email (letters.breakApart). Without it
   * the parts fly apart on their own, as before.
   */
  breakApart?(parts: BreakPart[], at: THREE.Vector3, along: THREE.Vector3, push: THREE.Vector3): void;
  /** It is over (seen or skipped): the game can begin. */
  done(): void;
}
/** The weapon, as the letters see it (blade.ts): the ends of what hits things, and how fast the tip is going. */
interface BladeLike { moving: boolean; tip: THREE.Vector3; base: THREE.Vector3; velocity: THREE.Vector3; speed: number }
/** A sprayer's nozzle and trigger (letters.ts SprayTool). */
interface ToolLike { origin: THREE.Vector3; direction: THREE.Vector3; on: number; valid: boolean }
interface Sounds { play(name: string, pitch?: number, volume?: number, at?: THREE.Vector3): void }
/** One part of the panel as a picture, w by h metres, where `matrix` puts it in the world. */
export interface BreakPart { canvas: HTMLCanvasElement; w: number; h: number; matrix: THREE.Matrix4 }

/** A word in the pixel letters, in the level's label look (pixelLabel.ts), as a flat thing that can change its words. */
function label(cell: number, colours: [string, string]) {
  const canvas = document.createElement('canvas'), texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material); mesh.renderOrder = ON_ORDER + 5;
  const holder = new THREE.Group(); holder.add(mesh);
  let text = '', size = cell, look = colours;
  return {
    holder, material, canvas,
    get text() { return text; },
    set(next: string, nextCell = size, nextColours = look) {
      if (next === text && nextCell === size && nextColours === look) return;
      text = next; size = nextCell; look = nextColours;
      const upper = next.toUpperCase(), room = labelGlowRoom(size) + labelEdge(size);
      canvas.width = Math.max(4, PixelFont.width(upper, size) + room * 2); canvas.height = PixelFont.Rows * size + room * 2 + labelEdge(size);
      const g = canvas.getContext('2d')!; g.clearRect(0, 0, canvas.width, canvas.height);
      labelGlow(g, upper, room, room, size, look, 0.8); labelLetters(g, upper, room, room, size, look);
      texture.dispose(); texture.needsUpdate = true;
      mesh.scale.set(canvas.width * PX, canvas.height * PX, 1);
    },
    dispose() { texture.dispose(); material.dispose(); mesh.geometry.dispose(); },
  };
}

/** A card's box, in pixels: corners stepped off twice, as the home screen's pixel boxes are (style.css .pixbox). */
function steppedBox(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, s: number) {
  g.fillRect(x + 2 * s, y, w - 4 * s, h); g.fillRect(x + s, y + s, w - 2 * s, h - 2 * s); g.fillRect(x, y + 2 * s, w, h - 4 * s);
}
function canvasTexture(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d')!, w, h);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
const flat = (map: THREE.Texture | null, w: number, h: number, order: number, blending: THREE.Blending = THREE.NormalBlending) => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map, transparent: true, depthTest: false, depthWrite: false, blending }));
  mesh.renderOrder = order; return mesh;
};
const opacity = (mesh: THREE.Mesh, a: number) => { (mesh.material as THREE.MeshBasicMaterial).opacity = a; mesh.visible = a > 0.005; };

export function createHowto(world: World, sounds: Sounds) {
  const root = new THREE.Group(); root.name = 'How to Play'; root.visible = false;
  world.createTransformEntity(root);
  const panel = new THREE.Group(); root.add(panel);

  // ---- the shared pictures
  const S = 6, FW = Math.round(CARD_W / PX), FH = Math.round(CARD_H / PX);
  const faceMap = canvasTexture((g, w, h) => {
    // (see-through, as on the home screen's How to Play: 2026-11-14, "make the cards of how to play be transparent like in the how to play menu")
    g.fillStyle = '#09080d66'; steppedBox(g, S, S, w - 2 * S, h - 2 * S, S);
    g.fillStyle = '#ffffff12'; g.fillRect(3 * S, 2 * S, w - 6 * S, S * 0.5);      // (the bevel: light along the top, dark along the bottom)
    g.fillStyle = '#00000040'; g.fillRect(3 * S, h - 2.6 * S, w - 6 * S, S * 0.6);
  }, FW, FH);
  const edgeMap = canvasTexture((g, w, h) => {
    g.fillStyle = '#ffffff'; steppedBox(g, 0, 0, w, h, S);
    g.globalCompositeOperation = 'destination-out'; steppedBox(g, S, S, w - 2 * S, h - 2 * S, S);
  }, FW, FH);
  const glowMap = canvasTexture((g, w, h) => {
    const fade = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    fade.addColorStop(0, '#ffffffff'); fade.addColorStop(0.45, '#ffffff66'); fade.addColorStop(1, '#ffffff00');
    g.fillStyle = fade; g.fillRect(0, 0, w, h);
  }, 128, 128);
  const shadowMap = canvasTexture((g, w, h) => {
    const fade = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    fade.addColorStop(0, '#05040acc'); fade.addColorStop(0.6, '#05040a70'); fade.addColorStop(1, '#05040a00');
    g.fillStyle = fade; g.fillRect(0, 0, w, h);
  }, 128, 128);
  const streakMap = canvasTexture((g, w, h) => {
    const along = g.createLinearGradient(0, 0, w, 0); along.addColorStop(0, '#ffffff00'); along.addColorStop(0.5, '#ffffffff'); along.addColorStop(1, '#ffffff00');
    g.fillStyle = along; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in';
    const across = g.createLinearGradient(0, 0, 0, h); across.addColorStop(0, '#ffffff00'); across.addColorStop(0.5, '#ffffffff'); across.addColorStop(1, '#ffffff00');
    g.fillStyle = across; g.fillRect(0, 0, w, h);
  }, 256, 32);

  // the skip line's plate: a dark stepped box with an outline in the level's colour (2026-11-14: "make the slash to skip more clear")
  const plateFaceMap = canvasTexture((g, w, h) => { g.fillStyle = '#09080dd9'; steppedBox(g, 4, 4, w - 8, h - 8, 4); }, 512, 96);
  const plateEdgeMap = canvasTexture((g, w, h) => {
    g.fillStyle = '#ffffff'; steppedBox(g, 0, 0, w, h, 4);
    g.globalCompositeOperation = 'destination-out'; steppedBox(g, 4, 4, w - 8, h - 8, 4);
  }, 512, 96);

  const shadow = flat(shadowMap, 1.75, 1.45, ON_ORDER); shadow.position.z = -0.02; panel.add(shadow);

  // ---- the cards: each its box, a glow behind it while lit, its window onto the hands, and its two lines of words
  type Card = { side: 'left' | 'right'; group: THREE.Group; glow: THREE.Mesh; face: THREE.Mesh; edge: THREE.Mesh; view: THREE.Mesh;
    words: ReturnType<typeof label>[]; wordLit: number[]; lit: number; shown: number; vel: THREE.Vector3; spin: THREE.Vector3 };
  const cards: Card[] = (['left', 'right'] as const).map(side => {
    const group = new THREE.Group(); group.position.x = side === 'left' ? -CARD_X : CARD_X; panel.add(group);
    const glow = flat(glowMap, CARD_W * 1.7, CARD_H * 1.5, ON_ORDER + 1, THREE.AdditiveBlending);
    const face = flat(faceMap, CARD_W, CARD_H, ON_ORDER + 2), view = flat(null, VIEW_W, VIEW_H, ON_ORDER + 3), edge = flat(edgeMap, CARD_W, CARD_H, ON_ORDER + 4);
    (view.material as THREE.MeshBasicMaterial).color.set('#110f18');
    // the hands are drawn on a clear target (no backdrop), so its colours come premultiplied: blend them as such
    { const m = view.material as THREE.MeshBasicMaterial; m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor; }
    group.add(glow, face, view, edge);
    const words = [label(5, ['#f6b3cc', '#f6b3cc']), label(5, ['#f6b3cc', '#f6b3cc'])];
    words[0].holder.position.y = WORD_Y; words[1].holder.position.y = -WORD_Y; group.add(words[0].holder, words[1].holder);
    return { side, group, glow, face, edge, view, words, wordLit: [0, 0], lit: 0, shown: 0, vel: new THREE.Vector3(), spin: new THREE.Vector3() };
  });
  const title = label(11, ['#f6b3cc', '#f6b3cc']); title.holder.position.y = TITLE_Y; panel.add(title.holder);
  const foot = label(4, ['#f6b3cc', '#f6b3cc']); foot.holder.position.y = FOOT_Y; panel.add(foot.holder);
  const plateFace = flat(plateFaceMap, 1, 1, ON_ORDER + 4), plateEdge = flat(plateEdgeMap, 1, 1, ON_ORDER + 4);
  const plateSwipe = flat(streakMap, 1, 1, ON_ORDER + 6, THREE.AdditiveBlending);
  plateFace.position.z = -0.002; plateEdge.position.z = -0.001; plateSwipe.position.z = 0.002;
  foot.holder.add(plateFace, plateEdge, plateSwipe);
  /** The plate sized to the skip words. */
  const fitPlate = () => {
    const words = foot.holder.children[0] as THREE.Mesh, w = words.scale.x * 0.92 + 0.07, h = words.scale.y * 0.78 + 0.03;
    for (const m of [plateFace, plateEdge]) m.scale.set(w, h, 1);
    return { w, h };
  };
  let plate = { w: 0.4, h: 0.08 };
  const streak = flat(streakMap, 1, 1, ON_ORDER + 8, THREE.AdditiveBlending); panel.add(streak); streak.visible = false;
  const pieces = [title.holder, cards[0].group, cards[1].group, foot.holder];
  const pieceMotion = new Map<THREE.Object3D, { vel: THREE.Vector3; spin: THREE.Vector3 }>();

  // ---- the hands: both rounds' guides, built once (their models are fetched), each card drawn into its own texture
  let scenes: { one: GuideScene; two: GuideScene } | null = null;
  let building: Promise<void> | null = null;
  const half = world.renderer.extensions.has('EXT_color_buffer_float') || world.renderer.extensions.has('EXT_color_buffer_half_float');
  // (8-bit and 2x MSAA, not half float and 4x, since 2026-11-14: on the Quest every pass into these costs frame time, and a dropped
  //  frame shows as the held weapon lagging and jumping while the world is re-projected smoothly; "the weapon will change position
  //  randomly" while the intro played)
  void half;
  const target = () => new THREE.WebGLRenderTarget(448, Math.round(448 * 0.92), { type: THREE.UnsignedByteType, samples: 2 });
  const targets = { one: { left: target(), right: target() }, two: { left: target(), right: target() } };
  let paintTick = 0;
  /** Each card's time when it was last drawn ('one:left' and so on), so a card that has not moved is not drawn again. */
  const painted = new Map<string, number>();
  /** Draw a round's two cards into their textures with the game's renderer (outside VR's own cameras for the moment). */
  function paint(round: 'one' | 'two', tl: number, tr: number, which: 'left' | 'right' | 'both' = 'both') {
    const guide = scenes?.[round]; if (!guide) return;
    const r = world.renderer, xr = r.xr.enabled, before = r.getRenderTarget();
    guide.pose(tl, tr);
    r.xr.enabled = false;
    const clear = r.getClearColor(new THREE.Color()), clearAlpha = r.getClearAlpha();
    r.setClearColor(0x000000, 0);      // (see-through around the hands)
    try {
      for (const side of ['left', 'right'] as const) {
        if (which !== 'both' && which !== side) continue;
        const camera = guide.cameras[side]; camera.aspect = 1 / 0.92; camera.updateProjectionMatrix();
        r.setRenderTarget(targets[round][side]); r.clear(true, true, false); r.render(guide.scene, camera);
      }
    } finally { r.setRenderTarget(before); r.xr.enabled = xr; r.setClearColor(clear, clearAlpha); }
  }
  /** Fetch the hands and make the guides (in the background, as soon as a real game is ready to play). */
  function prepare() {
    building ??= Promise.all([import('./handguide').then(m => m.buildSortScene()), import('./replyguide').then(m => m.buildReplyScene())])
      .then(([one, two]) => {
        one.scene.background = null; two.scene.background = null;      // (no dark backdrop: the card shows the level through it, as on the home screen)
        scenes = { one, two };
        if (run) { one.accent(run.opts.accent); two.accent(run.opts.accent); }      // (made after this run began)
        // draw each once now, so their shaders are made here and not in the first moments in VR
        paint('one', 0, 0); paint('two', 0, 0);
      })
      .catch(error => { console.warn('How to Play: the hands could not be made; the cards show their words alone', error); });
    return building;
  }

  // ---- the voice
  const base = import.meta.env.BASE_URL;
  const clips = VOICE.map(line => { const clip = new Audio(`${base}${line.url}`); clip.preload = 'auto'; return clip; });
  const hush = () => { for (const clip of clips) { clip.pause(); try { clip.currentTime = 0; } catch { /* not loaded */ } } };

  // ---- a run
  let run: null | { opts: Opts; t: number; placed: boolean; said: boolean[]; round: 'one' | 'two'; flipFrom: number; titleText: string; titlePop: number;
    skip: { at: number; point: THREE.Vector2; dir: THREE.Vector2 } | null; aimed: number; demo: boolean } = null;
  const prevBase = new THREE.Vector3(), prevTip = new THREE.Vector3(), nowBase = new THREE.Vector3(), nowTip = new THREE.Vector3();
  let hadBlade = false;
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), p0 = new THREE.Vector3(), p1 = new THREE.Vector3();

  let verb = 'Slash';
  function setRound(round: 'one' | 'two', colours: [string, string]) {
    for (const card of cards) {
      const lines = CARDS[round][card.side];
      card.words.forEach((word, i) => word.set(lines[i][0].replace(/^Slash\b/, verb), wordCell(), colours));      // (the level's own verb: BURN TO CLEAR, CHOP TO CLEAR)
      (card.view.material as THREE.MeshBasicMaterial).map = scenes ? targets[round][card.side].texture : null;
      (card.view.material as THREE.MeshBasicMaterial).needsUpdate = true;
    }
  }
  /** One size for every card word: as big as the longest fits across a card. */
  const wordCell = () => {
    const longest = Math.max(...Object.values(CARDS).flatMap(r => Object.values(r).flatMap(lines => lines.map(([text]) => PixelFont.widthCells(text.toUpperCase())))));
    return Math.max(3, Math.min(6, Math.floor((CARD_W * 0.88) / PX / (longest + 4))));
  };

  function place(head: THREE.Vector3, at?: Opts['at']) {
    root.position.set(head.x * 0.7, head.y - 0.06 + (at?.up ?? 0), head.z - AHEAD + (at?.nearer ?? 0));
    root.lookAt(head.x, head.y - 0.04, head.z);
    root.scale.setScalar(at?.size ?? 1);
    root.updateMatrixWorld(true);
  }

  function finish(skipped: boolean) {
    if (!run) return;
    const { done } = run.opts;
    if (run.demo) howtoMemory.remember();
    hush(); root.visible = false; run = null; hadBlade = false;
    void skipped;
    done();
  }

  /** Slashed (or skipped from the keyboard): the panel comes apart along the cut, and the game starts. */
  function slash(point: THREE.Vector2, dir: THREE.Vector2) {
    if (!run || run.skip) return;
    if (dir.lengthSq() < 1e-6) dir.set(1, -0.35);
    dir.normalize();
    run.skip = { at: run.t, point: point.clone(), dir: dir.clone() };
    hush();
    const normal = new THREE.Vector2(-dir.y, dir.x);
    for (const piece of pieces) {
      const c = new THREE.Vector2(piece.position.x, piece.position.y).sub(point);
      const side = Math.sign(c.dot(normal)) || (Math.random() < 0.5 ? -1 : 1);
      pieceMotion.set(piece, {
        vel: new THREE.Vector3(normal.x * side * 0.75 + dir.x * 0.3, normal.y * side * 0.75 + dir.y * 0.3, 0.25),
        spin: new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, side * (1.4 + Math.random())),
      });
    }
    if (run.opts.breakApart) handOver(point, dir);
    streak.visible = true; streak.position.set(point.x, point.y, 0.03); streak.rotation.set(0, 0, Math.atan2(dir.y, dir.x)); streak.scale.set(0.01, 0.05, 1);
    v1.set(point.x, point.y, 0); root.localToWorld(v1);
    sounds.play('slash1', 1, 1, v1); sounds.play('swoosh2', 0.9, 0.55, v1);
    const session = world.renderer.xr.getSession();
    if (session) for (const source of session.inputSources) {
      if (source.handedness !== 'right') continue;
      const pad = source.gamepad as (Gamepad & { hapticActuators?: { pulse?(value: number, duration: number): Promise<boolean> }[] }) | undefined;
      try { void pad?.hapticActuators?.[0]?.pulse?.(0.8, 60)?.catch(() => undefined); } catch { /* no rumble */ }
    }
  }

  /**
   * The panel's parts as pictures, handed to the game's letters at the hit (2026-11-14: "would be fun if they could be cut up / burn
   * like other things"): the title, each card (its box, its outline lit or not, its two lines of words; not the hands) and the skip
   * plate with its words. Then the panel's own parts are hidden: the letters' pieces are what is seen.
   */
  function handOver(point: THREE.Vector2, dir: THREE.Vector2) {
    if (!run?.opts.breakApart) return;
    root.updateMatrixWorld(true);
    const parts: BreakPart[] = [], sc = new THREE.Vector3(), ps = new THREE.Vector3(), qu = new THREE.Quaternion();
    const size = (o: THREE.Object3D) => { o.matrixWorld.decompose(ps, qu, sc); return sc; };
    // the title, as its own picture
    if (title.material.opacity > 0.05) { const mesh = title.holder.children[0]; const k = size(mesh); parts.push({ canvas: title.canvas, w: k.x, h: k.y, matrix: mesh.matrixWorld.clone() }); }
    // each card: its box, outline and words drawn into one picture
    for (const card of cards) {
      if (!card.face.visible || (card.face.material as THREE.MeshBasicMaterial).opacity < 0.05) continue;
      const k = size(card.group), canvas = document.createElement('canvas'); canvas.width = FW; canvas.height = FH;
      const g = canvas.getContext('2d')!;
      g.fillStyle = '#' + (card.edge.material as THREE.MeshBasicMaterial).color.getHexString(); steppedBox(g, 0, 0, FW, FH, S);
      g.fillStyle = '#0d0b14'; steppedBox(g, S, S, FW - 2 * S, FH - 2 * S, S);
      card.words.forEach((word, i) => { const c = word.canvas; g.drawImage(c, (FW - c.width) / 2, FH / 2 + (i === 0 ? -1 : 1) * WORD_Y / PX - c.height / 2); });
      parts.push({ canvas, w: CARD_W * k.x, h: CARD_H * k.y, matrix: card.group.matrixWorld.clone() });
    }
    // the skip plate and its words
    if (foot.material.opacity > 0.05) {
      const k = size(foot.holder), pw = Math.round(plate.w / PX), ph = Math.round(plate.h / PX), canvas = document.createElement('canvas'); canvas.width = pw; canvas.height = ph;
      const g = canvas.getContext('2d')!;
      g.fillStyle = run.opts.accent; steppedBox(g, 0, 0, pw, ph, 4); g.fillStyle = '#09080d'; steppedBox(g, 4, 4, pw - 8, ph - 8, 4);
      g.drawImage(foot.canvas, (pw - foot.canvas.width) / 2, (ph - foot.canvas.height) / 2);
      parts.push({ canvas, w: plate.w * k.x, h: plate.h * k.y, matrix: foot.holder.matrixWorld.clone() });
    }
    const at = new THREE.Vector3(point.x, point.y, 0); root.localToWorld(at);
    const along = new THREE.Vector3(dir.x, dir.y, 0).transformDirection(root.matrixWorld);
    const push = along.clone().multiplyScalar(4).add(new THREE.Vector3(0, 0.6, 0));
    run.opts.breakApart(parts, at, along, push);
    // the panel's own parts go at once (the shadow and the streak fade as before)
    for (const piece of pieces) piece.visible = false;
    pieceMotion.clear();
  }

  /** Did the weapon's line go through the panel this frame (fast enough to be a swing)? Its point and way across, in the panel's own plane. */
  function bladeThrough(blade: BladeLike): { point: THREE.Vector2; dir: THREE.Vector2 } | null {
    if (!blade.moving) { hadBlade = false; return null; }
    // the line goes on past the tip, as a letter's cut does once it is in focus (letters.ts): a seated player swings from far
    v1.subVectors(blade.tip, blade.base); const long = v1.length(); if (long < 1e-4) return null;
    nowBase.copy(blade.base); nowTip.copy(blade.base).addScaledVector(v1, (long + REACH) / long);
    root.worldToLocal(nowBase); root.worldToLocal(nowTip);
    let hit: { point: THREE.Vector2; dir: THREE.Vector2 } | null = null;
    if (hadBlade && blade.speed > HIT_SPEED) {
      const inside = (x: number, y: number) => Math.abs(x) < HIT_X && Math.abs(y) < HIT_Y;
      // the line's sweep from last frame to this one, crossing the panel's plane
      for (let i = 0; i <= 12 && !hit; i++) {
        const s = i / 12; p0.lerpVectors(prevBase, prevTip, s); p1.lerpVectors(nowBase, nowTip, s);
        if ((p0.z > 0) === (p1.z > 0)) continue;
        const k = p0.z / (p0.z - p1.z), x = p0.x + (p1.x - p0.x) * k, y = p0.y + (p1.y - p0.y) * k;
        if (inside(x, y)) hit = { point: new THREE.Vector2(x, y), dir: new THREE.Vector2(p1.x - p0.x, p1.y - p0.y) };
      }
      // or the line itself through it, moving fast
      if (!hit && (nowBase.z > 0) !== (nowTip.z > 0)) {
        const k = nowBase.z / (nowBase.z - nowTip.z), x = nowBase.x + (nowTip.x - nowBase.x) * k, y = nowBase.y + (nowTip.y - nowBase.y) * k;
        if (inside(x, y)) { v2.copy(blade.velocity).transformDirection(root.matrixWorld.clone().invert()); hit = { point: new THREE.Vector2(x, y), dir: new THREE.Vector2(v2.x, v2.y) }; }
      }
    }
    prevBase.copy(nowBase); prevTip.copy(nowTip); hadBlade = true;
    return hit;
  }
  /** A sprayer held on the panel, trigger down, for a moment. */
  function sprayedOn(tool: ToolLike, dt: number): { point: THREE.Vector2; dir: THREE.Vector2 } | null {
    if (!run || !tool.valid || tool.on < 0.5) { if (run) run.aimed = 0; return null; }
    p0.copy(tool.origin); root.worldToLocal(p0); p1.copy(tool.origin).add(tool.direction); root.worldToLocal(p1); p1.sub(p0);
    if (p1.z >= -1e-4) { run.aimed = 0; return null; }
    const k = -p0.z / p1.z, x = p0.x + p1.x * k, y = p0.y + p1.y * k;
    if (Math.abs(x) > HIT_X || Math.abs(y) > HIT_Y) { run.aimed = 0; return null; }
    run.aimed += dt;
    return run.aimed > 0.2 ? { point: new THREE.Vector2(x, y), dir: new THREE.Vector2(1, -0.3) } : null;
  }

  return {
    /** Should How to Play come before the game about to start? Always before a game from a code; before the demo, the first time. */
    wanted: () => ALWAYS || mail.roundReady() || !howtoMemory.seen(),
    get running() { return !!run; },
    /** Seconds into the timeline above (-1 when not running), for checks. */
    get time() { return run ? run.t - SETTLE : -1; },
    prepare,
    start(opts: Opts) {
      void prepare();
      run = { opts, t: 0, placed: false, said: VOICE.map(() => false), round: 'one', flipFrom: -1, titleText: '', titlePop: 0, skip: null, aimed: 0, demo: !mail.roundReady() };
      for (const scene of [scenes?.one, scenes?.two]) scene?.accent(opts.accent);
      const words: [string, string] = [opts.colours[0], opts.colours[1]];
      verb = opts.verb ?? 'Slash';
      title.set('How to Play', 13, words); foot.set(opts.vr ? `${verb} here to skip` : 'Press X to skip', 6, words); plate = fitPlate();
      for (const m of [plateFace, plateEdge, plateSwipe]) (m.material as THREE.MeshBasicMaterial).color.set(m === plateFace ? '#ffffff' : opts.accent);
      setRound('one', words);
      for (const card of cards) { card.lit = 0; card.shown = 0; card.wordLit = [0, 0]; card.group.rotation.set(0, 0, 0); card.group.position.set(card.side === 'left' ? -CARD_X : CARD_X, 0, 0); card.group.scale.setScalar(0.001); }
      title.holder.position.set(0, 0, 0); title.holder.rotation.set(0, 0, 0); foot.holder.position.set(0, FOOT_Y, 0); foot.holder.rotation.set(0, 0, 0);
      pieceMotion.clear(); streak.visible = false; hadBlade = false; painted.clear();
      for (const piece of pieces) piece.visible = true;
      root.visible = false; panel.scale.setScalar(1);
    },
    /** Left before the end (the player left VR, or the menu): gone, nothing remembered. */
    stop() { if (!run) return; hush(); root.visible = false; run = null; hadBlade = false; },
    /** Skip from the keyboard (X, Space, Enter on a screen). */
    skip() { if (run && run.placed) slash(new THREE.Vector2(0.08, 0.05), new THREE.Vector2(1, -0.35)); },

    update(dt: number, head: THREE.Vector3, blade: BladeLike | null, tool: ToolLike | null) {
      if (!run) return;
      run.t += dt;
      if (!run.placed) {
        if (run.t < SETTLE || !Number.isFinite(head.x + head.y + head.z)) return;
        place(head, run.opts.at); run.placed = true; root.visible = true;
        sounds.play('blip', 1.1, 0.35);
      }
      const T = run.t - SETTLE, colours = run.opts.colours;

      // ---- slashed: the pieces fly apart and fall, the streak flares; then the game
      if (run.skip) {
        const age = run.t - run.skip.at;
        for (const [piece, m] of pieceMotion) {
          piece.position.addScaledVector(m.vel, dt); m.vel.y -= 1.6 * dt;
          piece.rotation.x += m.spin.x * dt; piece.rotation.y += m.spin.y * dt; piece.rotation.z += m.spin.z * dt;
        }
        const fade = 1 - ease(age / 0.6);
        for (const card of cards) { opacity(card.face, fade); opacity(card.edge, fade); opacity(card.view, fade); opacity(card.glow, 0.35 * fade * card.lit); for (const w of card.words) w.material.opacity = fade; }
        title.material.opacity = fade; foot.material.opacity = fade; opacity(plateFace, fade); opacity(plateEdge, fade); opacity(plateSwipe, 0); opacity(shadow, 0.4 * fade);
        const flare = clamp01(age / 0.07);
        streak.scale.set(0.01 + 1.8 * flare, 0.06 * (1 - 0.6 * clamp01(age / 0.3)), 1); opacity(streak, 1 - ease((age - 0.05) / 0.3));
        if (age > 0.65) finish(true);
        return;
      }

      // ---- the voice, on its marks
      VOICE.forEach((line, i) => {
        if (run!.said[i] || T < line.at) return;
        run!.said[i] = true;
        const clip = clips[i]; try { clip.currentTime = 0; } catch { /* not loaded yet */ }
        void clip.play().catch(() => undefined);      // (no voice allowed: the cards still play their parts)
      });

      // ---- the title: HOW TO PLAY, ROUND ONE, ROUND TWO, READY?, LET'S GO!
      const titleText = T < ROUND_ONE ? 'How to Play' : T < ROUND_TWO ? 'Round One' : T < READY ? 'Round Two' : T < GO ? 'Ready?' : "Let's go!";
      // (2026-11-14: HOW TO PLAY in the middle, fading away before the cards come in; READY? and LET'S GO! in the middle too, as the cards go)
      const middle = T < ROUND_ONE || T >= READY;
      if (titleText !== run.titleText) { run.titleText = titleText; title.set(titleText, middle ? 13 : 11, colours); run.titlePop = 0; if (T > 0.2) sounds.play('blip', T >= GO ? 1.5 : 1.25, 0.3); }
      run.titlePop += dt;
      const titleIn = T < 0 ? 0 : backOut(run.titlePop / 0.35);
      title.holder.scale.setScalar((0.6 + 0.4 * titleIn) * (T >= GO ? 1.12 : 1));
      title.holder.position.set(0, middle ? 0.02 : TITLE_Y, 0.03);
      const firstAway = T < ROUND_ONE ? 1 - ease((T - (ROUND_ONE - 0.5)) / 0.4) : 1;
      title.material.opacity = clamp01(T / 0.25) * firstAway * (1 - ease((T - END) / OUT));

      // ---- the cards: in with ROUND ONE, over to ROUND TWO, away at READY
      if (T >= ROUND_TWO - 0.15 && run.round === 'one') { run.round = 'two'; run.flipFrom = T; sounds.play('swoosh1', 1.2, 0.35); }
      const flip = run.flipFrom >= 0 ? clamp01((T - run.flipFrom) / FLIP) : 1;
      if (run.flipFrom >= 0 && flip >= 0.5 && cards[0].words[0].text !== CARDS.two.left[0][0]) setRound('two', colours);
      const leave = ease((T - READY) / 0.3);
      cards.forEach((card, i) => {
        // in once HOW TO PLAY has gone: each rises from below and swings round from its own side, the right a beat after the left
        const inAt = ROUND_ONE + 0.08 + i * 0.12, k = clamp01((T - inAt) / 0.55), popped = backOut((T - inAt) / 0.5) * (T >= inAt ? 1 : 0), swing = 1 - ease(k);
        if (T >= inAt && card.shown === 0) { card.shown = 1; sounds.play('blip', 1.35 + i * 0.12, 0.25); }
        const turn = flip < 0.5 ? ease(flip * 2) * Math.PI / 2 : -(1 - ease((flip - 0.5) * 2)) * Math.PI / 2;
        card.group.rotation.y = (run!.flipFrom >= 0 && flip < 1 ? turn * (card.side === 'left' ? 1 : -1) : 0) + swing * 0.9 * (card.side === 'left' ? 1 : -1);
        card.group.rotation.z = swing * 0.25 * (card.side === 'left' ? 1 : -1);
        // lit: the left card, then the right, each round
        const leftOn = (T >= ROUND_ONE && T < RIGHT_ONE) || (T >= ROUND_TWO && T < RIGHT_TWO), rightOn = (T >= RIGHT_ONE && T < ROUND_TWO - 0.15) || (T >= RIGHT_TWO && T < READY);
        card.lit = approach(card.lit, (card.side === 'left' ? leftOn : rightOn) ? 1 : 0, 9, dt);
        const s = Math.max(0.001, popped * (1 + 0.035 * card.lit) * (1 - 0.6 * leave));
        card.group.scale.setScalar(s);
        card.group.position.set((card.side === 'left' ? -1 : 1) * (CARD_X + 0.18 * leave + 0.12 * swing), -0.16 * swing + 0.012 * card.lit, 0.02 * card.lit);
        const a = clamp01(popped) * (1 - leave);
        opacity(card.face, a); opacity(card.view, a); opacity(card.edge, a); opacity(card.glow, a * (0.1 + 0.25 * card.lit));      // (a pool of the level's colour behind the hands, brighter while lit)
        (card.edge.material as THREE.MeshBasicMaterial).color.set('#2b2735').lerp(new THREE.Color(run!.opts.accent), card.lit);
        (card.glow.material as THREE.MeshBasicMaterial).color.set(run!.opts.accent);
        (card.view.material as THREE.MeshBasicMaterial).color.setScalar((0.42 + 0.58 * card.lit) * a);      // (premultiplied: faded by its colour too)
        if (!(card.view.material as THREE.MeshBasicMaterial).map) (card.view.material as THREE.MeshBasicMaterial).color.set('#110f18');
        // its words light as their part plays
        const round = run!.round, guide = scenes?.[round];
        const t = card.side === 'left' ? (round === 'one' ? T - ROUND_ONE : T - ROUND_TWO) : (round === 'one' ? T - RIGHT_ONE : T - RIGHT_TWO);
        card.words.forEach((word, k) => {
          const step = CARDS[round][card.side][k][1], span = guide?.steps[step] ?? (k === 0 ? [0.4, 1.4] : [1.4, 2.8]);
          const on = card.lit > 0.5 && t >= span[0] && t < span[1] ? 1 : 0;
          card.wordLit[k] = approach(card.wordLit[k], on, 12, dt);
          word.holder.scale.setScalar(1 + 0.18 * card.wordLit[k]);
          word.material.opacity = a * (0.45 + 0.55 * Math.max(card.wordLit[k], 0.35 * card.lit));
        });
      });

      // ---- the hands: each card at its own time (a card not yet playing waits at its start; one done rests at its end)
      if (scenes && T >= ROUND_ONE - 0.1 && T < READY + 0.35) {
        const round = run.round, loops = scenes[round].loops;
        const tl = Math.min(loops.left, Math.max(0, T - (round === 'one' ? ROUND_ONE : ROUND_TWO))), tr = Math.min(loops.right, Math.max(0, T - (round === 'one' ? RIGHT_ONE : RIGHT_TWO)));
        // (only what changed, and the moving card at half the frame rate: a card resting at its start or end is not drawn again;
        //  2026-11-14, to keep the Quest at its frame rate while the intro plays)
        paintTick++;
        for (const side of ['left', 'right'] as const) {
          const t = side === 'left' ? tl : tr, key = `${round}:${side}`, lastT = painted.get(key);
          if (lastT !== undefined && Math.abs(lastT - t) < 1e-4) continue;      // (still: its picture stands)
          if (lastT !== undefined && (paintTick + (side === 'left' ? 0 : 1)) % 2) continue;      // (moving: every other frame, the two cards taking turns)
          painted.set(key, t); paint(round, tl, tr, side);
        }
        for (const card of cards) { const m = card.view.material as THREE.MeshBasicMaterial; if (m.map !== targets[round][card.side].texture) { m.map = targets[round][card.side].texture; m.needsUpdate = true; } }
      }

      // ---- the rest: the shadow behind, the skip line under it, and the whole going at the end
      opacity(shadow, 0.4 * clamp01(T / 0.3) * (1 - ease((T - END) / OUT)));      // (light: the level shows through the cards)
      // the skip line: bright on its plate, a slash of light sweeping across it every 1.6 s (2026-11-14: "make the slash to skip more clear")
      const footA = clamp01((T - 0.6) / 0.4) * (1 - ease((T - READY) / 0.3));
      foot.material.opacity = footA * (0.85 + 0.15 * Math.sin(T * 4)); opacity(plateFace, footA); opacity(plateEdge, footA * (0.7 + 0.3 * Math.sin(T * 4)));
      const sweep = ((T - 0.6) % 1.6) / 0.45;
      if (sweep >= 0 && sweep <= 1) {
        plateSwipe.position.set((sweep - 0.5) * plate.w * 1.1, 0, 0.002); plateSwipe.rotation.z = -1.1;
        plateSwipe.scale.set(plate.h * 2.2, 0.035, 1); opacity(plateSwipe, footA * Math.sin(Math.PI * sweep));
      } else opacity(plateSwipe, 0);
      const out = ease((T - END) / OUT);
      panel.scale.setScalar(1 + 0.22 * out);
      if (T >= END + OUT) { sounds.play('swoosh3', 1, 0.4); finish(false); return; }

      // ---- slash to skip: the weapon's line through the panel, or the sprayer on it
      if (T > 0.3 && T < END) {
        const through = blade ? bladeThrough(blade) : null, sprayed = !through && tool ? sprayedOn(tool, dt) : null;
        const hit = through ?? sprayed;
        if (hit) slash(hit.point, hit.dir);
      }
    },
    dispose() {
      hush(); for (const card of cards) for (const w of card.words) w.dispose(); title.dispose(); foot.dispose();
      for (const set of Object.values(targets)) for (const rt of Object.values(set)) rt.dispose();
      for (const map of [faceMap, edgeMap, glowMap, shadowMap, streakMap, plateFaceMap, plateEdgeMap]) map.dispose();
    },
  };
}

export type Howto = ReturnType<typeof createHowto>;
