/**
 * Playing on a monitor with a mouse and keyboard (CONTROLS-PLAN.md, step 2).
 *
 * The user's words, 2026-11-15, in order: "mouse to move head, left click / hold to activate weapon ... space bar to hold
 * and mouse then moves the hand to throw"; "stationary view, head on, dont move head, its bad experience"; "for weapon,
 * only move when left mouse down"; "its not great, how about you do what you feel is the most game friendly default";
 * then, after a click-to-slash version: "dont like the auto attack", and this, which is what is built:
 *
 * - The view never moves. The mouse is an ordinary cursor (no pointer lock), drawn as a ring; the weapon is always in
 *   the right hand and follows it, its tip on the cursor.
 * - Left button held: the weapon is live, and slashes wherever it is swept. Nothing happens by itself.
 * - Space held: the left hand, which stays where it is (the mouse does not move it), takes the letter: it comes to the
 *   middle of the view, a bit bigger, held up (letters.ts). Let go of Space and it is thrown away, for later. In round
 *   two, 1, 2 or M while it is held (or waiting) answers it.
 *
 * A finger (a phone, upright) plays the same game: swipe to slash, the GRAB button to grab (CONTROLS-PLAN.md step 3). Nothing here touches the controllers or
 * tracked hands: it is only read while no headset is presenting.
 */
import { Euler, Matrix4, Quaternion, Vector3, type Camera } from '@iwsdk/core';

const FOLLOW = 32;                 // the weapon and hand follow the cursor a breath behind (per second): a little weight
// The right hand: a controller held a little below and to the right of the cursor, out along its line; the weapon sits
// in it with the controller hold (2026-11-15: "make the weapon use the position setup from controller for now"), turned
// so its hit line runs out through the cursor to the letter. First guesses.
const look = {
  // the left hand grabbing (desktophands.ts): degrees it twists to the left about its reach
  leftTwist: 30,
  faceEye: 1,
  /** Numbers to try on the weapon in hand just now, from the console (MouseHold); {} when not trying anything. */
  now: {} as MouseHold, gripDepth: 0.48, gripSide: new Vector3(0.2, -0.22, 0), gripTurn: new Quaternion().setFromEuler(new Euler(0.35, 0, 0)) };
// A letter taken with Space: held up in the middle of the view, this far out and this far above the eye's line.
const HOLD_DIST = 0.78, HOLD_UP = 0.02;

const fine = () => { try { return matchMedia('(hover: hover) and (pointer: fine)').matches; } catch { return true; } };
const coarse = () => { try { return !fine() && matchMedia('(pointer: coarse)').matches; } catch { return false; } };
const TOUCH_MOVE = 12;             // px a finger moves before it is a swipe
const v1 = new Vector3(), v2 = new Vector3(), v3 = new Vector3(), v4 = new Vector3(), q1 = new Quaternion(), q2 = new Quaternion(), m1 = new Matrix4(), m2 = new Matrix4();
type Point = { x: number; y: number };
/** How much narrower the view is than the wide screen the hold was set on (1 there or wider; a phone upright about 0.3). */
export const narrow = (camera: Camera) => Math.min(1, ((camera as Camera & { aspect?: number }).aspect ?? 1.5) / 1.5);
/** How one weapon sits on a monitor (held.ts HeldSpec.desktop.mouse): out along the cursor's line `depth` metres, moved
 * `side` metres (right, up), rolled `roll` degrees about its hit line; `upright`: a pointing tool kept the right way up. */
export type MouseHold = { depth?: number; side?: [number, number]; roll?: number; upright?: boolean };
/** Turn a matrix by `q` about the point `at` (world). */
function turnAbout(matrix: Matrix4, at: Vector3, q: Quaternion) {
  m2.makeTranslation(-at.x, -at.y, -at.z).premultiply(m1.makeRotationFromQuaternion(q)).premultiply(m1.makeTranslation(at.x, at.y, at.z));
  matrix.premultiply(m2);
}

export const desktop = {
  /** A mouse or a finger plays on a screen (always, now: a finger once only dragged to look). */
  enabled: true,
  /** Playing on a monitor just now with the mouse: set every frame by main.ts. */
  active: false,
  /** The cursor, -1 to 1 across and up the view; and where the weapon is following it to (`pointer`, then `shown`). */
  cursor: { x: 0, y: -0.2 } as Point, pointer: { x: 0, y: -0.2 } as Point, shown: { x: 0, y: -0.2 } as Point,
  /** The left button is held. */
  swing: false,
  /** Space is held (or the GRAB button on a phone): the left hand has closed. */
  grab: false,
  /** The last thing played with was a finger (a phone or a tablet): main.ts words the card and the hint for it. */
  touch: coarse(),
  /** The weapon in hand sprays (a finger down sprays at once). main.ts sets it. */
  sprays: false,
  /** Close or open the left hand (Space, or the GRAB button on a phone). */
  setGrab(on: boolean) {
    if (on && !this.grab) { this.grab = true; this.grabFor = 0; this.sinceGrab = 0; }
    if (!on && this.grab) { this.grab = false; this.sinceGrab = 0; }
  },
  /** Seconds since the grab was let go (the hand is still there a moment, to throw from), and how long it was held. */
  sinceGrab: 99, grabFor: 0,
  /** How far out the hit line is aimed: the letter's distance, eased (main.ts sets `depthWanted`). */
  depth: 1.4, depthWanted: 1.4,
  /** The right hand's grip this frame (world), once a weapon has been put in it; for the drawn fist (desktophands.ts). */
  grip: new Matrix4(), gripValid: false,
  /** The hold's numbers above, to try others from the console (__vr3.desktop.look). */
  look,
  /** Where the drawn left hand's fingers close, world space (desktophands.ts), and whether it is known: the thread to a
   * held letter runs from there (letters.ts). */
  handAt: new Vector3(), handAtSet: false,

  /** Is the weapon live: the left button held. */
  live() { return this.swing; },
  /** Nothing held (a game starting or ending). */
  reset() { this.swing = false; this.grab = false; this.sinceGrab = 99; },

  /** Every frame, while playing on a monitor. */
  update(dt: number) {
    this.gripValid = false;      // (until a weapon is put in the hand this frame)
    if (this.grab) this.grabFor += dt; else this.sinceGrab += dt;
    const f = 1 - Math.exp(-dt * FOLLOW);
    this.pointer.x += (this.cursor.x - this.pointer.x) * f; this.pointer.y += (this.cursor.y - this.pointer.y) * f;
    this.shown.x += (this.pointer.x - this.shown.x) * f; this.shown.y += (this.pointer.y - this.shown.y) * f;
    this.depth += (this.depthWanted - this.depth) * (1 - Math.exp(-dt * 4));
  },

  /** The line from the eye through a point on the screen (the weapon's, unless given): a unit direction, world space. */
  ray(camera: Camera, out: Vector3, at?: Point) {
    at ??= desktop.shown;
    camera.updateMatrixWorld();
    camera.getWorldPosition(v3);
    out.set(at.x, at.y, 0.5).unproject(camera).sub(v3).normalize();
    // (a canvas with no size, a hidden tab, has no projection: straight ahead then, never NaN, which Web Audio throws on)
    if (!Number.isFinite(out.x + out.y + out.z)) out.set(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(q1));
    return out;
  },

  /**
   * The right hand, as a controller would be held, below and to the right of the weapon's point on the screen; then
   * turned so the weapon's hit line (`base` to `tip` in the weapon's own space, `toWeapon` from the grip) runs out
   * through that point at the letter's distance: the smallest turn, about the hit line's base. Returns the weapon's
   * world matrix in `out`; the grip is kept in `desktop.grip`.
   */
  holdWeapon(camera: Camera, toWeapon: Matrix4, base: Vector3, tip: Vector3, out: Matrix4, own: MouseHold = {}) {
    // (a weapon's own numbers, held.ts HeldSpec.desktop.mouse, then any tried live from the console: __vr3.desktop.look.now)
    const o = { ...own, ...look.now }, depth = o.depth ?? look.gripDepth, side = o.side ?? [look.gripSide.x, look.gripSide.y];
    camera.updateMatrixWorld();
    camera.getWorldPosition(v4);
    camera.getWorldQuaternion(q1);
    // (sideways offsets were set on a wide screen: on a narrow one, a phone held upright, they come in to match, or the
    // fist and weapon sit off its edge)
    const at = this.ray(camera, v1).multiplyScalar(depth).add(v4).add(v2.set(side[0] * narrow(camera), side[1], 0).applyQuaternion(q1));
    this.grip.compose(at, q1.multiply(look.gripTurn), v2.set(1, 1, 1));
    const target = this.ray(camera, v2).multiplyScalar(this.depth).add(v4);
    m1.multiplyMatrices(this.grip, toWeapon);
    const from = v3.copy(base).applyMatrix4(m1);
    const now = v4.copy(tip).applyMatrix4(m1).sub(from).normalize();
    q1.setFromUnitVectors(now, target.sub(from).normalize());
    if (Number.isFinite(q1.x + q1.y + q1.z + q1.w)) turnAbout(this.grip, from, q1);
    // then rolled about that line so the back of the hand (the grip's +x, measured on the drawn right hand) faces the eye:
    // the top of the fist is seen, not the palm and fingers (2026-11-15: "rotate the hand model so more of the top of
    // the hand is visible"). A rod's broad face lies the same way, so its blade is seen flat, not edge on.
    // A pointing tool (o.upright) is rolled instead so its own up (its handle the other way) is the view's up: on its side
    // it would look dropped. Then a weapon's own extra roll, degrees (o.roll), for one whose best face is another way.
    if (look.faceEye) {
      m1.multiplyMatrices(this.grip, toWeapon);
      const along = v4.copy(tip).applyMatrix4(m1).sub(from).normalize();
      const face = o.upright ? v1.set(0, 1, 0).transformDirection(m1) : v1.set(1, 0, 0).transformDirection(this.grip);
      const eyeward = o.upright ? v2.set(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(q2)) : v2.copy(camera.getWorldPosition(v2)).sub(from);
      face.addScaledVector(along, -face.dot(along)); eyeward.addScaledVector(along, -eyeward.dot(along));
      if (face.length() > 0.3 && eyeward.length() > 1e-4) {
        face.normalize(); eyeward.normalize();
        const cos = face.dot(eyeward), angle = Math.atan2(v2.crossVectors(face, eyeward).dot(along), cos);
        turnAbout(this.grip, from, q1.setFromAxisAngle(along, angle * look.faceEye));
      }
      if (o.roll) turnAbout(this.grip, from, q1.setFromAxisAngle(along, o.roll * Math.PI / 180));
    }
    this.gripValid = true;
    return out.multiplyMatrices(this.grip, toWeapon);
  },

  /** Where a letter taken with Space is held: the middle of the view, a little above the eye's line. Also the left
   * hand's place for letters.ts (it stays still: the mouse never moves it). */
  holdPoint(camera: Camera, out: Vector3) {
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    return camera.getWorldPosition(out).addScaledVector(v1.set(-e[8], -e[9], -e[10]).normalize(), HOLD_DIST).addScaledVector(v2.set(e[4], e[5], e[6]).normalize(), HOLD_UP);
  },

  /** Wire up the mouse and keys. `playing` says whether a game is on (and no headset is presenting). */
  attach(canvas: HTMLCanvasElement, playing: () => boolean) {
    const typing = (e: Event) => !!(e.target as HTMLElement | null)?.matches?.('input,select,button,summary,textarea');
    const place = (e: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return;
      this.cursor.x = Math.max(-1, Math.min(1, ((e.clientX - box.left) / box.width) * 2 - 1));
      this.cursor.y = Math.max(-1, Math.min(1, 1 - ((e.clientY - box.top) / box.height) * 2));
    };
    // A finger (2026-11-15, "swipes are the weapon"): one finger at a time on the game. It lands and the weapon is there at
    // once (no sweep from where it was); moved TOUCH_MOVE px it is live and slashes. Where the weapon is a sprayer, a finger
    // down sprays at once. Grabbing is the GRAB button low on the left, held (main.ts calls setGrab): "add a button lower
    // left corner for grab, so that way it can grab (release to throw) or slash". (A finger held still on the email grabbed
    // it at first; the button took its place the same day.)
    let finger = -1, downX = 0, downY = 0, moved = false;
    const fingerUp = (e: PointerEvent) => {
      if (e.pointerId !== finger) return;
      finger = -1; this.swing = false;
    };
    canvas.addEventListener('pointerdown', e => {
      this.enabled = true; this.touch = e.pointerType === 'touch';
      if (!playing()) return;
      if (this.touch) {
        if (finger !== -1) return;
        finger = e.pointerId; downX = e.clientX; downY = e.clientY; moved = false; place(e);
        this.pointer.x = this.shown.x = this.cursor.x; this.pointer.y = this.shown.y = this.cursor.y;
        if (this.sprays) this.swing = true;
        return;
      }
      place(e);
      if (e.button === 0) this.swing = true;
    });
    canvas.addEventListener('contextmenu', e => { if (playing()) e.preventDefault(); });
    window.addEventListener('pointerup', e => { if (e.pointerType === 'touch') fingerUp(e); else if (e.button === 0) this.swing = false; });
    window.addEventListener('pointercancel', e => { if (e.pointerType === 'touch') fingerUp(e); else this.swing = false; });
    window.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') {
        if (e.pointerId !== finger) return;
        place(e);
        if (!moved && Math.hypot(e.clientX - downX, e.clientY - downY) > TOUCH_MOVE) { moved = true; this.swing = true; }
        return;
      }
      if (this.enabled) place(e);
    });
    window.addEventListener('keydown', e => {
      if (e.key !== ' ' || typing(e) || !playing() || !this.enabled) return;
      e.preventDefault();
      if (!e.repeat) this.setGrab(true);
    });
    window.addEventListener('keyup', e => { if (e.key === ' ') this.setGrab(false); });
    window.addEventListener('blur', () => { this.swing = false; this.setGrab(false); });
  },
};
