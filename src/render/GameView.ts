import { Group, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import type { AppEvent, Command, SessionController } from '../app/SessionController';
import type { AudioFeedback } from '../audio/AudioFeedback';
import { LAYOUT, PALETTE } from '../config';
import { formatHour, formatReceived } from '../domain/reminderTime';
import { BladeInteraction } from '../input/BladeInteraction';
import { GrabInteraction } from '../input/GrabInteraction';
import { XRInput, type HandInput } from '../input/XRInput';
import { ArenaScene } from './ArenaScene';
import { Effects } from './Effects';
import { EmailCard } from './EmailCard';
import { HandVisual } from './Hands';
import { Hud, MenuPanel, PausedPanel, ReadingPanel, ReviewStation, SummaryPanel, type PanelContext } from './Panels';
import { SortingPortal, type PortalId } from './SortingPortal';
import { UIManager } from './ui3d';

export interface ViewHooks {
  /** Leave the session view for the launch screen (desktop only). */
  onExitToLaunch(): void;
  onVRChange(inVR: boolean): void;
}

const DESKTOP_EYE = new Vector3(0, 1.2, 0.32);
const DESKTOP_LOOK = new Vector3(0, 1.08, -1.1);
const DEFAULT_SLASH_ANGLE = -0.5;
const TRIAGE_COMMANDS = new Set(['archive', 'keep', 'defer']);

/**
 * Owns the renderer and everything drawn. It reads session state, plays
 * feedback for events, and turns physical input into the same commands the
 * desktop buttons send. It never changes session state itself.
 */
export class GameView {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(62, 1, 0.05, 90);
  readonly ui = new UIManager();
  readonly arena: ArenaScene;
  readonly card = new EmailCard();
  readonly effects = new Effects();
  readonly portals: SortingPortal[];
  readonly reading: ReadingPanel;
  private cardHolder = new Group();
  private hud: Hud;
  private review: ReviewStation;
  private summary: SummaryPanel;
  private menu: MenuPanel;
  private paused = new PausedPanel();
  private xr: XRInput;
  private visuals: HandVisual[];
  private uiCapture = [false, false];
  private blade = new BladeInteraction();
  private grab: GrabInteraction;
  private session: XRSession | null = null;
  private needsRecenter = false;
  private recenterHold = 0;
  private stickRepeat = 0;
  private lastTime = 0;
  private triaging = false;
  private head = new Vector3();
  private raycaster = new Raycaster();
  private calmTarget = 0;
  /** Rolling frame stats, shown with ?stats. */
  stats = { fps: 0, calls: 0, triangles: 0 };

  constructor(
    container: HTMLElement,
    private controller: SessionController,
    private audio: AudioFeedback,
    private hooks: ViewHooks,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.xr.enabled = true;
    this.renderer.localClippingEnabled = true; // the slash effect clips each card half
    container.appendChild(this.renderer.domElement);

    this.arena = new ArenaScene(this.scene);
    const root = this.arena.root;
    this.portals = [
      new SortingPortal('keep', -1, 'KEEP', 'keep', PALETTE.cyan),
      new SortingPortal('tomorrow', 1, 'TOMORROW', 'calendar', PALETTE.coral),
    ];
    this.portals[0].setSub('review at the end');
    this.cardHolder.add(this.card.group);
    root.add(this.cardHolder, this.effects.group, ...this.portals.map((p) => p.group));

    const ctx: PanelContext = {
      controller,
      ui: this.ui,
      actions: {
        dispatch: (cmd) => this.dispatch(cmd, true),
        recenter: () => this.recenter(),
        exit: () => this.exit(),
        newDemo: () => this.dispatch({ type: 'start' }, true),
        inVR: () => this.inVR,
      },
    };
    this.hud = new Hud(ctx);
    this.reading = new ReadingPanel(ctx);
    this.review = new ReviewStation(ctx);
    this.summary = new SummaryPanel(ctx);
    this.menu = new MenuPanel(ctx);
    root.add(this.hud.group, this.reading.group, this.review.group, this.summary.group, this.menu.group, this.paused.group);

    this.xr = new XRInput(this.renderer, this.scene);
    this.visuals = this.xr.hands.map((h) => {
      const v = new HandVisual();
      h.space.add(v.group);
      this.scene.add(v.trail.mesh);
      return v;
    });
    this.grab = new GrabInteraction(root, this.portals);

    this.blade.onSwing = (speed) => this.audio.swing(speed);
    this.blade.onSlash = (angle, hand) => {
      hand.pulse(0.9, 70);
      this.dispatch({ type: 'archive', id: this.card.messageId ?? undefined, via: { kind: 'slash', angle } });
    };
    this.grab.onAimStart = (hand) => hand.pulse(0.15, 20);
    this.grab.onGrab = (hand) => {
      hand.pulse(0.4, 40);
      this.audio.grab(true);
    };
    this.grab.onMiss = () => this.audio.grab(false);
    this.grab.onThrow = (portal, hand) => {
      hand.pulse(0.3, 30);
      this.audio.grab(false);
      this.throwTo(portal, hand);
    };
    this.ui.onHover = (pointerId) => {
      const i = pointerId === 'xr0' ? 0 : pointerId === 'xr1' ? 1 : -1;
      if (i >= 0) this.xr.hands[i].pulse(0.12, 15);
    };

    controller.subscribe(() => this.sync());
    controller.onEvent((e) => this.onEvent(e));

    this.resetCamera();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => this.updatePaused());
    this.resize();
    this.sync();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  get inVR(): boolean {
    return this.session !== null;
  }

  // ---- commands ------------------------------------------------------------

  dispatch(cmd: Command, click = false): void {
    this.audio.unlock();
    if (click) this.audio.click();
    void this.controller.dispatch(cmd);
  }

  private exit(): void {
    if (this.session) void this.session.end();
    else this.hooks.onExitToLaunch();
  }

  // ---- VR session ----------------------------------------------------------

  async enterVR(): Promise<void> {
    if (this.session || !navigator.xr) return;
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
    this.renderer.xr.setReferenceSpaceType('local-floor');
    await this.renderer.xr.setSession(session);
    this.session = session;
    this.needsRecenter = true;
    this.blade.reset();
    this.xr.clear();
    session.addEventListener('visibilitychange', () => this.updatePaused());
    session.addEventListener('end', () => this.onSessionEnd());
    this.hooks.onVRChange(true);
    this.updatePaused();
    this.sync();
  }

  private onSessionEnd(): void {
    this.session = null;
    // Leaving VR must not decide anything: drop held cards and flights, keep state.
    this.interrupt();
    this.arena.root.position.set(0, 0, 0);
    this.arena.root.rotation.set(0, 0, 0);
    this.visuals.forEach((v) => v.setRole('none', false));
    this.resetCamera();
    this.resize();
    this.hooks.onVRChange(false);
    this.updatePaused();
    this.sync();
  }

  private updatePaused(): void {
    const hidden = document.visibilityState === 'hidden';
    const blurred = !!this.session && this.session.visibilityState !== 'visible';
    const paused = hidden || blurred;
    if (paused) this.interrupt();
    this.audio.suspend(paused);
    void this.controller.dispatch({ type: 'setPaused', paused });
  }

  /** Stop any gesture in progress without it counting as an action. */
  private interrupt(): void {
    this.grab.cancel(this.card);
    this.visuals.forEach((v) => {
      v.magnet.set(null);
      v.setGrabbing(false);
      v.setArmed(false);
    });
    this.audio.grab(false);
    if (this.effects.flying) {
      this.effects.cancelFlight();
      this.restoreCard();
    }
    this.blade.reset();
    this.xr.clear();
    this.uiCapture = [false, false];
    this.ui.point('xr0', null);
    this.ui.point('xr1', null);
  }

  /** Put the arena in front of wherever the player is sitting and looking now. */
  recenter(): void {
    if (!this.session) return;
    // The XR camera is posed before the frame callback; the scene camera only
    // catches up during render, so it would still hold last frame's pose here.
    const xrCamera = this.renderer.xr.getCamera();
    xrCamera.getWorldPosition(this.head);
    const dir = xrCamera.getWorldDirection(new Vector3());
    dir.y = 0;
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
    dir.normalize();
    const root = this.arena.root;
    root.rotation.set(0, Math.atan2(-dir.x, -dir.z), 0);
    root.position.set(this.head.x, this.head.y - LAYOUT.eyeHeight, this.head.z);
    root.updateMatrixWorld(true);
    // The world just moved under the blade; do not read that as a swing.
    this.blade.reset();
    this.grab.cancel(this.card);
  }

  private resetCamera(): void {
    this.camera.position.copy(DESKTOP_EYE);
    this.camera.lookAt(DESKTOP_LOOK);
    this.camera.updateMatrixWorld(true);
  }

  private resize(): void {
    if (this.renderer.xr.isPresenting) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Keep the console and both portals in view on narrow windows.
    this.camera.fov = this.camera.aspect < 1.5 ? Math.min(95, 62 * (1.5 / this.camera.aspect)) : 62;
    this.camera.updateProjectionMatrix();
  }

  // ---- desktop pointer -----------------------------------------------------

  /** Mouse position in normalised device coordinates, or null to clear hover. */
  pointerMove(ndc: Vector2 | null): void {
    if (this.inVR || !ndc) {
      this.ui.point('mouse', null);
      return;
    }
    this.raycaster.setFromCamera(ndc, this.camera);
    this.ui.point('mouse', this.raycaster.ray.origin, this.raycaster.ray.direction);
    this.renderer.domElement.style.cursor = this.ui.hovering('mouse') ? 'pointer' : 'default';
  }

  pointerClick(): boolean {
    if (this.inVR) return false;
    this.audio.unlock();
    const pressed = this.ui.press('mouse');
    if (pressed) this.audio.click();
    return pressed;
  }

  /** A quick mouse drag across the card is the desktop stand-in for a slash. */
  pointerSlash(from: Vector2, to: Vector2): void {
    if (this.inVR || !this.triaging || this.card.mode !== 'idle') return;
    const mid = from.clone().add(to).multiplyScalar(0.5);
    this.raycaster.setFromCamera(mid, this.camera);
    if (this.raycaster.intersectObject(this.card.group, true).length === 0) return;
    this.card.mode = 'locked';
    const aspect = this.camera.aspect;
    const angle = Math.atan2(to.y - from.y, (to.x - from.x) * aspect);
    this.dispatch({ type: 'archive', id: this.card.messageId ?? undefined, via: { kind: 'slash', angle } });
  }

  // ---- reacting to state ---------------------------------------------------

  private throwTo(portal: PortalId, hand?: HandInput): void {
    const id = this.card.messageId;
    const visual = this.card.takeVisual();
    if (!id || !visual) return;
    const target = this.portals.find((p) => p.id === portal)!;
    this.effects.fly(visual, target.group.position, () => {
      // The decision is made here, when the card is inside the portal, not at release.
      hand?.pulse(0.25, 25);
      this.dispatch({ type: portal === 'keep' ? 'keep' : 'defer', id, via: { kind: 'throw' } });
    });
  }

  /** Bring the current card back if a gesture's command did not go through. */
  private restoreCard(): void {
    const id = this.controller.currentId;
    if (!id || this.card.messageId !== id) return;
    if (!this.card.hasVisual) this.showCard(id);
    else if (this.card.mode === 'locked') this.card.mode = 'idle';
  }

  private showCard(id: string): void {
    const msg = this.controller.message(id);
    if (!msg) return;
    this.card.show(msg, formatReceived(msg.receivedAt, this.controller.settings.timezone, new Date()));
  }

  private onEvent(e: AppEvent): void {
    switch (e.type) {
      case 'action': {
        const a = e.action;
        const type = a.actionType;
        const portal = type === 'keep' ? this.portals[0] : type === 'defer' ? this.portals[1] : null;
        const visual = this.card.messageId === a.messageId ? this.card.takeVisual() : null;
        if (type === 'archive') {
          if (visual) this.effects.slash(visual, e.via.kind === 'slash' ? e.via.angle : DEFAULT_SLASH_ANGLE);
          this.audio.slice();
        } else if (portal) {
          const land = () => {
            portal.capture();
            this.audio.chime(portal.id);
          };
          if (visual) this.effects.fly(visual, portal.group.position, land);
          else land();
        } else {
          visual?.texture.dispose();
          this.audio.chime(type === 'handle' || type === 'draft_finish' ? 'keep' : 'tomorrow');
        }
        break;
      }
      case 'undo':
        this.audio.undo();
        break;
      case 'toast':
        this.hud.showToast(e.text, e.tone);
        break;
      case 'rejected':
        if (TRIAGE_COMMANDS.has(e.command)) this.restoreCard();
        if (e.reason !== 'paused' && e.reason !== 'already-resolved') this.audio.nudge();
        break;
      case 'phase':
        this.calmTarget = e.to === 'review' || e.to === 'complete' ? 1 : 0;
        if (e.to === 'complete') {
          this.arena.celebrate();
          this.audio.finish();
        }
        break;
    }
  }

  private sync(): void {
    const c = this.controller;
    const s = c.settings;
    const phase = c.phase;
    const reduced = s.effects === 'reduced';
    this.arena.reduced = reduced;
    this.effects.reduced = reduced;
    this.audio.setSound(s.sound);
    this.audio.setMusic(s.music && phase !== 'setup');
    this.portals[1].setSub(`reminder at ${formatHour(s.reminderHour)}`);

    const blocked = c.ui.reading !== null || c.ui.menuOpen || c.ui.paused;
    const inTriage = phase === 'tutorial' || phase === 'triage';
    const triaging = inTriage && !blocked;
    if (triaging !== this.triaging) {
      this.triaging = triaging;
      this.blade.reset();
      if (!triaging) this.grab.cancel(this.card);
    }

    const id = c.currentId;
    if (!id) this.card.hide();
    else if (this.card.messageId !== id || (!this.card.hasVisual && !this.effects.flying)) this.showCard(id);
    this.cardHolder.visible = triaging;
    for (const p of this.portals) p.group.visible = inTriage && !c.ui.reading && !c.ui.menuOpen;

    this.hud.sync();
    this.reading.sync();
    this.review.sync();
    this.summary.sync();
    this.menu.sync();
    this.paused.group.visible = c.ui.paused && phase !== 'setup';

    const n = c.counts;
    this.audio.setProgress(phase === 'triage' && n.total ? (n.total - n.pending) / n.total : phase === 'tutorial' ? 0 : 0.5);
    this.audio.setDuck(c.ui.reading ? 0.3 : phase === 'review' || phase === 'complete' ? 0.5 : 1);
    this.calmTarget = phase === 'review' || phase === 'complete' ? 1 : 0;
  }

  // ---- frame loop ----------------------------------------------------------

  private frame(time: number): void {
    const dt = this.lastTime ? Math.min(0.5, (time - this.lastTime) / 1000) : 0;
    this.lastTime = time;
    const anim = Math.min(dt, 0.05);

    if (this.renderer.xr.isPresenting && this.session) {
      this.xr.update(dt);
      this.renderer.xr.getCamera().getWorldPosition(this.head);
      if (this.needsRecenter && this.head.y > 0.25) {
        this.needsRecenter = false;
        this.recenter();
      }
      if (!this.controller.ui.paused) this.updateVR(dt);
    }

    // The review transition eases the room down over about a second and a half.
    this.arena.calm += (this.calmTarget - this.arena.calm) * Math.min(1, anim / 0.5);
    this.arena.update(anim);
    this.card.update(anim);
    this.effects.update(anim);
    for (const p of this.portals) p.update(anim);
    this.hud.update(anim);
    this.renderer.render(this.scene, this.camera);

    if (dt > 0) this.stats.fps += (1 / dt - this.stats.fps) * 0.05;
    this.stats.calls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
  }

  private updateVR(dt: number): void {
    const c = this.controller;
    const bladeHand = this.xr.byHandedness(c.settings.bladeHand);
    const sortHand = this.xr.byHandedness(c.settings.bladeHand === 'right' ? 'left' : 'right');
    const cardReady = this.triaging && this.card.messageId !== null;

    this.xr.hands.forEach((hand, i) => {
      const visual = this.visuals[i];
      if (!hand.connected) {
        visual.setRole('none', false);
        this.ui.point(`xr${i}`, null);
        return;
      }
      const role = hand === bladeHand ? 'blade' : hand === sortHand ? 'sort' : 'none';
      visual.setRole(role, this.triaging, hand.handedness === 'left');

      // Either hand's trigger presses buttons. A press that starts on a button
      // is a UI press for as long as the trigger is held, never an armed blade.
      const holding = role === 'sort' && this.grab.holding;
      const hit = holding ? this.ui.point(`xr${i}`, null) : this.ui.point(`xr${i}`, hand.origin, hand.dir);
      visual.pointer.set(hit ? hit.distance : this.triaging ? null : 0.9);
      if (hand.trigger.down && hit) {
        this.uiCapture[i] = true;
        this.audio.unlock();
        if (this.ui.press(`xr${i}`)) {
          this.audio.click();
          hand.pulse(0.3, 25);
        }
      }
      if (!hand.trigger.pressed) this.uiCapture[i] = false;

      if (role === 'blade') {
        if (this.triaging) {
          const armed = hand.trigger.pressed && !this.uiCapture[i];
          const target = cardReady && !this.grab.holding ? this.card : null;
          this.blade.update(dt, hand, visual, armed, target, c.settings.effects === 'full');
        } else {
          visual.setArmed(false);
        }
      }
      if (role === 'sort') this.grab.update(dt, hand, visual, this.head, cardReady ? this.card : null, cardReady);

      // Hold a thumbstick click for a second to recentre without opening the menu.
      if (hand.stickClick.pressed) {
        this.recenterHold += dt;
        if (this.recenterHold > 1) {
          this.recenterHold = -1e9;
          this.recenter();
          hand.pulse(0.5, 60);
        }
      }
    });
    if (!this.xr.hands.some((h) => h.stickClick.pressed)) this.recenterHold = 0;

    // Thumbstick pages the reading panel.
    this.stickRepeat -= dt;
    if (c.ui.reading) {
      const y = this.xr.hands.reduce((m, h) => (Math.abs(h.stickY) > Math.abs(m) ? h.stickY : m), 0);
      if (Math.abs(y) < 0.4) this.stickRepeat = 0;
      else if (this.stickRepeat <= 0 && Math.abs(y) > 0.7) {
        this.stickRepeat = 0.45;
        if (this.reading.turn(y > 0 ? 1 : -1)) this.audio.click();
      }
    }
  }
}
