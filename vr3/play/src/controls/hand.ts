/**
 * Tracked hands (step 1 of CONTROLS-PLAN.md, 2026-11-14). The user's words: "for hands, grab / activate with fist
 * and or pinch ? more foriving, weapon aslways in hand", then "make it just fist only, not pinch". So a hand is closed
 * by a fist alone, and that one number does what a controller's trigger and grip do: the left takes a letter, the right
 * makes its weapon live. The weapon sits on the hand's grip pose all the time, as it does on a controller.
 *
 * Read once a frame (update(), from main.ts) for both sides; the game asks for what it needs through controls/index.ts.
 *
 * Fast swings blur the headset's cameras and a hand can drop out for a moment. For a short while (hand.grace) the
 * hand is taken to be where it last was and as closed as it last was, so a weapon does not vanish or go dead in the
 * middle of a swing; when the hand comes back, the move from where it was to where it is counts as part of the swing.
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Side } from './controller';

export const hand = {
  // A fist: all four fingers curled, the least curled one deciding (2026-11-14: "the fist is too senstive, can you
  // make it more like a closed fist?"; until then the average of index, middle and ring, so a loose grip, a hook and
  // even pointing counted). For each, the fingertip's distance from the wrist over the hand's own size (wrist to the
  // middle finger's knuckle), so a big hand and a small one read the same. In the emulator a closed fist is about 0.7
  // on every finger, a loose grip about 1.0 to 1.1, an open hand 1.9.
  open: 1.25,           // this far out (in hand sizes) a finger counts as not curled at all
  curled: 0.85,         // this close, fully curled
  // A pinch: thumb tip to index tip, in metres. Measured for checks only: a pinch does nothing in the game (2026-11-14)
  pinchOpen: 0.055,     // apart by this much, no pinch
  pinchShut: 0.018,     // this close, a full pinch
  grace: 0.2,           // seconds a hand that has dropped out is held where it was (and as closed as it was)
  // The fist is on or off, not a level (2026-11-14: "the sword / weapon seems more jittery when hitting"): a fast swing
  // blurs the fingers and the curl dips, which made the weapon flicker live, dead, live (its draw sound again, its glow).
  closeAt: 0.6,         // every finger curled this far (a fingertip within about 1.0 hand sizes of the wrist), the fist closes
  openAt: 0.25,         // and it opens once any finger is below this (about 1.15),
  letGo: { left: 0.05, right: 0.15 } as Record<Side, number>,     // for this long, seconds (short on the left, so a throw lets go when it should)
  // Smoothing the grip. Tracked joints shake by millimetres, and the weapon's tip turns that into centimetres. At rest
  // the grip eases (a steady blade); the faster the hand moves, the less it eases, so a swing has next to no lag.
  steady: 14,           // 1/s: how fast the grip catches up at rest
  follow: 45,           // and how much faster per m/s of the hand's speed
  turnFollow: 9,        // and per radian a second it turns
};

const JOINTS = ['wrist', 'thumb-tip', 'index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip', 'index-finger-phalanx-proximal', 'middle-finger-phalanx-proximal', 'pinky-finger-phalanx-proximal'] as const;

/**
 * Where a held weapon sits. A tracked hand's own grip pose does not face the way a controller's does (in the emulator
 * the katana pointed back at the player), so the grip is fitted from the hand itself: the wrist and three knuckles of
 * the real hand are laid over the same four points of the closed fist drawn on a controller (the SDK's generic hand,
 * measured in its grip space, right hand; the left is its mirror), and the weapon is placed as it is on that fist.
 * The drawn sword fist is leaned by the weapon's tilt (hands.ts), so the same lean is taken back out here.
 */
const DRAWN: Record<'wrist' | 'index' | 'middle' | 'pinky', [number, number, number]> = {
  wrist: [0.0521, 0.0431, 0.0861], index: [0.0502, -0.0119, -0.0083], middle: [0.0507, -0.0292, 0.0093], pinky: [0.0307, -0.0422, 0.0493],
};
/** How far the weapon's fist is leaned, degrees (main.ts hands it the weapon's tilt, as the drawn hands have it). */
export const lean = { tilt: (): number => 0 };
const fa = new Vector3(), fb = new Vector3(), fc = new Vector3(), fo = new Vector3();
/** A frame from a wrist and three knuckles: x from the little finger's knuckle to the index's, y up the hand, origin their middle. */
function frameOf(out: Matrix4, w: Vector3, i: Vector3, m: Vector3, p: Vector3) {
  fo.copy(w).add(i).add(m).add(p).multiplyScalar(0.25);
  fa.subVectors(i, p).normalize();
  fb.subVectors(m, w); fb.addScaledVector(fa, -fb.dot(fa)).normalize();
  fc.crossVectors(fa, fb);
  return out.makeBasis(fa, fb, fc).setPosition(fo);
}
const drawnInverse: Record<Side, Matrix4> = { left: new Matrix4(), right: new Matrix4() };
for (const side of ['left', 'right'] as const) {
  const flip = side === 'left' ? -1 : 1, v = (k: keyof typeof DRAWN) => new Vector3(DRAWN[k][0] * flip, DRAWN[k][1], DRAWN[k][2]);
  frameOf(drawnInverse[side], v('wrist'), v('index'), v('middle'), v('pinky')).invert();
}
const jw = new Vector3(), ji = new Vector3(), jm = new Vector3(), jp = new Vector3(), fitted = new Matrix4(), leaned = new Matrix4();
const rawAt = new Vector3(), rawTurn = new Quaternion(), one = new Vector3(1, 1, 1);
type Joint = (typeof JOINTS)[number];

export type HandState = {
  source: XRInputSource | null;
  /** 0 to 1: how closed the hand is: its fist (a pinch does not count). */
  closed: number;
  /** Its fist and its pinch, each 0 to 1 (for checks). */
  fist: number; pinch: number;
  /** The grip pose's matrix in the reference space, held for a moment if tracking drops. */
  grip: Float32Array | null;
  /** When it was last really seen, seconds. */
  seen: number;
  tracked: boolean;
  /** The fist, latched on or off, and how long it has been opening. */
  latched: boolean; opening: number;
  /** The smoothed grip, and when it was last read. */
  at: Vector3; turn: Quaternion; smoothed: boolean; last: number;
};
const blank = (): HandState => ({ source: null, closed: 0, fist: 0, pinch: 0, grip: null, seen: -9, tracked: false, latched: false, opening: 0, at: new Vector3(), turn: new Quaternion(), smoothed: false, last: -9 });
const states: Record<Side, HandState> = { left: blank(), right: blank() };

const at: Partial<Record<Joint, DOMPointReadOnly>> = {};
const gap = (a: DOMPointReadOnly, b: DOMPointReadOnly) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const ramp = (x: number, from: number, to: number) => Math.min(1, Math.max(0, (x - from) / (to - from)));

/** Once a frame: read both hands. */
export function update(session: XRSession, frame: XRFrame, space: XRReferenceSpace, time: number) {
  const found: Record<Side, boolean> = { left: false, right: false };
  for (const source of session.inputSources) {
    const side = source.handedness;
    if (!source.hand || (side !== 'left' && side !== 'right')) continue;
    found[side] = true;
    const state = states[side];
    state.source = source;
    let all = true;
    for (const name of JOINTS) {
      const joint = source.hand.get(name);
      const pose = joint && frame.getJointPose ? frame.getJointPose(joint, space) : undefined;
      if (!pose) { all = false; break; }
      at[name] = pose.transform.position;
    }
    if (all) {
      const wrist = at.wrist!, size = Math.max(0.04, gap(wrist, at['middle-finger-phalanx-proximal']!));
      let fist = 1;
      for (const tip of ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'] as const) fist = Math.min(fist, ramp(gap(wrist, at[tip]!) / size, hand.open, hand.curled));
      state.fist = fist;
      state.pinch = ramp(gap(at['thumb-tip']!, at['index-finger-tip']!), hand.pinchOpen, hand.pinchShut);
      // fist only (2026-11-14: "make it just fist only, not pinch"; the pinch counted too before), latched on or off
      const dt = Math.min(0.1, Math.max(0, time - state.last));
      if (state.fist >= hand.closeAt) { state.latched = true; state.opening = 0; }
      else if (state.fist < hand.openAt) { state.opening += dt; if (state.opening > hand.letGo[side]) state.latched = false; }
      else state.opening = 0;
      state.closed = state.latched ? 1 : 0;
      // the grip, fitted from the wrist and knuckles (see DRAWN), with the drawn fist's lean taken back out
      const p3 = (q: DOMPointReadOnly, o: Vector3) => o.set(q.x, q.y, q.z);
      frameOf(fitted, p3(wrist, jw), p3(at['index-finger-phalanx-proximal']!, ji), p3(at['middle-finger-phalanx-proximal']!, jm), p3(at['pinky-finger-phalanx-proximal']!, jp)).multiply(drawnInverse[side]);
      if (side === 'right') fitted.multiply(leaned.makeRotationX(lean.tilt() * Math.PI / 180));
      // smoothed: eased at rest, all but raw in a swing (see hand.steady)
      fitted.decompose(rawAt, rawTurn, jw);
      if (!state.smoothed || dt <= 0) { state.at.copy(rawAt); state.turn.copy(rawTurn); state.smoothed = true; }
      else {
        const speed = rawAt.distanceTo(state.at) / dt, spin = state.turn.angleTo(rawTurn) / dt;
        state.at.lerp(rawAt, 1 - Math.exp(-dt * (hand.steady + hand.follow * speed)));
        state.turn.slerp(rawTurn, 1 - Math.exp(-dt * (hand.steady + hand.turnFollow * spin)));
      }
      fitted.compose(state.at, state.turn, one);
      state.grip = state.grip ?? new Float32Array(16);
      fitted.toArray(state.grip);
      state.seen = time; state.last = time; state.tracked = true;
    } else if (time - state.seen > hand.grace) {
      state.tracked = false; state.grip = null; state.closed = 0; state.latched = false; state.smoothed = false;
    }
  }
  for (const side of ['left', 'right'] as const) if (!found[side]) states[side] = blank();
}

/** That side's hand, as last read. */
export function stateOf(side: Side): HandState { return states[side]; }

/** Where a held thing sits in that hand (its grip pose), or null: shaped like an XRPose for the callers. */
export function gripPose(side: Side): { transform: { matrix: Float32Array } } | null {
  const grip = states[side].grip;
  return grip ? { transform: { matrix: grip } } : null;
}

/** For the console and checks. */
export function diagnostics() {
  const one = (s: HandState) => ({ tracked: s.tracked, fist: +s.fist.toFixed(2), pinch: +s.pinch.toFixed(2), closed: +s.closed.toFixed(2) });
  return { left: one(states.left), right: one(states.right) };
}
