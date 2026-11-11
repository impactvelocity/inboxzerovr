import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  createSystem,
  DoubleSide,
  Entity,
  Group,
  InputComponent,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PokeInteractable,
  Pressed,
  Quaternion,
  RayInteractable,
  SRGBColorSpace,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import {
  drawButton,
  drawEmailCard,
  drawIntro,
  drawLabel,
  drawMic,
  drawReplyChip,
  INK,
} from './card-art.js';
import { HomeButton, Inbox } from './game-components.js';
import {
  applyRoundOverrides,
  ROUND,
  Session,
  type Phase,
  type WorkAction,
} from './round.js';
import {
  createHammer,
  createSword,
  HAMMER_HEAD_RADIUS,
  HAMMER_HEAD_Y,
  NEON,
  SWORD_BLADE_END,
  SWORD_BLADE_START,
} from './scene-assets/arena.scene-asset.js';
import { Sfx } from './sfx.js';

/**
 * Inbox Zero: a seated, hands-only game. The rules are in round.ts; this
 * system is the body: the home screen, the card, the hands, the weapon.
 *
 *   Home     a start button and some placeholder buttons.
 *   Round 1  Review. Right hand holds a weapon: swing it through an email to
 *            destroy it. Left hand grabs an email and throws it away to keep.
 *   Round 2  The work. Grab a kept email with either hand and lift it onto a
 *            ready-made reply (3 s) or the mic (2 s) above it, or throw it up
 *            past them to leave it for tomorrow.
 *
 * Everything is within arm's reach of a chair. Keys work too (see onKey).
 */

// ------------------------------------------------------------------ tuning
// Everything worth adjusting on a headset lives here.
const TUNING = {
  swordSpeed: 1.0, // m/s the blade must be moving to cut
  hammerSpeed: 0.8, // m/s the hammer head must be moving to smash
  hitDepth: 0.1, // the card's hit volume reaches this far in front and behind
  hitMargin: 0.03, // and this far past its edges
  weaponTiltDeg: 20, // how far the weapon leans toward the fingers
  grabReach: 0.12, // a palm this close to the card can grab it
  pinchOn: 0.025, // thumb-to-index distance that closes a pinch
  pinchOff: 0.045, // and the distance that opens it again
  fistCurl: 0.09, // middle fingertip this close to the wrist is a fist
  swipeSpeed: 0.9, // m/s throw that sends a held card without letting go
  swipeTravel: 0.07, // the card must also have moved this far
  dropTravel: 0.13, // or: carry it this far and let go
  arriveSeconds: 0.22, // how long the next email takes to fly in
  nextDelay: 0.08, // pause between one email and the next
  cardDistance: 0.72, // how far in front of the chair the email floats
  introSeconds: 4, // "get ready" before round 1
  intro2Seconds: 6, // and before round 2 (more to read)
  doneSeconds: 7, // summary on screen before going home
  replyHold: 3, // seconds over a reply to send it
  micHold: 2, // seconds over the mic to start dictating
  dictateSeconds: 2.6, // how long the pretend dictation runs
  // 1: the weapon only hits while the right hand is closed (grab / squeeze /
  // pinch). On by default in the browser emulator, where the mouse drags the
  // hands around and an always-live weapon gets in the way of the left hand.
  gripToHit: 0,
};

type Tuning = typeof TUNING;

function applyTuningOverrides(): void {
  const values = TUNING as Record<string, number>;
  if ((window as unknown as { IWER_DEVICE?: unknown }).IWER_DEVICE) {
    values.gripToHit = 1;
  }
  const params = new URLSearchParams(window.location.search);
  for (const key of Object.keys(values)) {
    const raw = params.get(key);
    if (raw !== null && raw !== '' && Number.isFinite(Number(raw))) {
      values[key] = Number(raw);
    }
  }
  (window as unknown as { INBOX_TUNING: Tuning }).INBOX_TUNING = TUNING;
}

// ------------------------------------------------------------------ layout
// Z values here are for a card distance of 0.72 and move with that tuning.
const CARD_W = 0.4;
const CARD_H = 0.25;
const REVIEW_HOME = new Vector3(0, 1.02, -0.72);
const WORK_HOME = new Vector3(0, 0.95, -0.72);
const LATER_TARGET = new Vector3(0, 1.85, -0.9);
const DESK_WEAPON = new Vector3(0.3, 0.84, -0.64);
const HOME_Z = -0.66;
const INTRO_AT = new Vector3(0, 1.2, -1.3);
const OFFSTAGE_Y = -50; // hidden buttons wait here, out of reach of any ray

// Round 2 targets, in a row above the card. Order matters: 0 and 1 are replies.
const MIC = 2;
const TARGETS = [
  { at: new Vector3(-0.27, 1.23, -0.69), halfW: 0.15, halfH: 0.11 },
  { at: new Vector3(0.27, 1.23, -0.69), halfW: 0.15, halfH: 0.11 },
  { at: new Vector3(0, 1.24, -0.69), halfW: 0.1, halfH: 0.11 },
];
/** Carry or throw a card higher than this, past the row, for tomorrow. */
const LATER_LINE = 1.42;

// WebXR hand joint order.
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_KNUCKLE = 6;
const INDEX_TIP = 9;
const MIDDLE_KNUCKLE = 11;
const MIDDLE_TIP = 14;
const PINKY_KNUCKLE = 21;

const SWORD_SAMPLES = 5;
const PIECE_SECONDS = 0.7;
const GRAVITY = 4;
const VOICE_BARS = 5;

type Weapon = 'sword' | 'hammer';
type Side = 'left' | 'right';
type CardState = 'hidden' | 'arrive' | 'idle' | 'held' | 'return' | 'dictate';

interface Piece {
  mesh: Mesh;
  /** Centre of the piece on the card, in card space. */
  offset: Vector3;
  velocity: Vector3;
  spin: Vector3;
  /** Set for the whole card flying off somewhere. */
  target: Vector3 | null;
  from: Vector3;
}

interface Hand {
  side: Side;
  tracked: boolean;
  closed: boolean;
  /** Set after a card leaves: the hand has to open before it grabs again. */
  mustOpen: boolean;
  palm: Vector3;
  prev: Vector3;
  velocity: Vector3;
}

interface Label {
  mesh: Mesh;
  ctx: CanvasRenderingContext2D;
  texture: CanvasTexture;
}

function makeLabel(
  width: number,
  height: number,
  pxW: number,
  pxH: number,
  pressable = false,
): Label {
  const canvas = document.createElement('canvas');
  canvas.width = pxW;
  canvas.height = pxH;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const mesh = new Mesh(
    new PlaneGeometry(width, height),
    new MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  if (!pressable) mesh.raycast = () => {};
  return { mesh, ctx: canvas.getContext('2d')!, texture };
}

function makeHand(side: Side): Hand {
  return {
    side,
    tracked: false,
    closed: false,
    mustOpen: false,
    palm: new Vector3(),
    prev: new Vector3(),
    velocity: new Vector3(),
  };
}

export class InboxSystem extends createSystem({
  pressed: { required: [HomeButton, Pressed] },
}) {
  private session = new Session();
  private sfx = new Sfx();
  private phase: Phase | null = null; // the phase the scene is dressed for
  private phaseTimer = 0;
  private countdown = -1;

  // Home screen.
  private homeParts: Mesh[] = [];
  private weaponButton!: Label;

  // Round intro and summary text.
  private intro!: Label;

  // Card.
  private card!: Mesh;
  private cardEntity!: Entity;
  private cardMaterial!: MeshBasicMaterial;
  private cardCtx: CanvasRenderingContext2D[] = [];
  private cardTextures: CanvasTexture[] = [];
  private activeFace = 0;
  private cardState: CardState = 'hidden';
  private cardTimer = 0;
  private cardAge = 0;
  private cardHome = REVIEW_HOME;
  private returnFrom = new Vector3();
  private pendingCard = false;
  private pendingTimer = 0;

  // Pieces of a destroyed or sent card.
  private pieceMaterial!: MeshBasicMaterial;
  private grid: Piece[] = [];
  private halvesH: Piece[] = []; // top, bottom
  private halvesV: Piece[] = []; // left, right
  private whole!: Piece;
  private live: Piece[] = [];
  private pieceAge = PIECE_SECONDS;
  private flyTarget = new Vector3();

  // Feedback.
  private flash!: Mesh;
  private flashAge = 1;
  private pop!: Label;
  private popAge = 2;
  private popFrom = new Vector3();

  // Round 2: replies, mic, hold progress.
  private chips: Label[] = [];
  private mic!: Label;
  private bars: Mesh[] = [];
  private voice: Mesh[] = [];
  private hover = -1;
  private hoverTime = 0;
  private dictateTimer = 0;

  // Weapon and hands.
  private weapon: Weapon = 'sword';
  private weapons!: Record<Weapon, Group>;
  private weaponTracked = false;
  private samples: Vector3[] = [];
  private samplesPrev: Vector3[] = [];
  private swing = 1; // desktop swing animation, 0..1
  private hands: Record<Side, Hand> = {
    left: makeHand('left'),
    right: makeHand('right'),
  };
  private holder: Hand | null = null;
  private grabOffset = new Vector3();

  // Scratch.
  private a = new Vector3();
  private b = new Vector3();
  private c = new Vector3();
  private d = new Vector3();
  private x = new Vector3();
  private y = new Vector3();
  private z = new Vector3();
  private basis = new Matrix4();
  private q = new Quaternion();

  init(): void {
    applyTuningOverrides();
    applyRoundOverrides(window.location.search);
    const params = new URLSearchParams(window.location.search);
    if (params.get('weapon') === 'hammer') this.weapon = 'hammer';

    // Everything in reach moves out with the card.
    const push = -TUNING.cardDistance - REVIEW_HOME.z;
    REVIEW_HOME.z += push;
    WORK_HOME.z += push;
    DESK_WEAPON.z += push;
    for (const target of TARGETS) target.at.z += push;

    this.buildCard();
    this.buildPieces();
    this.buildFeedback();
    this.buildWeapons();
    this.buildHome(push);
    this.buildWork();

    // Simulator and desktop shortcuts. A headset has no keyboard.
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      this.sfx.unlock();
      if (!this.onKey(event.code)) return;
      event.preventDefault();
    };
    const unlock = () => this.sfx.unlock();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', unlock);
    this.cleanupFuncs.push(
      () => window.removeEventListener('keydown', onKey),
      () => window.removeEventListener('pointerdown', unlock),
      this.world.visibilityState.subscribe(() => this.sfx.unlock()),
      this.queries.pressed.subscribe('qualify', (entity) => {
        this.sfx.unlock();
        this.pressHome(entity.getValue(HomeButton, 'action') ?? '');
      }),
    );

    this.syncPhase();
  }

  private onKey(code: string): boolean {
    const phase = this.session.phase;
    const at = this.card.position;
    switch (code) {
      case 'Space':
      case 'Enter':
      case 'KeyD':
        if (phase === 'home') this.pressHome('start');
        else if (phase === 'review') {
          this.swing = 0;
          this.decideReview('destroy', at, true, null, null);
        } else this.phaseTimer = 0; // skip an intro or the summary
        return true;
      case 'ArrowLeft':
      case 'KeyA':
        this.decideReview('keep', at, true, null, null);
        return true;
      case 'Digit1':
        this.decideWork('reply', 0);
        return true;
      case 'Digit2':
        this.decideWork('reply', 1);
        return true;
      case 'KeyM':
        this.startDictation();
        return true;
      case 'ArrowUp':
      case 'KeyW':
        this.decideWork('later', -1);
        return true;
      case 'KeyS':
        this.pressHome('weapon');
        return true;
      default:
        return false;
    }
  }

  // ---------------------------------------------------------------- build

  private buildCard(): void {
    for (let i = 0; i < 2; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 640;
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 4;
      this.cardCtx.push(canvas.getContext('2d')!);
      this.cardTextures.push(texture);
    }
    this.cardMaterial = new MeshBasicMaterial({
      map: this.cardTextures[0],
      transparent: true,
      side: DoubleSide,
      toneMapped: false,
    });
    this.card = new Mesh(new PlaneGeometry(CARD_W, CARD_H), this.cardMaterial);
    this.card.name = 'EmailCard';
    this.card.raycast = () => {};
    this.card.visible = false;
    this.cardEntity = this.world.createTransformEntity(this.card);
    this.cardEntity.addComponent(Inbox);
  }

  private makePiece(u0: number, v0: number, u1: number, v1: number): Piece {
    const geometry = new PlaneGeometry((u1 - u0) * CARD_W, (v1 - v0) * CARD_H);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(
        i,
        u0 + uv.getX(i) * (u1 - u0),
        v0 + uv.getY(i) * (v1 - v0),
      );
    }
    const mesh = new Mesh(geometry, this.pieceMaterial);
    mesh.visible = false;
    mesh.raycast = () => {};
    this.world.createTransformEntity(mesh);
    return {
      mesh,
      offset: new Vector3(
        ((u0 + u1) / 2 - 0.5) * CARD_W,
        ((v0 + v1) / 2 - 0.5) * CARD_H,
        0,
      ),
      velocity: new Vector3(),
      spin: new Vector3(),
      target: null,
      from: new Vector3(),
    };
  }

  private buildPieces(): void {
    this.pieceMaterial = new MeshBasicMaterial({
      map: this.cardTextures[0],
      transparent: true,
      side: DoubleSide,
      toneMapped: false,
    });
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        this.grid.push(
          this.makePiece(col / 4, row / 3, (col + 1) / 4, (row + 1) / 3),
        );
      }
    }
    this.halvesH = [this.makePiece(0, 0.5, 1, 1), this.makePiece(0, 0, 1, 0.5)];
    this.halvesV = [this.makePiece(0, 0, 0.5, 1), this.makePiece(0.5, 0, 1, 1)];
    this.whole = this.makePiece(0, 0, 1, 1);
  }

  private buildFeedback(): void {
    this.flash = new Mesh(
      new CircleGeometry(0.5, 32),
      new MeshBasicMaterial({
        color: NEON.cyan,
        blending: AdditiveBlending,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.flash.visible = false;
    this.flash.raycast = () => {};
    this.world.createTransformEntity(this.flash);

    this.pop = makeLabel(0.56, 0.07, 1024, 128);
    this.pop.mesh.visible = false;
    this.pop.mesh.renderOrder = 5;
    this.world.createTransformEntity(this.pop.mesh);

    this.intro = makeLabel(1.1, 0.55, 1024, 512);
    this.intro.mesh.position.copy(INTRO_AT);
    this.intro.mesh.visible = false;
    this.intro.mesh.name = 'IntroText';
    this.world.createTransformEntity(this.intro.mesh);
  }

  private buildWeapons(): void {
    const make = (group: Group): Group => {
      group.visible = false;
      group.traverse((child) => {
        child.raycast = () => {};
      });
      this.world.createTransformEntity(group);
      return group;
    };
    this.weapons = { sword: make(createSword()), hammer: make(createHammer()) };
    for (let i = 0; i < SWORD_SAMPLES; i++) {
      this.samples.push(new Vector3());
      this.samplesPrev.push(new Vector3());
    }
  }

  /** Title, tagline, a start button and three smaller buttons. */
  private buildHome(push: number): void {
    const z = HOME_Z + push;
    const text = (
      label: Label,
      words: string,
      color: string,
      y: number,
    ): void => {
      drawLabel(label.ctx, words, color);
      label.texture.needsUpdate = true;
      label.mesh.position.set(0, y, z);
      label.mesh.userData.homeY = y;
      this.world.createTransformEntity(label.mesh);
      this.homeParts.push(label.mesh);
    };
    text(makeLabel(0.62, 0.124, 1024, 205), 'INBOX ZERO', INK.text, 1.42);
    text(
      makeLabel(0.62, 0.045, 1024, 74),
      'End of the day. Clear it out.',
      INK.dim,
      1.32,
    );

    const button = (
      action: string,
      words: string,
      width: number,
      x: number,
      y: number,
    ): Label => {
      const primary = action === 'start';
      const label = makeLabel(width, width / 2.84, 512, 180, true);
      drawButton(label.ctx, words, primary);
      label.texture.needsUpdate = true;
      label.mesh.position.set(x, y, z);
      label.mesh.userData.homeY = y;
      label.mesh.name = `Home-${action}`;
      const entity = this.world.createTransformEntity(label.mesh);
      entity.addComponent(RayInteractable);
      entity.addComponent(PokeInteractable);
      entity.addComponent(HomeButton, { action });
      this.homeParts.push(label.mesh);
      return label;
    };
    button('start', 'START', 0.34, 0, 1.14);
    // Placeholders for now. The middle one already switches the weapon.
    button('settings', 'SETTINGS', 0.2, -0.23, 0.98);
    this.weaponButton = button('weapon', '', 0.2, 0, 0.98);
    button('scores', 'SCORES', 0.2, 0.23, 0.98);
    this.drawWeaponButton();
  }

  private drawWeaponButton(): void {
    drawButton(this.weaponButton.ctx, this.weapon.toUpperCase(), false);
    this.weaponButton.texture.needsUpdate = true;
  }

  /** Round 2: two reply chips, the mic, hold bars and the voice meter. */
  private buildWork(): void {
    const barMaterial = new MeshBasicMaterial({
      color: NEON.cyan,
      toneMapped: false,
    });
    for (let i = 0; i < TARGETS.length; i++) {
      const target = TARGETS[i];
      const label =
        i === MIC ? makeLabel(0.15, 0.15, 256, 256) : makeLabel(0.26, 0.1, 512, 200);
      label.mesh.position.copy(target.at);
      label.mesh.visible = false;
      this.world.createTransformEntity(label.mesh);
      if (i === MIC) this.mic = label;
      else this.chips.push(label);

      // A bar under the target that fills while a card is held over it.
      const width = i === MIC ? 0.13 : 0.24;
      const geometry = new PlaneGeometry(width, 0.012);
      geometry.translate(width / 2, 0, 0); // grows from its left end
      const bar = new Mesh(geometry, barMaterial);
      bar.position.set(
        target.at.x - width / 2,
        target.at.y - (i === MIC ? 0.088 : 0.064),
        target.at.z + 0.002,
      );
      bar.visible = false;
      bar.raycast = () => {};
      this.world.createTransformEntity(bar);
      this.bars.push(bar);
    }
    drawMic(this.mic.ctx, false);
    this.mic.texture.needsUpdate = true;

    const voiceMaterial = new MeshBasicMaterial({
      color: NEON.coral,
      toneMapped: false,
    });
    const micAt = TARGETS[MIC].at;
    for (let i = 0; i < VOICE_BARS; i++) {
      const bar = new Mesh(new BoxGeometry(0.012, 0.05, 0.004), voiceMaterial);
      bar.position.set(
        micAt.x + (i - (VOICE_BARS - 1) / 2) * 0.022,
        micAt.y + 0.12,
        micAt.z + 0.01,
      );
      bar.visible = false;
      bar.raycast = () => {};
      this.world.createTransformEntity(bar);
      this.voice.push(bar);
    }
  }

  // ----------------------------------------------------------------- flow

  private inXR(): boolean {
    return this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
  }

  private pressHome(action: string): void {
    if (this.session.phase !== 'home') return;
    if (action === 'start') {
      this.session.start((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);
      this.sfx.fanfare();
      this.syncPhase();
    } else if (action === 'weapon') {
      this.weapon = this.weapon === 'sword' ? 'hammer' : 'sword';
      this.drawWeaponButton();
      this.sfx.swap();
      this.publish();
    } else {
      // Settings and scores are not built yet.
      this.sfx.swap();
      this.showPop(
        'COMING SOON',
        INK.dim,
        this.a.set(0, 0.86, this.homeParts[0].position.z),
      );
    }
  }

  /** Dress the scene for the session's phase. Call after it changes. */
  private syncPhase(): void {
    const session = this.session;
    const phase = session.phase;
    if (phase === this.phase) return;
    this.phase = phase;
    this.countdown = -1;

    const home = phase === 'home';
    for (const part of this.homeParts) {
      part.visible = home;
      part.position.y = home ? (part.userData.homeY as number) : OFFSTAGE_Y;
    }
    const work = phase === 'work';
    for (const chip of this.chips) chip.mesh.visible = work;
    this.mic.mesh.visible = work;
    this.setHover(-1);
    for (const bar of this.voice) bar.visible = false;
    this.cardHome = work ? WORK_HOME : REVIEW_HOME;

    const intro = phase === 'intro1' || phase === 'intro2' || phase === 'done';
    this.intro.mesh.visible = intro;
    if (phase === 'intro1') this.phaseTimer = TUNING.introSeconds;
    else if (phase === 'intro2') this.phaseTimer = TUNING.intro2Seconds;
    else if (phase === 'done') {
      this.phaseTimer = TUNING.doneSeconds;
      this.sfx.fanfare();
    }
    if (intro) this.drawIntroText();
    this.publish();
  }

  private drawIntroText(): void {
    const session = this.session;
    const count =
      this.phase === 'done' ? '' : String(Math.max(1, this.countdown));
    if (this.phase === 'intro1') {
      drawIntro(
        this.intro.ctx,
        'ROUND 1',
        'INBOX REVIEW',
        [
          `${Math.round(ROUND.size)} unread. Destroy the junk: right hand.`,
          'Keep what needs a reply: grab it with',
          'your left hand and throw it aside.',
        ],
        count,
      );
    } else if (this.phase === 'intro2') {
      const n = session.keptEmails.length;
      drawIntro(
        this.intro.ctx,
        'ROUND 2',
        'THE WORK',
        [
          `${n} kept. Grab one and hold it over a reply,`,
          'or over the mic to dictate.',
          'Throw it up past them for tomorrow.',
        ],
        count,
      );
    } else {
      const sent = session.replied + session.dictated;
      drawIntro(
        this.intro.ctx,
        'DONE FOR THE DAY',
        'INBOX ZERO',
        [
          `${session.destroyed} destroyed  ·  ${sent} replied  ·  ${session.later} tomorrow`,
          session.mistakes > 0
            ? `${session.mistakes} you needed went in the bin. Oops.`
            : 'Nothing important was harmed.',
        ],
        '',
      );
    }
    this.intro.texture.needsUpdate = true;
  }

  private showCard(): void {
    const email = this.session.current;
    if (!email) return;
    this.activeFace ^= 1;
    drawEmailCard(this.cardCtx[this.activeFace], email);
    this.cardTextures[this.activeFace].needsUpdate = true;
    this.cardMaterial.map = this.cardTextures[this.activeFace];
    if (this.session.phase === 'work') {
      for (let i = 0; i < this.chips.length; i++) {
        drawReplyChip(this.chips[i].ctx, email.replies[i]);
        this.chips[i].texture.needsUpdate = true;
      }
    }
    this.cardState = 'arrive';
    this.cardTimer = 0;
    this.cardAge = 0;
    this.card.visible = true;
    this.card.rotation.set(-0.2, 0, 0);
    this.sfx.arrive();
  }

  private cardLive(): boolean {
    return (
      this.cardState === 'idle' ||
      this.cardState === 'held' ||
      this.cardState === 'return' ||
      this.cardState === 'dictate'
    );
  }

  private showPop(words: string, color: string, at: Vector3): void {
    drawLabel(this.pop.ctx, words, color);
    this.pop.texture.needsUpdate = true;
    this.popFrom.copy(at);
    this.pop.mesh.visible = true;
    this.popAge = 0;
  }

  /** The card is gone, one way or another: tidy up and line up the next. */
  private cardLeft(headline: string, good: boolean, at: Vector3): void {
    this.pieceAge = 0;
    this.card.visible = false;
    this.cardState = 'hidden';
    this.holder = null;
    this.hands.left.mustOpen = true;
    this.hands.right.mustOpen = true;
    this.setHover(-1);

    const flashMaterial = this.flash.material as MeshBasicMaterial;
    flashMaterial.color.set(good ? NEON.cyan : NEON.coral);
    this.flash.position.copy(at);
    this.flash.position.z += 0.01;
    this.flash.visible = true;
    this.flashAge = 0;
    this.a.copy(this.cardHome);
    this.a.y += CARD_H / 2 + 0.06;
    this.showPop(headline, good ? INK.green : INK.coral, this.a);

    this.pendingCard = this.session.current !== null;
    this.pendingTimer = TUNING.nextDelay;
    this.syncPhase();
    this.publish();
  }

  /** Send the whole card flying to `target`, shrinking as it goes. */
  private flyCard(target: Vector3): void {
    this.pieceMaterial.map = this.cardTextures[this.activeFace];
    this.pieceMaterial.opacity = 1;
    for (const piece of this.live) piece.mesh.visible = false;
    this.live = [this.whole];
    const piece = this.whole;
    piece.mesh.position.copy(this.card.position);
    piece.mesh.quaternion.copy(this.card.quaternion);
    piece.mesh.scale.setScalar(1);
    piece.mesh.visible = true;
    piece.from.copy(this.card.position);
    this.flyTarget.copy(target);
    piece.target = this.flyTarget;
  }

  /**
   * Round 1. `at` is where it happened, `horizontal` the direction of a sword
   * cut, `push` the weapon's velocity, `away` the direction a kept card flies.
   */
  private decideReview(
    action: 'destroy' | 'keep',
    at: Vector3,
    horizontal: boolean,
    push: Vector3 | null,
    away: Vector3 | null,
  ): void {
    if (!this.cardLive()) return;
    const session = this.session;
    const verdict = session.review(action);
    if (!verdict) return;

    if (action === 'destroy') {
      this.pieceMaterial.map = this.cardTextures[this.activeFace];
      this.pieceMaterial.opacity = 1;
      for (const piece of this.live) piece.mesh.visible = false;
      this.live =
        this.weapon === 'hammer'
          ? this.grid
          : horizontal
            ? this.halvesH
            : this.halvesV;
      this.scatter(push);
      if (!verdict.correct) this.sfx.wrong();
      else if (this.weapon === 'hammer') this.sfx.smash(session.streak);
      else this.sfx.slash(session.streak);
    } else {
      // Off to the side it was thrown, or to the left by default.
      if (away && away.lengthSq() > 1e-6) this.b.copy(away).normalize();
      else this.b.set(-1, 0.1, 0);
      this.b.multiplyScalar(0.8).add(this.card.position);
      this.flyCard(this.b);
      this.sfx.sort(session.streak);
    }
    this.z.copy(at);
    this.cardLeft(verdict.headline, verdict.correct, this.z);
  }

  /** Round 2. `target` is the reply or mic it was sent through, or -1. */
  private decideWork(action: WorkAction, target: number): void {
    if (!this.cardLive()) return;
    const session = this.session;
    const wasDictating = this.cardState === 'dictate';
    const verdict = session.work(action);
    if (!verdict) return;
    for (const bar of this.voice) bar.visible = false;
    if (wasDictating) {
      drawMic(this.mic.ctx, false);
      this.mic.texture.needsUpdate = true;
    }
    this.flyCard(target >= 0 ? TARGETS[target].at : LATER_TARGET);
    this.sfx.sort(session.streak);
    this.z.copy(this.card.position);
    this.cardLeft(verdict.headline, true, this.z);
  }

  /** The card was held over the mic long enough: pretend to listen. */
  private startDictation(): void {
    if (this.session.phase !== 'work') return;
    if (!this.cardLive() || this.cardState === 'dictate') return;
    this.cardState = 'dictate';
    this.dictateTimer = 0;
    this.returnFrom.copy(this.card.position);
    this.holder = null;
    this.hands.left.mustOpen = true;
    this.hands.right.mustOpen = true;
    this.setHover(-1);
    drawMic(this.mic.ctx, true);
    this.mic.texture.needsUpdate = true;
    for (const bar of this.voice) bar.visible = true;
    this.sfx.swap();
    this.publish();
  }

  private setHover(target: number): void {
    if (target === this.hover) return;
    this.hover = target;
    this.hoverTime = 0;
    for (let i = 0; i < this.bars.length; i++) this.bars[i].visible = false;
    if (target >= 0) this.sfx.grab();
  }

  private scatter(push: Vector3 | null): void {
    this.card.updateMatrixWorld();
    for (const piece of this.live) {
      const mesh = piece.mesh;
      mesh.position.copy(piece.offset).applyMatrix4(this.card.matrixWorld);
      mesh.quaternion.copy(this.card.quaternion);
      mesh.scale.setScalar(1);
      mesh.visible = true;
      piece.target = null;
      // Outward from the middle of the card, plus some of the weapon's push.
      piece.velocity
        .copy(piece.offset)
        .applyQuaternion(this.card.quaternion)
        .multiplyScalar(5)
        .add(this.a.set(Math.random() - 0.5, Math.random() * 0.8, -0.3));
      if (push) piece.velocity.addScaledVector(push, 0.35);
      piece.spin.set(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
      );
    }
  }

  /** Mirror the game state into the ECS so tools and tests can read it. */
  private publish(): void {
    const entity = this.cardEntity;
    const session = this.session;
    entity.setValue(Inbox, 'phase', session.phase);
    entity.setValue(Inbox, 'card', this.cardState);
    entity.setValue(Inbox, 'weapon', this.weapon);
    entity.setValue(Inbox, 'remaining', session.remaining);
    entity.setValue(Inbox, 'mistakes', session.mistakes);
    entity.setValue(Inbox, 'destroyed', session.destroyed);
    entity.setValue(Inbox, 'kept', session.kept);
    entity.setValue(Inbox, 'replied', session.replied);
    entity.setValue(Inbox, 'dictated', session.dictated);
    entity.setValue(Inbox, 'later', session.later);
  }

  // ---------------------------------------------------------------- hands

  private joint(target: Vector3, joints: Float32Array, id: number): Vector3 {
    return target.set(
      joints[id * 16 + 12],
      joints[id * 16 + 13],
      joints[id * 16 + 14],
    );
  }

  private handJoints(side: Side): Float32Array | null {
    if (!this.input.xr.isPrimary('hand', side)) return null;
    return this.input.xr.visualAdapters.hand[side].jointTransforms ?? null;
  }

  /** Thumb and index together, or the whole hand closed. */
  private handClosed(joints: Float32Array, wasClosed: boolean): boolean {
    const pinch = this.joint(this.a, joints, THUMB_TIP).distanceTo(
      this.joint(this.b, joints, INDEX_TIP),
    );
    const curl = this.joint(this.a, joints, MIDDLE_TIP).distanceTo(
      this.joint(this.b, joints, WRIST),
    );
    if (curl > 0 && curl < TUNING.fistCurl) return true;
    return pinch < (wasClosed ? TUNING.pinchOff : TUNING.pinchOn);
  }

  /** Where one hand is, how fast it is moving and whether it is closed. */
  private readHand(hand: Hand, dt: number): void {
    const xr = this.inXR();
    const joints = xr ? this.handJoints(hand.side) : null;
    const controller =
      xr && !joints && this.input.xr.isPrimary('controller', hand.side);
    if (!joints && !controller) {
      hand.tracked = false;
      hand.closed = false;
      return;
    }
    const pad = this.input.xr.gamepads[hand.side];
    const pressed =
      (pad?.getSelecting() ?? false) ||
      (pad?.getButtonPressed(InputComponent.Squeeze) ?? false);
    hand.closed = joints
      ? this.handClosed(joints, hand.closed) || pressed
      : pressed;

    hand.prev.copy(hand.palm);
    this.player.gripSpaces[hand.side].getWorldPosition(hand.palm);
    if (!hand.tracked || dt <= 0) {
      hand.prev.copy(hand.palm);
      hand.velocity.set(0, 0, 0);
    } else {
      this.a.copy(hand.palm).sub(hand.prev).divideScalar(dt);
      if (this.a.lengthSq() > 15 * 15) this.a.set(0, 0, 0); // tracking jump
      hand.velocity.lerp(this.a, 0.5);
    }
    hand.tracked = true;
    if (!hand.closed) hand.mustOpen = false;
  }

  /** Is this world point inside the card's hit volume? */
  private touchesCard(point: Vector3, radius: number): boolean {
    this.d.copy(point);
    this.card.worldToLocal(this.d);
    const margin = TUNING.hitMargin + radius;
    return (
      Math.abs(this.d.x) < CARD_W / 2 + margin &&
      Math.abs(this.d.y) < CARD_H / 2 + margin &&
      Math.abs(this.d.z) < TUNING.hitDepth + radius
    );
  }

  private updateWeapon(dt: number): void {
    const weapon = this.weapons[this.weapon];
    this.weapons[this.weapon === 'sword' ? 'hammer' : 'sword'].visible = false;
    const phase = this.session.phase;
    if (phase !== 'intro1' && phase !== 'review') {
      weapon.visible = false; // the weapon belongs to round 1
      this.weaponTracked = false;
      return;
    }

    if (!this.inXR()) {
      // Desktop: the weapon waits at the side and swings on Space.
      this.swing = Math.min(1, this.swing + dt / 0.22);
      const arc = Math.sin(this.swing * Math.PI);
      weapon.scale.setScalar(1);
      weapon.position.copy(DESK_WEAPON);
      weapon.position.x -= arc * 0.22;
      weapon.position.y += arc * 0.14;
      weapon.rotation.set(-0.5 - arc * 0.9, 0, 0.35 + arc * 0.9);
      weapon.visible = true;
      this.weaponTracked = false;
      return;
    }

    const grip = this.player.gripSpaces.right;
    grip.updateWorldMatrix(true, false);
    const joints = this.handJoints('right');
    if (joints) {
      // Pose the weapon from the knuckles, so it does not depend on a grip
      // convention: the handle runs from the little finger to the thumb side.
      const world = grip.matrixWorld;
      this.joint(this.a, joints, WRIST).applyMatrix4(world);
      this.joint(this.b, joints, INDEX_KNUCKLE).applyMatrix4(world);
      this.joint(this.c, joints, PINKY_KNUCKLE).applyMatrix4(world);
      this.joint(this.d, joints, MIDDLE_KNUCKLE).applyMatrix4(world);
      this.y.copy(this.b).sub(this.c); // across the knuckles, toward the thumb
      this.z.copy(this.d).sub(this.a); // along the hand, toward the fingers
      if (this.y.lengthSq() < 1e-6 || this.z.lengthSq() < 1e-6) {
        weapon.visible = false;
        this.weaponTracked = false;
        return;
      }
      this.y.normalize();
      this.z.normalize();
      const tilt = (TUNING.weaponTiltDeg * Math.PI) / 180;
      this.y.multiplyScalar(Math.cos(tilt)).addScaledVector(this.z, Math.sin(tilt));
      this.y.normalize();
      this.z.addScaledVector(this.y, -this.z.dot(this.y)).normalize();
      this.x.crossVectors(this.y, this.z);
      this.basis.makeBasis(this.x, this.y, this.z);
      weapon.quaternion.setFromRotationMatrix(this.basis);
      weapon.position.copy(this.a).lerp(this.d, 0.8);
    } else if (this.input.xr.isPrimary('controller', 'right')) {
      // A controller: a held rod lies along the grip's -Z axis.
      grip.getWorldPosition(weapon.position);
      grip.getWorldQuaternion(weapon.quaternion);
      weapon.quaternion.multiply(this.q.setFromAxisAngle(this.x.set(1, 0, 0), -Math.PI / 2));
    } else {
      weapon.visible = false;
      this.weaponTracked = false;
      return;
    }
    // Grip mode: the weapon rests small in the open hand and is harmless
    // until the hand closes on it.
    const engaged = TUNING.gripToHit <= 0 || this.hands.right.closed;
    weapon.scale.setScalar(engaged ? 1 : 0.45);
    weapon.visible = true;
    weapon.updateMatrixWorld();
    if (!engaged) {
      this.weaponTracked = false; // no swing carries over from the open hand
      return;
    }

    // Where the business end is now, and how fast it is moving.
    const count = this.weapon === 'sword' ? SWORD_SAMPLES : 1;
    const radius = this.weapon === 'sword' ? 0.015 : HAMMER_HEAD_RADIUS;
    const needed =
      this.weapon === 'sword' ? TUNING.swordSpeed : TUNING.hammerSpeed;
    const canHit =
      phase === 'review' &&
      this.weaponTracked &&
      dt > 0 &&
      this.cardAge > 0.12 &&
      this.cardLive();
    let hit = false;
    for (let i = 0; i < count; i++) {
      const sample = this.samples[i];
      const along =
        this.weapon === 'sword'
          ? SWORD_BLADE_START +
            ((SWORD_BLADE_END - SWORD_BLADE_START) * i) / (SWORD_SAMPLES - 1)
          : HAMMER_HEAD_Y;
      sample.set(0, along, 0).applyMatrix4(weapon.matrixWorld);
      if (canHit && !hit) {
        this.c.copy(sample).sub(this.samplesPrev[i]).divideScalar(dt);
        const speed = this.c.length();
        // Faster than an arm can move is a tracking jump, not a swing.
        if (speed >= needed && speed < 15 && this.touchesCard(sample, radius)) {
          hit = true;
          this.b.copy(this.c); // world velocity, for the pieces
          this.q.copy(this.card.quaternion).invert();
          this.c.applyQuaternion(this.q); // velocity in card space
          const horizontal = Math.abs(this.c.x) > Math.abs(this.c.y);
          this.a.copy(sample);
          this.card.worldToLocal(this.a);
          this.a.z = 0;
          this.a.x = Math.max(-CARD_W / 2, Math.min(CARD_W / 2, this.a.x));
          this.a.y = Math.max(-CARD_H / 2, Math.min(CARD_H / 2, this.a.y));
          this.card.localToWorld(this.a);
          this.x.copy(this.a);
          this.y.copy(this.b);
          this.decideReview('destroy', this.x, horizontal, this.y, null);
        }
      }
    }
    for (let i = 0; i < count; i++) this.samplesPrev[i].copy(this.samples[i]);
    this.weaponTracked = true;
  }

  /** Close a hand on or near the card to pick it up. */
  private tryGrab(hand: Hand): void {
    if (!hand.tracked || !hand.closed || hand.mustOpen) return;
    if (this.cardAge <= 0.1) return;
    if (this.cardState !== 'idle' && this.cardState !== 'return') return;
    this.d.copy(hand.palm);
    this.card.worldToLocal(this.d);
    const ox = Math.max(0, Math.abs(this.d.x) - CARD_W / 2);
    const oy = Math.max(0, Math.abs(this.d.y) - CARD_H / 2);
    if (Math.hypot(ox, oy, this.d.z) < TUNING.grabReach) {
      this.grabOffset.copy(this.card.position).sub(hand.palm);
      this.cardState = 'held';
      this.holder = hand;
      this.sfx.grab();
    }
  }

  private springBack(): void {
    this.returnFrom.copy(this.card.position);
    this.cardState = 'return';
    this.cardTimer = 0;
    this.holder = null;
    this.setHover(-1);
  }

  private updateHands(dt: number): void {
    this.readHand(this.hands.left, dt);
    this.readHand(this.hands.right, dt);
    const phase = this.session.phase;
    const hand = this.holder;

    if (!hand || this.cardState !== 'held') {
      this.holder = null;
      if (phase === 'review') {
        this.tryGrab(this.hands.left); // the right hand has the weapon
      } else if (phase === 'work') {
        this.tryGrab(this.hands.left);
        if (!this.holder) this.tryGrab(this.hands.right);
      }
      return;
    }
    if (!hand.tracked) {
      this.springBack();
      return;
    }

    this.card.position.copy(hand.palm).add(this.grabOffset);
    this.c.copy(this.card.position).sub(this.cardHome); // how far it has moved
    const travel = this.c.length();
    const v = hand.velocity;

    if (phase === 'review') {
      // Throw it anywhere, or carry it off and let go: kept.
      if (
        v.length() > TUNING.swipeSpeed &&
        travel > TUNING.swipeTravel &&
        v.dot(this.c) > 0
      ) {
        this.y.copy(v);
        this.decideReview('keep', this.card.position, true, null, this.y);
      } else if (!hand.closed) {
        if (travel > TUNING.dropTravel) {
          this.y.copy(this.c);
          this.decideReview('keep', this.card.position, true, null, this.y);
        } else this.springBack();
      }
      return;
    }

    // Round 2: lift it to a reply or the mic, or on up past them for tomorrow.
    if (this.card.position.y > LATER_LINE) {
      this.decideWork('later', -1);
      return;
    }
    if (!hand.closed) {
      this.springBack();
      return;
    }
    let over = -1;
    for (let i = 0; i < TARGETS.length; i++) {
      const target = TARGETS[i];
      if (
        Math.abs(this.card.position.x - target.at.x) < target.halfW &&
        Math.abs(this.card.position.y - target.at.y) < target.halfH
      ) {
        over = i;
      }
    }
    this.setHover(over);
    if (over < 0) return;
    this.hoverTime += dt;
    const need = over === MIC ? TUNING.micHold : TUNING.replyHold;
    const bar = this.bars[over];
    bar.visible = true;
    bar.scale.x = Math.max(0.001, Math.min(1, this.hoverTime / need));
    if (this.hoverTime >= need) {
      if (over === MIC) this.startDictation();
      else this.decideWork('reply', over);
    }
  }

  // --------------------------------------------------------------- update

  update(delta: number, time: number): void {
    if (this.world.visibilityState.peek() === VisibilityState.VisibleBlurred) {
      return; // paused behind a system menu
    }
    const dt = Math.min(delta, 0.05);
    const session = this.session;

    // Intros count down into their round; the summary times out to home.
    const phase = session.phase;
    if (phase === 'intro1' || phase === 'intro2' || phase === 'done') {
      this.phaseTimer -= dt;
      const count = Math.ceil(this.phaseTimer);
      if (phase !== 'done' && count !== this.countdown && count > 0) {
        this.countdown = count;
        this.drawIntroText();
        if (count <= 3) this.sfx.grab();
      }
      if (this.phaseTimer <= 0) {
        if (phase === 'intro1') session.beginReview();
        else if (phase === 'intro2') session.beginWork();
        else session.goHome();
        this.pendingCard = session.current !== null;
        this.pendingTimer = 0;
        this.syncPhase();
      }
    }

    // Next card.
    if (this.pendingCard && this.cardState === 'hidden') {
      this.pendingTimer -= dt;
      if (this.pendingTimer <= 0) {
        this.pendingCard = false;
        this.showCard();
        this.publish();
      }
    }

    // Card motion.
    const home = this.cardHome;
    this.cardAge += dt;
    if (this.cardState === 'arrive') {
      this.cardTimer += dt;
      const t = Math.min(1, this.cardTimer / TUNING.arriveSeconds);
      const ease = 1 - (1 - t) ** 3;
      this.card.position.set(
        home.x,
        home.y + (1 - ease) * 0.15,
        home.z - (1 - ease) * 2.2,
      );
      this.card.scale.setScalar(0.3 + 0.7 * ease);
      if (t >= 1) {
        this.cardState = 'idle';
        this.cardAge = 0;
      }
    } else if (this.cardState === 'idle') {
      this.card.position.set(
        home.x,
        home.y + Math.sin(time * 2.2) * 0.006,
        home.z,
      );
    } else if (this.cardState === 'return') {
      this.cardTimer += dt;
      const t = Math.min(1, this.cardTimer / 0.18);
      this.card.position.lerpVectors(this.returnFrom, home, 1 - (1 - t) ** 2);
      if (t >= 1) this.cardState = 'idle';
    } else if (this.cardState === 'dictate') {
      // The card waits under the mic while the voice meter dances.
      this.dictateTimer += dt;
      const micAt = TARGETS[MIC].at;
      const t = Math.min(1, this.dictateTimer / 0.2);
      this.a.set(micAt.x, micAt.y - 0.27, micAt.z);
      this.card.position.lerpVectors(this.returnFrom, this.a, t);
      for (let i = 0; i < this.voice.length; i++) {
        this.voice[i].scale.y =
          0.25 + Math.abs(Math.sin(time * (7 + i * 1.7) + i * 1.3));
      }
      if (this.dictateTimer >= TUNING.dictateSeconds) {
        this.decideWork('dictate', MIC);
      }
    }
    this.card.updateMatrixWorld();

    this.updateHands(dt);
    this.updateWeapon(dt);

    // Pieces.
    if (this.pieceAge < PIECE_SECONDS) {
      this.pieceAge += dt;
      const life = Math.min(1, this.pieceAge / PIECE_SECONDS);
      for (const piece of this.live) {
        const mesh = piece.mesh;
        if (piece.target) {
          const t = Math.min(1, this.pieceAge / 0.26);
          mesh.position.lerpVectors(piece.from, piece.target, t * t);
          mesh.scale.setScalar(1 - 0.85 * t);
          if (t >= 1) mesh.visible = false;
        } else {
          piece.velocity.y -= GRAVITY * dt;
          mesh.position.addScaledVector(piece.velocity, dt);
          mesh.rotateX(piece.spin.x * dt);
          mesh.rotateY(piece.spin.y * dt);
          mesh.rotateZ(piece.spin.z * dt);
          if (life >= 1) mesh.visible = false;
        }
      }
      this.pieceMaterial.opacity = this.live[0]?.target ? 1 : 1 - life * life;
    }

    // Flash, pop text, and the reply the card is hovering over.
    if (this.flashAge < 1) {
      this.flashAge = Math.min(1, this.flashAge + dt / 0.28);
      this.flash.scale.setScalar(0.2 + this.flashAge * 0.9);
      (this.flash.material as MeshBasicMaterial).opacity =
        0.7 * (1 - this.flashAge);
      if (this.flashAge >= 1) this.flash.visible = false;
    }
    if (this.popAge < 1) {
      this.popAge = Math.min(1, this.popAge + dt / 0.8);
      this.pop.mesh.position.copy(this.popFrom);
      this.pop.mesh.position.y += this.popAge * 0.12;
      (this.pop.mesh.material as MeshBasicMaterial).opacity =
        1 - this.popAge ** 3;
      if (this.popAge >= 1) this.pop.mesh.visible = false;
    }
    for (let i = 0; i < this.chips.length; i++) {
      this.chips[i].mesh.scale.setScalar(this.hover === i ? 1.1 : 1);
    }
    this.mic.mesh.scale.setScalar(
      this.hover === MIC || this.cardState === 'dictate' ? 1.15 : 1,
    );
  }
}
