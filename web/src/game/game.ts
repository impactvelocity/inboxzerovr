import * as THREE from 'three';
import { flipPoint, flipQuaternion, type Game, type GameContext } from '../api';
import * as CardArt from './cardArt';
import { hex, Look, toLinear, White, type Rgba } from './color';
import { Categories, type Email } from './emails';
import { Hand, HandVisual, IndexKnuckle, IndexTip, LittleKnuckle, makeReading, MiddleKnuckle, MiddleTip, ThumbTip, Wrist, XrInput, type Side } from './hands';
import { DesktopInput, HintBar } from './input';
import { BladeTrail, Boom, CardSplit, HitFx, Sparks } from './juice';
import { GlowMaterial, InkMaterial, LabelMaterial, neonRoundRect, quad, softDisc } from './look';
import { clamp, clamp01, Deg2Rad, ease, euler, Forward, fromTo, inverseTransformPoint, lerp, lookRotation, moveTowards, pick, range, Right, snap, transformPoint, Up } from './mathx';
import { makeSurface, Painter, type Surface } from './painter';
import { Session, type Phase, type ReviewAction, type WorkAction } from './session';
import { Sfx } from './sfx';
import { CardH, CardW, level, PlayWords, SwordBladeEnd, SwordBladeStart, tuning } from './tuning';

export type CardState = 'Hidden' | 'Arrive' | 'Idle' | 'Held' | 'Return' | 'Dictate' | 'Pass';

/**
 * The Kyoto katana at rest on a monitor (Unity: InboxGame.KatanaRest, KatanaAim, KatanaTurn).
 * Rest: where the middle of its grip falls in the picture (x, y from the lower left; outside
 * 0..1 is off it) and how far out it is held, in metres at a 60 degree lens. Aim: which way the
 * blade points as the head sees it (right, up, away). Turn: its turn about its own length, in
 * degrees: spine toward the player, so the blade curves up toward its tip.
 */
const KatanaRest = new THREE.Vector3(0.97, -0.04, 0.44);
const KatanaAim = new THREE.Vector3(-0.12, 0.66, 0.74);
const KatanaTurn = 110;

const Mic = 2; // index into targets; 0 and 1 are the replies
const SwordSamples = 6;
const VoiceBars = 5;
const Faces = 3;

const SliceWords = ['SLICED!', 'ZAPPED!', 'GONE!', 'TRASHED!', 'BYE!', 'POOF!', 'NOPE!'];
const KeepWords = ['KEPT!', 'SAVED!', 'KEEPER!'];
/** The cuts the desktop katana takes, in turn, across the card's face. */
const SwingCuts: readonly (readonly [number, number])[] = [
  [-1, -0.55], [1, -0.45], [-1, 0.5],
  [0.4, -1], [1, 0.55], [-0.45, -1],
];

const Green = hex(0x5dffa1);

/**
 * Draw order among the game's see-through things, as offsets from ctx.ui.renderOrder. These are
 * Unity's render queues (relative to Transparent - 2, the letter): the letter and its scrolling
 * window first, then labels and chips, the pop-up over them, and the light of a hit over all.
 */
const Order = {
  card: 0,
  scroll: 1,
  halo: 1,
  ui: 2,
  pop: 7,
  trail: 47,
  ring: 47,
  weapon: 52,
  blast: 57,
  slash: 62,
  sparks: 72,
} as const;

interface Label {
  mesh: THREE.Mesh;
  surface: Surface;
  width: number;
  height: number;
  setOpacity(value: number): void;
}

interface HomeButton {
  label: Label;
  action: string;
}

interface Target {
  at: THREE.Vector3;
  halfW: number;
  halfH: number;
}

// Scratch values. None of them is kept across a call.
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
const _f = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _r = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _v2 = new THREE.Vector2();
const _w2 = new THREE.Vector2();

/**
 * Inbox Zero: a seated, hands-first game. The rules are in Session; this is the body: the home
 * screen, the letter, the hands, the katana, and all the feedback that makes a hit feel like a
 * hit. A port of Unity's InboxGame.cs for the Kyoto v2 level, method for method.
 *
 *   Home     the logo and the big button.
 *   Round 1  Review. The right hand holds the katana: swing it through a letter to destroy it.
 *            The left hand grabs a letter and throws it away to keep.
 *   Round 2  The work. Grab a kept letter with either hand and lift it onto a ready-made reply
 *            (3 s) or the mic (2 s) above it, or throw it up past them to leave it for tomorrow.
 *
 * A letter that is left alone for a few seconds flies on past and comes round again later, so
 * nothing has to be decided in a hurry.
 *
 * Everything is within arm's reach of a chair, and everything here is in Unity space (x right,
 * y up, z forward, metres), under `ctx.unity`.
 */
export class InboxGame implements Game {
  readonly session = new Session();
  readonly tuning = tuning;
  readonly sfx: Sfx;

  private readonly ctx: GameContext;
  private readonly painter = new Painter();
  private readonly stage = new THREE.Group(); // parent of everything the game creates
  private clock = 0;
  private dressed: Phase | null = null; // the phase the scene is dressed for
  private phaseTimer = 0;
  private countdown = -1;
  private underway: boolean | null = null;

  // Layout.
  private readonly reviewHome = new THREE.Vector3();
  private readonly workHome = new THREE.Vector3();
  private readonly laterTarget = new THREE.Vector3();
  private readonly introAt = new THREE.Vector3();
  private readonly cardHome = new THREE.Vector3();
  private readonly targets: Target[] = [];
  private homeZ = 0;
  private laterLine = 0;
  private hudY = 0;
  private working = false; // the card's home is round 2's

  // Home screen.
  private readonly homeParts: THREE.Object3D[] = [];
  private readonly buttons: HomeButton[] = [];
  private startButton!: HomeButton;
  private logo!: THREE.Mesh;
  private logoSized = false;
  private logoY = 0;

  // Text.
  private intro!: Label;
  private pop!: Label;
  private hud!: Label;
  private readonly hints: HintBar;
  private introPunch = 0;
  private popAge = 2;
  private popTilt = 0;
  private goTimer = 0;
  private hudPunch = 0;
  private readonly popFrom = new THREE.Vector3();
  private hintsForXR = false;
  private readonly marks: Rgba[] = []; // what happened to each email this round

  // Light and motion.
  private flash!: THREE.Mesh;
  private flashMaterial!: GlowMaterial;
  private flashAge = 1;
  private readonly sparks: Sparks;
  private readonly hitFx: HitFx;
  private readonly boom: Boom;
  private readonly split: CardSplit;
  private readonly trail: BladeTrail;
  private hitStop = 0;
  private fovKick = 0;
  private confetti = 0;

  // The head, on a monitor (Unity space).
  private readonly headAt = new THREE.Vector3();
  private readonly headTurn = new THREE.Quaternion();
  private tanHalfFov = Math.tan(28 * Deg2Rad);
  private aspect = 16 / 9;

  // Card.
  private card!: THREE.Mesh;
  private scroll!: THREE.Mesh;
  private flyer!: THREE.Mesh;
  private cardMaterial!: InkMaterial;
  private flyMaterial!: InkMaterial;
  private scrollMaterial!: InkMaterial;
  private readonly cardFaces: Surface[] = [];
  private readonly scrollFaces: Surface[] = [];
  private activeFace = 0;
  private activeScroll = 0;
  /** The next email, already drawn and uploaded while nothing much was happening. */
  private prepared: { email: Email; face: number; scroll: number } | null = null;
  private cardTint: Rgba = Look.Cyan;
  private cardState: CardState = 'Hidden';
  private cardTimer = 0;
  private cardAge = 0;
  private scrollTime = 0;
  private flyAge = 1;
  private readTime = 0; // how long the card has waited
  private passScale = 1; // its size as it started to fly past
  private passSide = 1; // which shoulder it flies past, turn about
  private readonly returnFrom = new THREE.Vector3();
  private readonly flyFrom = new THREE.Vector3();
  private readonly flyTarget = new THREE.Vector3();
  private readonly passFrom = new THREE.Vector3();
  private readonly grabFrom = new THREE.Vector3();
  private readonly swingAt = new THREE.Vector3();
  private readonly passTurn = new THREE.Quaternion();
  private pendingCard = false;
  private pendingTimer = 0;

  // Round 2: replies, mic, hold progress.
  private readonly chips: Label[] = [];
  private mic!: Label;
  private readonly bars: THREE.Mesh[] = [];
  private readonly voice: THREE.Mesh[] = [];
  private hover = -1;
  private hoverTime = 0;
  private dictateTimer = 0;

  // Weapon and hands.
  private weaponTracked = false;
  private readonly sword = new THREE.Group(); // the katana: handle along +Y, origin mid-grip
  private readonly samples: THREE.Vector3[] = [];
  private readonly samplesPrev: THREE.Vector3[] = [];
  private bladeOut = 0;
  private tipSpeed = 0;
  private readonly tipWas = new THREE.Vector3();
  // The desktop katana's swing: -1 at rest, else 0..1 through it.
  private swingT = -1;
  private recover = 1;
  private readonly swingCut = new THREE.Vector2();
  private readonly swingFrame = new THREE.Quaternion();
  private readonly swingEndRot = new THREE.Quaternion();
  private readonly swingEndPos = new THREE.Vector3();
  private swingCount = 0;
  private swingHit = false;
  private readonly left = new Hand('left');
  private readonly right = new Hand('right');
  private readonly leftLook: HandVisual;
  private readonly rightLook: HandVisual;
  private readonly xr: XrInput;
  private readonly reading = makeReading();
  private holder: Hand | null = null;
  private readonly grabOffset = new THREE.Vector3();
  private readonly desktop: DesktopInput;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    this.sfx = new Sfx((name) => ctx.assets.audioUrl(name));
    this.stage.name = 'Stage';
    ctx.unity.add(this.stage);
    const base = ctx.ui.renderOrder;

    // The email hangs at eye level in the middle of the view; round 2 sits it a little lower to
    // make room for the replies above.
    const d = tuning.cardDistance;
    const eye = ctx.eye.y;
    this.reviewHome.set(0, eye - 0.02, d);
    this.workHome.set(0, eye - 0.1, d);
    const row = this.workHome.y + 0.28;
    this.targets.push(
      { at: new THREE.Vector3(-0.27, row, d - 0.03), halfW: 0.15, halfH: 0.11 },
      { at: new THREE.Vector3(0.27, row, d - 0.03), halfW: 0.15, halfH: 0.11 },
      { at: new THREE.Vector3(0, row + 0.01, d - 0.03), halfW: 0.1, halfH: 0.11 },
    );
    this.laterLine = row + 0.19; // carry or throw a card higher than this for tomorrow
    this.laterTarget.set(0, row + 0.6, d + 0.18);
    this.homeZ = d - 0.06;
    this.hudY = eye + 0.33;
    this.cardHome.copy(this.reviewHome);
    this.introAt.set(0, eye + 0.02, 1.3);
    for (let i = 0; i < SwordSamples; i++) {
      this.samples.push(new THREE.Vector3());
      this.samplesPrev.push(new THREE.Vector3());
    }

    this.sparks = new Sparks(this.stage, base + Order.sparks);
    this.hitFx = new HitFx(this.stage, base + Order.slash, base + Order.ring);
    this.boom = new Boom(this.stage, base + Order.blast);
    this.split = new CardSplit(this.stage, ctx.assets.washi, base + Order.ui);
    this.trail = new BladeTrail(this.stage, level.trail, base + Order.trail);
    this.buildCard();
    this.buildFeedback();
    this.buildHome();
    this.buildWork();
    this.hints = new HintBar(ctx, this.painter);
    this.leftLook = new HandVisual(this.stage, ctx, 'left', base + Order.ui);
    this.rightLook = new HandVisual(this.stage, ctx, 'right', base + Order.ui);

    // The katana from the courtyard's half, wrapped so its own transform is left alone.
    this.sword.name = 'Katana';
    this.sword.add(ctx.assets.katana);
    this.sword.traverse((part) => {
      part.renderOrder = base + Order.weapon;
    });
    this.sword.visible = false;
    this.stage.add(this.sword);

    const unlock = () => this.sfx.unlock();
    this.xr = new XrInput(ctx, unlock);
    ctx.renderer.xr.addEventListener('sessionstart', unlock);
    this.desktop = new DesktopInput(ctx, {
      key: (name) => this.key(name),
      click: (origin, direction) => this.click(origin, direction),
      gesture: unlock,
    });

    this.syncPhase();
  }

  // ------------------------------------------------------- state, for tools

  get phase(): Phase {
    return this.session.phase;
  }

  get cardNow(): CardState {
    return this.cardState;
  }

  get cardPosition(): THREE.Vector3 {
    return this.card.position.clone();
  }

  /** Where the big button and the replies are, in Unity space. */
  get startAt(): THREE.Vector3 {
    return this.startButton.label.mesh.position.clone();
  }

  replyAt(index: number): THREE.Vector3 {
    return this.targets[index].at.clone();
  }

  status(): string {
    const s = this.session;
    const hands = this.ctx.inXR() ? ` L:${this.xr.describe('left')} R:${this.xr.describe('right')}` : '';
    return `${s.phase} card:${this.cardState} left:${s.remaining} streak:${s.streak} oops:${s.mistakes}${hands}${this.sfx.running ? '' : ' (sound waits for a click)'}`;
  }

  // ------------------------------------------------------------------ input

  /**
   * Desktop shortcuts. A headset has no keyboard.
   *   Space  start / slash / skip a countdown     A  keep
   *   1, 2   send that reply     M  dictate     W  tomorrow
   */
  key(key: string): void {
    const phase = this.session.phase;
    switch (key) {
      case 'Space':
        if (phase === 'Home') this.pressHome('start');
        else if (phase === 'Review') this.swing();
        else this.phaseTimer = 0; // skip a countdown or the summary
        break;
      case 'A': this.decideReview('Keep', this.card.position, null, null); break;
      case '1': this.decideWork('Reply', 0); break;
      case '2': this.decideWork('Reply', 1); break;
      case 'M': this.startDictation(); break;
      case 'W': this.decideWork('Later', -1); break;
    }
  }

  /** A pointer (mouse, or a controller's trigger) pressed along this ray, in Unity space. */
  click(origin: THREE.Vector3, direction: THREE.Vector3): void {
    if (this.session.phase !== 'Home') return;
    for (const button of this.buttons) {
      const t = button.label.mesh;
      // The plane the button lies in, facing the seat.
      const normal = _a.set(0, 0, -1).applyQuaternion(t.quaternion);
      const facing = direction.dot(normal);
      if (Math.abs(facing) < 1e-6) continue;
      const distance = _b.copy(t.position).sub(origin).dot(normal) / facing;
      if (distance <= 0) continue;
      const local = inverseTransformPoint(t, _b.copy(origin).addScaledVector(direction, distance), _c);
      if (Math.abs(local.x) < button.label.width / 2 && Math.abs(local.y) < button.label.height / 2) {
        this.pressHome(button.action);
        return;
      }
    }
  }

  /**
   * Stand in for a tracked hand or controller, to drive the game from the console. `joints` (26
   * points in XR Hands order) makes it a bare hand; without them it is a controller. Pass
   * `tracked: false` to stop. While either hand is faked the game behaves as in a headset.
   */
  fakeHand(side: Side, tracked: boolean, at: THREE.Vector3 = new THREE.Vector3(), turn: THREE.Quaternion = new THREE.Quaternion(), closed = false, joints: THREE.Vector3[] | null = null): void {
    const hand = side === 'left' ? this.left : this.right;
    hand.fake = tracked;
    hand.fakeAt.copy(at);
    hand.fakeTurn.copy(turn);
    hand.fakeClosed = closed;
    hand.fakeJoints = joints;
  }

  // ------------------------------------------------------------------ build

  private spawn<T extends THREE.Object3D>(object: T, name: string, order: number, parent: THREE.Object3D = this.stage): T {
    object.name = name;
    object.renderOrder = this.ctx.ui.renderOrder + order;
    parent.add(object);
    return object;
  }

  private makeLabel(name: string, width: number, height: number, pxW: number, pxH: number, order: number = Order.ui, scale = tuning.textScale): Label {
    const kit = tuning.labelsThroughUiKit;
    const surface = makeSurface(pxW, pxH, { scale, premultiplied: !kit });
    const texture = surface.texture as THREE.Texture;
    let material: THREE.Material;
    let setOpacity: (value: number) => void;
    if (kit) {
      const flat = this.ctx.ui.material({ map: texture, doubleSide: true });
      flat.transparent = true;
      material = flat;
      setOpacity = (value) => {
        flat.opacity = value;
      };
    } else {
      const own = new LabelMaterial(texture);
      material = own;
      setOpacity = (value) => own.setOpacity(value);
    }
    const mesh = this.spawn(new THREE.Mesh(quad(width, height), material), name, order);
    return { mesh, surface, width, height, setOpacity };
  }

  private buildCard(): void {
    const scale = tuning.textScale;
    for (let i = 0; i < Faces; i++) this.cardFaces.push(makeSurface(1024, 640, { scale, ink: true }));
    const washi = this.ctx.assets.washi;

    // The letter is a sheet of paper with the email inked onto it. It and everything on it draw
    // just before the rest of the UI, so chips and labels always sit on top of it. The sheet is
    // a closed shell: only the side that faces the eye is shown.
    this.cardMaterial = new InkMaterial({ map: this.cardFaces[0].texture, paperMap: washi, paper: true, side: THREE.FrontSide });
    this.card = this.spawn(new THREE.Mesh(this.ctx.assets.letter, this.cardMaterial), 'EmailCard', Order.card);
    this.card.frustumCulled = false; // it flies past the shoulder, growing as it comes

    // The window on a newsletter that scrolls through the mock email: ink only, laid on the sheet.
    const win = CardArt.ScrollWindow;
    for (let i = 0; i < 2; i++) this.scrollFaces.push(makeSurface(win.width, CardArt.ScrollHeight, { scale: 1, ink: true, repeatY: true }));
    this.scrollMaterial = new InkMaterial({ map: this.scrollFaces[0].texture, paperMap: washi, paper: false, side: THREE.DoubleSide });
    this.scrollMaterial.window = win.height / CardArt.ScrollHeight;
    this.scroll = this.spawn(
      new THREE.Mesh(quad((win.width / 1024) * CardW, (win.height / 640) * CardH), this.scrollMaterial),
      'Scroll', Order.scroll, this.card,
    );
    this.scroll.position.set(
      ((win.x + win.width / 2) / 1024) * CardW - CardW / 2,
      CardH / 2 - ((win.y + win.height / 2) / 640) * CardH,
      -0.0008,
    );
    this.card.visible = false;

    // A kept or sent card flies off as a copy of itself.
    this.flyMaterial = new InkMaterial({ map: this.cardFaces[0].texture, paperMap: washi, paper: true, side: THREE.FrontSide });
    this.flyer = this.spawn(new THREE.Mesh(this.ctx.assets.letter, this.flyMaterial), 'CardFlying', Order.ui);
    this.flyer.frustumCulled = false;
    this.flyer.visible = false;
  }

  private buildFeedback(): void {
    this.flashMaterial = new GlowMaterial(true);
    this.flash = this.spawn(new THREE.Mesh(softDisc(0.5, 40), this.flashMaterial), 'Flash', Order.ui);
    this.flash.visible = false;

    this.pop = this.makeLabel('Pop', 0.5, 0.078, 1024, 160, Order.pop); // over the card and the chips
    this.pop.mesh.visible = false;

    // Big blocks of pixel type, redrawn on every tick of the countdown: Unity's size is plenty.
    this.intro = this.makeLabel('Countdown', 1.4, 0.7, 1024, 512, Order.ui, 1);
    this.intro.mesh.position.copy(this.introAt);
    this.intro.mesh.visible = false;

    this.hud = this.makeLabel('RoundHud', 0.42, 0.082, 1024, 200);
    this.hud.mesh.visible = false;
  }

  /** A small logo and the big button. (Unity's level picker and settings gear are not in this build.) */
  private buildHome(): void {
    const eye = this.ctx.eye.y;
    this.logoY = eye + 0.15;
    this.logo = this.spawn(
      new THREE.Mesh(quad(1, 1), this.ctx.ui.material({ map: this.ctx.assets.logo, doubleSide: true })),
      'Logo', Order.ui,
    );
    this.logo.position.set(0, this.logoY, this.homeZ);
    this.sizeLogo();
    this.homeParts.push(this.logo);

    const start = this.makeLabel('Home-start', 0.3, (0.3 * 170) / 640, 640, 170);
    CardArt.button(this.painter, start.surface, PlayWords, level.accent);
    start.mesh.position.set(0, eye - 0.06, this.homeZ);
    this.homeParts.push(start.mesh);
    this.startButton = { label: start, action: 'start' };
    this.buttons.push(this.startButton);
    const glow = new GlowMaterial(true);
    toLinear(level.accent, glow.tint);
    glow.setOpacity(0.55);
    const halo = this.spawn(
      new THREE.Mesh(neonRoundRect(0.15 - 0.004, start.height / 2 - 0.006, 0.008, 0.01, 0.035), glow),
      'StartGlow', Order.halo, start.mesh,
    );
    halo.position.set(0, 0.002, 0.002);
  }

  /** The logo is 0.3 m wide and as tall as its picture makes it; the picture may still be loading. */
  private sizeLogo(): void {
    if (this.logoSized) return;
    const image = this.ctx.assets.logo.image as { width?: number; height?: number } | null | undefined;
    const w = image?.width ?? 0;
    const h = image?.height ?? 0;
    const known = w > 0 && h > 0;
    this.logo.scale.set(0.3, known ? (0.3 * h) / w : 0.075, 1);
    this.logoSized = known;
  }

  /** Round 2: two reply chips, the mic, hold bars and the voice meter. */
  private buildWork(): void {
    const barMaterial = this.ctx.ui.material({ color: toLinear(Green), doubleSide: true });
    for (let i = 0; i < this.targets.length; i++) {
      const target = this.targets[i];
      const label = i === Mic ? this.makeLabel('Mic', 0.15, 0.15, 256, 256) : this.makeLabel(`Reply${i}`, 0.26, 0.1, 512, 200);
      label.mesh.position.copy(target.at);
      label.mesh.visible = false;
      if (i === Mic) this.mic = label;
      else this.chips.push(label);

      // A bar under the target that fills while a card is held over it.
      const width = i === Mic ? 0.13 : 0.24;
      const bar = this.spawn(new THREE.Mesh(quad(width, 0.012, true), barMaterial), `HoldBar${i}`, Order.ui + 1);
      bar.position.set(target.at.x - width / 2, target.at.y - (i === Mic ? 0.088 : 0.064), target.at.z - 0.002);
      bar.visible = false;
      this.bars.push(bar);
    }
    CardArt.mic(this.painter, this.mic.surface, false);

    // The voice meter sits just under the mic while it listens.
    const voiceMaterial = this.ctx.ui.material({ color: toLinear(Look.Coral), doubleSide: true });
    const micAt = this.targets[Mic].at;
    for (let i = 0; i < VoiceBars; i++) {
      const bar = this.spawn(new THREE.Mesh(quad(0.012, 0.04), voiceMaterial), `VoiceBar${i}`, Order.ui + 1);
      bar.position.set(micAt.x + (i - (VoiceBars - 1) / 2) * 0.022, micAt.y - 0.105, micAt.z - 0.01);
      bar.visible = false;
      this.voice.push(bar);
    }
  }

  private drawHints(): void {
    const show = !this.inXR();
    this.hints.show(show);
    if (!show) return;
    let keys: (readonly [string, string])[];
    switch (this.session.phase) {
      case 'Home': keys = [['Space', 'clear my inbox']]; break;
      case 'Review': keys = [['Space', 'slash'], ['A', 'keep']]; break;
      case 'Work': keys = [['1', 'left reply'], ['2', 'right reply'], ['M', 'dictate'], ['W', 'tomorrow']]; break;
      default: keys = [['Space', 'skip']]; break;
    }
    this.hints.draw(keys);
  }

  // ------------------------------------------------------------------- flow

  /** A headset is on, or a test is standing in for one. */
  private inXR(): boolean {
    return this.left.fake || this.right.fake || this.ctx.inXR();
  }

  pressHome(action: string): void {
    if (this.session.phase !== 'Home') return;
    if (action === 'start') this.startRound(((Date.now() & 0x7fffffff) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
  }

  /**
   * Start with a chosen shuffle (the same seed deals the same emails). No sound here: the level
   * coming alive is the start.
   */
  startRound(seed: number): void {
    if (this.session.phase !== 'Home') return;
    this.sfx.unlock();
    this.session.start(seed >>> 0, tuning.roundSize, tuning.junkShare);
    this.ctx.world.kick(1);
    this.syncPhase();
  }

  /** Dress the scene for the session's phase. Call after it changes. */
  private syncPhase(): void {
    const phase = this.session.phase;
    if (this.dressed === phase) return;
    const was = this.dressed;
    this.dressed = phase;
    this.countdown = -1;

    for (const part of this.homeParts) part.visible = phase === 'Home';
    const work = phase === 'Work';
    for (const chip of this.chips) chip.mesh.visible = work;
    this.mic.mesh.visible = work;
    this.setHover(-1);
    for (const bar of this.voice) bar.visible = false;
    this.working = work;
    this.cardHome.copy(work ? this.workHome : this.reviewHome);

    const playing = phase === 'Review' || work;
    this.hud.mesh.visible = playing;
    if (playing) {
      this.marks.length = 0;
      this.hud.mesh.position.set(0, this.hudY, this.cardHome.z + 0.06);
      this.hud.mesh.quaternion.identity();
      this.drawHud();
    }

    const counting = phase === 'Intro1' || phase === 'Intro2' || phase === 'Done';
    this.introPunch = 1;
    if (playing && (was === 'Intro1' || was === 'Intro2')) {
      // The countdown ends on GO!, which hangs on as the first card comes in.
      CardArt.countdown(this.painter, this.intro.surface, work ? 'ROUND 2' : 'ROUND 1', 'GO!', level);
      this.goTimer = 0.6;
      this.intro.mesh.visible = true;
      this.ctx.world.kick(0.8);
    } else this.intro.mesh.visible = counting;

    if (phase === 'Intro1') this.phaseTimer = tuning.introSeconds;
    else if (phase === 'Intro2') this.phaseTimer = tuning.intro2Seconds;
    else if (phase === 'Done') {
      this.phaseTimer = tuning.doneSeconds;
      this.confetti = 1.6;
      this.ctx.world.wish(7);
      this.sfx.done();
    }
    if (counting) this.drawIntroText();
    this.hintsForXR = this.inXR();
    this.drawHints();
  }

  private drawIntroText(): void {
    const count = String(Math.max(1, this.countdown));
    const s = this.session;
    if (this.dressed === 'Intro1') CardArt.countdown(this.painter, this.intro.surface, 'ROUND 1', count, level);
    else if (this.dressed === 'Intro2') CardArt.countdown(this.painter, this.intro.surface, 'ROUND 2', count, level);
    else {
      const sent = s.replied + s.dictated;
      CardArt.summary(this.painter, this.intro.surface, s.rank, [
        `${s.destroyed} sliced  ·  ${sent} replied  ·  ${s.later} tomorrow`,
        s.mistakes > 0
          ? `${s.mistakes} you needed went in the bin. Oops.`
          : `Nothing important was harmed. Best streak: ${s.bestStreak}.`,
      ], level);
    }
  }

  private drawHud(): void {
    const work = this.session.phase === 'Work';
    const total = work ? this.session.keptEmails.length : this.session.deck.length;
    CardArt.hud(this.painter, this.hud.surface, work ? 'ROUND 2' : 'ROUND 1', total, this.marks);
  }

  // --------------------------------------------------------------- the card

  private showCard(): void {
    const email = this.session.current;
    if (email === null) return;
    this.activeFace = (this.activeFace + 1) % Faces;
    const ready = this.prepared !== null && this.prepared.email === email && this.prepared.face === this.activeFace ? this.prepared : null;
    this.prepared = null;
    if (ready === null) CardArt.emailCard(this.painter, this.cardFaces[this.activeFace], email);
    this.cardMaterial.face = this.cardFaces[this.activeFace].texture;
    this.cardTint = Categories.tint(email.category);
    const scrolls = tuning.scrollPreview && CardArt.scrolls(email);
    this.scroll.visible = scrolls;
    if (scrolls) {
      if (ready !== null && ready.scroll >= 0) this.activeScroll = ready.scroll;
      else {
        this.activeScroll = 1 - this.activeScroll;
        CardArt.scrollContent(this.painter, this.scrollFaces[this.activeScroll], email);
      }
      this.scrollMaterial.face = this.scrollFaces[this.activeScroll].texture;
      this.scrollTime = 0;
      this.scrollMaterial.offset = 0;
    }
    if (this.session.phase === 'Work') {
      for (let i = 0; i < this.chips.length; i++) CardArt.replyChip(this.painter, this.chips[i].surface, email.replies[i]);
    }
    this.cardState = 'Arrive';
    this.cardTimer = 0;
    this.cardAge = 0;
    this.readTime = 0;
    this.card.visible = true;
    this.sfx.arrive();
  }

  /**
   * Draw an email's letter before it is wanted, on a face nothing is showing, and send it to the
   * graphics card now. Drawing and uploading a letter can cost a frame; this spends it while a
   * card is sitting still, not in the middle of the cut that sends for the next one. (Unity
   * draws at the moment of showing; what the player sees is the same.)
   */
  private prepare(email: Email | null): void {
    if (email === null || (this.prepared !== null && this.prepared.email === email)) return;
    const face = (this.activeFace + 1) % Faces;
    CardArt.emailCard(this.painter, this.cardFaces[face], email);
    this.warm(this.cardFaces[face]);
    let scroll = -1;
    if (tuning.scrollPreview && CardArt.scrolls(email)) {
      scroll = 1 - this.activeScroll;
      CardArt.scrollContent(this.painter, this.scrollFaces[scroll], email);
      this.warm(this.scrollFaces[scroll]);
    }
    this.prepared = { email, face, scroll };
  }

  private warm(surface: Surface): void {
    if (surface.texture === null) return;
    try {
      this.ctx.renderer.initTexture(surface.texture);
    } catch {
      /* it will be uploaded when it is first drawn */
    }
  }

  /** The email that follows the one on show, whether that one is decided or flies past. */
  private upcoming(): Email | null {
    const s = this.session;
    const pile = s.phase === 'Review' ? s.deck : s.phase === 'Work' ? s.keptEmails : null;
    const at = s.phase === 'Review' ? s.index : s.workIndex;
    return pile !== null && at + 1 < pile.length ? pile[at + 1] : null;
  }

  private cardLive(): boolean {
    return this.cardState === 'Idle' || this.cardState === 'Held' || this.cardState === 'Return' || this.cardState === 'Dictate';
  }

  /**
   * Where a waiting card sits. It starts a little way back and a little small, and drifts closer
   * and up to full size as its time runs out. Returns its scale.
   */
  private waitingAt(out: THREE.Vector3): number {
    const t = clamp01(this.readTime / Math.max(0.1, tuning.readSeconds));
    out.copy(this.cardHome);
    out.z += tuning.approach * (1 - t);
    return lerp(0.86, 1, t);
  }

  /** Nobody dealt with it in time: it comes on, bigger, and past a shoulder. */
  private startPass(): void {
    this.cardState = 'Pass';
    this.cardTimer = 0;
    this.passFrom.copy(this.card.position);
    this.passTurn.copy(this.card.quaternion);
    this.passScale = this.card.scale.x;
    this.passSide = -this.passSide;
    this.holder = null;
    this.setHover(-1);
    this.sfx.pass();
  }

  private popAt(out: THREE.Vector3): THREE.Vector3 {
    // Over the card in round 1; between the card and the replies in round 2.
    const y = this.cardHome.y + CardH / 2 + (this.working ? 0.05 : 0.07);
    return out.set(this.cardHome.x, y, this.cardHome.z - 0.03);
  }

  /** It has gone past. Back to the end of the line with it, undecided, so it comes round again later. */
  private cardPassed(): void {
    this.card.visible = false;
    this.cardState = 'Hidden';
    this.left.mustOpen = this.right.mustOpen = true;
    this.session.defer();
    this.showPop('BACK LATER', Look.Dim, hex(0x2a2148), this.popAt(_a));
    this.pendingCard = this.session.current !== null;
    this.pendingTimer = tuning.nextDelay;
    this.ctx.world.kick(0.25);
  }

  private showPop(words: string, color: Rgba, shadow: Rgba, at: THREE.Vector3): void {
    CardArt.pixelLabel(this.painter, this.pop.surface, words, color, shadow);
    this.popFrom.copy(at);
    this.popTilt = range(-6, 6);
    this.pop.mesh.position.copy(at);
    this.pop.mesh.visible = true;
    this.pop.setOpacity(1);
    this.popAge = 0;
  }

  /** The card is gone, one way or another: mark it, tidy up, line up the next. */
  private cardLeft(headline: string, good: boolean, at: THREE.Vector3, mark: Rgba): void {
    this.card.visible = false;
    this.cardState = 'Hidden';
    this.holder = null;
    this.left.mustOpen = this.right.mustOpen = true;
    this.setHover(-1);

    toLinear(mark, this.flashMaterial.tint);
    this.flash.position.set(at.x, at.y, at.z - 0.01);
    this.flash.visible = true;
    this.flashAge = 0;
    this.showPop(headline, good ? White : Look.Coral, good ? mark : hex(0x5a0f22), this.popAt(_a));
    this.marks.push([mark[0], mark[1], mark[2], 1]);
    this.drawHud();
    this.hudPunch = 1;

    this.pendingCard = this.session.current !== null;
    this.pendingTimer = tuning.nextDelay;
    this.ctx.world.kick(0.3);
    this.syncPhase();
  }

  /** Send a copy of the card flying to `target`, shrinking as it goes. */
  private flyCard(target: THREE.Vector3): void {
    this.flyMaterial.face = this.cardFaces[this.activeFace].texture;
    this.flyer.position.copy(this.card.position);
    this.flyer.quaternion.copy(this.card.quaternion);
    this.flyer.scale.setScalar(1);
    this.flyer.visible = true;
    this.flyFrom.copy(this.card.position);
    this.flyTarget.copy(target);
    this.flyAge = 0;
  }

  private streak(words: string): string {
    return this.session.streak >= 3 ? `${words} X${this.session.streak}` : words;
  }

  /**
   * Round 1. `at` is where it happened, `push` the weapon's velocity, `away` the direction a
   * kept card flies, `cut` the line of the blade across the card's face (from `push` if not
   * given).
   */
  private decideReview(action: ReviewAction, where: THREE.Vector3, push: THREE.Vector3 | null, away: THREE.Vector3 | null, cut: THREE.Vector2 | null = null): void {
    if (!this.cardLive()) return;
    const verdict = this.session.review(action);
    if (verdict === null) return;
    const card = this.card;
    const at = new THREE.Vector3().copy(where);

    let mark: Rgba;
    let headline: string;
    if (action === 'Destroy') {
      const dir = new THREE.Vector2();
      if (cut !== null) dir.copy(cut);
      if (dir.lengthSq() < 1e-6 && push !== null) {
        const inCard = _a.copy(push).applyQuaternion(_q.copy(card.quaternion).invert());
        dir.set(inCard.x, inCard.y);
      }
      if (dir.lengthSq() < 1e-6) {
        const next = SwingCuts[this.swingCount++ % SwingCuts.length];
        dir.set(next[0], next[1]);
      }
      dir.normalize();
      const along = new THREE.Vector3(dir.x, dir.y, 0).applyQuaternion(card.quaternion);
      const local = inverseTransformPoint(card, at, _a);
      const strike = new THREE.Vector2(clamp(local.x, -CardW / 2, CardW / 2), clamp(local.y, -CardH / 2, CardH / 2));
      transformPoint(card, _a.set(strike.x, strike.y, 0), at);
      mark = verdict.correct ? this.cardTint : Look.Coral;

      // The email comes apart along the blade's path, and everything goes off at once.
      const shove = push !== null ? _b.copy(push) : _b.copy(along).multiplyScalar(3.5);
      this.split.go(card, CardW, CardH, strike, dir, shove, this.cardFaces[this.activeFace].texture, mark);
      this.cutSpray(strike, dir, along, mark);
      this.sparks.burst(at, along, 0.9, White, 14, 1.8, 4.5);
      this.sparks.embers(card.position, mark, 14, 0.18);
      this.hitFx.strike(at, along, card.quaternion, mark);
      this.boom.go(at, along, mark, verdict.correct ? 1 : 0.8);
      this.ctx.world.kick(verdict.correct ? 1 : 0.4);
      this.hitStop = tuning.hitStop;
      this.fovKick = 1;
      if (verdict.correct) {
        this.sfx.slash(this.session.streak);
        headline = this.streak(pick(SliceWords));
        if (this.session.streak % 3 === 0) this.ctx.world.wish(); // every third in a row: something to celebrate
      } else {
        this.sfx.wrong();
        headline = 'OOPS! NEEDED THAT';
      }
    } else {
      // Off to the side it was thrown, or to the left by default.
      const direction = new THREE.Vector3(-1, 0.1, 0);
      if (away !== null && away.lengthSq() > 1e-6) direction.copy(away).normalize();
      mark = Green;
      this.flyCard(_a.copy(card.position).addScaledVector(direction, 0.8));
      this.sparks.burst(card.position, direction, 0.6, mark, 20, 1, 3);
      this.sfx.sort(this.session.streak);
      headline = this.streak(pick(KeepWords));
    }
    this.cardLeft(headline, verdict.correct, at, mark);
  }

  /** Pixels sprayed all along the cut, thrown the way the blade went. */
  private cutSpray(through: THREE.Vector2, dir: THREE.Vector2, along: THREE.Vector3, mark: Rgba): void {
    // Where the line of the cut enters and leaves the card.
    let from = -10;
    let to = 10;
    for (let axis = 0; axis < 2; axis++) {
      const d = axis === 0 ? dir.x : dir.y;
      const p = axis === 0 ? through.x : through.y;
      const half = axis === 0 ? CardW / 2 : CardH / 2;
      if (Math.abs(d) < 1e-4) continue;
      const a = (-half - p) / d;
      const b = (half - p) / d;
      from = Math.max(from, Math.min(a, b));
      to = Math.min(to, Math.max(a, b));
    }
    for (let k = 0; k <= 16; k++) {
      const along2 = lerp(from, to, k / 16);
      const point = transformPoint(this.card, _c.set(through.x + dir.x * along2, through.y + dir.y * along2, 0), _d);
      this.sparks.burst(point, along, 0.45, mark, 2, 1.2, 3.8);
    }
  }

  /** Round 2. `target` is the reply or mic it was sent through, or -1. */
  private decideWork(action: WorkAction, target: number): void {
    if (!this.cardLive()) return;
    const wasDictating = this.cardState === 'Dictate';
    const verdict = this.session.work(action);
    if (verdict === null) return;
    for (const bar of this.voice) bar.visible = false;
    if (wasDictating) CardArt.mic(this.painter, this.mic.surface, false);
    const to = target >= 0 ? this.targets[target].at : this.laterTarget;
    const mark: Rgba = action === 'Later' ? Look.Gold : Green;
    this.flyCard(to);
    const way = _e.copy(to).sub(this.card.position).normalize();
    this.sparks.burst(target >= 0 ? to : this.card.position, way, 0.7, mark, 26, 1, 3);
    this.sfx.sort(this.session.streak);
    this.cardLeft(this.streak(action === 'Later' ? 'TOMORROW!' : 'SENT!'), true, this.card.position, mark);
  }

  /** The card was held over the mic long enough: pretend to listen. */
  private startDictation(): void {
    if (this.session.phase !== 'Work') return;
    if (!this.cardLive() || this.cardState === 'Dictate') return;
    this.cardState = 'Dictate';
    this.dictateTimer = 0;
    this.returnFrom.copy(this.card.position);
    this.holder = null;
    this.left.mustOpen = this.right.mustOpen = true;
    this.setHover(-1);
    CardArt.mic(this.painter, this.mic.surface, true);
    for (const bar of this.voice) bar.visible = true;
    this.sfx.blip(1.3);
  }

  private setHover(target: number): void {
    if (target === this.hover) return;
    this.hover = target;
    this.hoverTime = 0;
    for (const bar of this.bars) bar.visible = false;
    if (target >= 0) this.sfx.blip(1.15);
  }

  // ------------------------------------------------------------------ hands

  /** Thumb and index together, or the whole hand closed. */
  private handClosed(hand: Hand): boolean {
    const pinch = hand.joints[ThumbTip].distanceTo(hand.joints[IndexTip]);
    const curl = hand.joints[MiddleTip].distanceTo(hand.joints[Wrist]);
    if (curl > 0 && curl < tuning.fistCurl) return true;
    return pinch < (hand.closed ? tuning.pinchOff : tuning.pinchOn);
  }

  /** Where one hand is, how fast it is moving and whether it is closed. */
  private readHand(hand: Hand, dt: number): void {
    let found = false;
    let closed = false;
    let trigger = false;
    let joints = false;
    const at = _a;
    const turn = _q;
    if (hand.fake) {
      found = true;
      at.copy(hand.fakeAt);
      turn.copy(hand.fakeTurn);
      closed = hand.fakeClosed;
      hand.rayFrom.copy(at);
      hand.rayDir.copy(Forward).applyQuaternion(turn);
      if (hand.fakeJoints !== null) {
        joints = true;
        for (let i = 0; i < hand.joints.length && i < hand.fakeJoints.length; i++) hand.joints[i].copy(hand.fakeJoints[i]);
        closed = this.handClosed(hand) || closed;
      }
    } else {
      const reading = this.reading;
      this.xr.read(hand, reading);
      if (reading.found) {
        found = true;
        joints = reading.joints;
        at.copy(reading.at);
        turn.copy(reading.turn);
        hand.rayFrom.copy(reading.rayFrom);
        hand.rayDir.copy(reading.rayDir);
        if (joints) closed = this.handClosed(hand);
        else {
          trigger = reading.trigger;
          closed = reading.closed;
        }
      }
    }
    hand.triggerWas = hand.trigger;
    hand.trigger = trigger;
    hand.hasJoints = found && joints;
    if (!found) {
      hand.tracked = false;
      hand.closed = false;
      hand.poking = false;
      return;
    }
    hand.closed = closed;
    hand.turn.copy(turn);
    hand.prev.copy(hand.palm);
    hand.palm.copy(at);
    if (!hand.tracked || dt <= 0) {
      hand.prev.copy(hand.palm);
      hand.velocity.set(0, 0, 0);
    } else {
      const v = _b.copy(hand.palm).sub(hand.prev).divideScalar(dt);
      if (v.lengthSq() > 15 * 15) v.set(0, 0, 0); // tracking jump
      hand.velocity.lerp(v, 0.5);
    }
    hand.tracked = true;
    if (!hand.closed) hand.mustOpen = false;

    // Home screen buttons: poke one with a fingertip (or the controller), or point a controller
    // at it and pull the trigger.
    if (hand.trigger && !hand.triggerWas) {
      this.sfx.unlock();
      this.click(hand.rayFrom, hand.rayDir);
    }
    let poking = false;
    if (this.session.phase === 'Home') {
      const tip = hand.hasJoints ? hand.joints[IndexTip] : hand.palm;
      for (const button of this.buttons) {
        const p = inverseTransformPoint(button.label.mesh, tip, _c);
        if (Math.abs(p.x) > button.label.width / 2 || Math.abs(p.y) > button.label.height / 2 || Math.abs(p.z) > tuning.pokeDepth) continue;
        poking = true;
        if (!hand.poking) {
          this.sfx.unlock();
          this.pressHome(button.action);
        }
        break;
      }
    }
    hand.poking = poking;
  }

  /** Is this point inside the card's hit volume? */
  private touchesCard(point: THREE.Vector3, radius: number): boolean {
    const p = inverseTransformPoint(this.card, point, _c);
    const margin = tuning.hitMargin + radius;
    return Math.abs(p.x) < CardW / 2 + margin && Math.abs(p.y) < CardH / 2 + margin && Math.abs(p.z) < tuning.hitDepth + radius;
  }

  /** The blade comes out as the weapon appears (the katana has no glow to dress: only its reach grows). */
  private dressBlade(dt: number, shown: boolean): void {
    this.bladeOut = shown ? moveTowards(this.bladeOut, 1, dt / 0.25) : 0;
  }

  /** Space on a monitor: the katana winds up and cuts across the email. */
  private swing(): void {
    if (!this.cardLive() || this.cardState === 'Held') return;
    const next = SwingCuts[this.swingCount++ % SwingCuts.length];
    const cut = _v2.set(next[0], next[1]).normalize();
    if (this.inXR()) {
      this.decideReview('Destroy', this.card.position, null, null, cut);
      return;
    }
    if (this.swingT >= 0) return;
    this.swingCut.copy(cut);
    this.swingAt.copy(this.card.position);
    this.swingFrame.copy(this.card.quaternion);
    this.swingT = 0;
    this.swingHit = false;
  }

  /**
   * Where the katana is `e` (0..1) of the way through a cut along swingCut: the hand sweeps
   * under the card while the blade leans into the cut.
   */
  private swingPose(e: number, pos: THREE.Vector3, rot: THREE.Quaternion): void {
    const d = this.swingCut;
    const across = _w2.set(-d.y, d.x);
    if (across.y < 0) across.negate();
    const right = _a.copy(Right).applyQuaternion(this.swingFrame);
    const up = _b.copy(Up).applyQuaternion(this.swingFrame);
    const fwd = _c.copy(Forward).applyQuaternion(this.swingFrame);
    const way = _d.copy(right).multiplyScalar(d.x).addScaledVector(up, d.y);
    const side = _e.copy(right).multiplyScalar(across.x).addScaledVector(up, across.y);
    pos.copy(this.swingAt).addScaledVector(side, -0.27).addScaledVector(way, lerp(-0.48, 0.48, e)).addScaledVector(fwd, -0.27);
    const blade = _f.copy(side).multiplyScalar(0.8).addScaledVector(fwd, 0.6).addScaledVector(way, lerp(-0.6, 0.6, e)).normalize();
    fromTo(Up, blade, rot);
  }

  private strikeFromSwing(): void {
    const across = _w2.set(-this.swingCut.y, this.swingCut.x);
    if (across.y < 0) across.negate();
    const offset = range(-0.02, 0.05);
    const at = transformPoint(this.card, _a.set(across.x * offset, across.y * offset, 0), new THREE.Vector3());
    const way = new THREE.Vector3(this.swingCut.x, this.swingCut.y, 0).applyQuaternion(this.swingFrame).multiplyScalar(4.5);
    this.decideReview('Destroy', at, way, null, this.swingCut);
  }

  /** Unity: Camera.ViewportToWorldPoint, for the monitor's head. */
  private viewportToWorld(x: number, y: number, depth: number, out: THREE.Vector3): THREE.Vector3 {
    return out
      .set((x * 2 - 1) * depth * this.tanHalfFov * this.aspect, (y * 2 - 1) * depth * this.tanHalfFov, depth)
      .applyQuaternion(this.headTurn)
      .add(this.headAt);
  }

  private readonly restPos = new THREE.Vector3();
  private readonly restRot = new THREE.Quaternion();
  private readonly swordPos = new THREE.Vector3();
  private readonly swordRot = new THREE.Quaternion();

  private updateWeapon(dt: number): void {
    const sword = this.sword;
    const phase = this.session.phase;
    const right = this.right;
    if (phase !== 'Intro1' && phase !== 'Review') {
      sword.visible = false; // the weapon belongs to round 1
      this.weaponTracked = false;
      this.swingT = -1;
      this.dressBlade(dt, false);
      return;
    }

    if (!this.inXR()) {
      // Desktop: the katana waits at the side, and cuts on Space.
      sword.visible = true;
      this.dressBlade(dt, true);
      this.weaponTracked = false;
      // Held as a right hand would hold it: the grip comes up out of the lower right corner
      // toward the eye, and the blade points up, away and a little inward, stopping short of
      // the letter. Set by where it falls in the picture, and nearer through a wider lens.
      const reach = (KatanaRest.z * 0.5774) / this.tanHalfFov;
      const restPos = this.viewportToWorld(KatanaRest.x, KatanaRest.y, reach, this.restPos);
      restPos.addScaledVector(_a.copy(Up).applyQuaternion(this.headTurn), Math.sin(this.clock * 1.3) * 0.004);
      const aim = _a.copy(KatanaAim).normalize();
      aim.x += Math.sin(this.clock * 0.9) * 0.012;
      const restRot = this.restRot.copy(this.headTurn).multiply(fromTo(Up, aim, _q)).multiply(euler(0, KatanaTurn, 0, _r));

      const pos = this.swordPos.copy(restPos);
      const rot = this.swordRot.copy(restRot);
      if (this.swingT >= 0) {
        this.swingT += dt / tuning.swingSeconds;
        if (this.swingT < 0.3) {
          this.swingPose(0, pos, rot);
          const k = ease(this.swingT / 0.3);
          pos.lerpVectors(restPos, pos, k);
          rot.copy(_r.copy(restRot).slerp(rot, k));
        } else {
          const e = snap(Math.min(1, (this.swingT - 0.3) / 0.7));
          this.swingPose(e, pos, rot);
          if (!this.swingHit && e >= 0.5) {
            this.swingHit = true;
            this.strikeFromSwing();
          }
        }
        if (this.swingT >= 1) {
          this.swingT = -1;
          this.recover = 0;
          this.swingEndPos.copy(pos);
          this.swingEndRot.copy(rot);
        }
      } else if (this.recover < 1) {
        this.recover = Math.min(1, this.recover + dt / 0.35);
        const k = ease(this.recover);
        pos.lerpVectors(this.swingEndPos, restPos, k);
        rot.copy(this.swingEndRot).slerp(restRot, k);
      }
      sword.position.copy(pos);
      sword.quaternion.copy(rot);
      sword.scale.setScalar(1);
      return;
    }

    if (!right.tracked) {
      sword.visible = false;
      this.weaponTracked = false;
      this.dressBlade(dt, false);
      return;
    }
    if (right.hasJoints) {
      // Pose the weapon from the knuckles, so it does not depend on a grip convention: the
      // handle runs from the little finger to the thumb side.
      const wrist = right.joints[Wrist];
      const middle = right.joints[MiddleKnuckle];
      const up = _a.copy(right.joints[IndexKnuckle]).sub(right.joints[LittleKnuckle]); // across the knuckles
      const along = _b.copy(middle).sub(wrist); // toward the fingers
      if (up.lengthSq() < 1e-6 || along.lengthSq() < 1e-6) {
        sword.visible = false;
        this.weaponTracked = false;
        return;
      }
      up.normalize();
      along.normalize();
      const tilt = tuning.weaponTiltDeg * Deg2Rad;
      up.multiplyScalar(Math.cos(tilt)).addScaledVector(along, Math.sin(tilt)).normalize();
      along.addScaledVector(up, -along.dot(up)).normalize();
      sword.position.lerpVectors(wrist, middle, 0.8);
      lookRotation(along, up, sword.quaternion);
    } else {
      // A controller: a held rod points along its forward axis.
      sword.position.copy(right.palm);
      sword.quaternion.copy(right.turn).multiply(euler(90, 0, 0, _q));
    }
    // Grip mode: the weapon rests small in the open hand and is harmless until the hand closes on it.
    const engaged = !tuning.gripToHit || right.closed;
    sword.scale.setScalar(engaged ? 1 : 0.45);
    sword.visible = true;
    this.dressBlade(dt, true);
    if (!engaged) {
      this.weaponTracked = false; // no swing carries over from the open hand
      return;
    }

    // Where the blade is now, and how fast it is moving.
    const canHit = phase === 'Review' && this.weaponTracked && dt > 0 && this.cardAge > 0.12 && this.cardLive();
    let hit = false;
    for (let i = 0; i < SwordSamples; i++) {
      const along = SwordBladeStart + ((SwordBladeEnd - SwordBladeStart) * i) / (SwordSamples - 1);
      transformPoint(sword, _a.set(0, along, 0), this.samples[i]);
      if (!canHit || hit) continue;
      const velocity = _b.copy(this.samples[i]).sub(this.samplesPrev[i]).divideScalar(dt);
      const speed = velocity.length();
      // Faster than an arm can move is a tracking jump, not a swing.
      if (speed >= tuning.swordSpeed && speed < 15 && this.touchesCard(this.samples[i], 0.015)) {
        hit = true;
        this.decideReview('Destroy', this.samples[i], velocity.clone(), null);
      }
    }
    for (let i = 0; i < SwordSamples; i++) this.samplesPrev[i].copy(this.samples[i]);
    this.weaponTracked = true;
  }

  /** Close a hand on or near the card to pick it up. */
  private tryGrab(hand: Hand): void {
    if (!hand.tracked || !hand.closed || hand.mustOpen) return;
    if (this.cardAge <= 0.1) return;
    if (this.cardState !== 'Idle' && this.cardState !== 'Return') return;
    const p = inverseTransformPoint(this.card, hand.palm, _c);
    const ox = Math.max(0, Math.abs(p.x) - CardW / 2);
    const oy = Math.max(0, Math.abs(p.y) - CardH / 2);
    if (Math.hypot(ox, oy, p.z) < tuning.grabReach) {
      this.grabOffset.copy(this.card.position).sub(hand.palm);
      this.grabFrom.copy(this.card.position);
      this.cardState = 'Held';
      this.holder = hand;
      this.sfx.blip();
    }
  }

  private springBack(): void {
    this.returnFrom.copy(this.card.position);
    this.cardState = 'Return';
    this.cardTimer = 0;
    this.readTime = 0; // they had hold of it: give it its full wait again
    this.holder = null;
    this.setHover(-1);
  }

  private updateHands(dt: number): void {
    this.readHand(this.left, dt);
    this.readHand(this.right, dt);
    const phase = this.session.phase;
    this.leftLook.draw(this.left, false);
    // The right controller is hidden in round 1: the weapon is there instead.
    this.rightLook.draw(this.right, phase === 'Intro1' || phase === 'Review');
    const hand = this.holder;

    if (hand === null || this.cardState !== 'Held') {
      this.holder = null;
      if (phase === 'Review') this.tryGrab(this.left); // the right hand has the weapon
      else if (phase === 'Work') {
        this.tryGrab(this.left);
        if (this.holder === null) this.tryGrab(this.right);
      }
      return;
    }
    if (!hand.tracked) {
      this.springBack();
      return;
    }

    const card = this.card;
    card.position.copy(hand.palm).add(this.grabOffset);
    const moved = _d.copy(card.position).sub(this.grabFrom); // how far it has been carried
    const travel = moved.length();
    const v = hand.velocity;

    if (phase === 'Review') {
      // Throw it anywhere, or carry it off and let go: kept.
      if (v.length() > tuning.swipeSpeed && travel > tuning.swipeTravel && v.dot(moved) > 0) this.decideReview('Keep', card.position, null, v.clone());
      else if (!hand.closed) {
        if (travel > tuning.dropTravel) this.decideReview('Keep', card.position, null, moved.clone());
        else this.springBack();
      }
      return;
    }

    // Round 2: lift it to a reply or the mic, or on up past them for tomorrow.
    if (card.position.y > this.laterLine) {
      this.decideWork('Later', -1);
      return;
    }
    if (!hand.closed) {
      this.springBack();
      return;
    }
    let over = -1;
    for (let i = 0; i < this.targets.length; i++) {
      const target = this.targets[i];
      if (Math.abs(card.position.x - target.at.x) < target.halfW && Math.abs(card.position.y - target.at.y) < target.halfH) over = i;
    }
    this.setHover(over);
    if (over < 0) return;
    this.hoverTime += dt;
    const need = over === Mic ? tuning.micHold : tuning.replyHold;
    const bar = this.bars[over];
    bar.visible = true;
    bar.scale.set(clamp(this.hoverTime / need, 0.001, 1), 1, 1);
    if (this.hoverTime >= need) {
      if (over === Mic) this.startDictation();
      else this.decideWork('Reply', over);
    }
  }

  // ----------------------------------------------------------------- update

  /**
   * On a monitor: the lens (a hit punches the view out for a moment), where the head is, and the
   * round's squares pinned to the top left of the picture. Never in a headset.
   */
  private updateDesktopLens(): void {
    const camera = this.ctx.camera;
    if (this.inXR()) {
      if (!this.ctx.inXR() && camera.zoom !== 1) {
        camera.zoom = 1;
        camera.updateProjectionMatrix();
      }
      return;
    }
    // The field of view is the courtyard's; the punch rides on top of it as zoom.
    const tanBase = Math.tan(camera.fov * Deg2Rad * 0.5);
    const kick = tuning.fovKickDeg * this.fovKick * this.fovKick;
    const zoom = kick > 1e-4 ? tanBase / Math.tan(Math.min(170, camera.fov + kick) * Deg2Rad * 0.5) : 1;
    if (Math.abs(camera.zoom - zoom) > 1e-6) {
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
    }
    this.tanHalfFov = tanBase / zoom;
    this.aspect = camera.aspect;
    camera.updateWorldMatrix(true, false);
    camera.matrixWorld.decompose(_a, _q, _s);
    flipPoint(_a, this.headAt);
    flipQuaternion(_q, this.headTurn);
    if (this.hud.mesh.visible) {
      this.viewportToWorld(0.18, 0.93, 1.6, this.hud.mesh.position);
      this.hud.mesh.quaternion.copy(this.headTurn);
    }
  }

  /** Advance the game by `delta` seconds. Call once a frame, before the scene is drawn. */
  step(delta: number): void {
    const session = this.session;
    this.updateDesktopLens();
    this.hints.layout();
    const dt = Math.min(Math.max(0, delta), 0.05);
    // A hit holds the world still for a few frames. Hands and head never stop.
    this.hitStop = Math.max(0, this.hitStop - dt);
    const world = this.hitStop > 0 ? dt * 0.08 : dt;
    this.clock += world;
    const clock = this.clock;
    const card = this.card;

    // Countdowns run into their round; the summary times out to home.
    const phase = session.phase;
    if (phase === 'Intro1' || phase === 'Intro2' || phase === 'Done') {
      this.phaseTimer -= dt;
      const count = Math.ceil(this.phaseTimer);
      if (phase !== 'Done' && count !== this.countdown && count > 0) {
        this.countdown = count;
        this.drawIntroText();
        this.introPunch = 1;
      }
      if (this.phaseTimer <= 0) {
        if (phase === 'Intro1') session.beginReview();
        else if (phase === 'Intro2') session.beginWork();
        else session.goHome();
        this.pendingCard = session.current !== null;
        this.pendingTimer = 0.3; // let GO! land first
        this.syncPhase();
      }
    }
    // A round's first letter is drawn during its countdown, once the last cut has cleared.
    if ((session.phase === 'Intro1' || session.phase === 'Intro2') && this.prepared === null && this.phaseTimer < 2 && this.phaseTimer > 0.2 && this.flyAge >= 1) {
      this.prepare(session.phase === 'Intro1' ? session.deck[0] ?? null : session.keptEmails[0] ?? null);
    }
    if (this.goTimer > 0) {
      this.goTimer -= dt;
      if (this.goTimer <= 0 && (session.phase === 'Review' || session.phase === 'Work')) this.intro.mesh.visible = false;
    }
    this.introPunch = Math.max(0, this.introPunch - dt * 5);
    this.intro.mesh.scale.setScalar(1 + 0.12 * this.introPunch * this.introPunch);

    // The summary throws confetti for its first moments.
    if (this.confetti > 0 && session.phase === 'Done') {
      const before = this.confetti;
      this.confetti -= dt;
      if (Math.floor(before / 0.35) !== Math.floor(this.confetti / 0.35)) {
        const colors = [level.accent, level.second, Look.Gold, Green];
        for (let i = 0; i < 2; i++) {
          const at = _a.copy(this.introAt);
          at.x += range(-0.5, 0.5);
          at.y += range(0, 0.25);
          at.z -= 0.1;
          this.sparks.burst(at, Up, 0.9, pick(colors), 14, 1, 3, 0.012, 0.9, 3);
        }
        this.ctx.world.kick(0.5);
      }
    }

    // Next card.
    if (this.pendingCard && this.cardState === 'Hidden') {
      this.pendingTimer -= world;
      if (this.pendingTimer <= 0) {
        this.pendingCard = false;
        this.showCard();
      }
    }

    // Card motion. An email comes out of the middle of the sky, waits in front of the player,
    // drifting closer, and if nothing is done with it in time it flies on past them and goes
    // back in line. While it waits it is never quite still: a slow bob and a lazy sway.
    this.cardAge += dt;
    const bob = Math.sin(clock * 1.7) * 0.008;
    const sway = euler(
      4 + Math.sin(clock * 1.1) * 1.2, // top leaning away a little
      Math.sin(clock * 0.8) * 2,
      Math.sin(clock * 1.3 + 1) * 0.8,
      _r,
    );
    const waitAt = _f;
    let waitScale = this.waitingAt(waitAt);
    if (this.cardState === 'Arrive') {
      // From a speck dead ahead to its place: quick at first, then easing in so there is time
      // to start reading before it settles.
      this.cardTimer += world;
      const t = Math.min(1, this.cardTimer / tuning.arriveSeconds);
      const e = 1 - Math.pow(1 - t, 3);
      card.position.set(0, this.ctx.eye.y, this.cardHome.z + 16).lerp(waitAt, e);
      card.position.y += bob * e;
      card.quaternion.copy(sway);
      card.scale.setScalar(lerp(0.03, waitScale, e));
      if (t >= 1) {
        this.cardState = 'Idle';
        this.cardAge = 0;
        this.prepare(this.upcoming()); // it has landed: a quiet moment to get the next one ready
      }
    } else if (this.cardState === 'Idle') {
      this.readTime += world;
      waitScale = this.waitingAt(waitAt);
      card.position.copy(waitAt);
      card.position.y += bob;
      card.quaternion.copy(sway);
      card.scale.setScalar(waitScale);
      // Time is up, unless the katana is already on its way.
      if (this.readTime >= tuning.readSeconds && this.swingT < 0) this.startPass();
    } else if (this.cardState === 'Pass') {
      // It slides up and aside first, clear of the face, then rushes by.
      this.cardTimer += world;
      const t = Math.min(1, this.cardTimer / tuning.passSeconds);
      const aside = 1 - (1 - t) * (1 - t);
      const rush = t * t * t;
      card.position.set(
        lerp(this.passFrom.x, this.passSide * 0.42, aside),
        lerp(this.passFrom.y, this.ctx.eye.y + 0.32, aside),
        lerp(this.passFrom.z, -0.45, rush),
      );
      card.quaternion.copy(this.passTurn).multiply(euler(0, -this.passSide * 28 * t, -this.passSide * 12 * t, _q));
      card.scale.setScalar(lerp(this.passScale, 1.5, t));
      if (t >= 1) this.cardPassed();
    } else if (this.cardState === 'Return') {
      this.cardTimer += dt;
      const t = Math.min(1, this.cardTimer / 0.18);
      card.position.lerpVectors(this.returnFrom, waitAt, 1 - (1 - t) * (1 - t));
      card.scale.setScalar(waitScale);
      if (t >= 1) this.cardState = 'Idle';
    } else if (this.cardState === 'Dictate') {
      // The card waits under the mic while the voice meter dances.
      this.dictateTimer += dt;
      const micAt = this.targets[Mic].at;
      const t = Math.min(1, this.dictateTimer / 0.2);
      card.position.lerpVectors(this.returnFrom, _a.set(micAt.x, micAt.y - 0.27, micAt.z), t);
      for (let i = 0; i < this.voice.length; i++) {
        const loud = 0.25 + Math.abs(Math.sin(clock * (7 + i * 1.7) + i * 1.3));
        this.voice[i].scale.set(1, loud, 1);
      }
      if (this.dictateTimer >= tuning.dictateSeconds) this.decideWork('Dictate', Mic);
    }
    // A newsletter's preview holds on its headline, then scrolls.
    if (this.scroll.visible && card.visible) {
      this.scrollTime += world;
      this.scrollMaterial.offset = (Math.max(0, this.scrollTime - 0.9) * 48) / CardArt.ScrollHeight;
    }
    // The paper takes a little of the evening.
    const night = clamp01(this.ctx.world.night);
    this.cardMaterial.night = night;
    this.flyMaterial.night = night;
    this.split.setNight(night);

    this.updateHands(dt);
    this.updateWeapon(dt);

    // The blade's trail.
    const sword = this.sword;
    if (sword.visible) {
      const length = lerp(SwordBladeStart, SwordBladeEnd, this.bladeOut);
      const inner = transformPoint(sword, _a.set(0, lerp(SwordBladeStart, length, 0.72), 0), _b);
      const tip = transformPoint(sword, _a.set(0, length, 0), _c);
      let speed = dt > 0 ? tip.distanceTo(this.tipWas) / dt : 0;
      if (speed > 25) speed = 0; // it was just put somewhere new
      this.tipSpeed = lerp(this.tipSpeed, speed, 0.4);
      this.tipWas.copy(tip);
      // No trail for the wind-up, nor for the katana at rest on a monitor.
      if ((this.swingT >= 0 && this.swingT < 0.3) || (!this.inXR() && this.swingT < 0)) this.trail.clear();
      else this.trail.push(inner, tip, clock);
    } else {
      this.tipSpeed = 0;
      this.trail.clear();
    }
    this.sfx.swing(sword.visible, this.tipSpeed, dt);   // the katana does not hum: it is heard when it is swung

    // The world around the seat.
    const underway = session.phase !== 'Home';
    if (underway !== this.underway) {
      this.underway = underway;
      this.ctx.world.round(underway);
    }
    this.sparks.step(world);
    this.hitFx.step(world);
    this.boom.step(world);
    this.split.step(world);
    // On a monitor a hit punches the view out for a moment. Never in a headset.
    this.fovKick = Math.max(0, this.fovKick - dt * 5);
    this.updateDesktopLens();
    if (this.hintsForXR !== this.inXR()) {
      this.hintsForXR = this.inXR();
      this.drawHints();
      // Out of the headset's way: back where a seated player looks for it.
      if (this.hintsForXR && this.hud.mesh.visible) {
        this.hud.mesh.position.set(0, this.hudY, this.cardHome.z + 0.06);
        this.hud.mesh.quaternion.identity();
      }
    }

    // A kept or sent card flying off.
    if (this.flyAge < 1) {
      this.flyAge = Math.min(1, this.flyAge + world / 0.26);
      this.flyer.position.lerpVectors(this.flyFrom, this.flyTarget, this.flyAge * this.flyAge);
      this.flyer.scale.setScalar(1 - 0.85 * this.flyAge);
      if (this.flyAge >= 1) this.flyer.visible = false;
    }

    // Flash, pop-up, HUD, and the reply the card is hovering over.
    if (this.flashAge < 1) {
      this.flashAge = Math.min(1, this.flashAge + world / 0.3);
      this.flash.scale.setScalar(0.15 + this.flashAge * 0.45);
      this.flashMaterial.setOpacity(0.55 * (1 - this.flashAge));
      if (this.flashAge >= 1) this.flash.visible = false;
    }
    if (this.popAge < 1) {
      // It punches in big and tilted, settles, then drifts up and fades.
      this.popAge = Math.min(1, this.popAge + dt / 0.85);
      const punch = clamp01(this.popAge / 0.1);
      const pop = this.pop.mesh;
      pop.scale.setScalar(1.8 - 0.8 * (1 - Math.pow(1 - punch, 3)));
      euler(0, 0, this.popTilt * (1 - Math.min(1, this.popAge * 3)), pop.quaternion);
      pop.position.copy(this.popFrom);
      pop.position.y += this.popAge * 0.08;
      this.pop.setOpacity(1 - Math.pow(Math.max(0, this.popAge - 0.3) / 0.7, 2));
      if (this.popAge >= 1) pop.visible = false;
    }
    this.hudPunch = Math.max(0, this.hudPunch - dt * 6);
    this.hud.mesh.scale.setScalar(1 + 0.06 * this.hudPunch * this.hudPunch);
    for (let i = 0; i < this.chips.length; i++) this.chips[i].mesh.scale.setScalar(this.hover === i ? 1.1 : 1);
    this.mic.mesh.scale.setScalar(this.hover === Mic || this.cardState === 'Dictate' ? 1.15 : 1);

    // Home: the logo floats and the big button asks to be pressed.
    if (session.phase === 'Home') {
      this.sizeLogo();
      this.logo.position.set(0, this.logoY + Math.sin(clock * 1.2) * 0.004, this.homeZ);
      this.startButton.label.mesh.scale.setScalar(1 + 0.02 * Math.sin(clock * 3.2));
    }
  }

  /** Take the game's listeners and its page elements away again. */
  destroy(): void {
    this.desktop.destroy();
    this.hints.destroy();
    this.stage.removeFromParent();
  }
}
