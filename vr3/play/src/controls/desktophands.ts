/**
 * The outline hands on a monitor (2026-11-15: "add the hand 3d model so they can feel it being there"). The same
 * model and look as in VR (src/hands.ts: the SDK's controller-held hands).
 *
 * - The right one is a closed fist on the weapon, where desktop.ts holds it (rolled so the back of the hand shows).
 * - The left one rests low on the left, relaxed, the back of the hand towards you. With Space it lifts a little and
 *   reaches towards the held letter, closing; the thread runs from its fingers to the letter (`desktop.handAt`). It
 *   never follows the mouse. 2026-11-15: "rotate the hand model so more of the top of the hand is visible", then
 *   "stationary hand", then "only move the hand a bit, and show the line from hand".
 */
import { AnimatedControllerHand, DEFAULT_PROFILES_PATH, Matrix4, Quaternion, Vector3, type Object3D, type World } from '@iwsdk/core';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { desktop, narrow } from './desktop';
import { handPoser } from '../handguide';

type Side = 'left' | 'right';
type Made = { visual: AnimatedControllerHand; model: Object3D; pad: { buttons: { value: number }[] };
  /** The left hand: How to Play's open palm and fist (src/handguide.ts), in place of the SDK's controller poses. */
  curl?: (amount: number) => void;
  /** Model space: the way the fingers run (wrist to middle knuckle) and the way the back of the hand faces. */
  fingers: Vector3; back: Vector3 };
const LEFT_REST = new Vector3(-0.22, -0.3, -0.5);       // the left hand at rest, from the eye (a first guess)
const LEFT_REACH = new Vector3(0.025, 0.03, -0.02);      // and how far it moves from there, grabbing: only a bit ("move a bit less": it was twice this)
const FOLLOW = 18;                                        // how quickly the left hand goes where it is wanted (per second)
// The left hand's fingers: How to Play's open palm and fist (src/handguide.ts handPoser). It was the SDK's controller
// poses, a loose rest and a closed grip (a pinch, then a fist; a tighter fist bent past it was tried and taken out:
// "undo the hand fist, this looks really bad"). It twists a bit to the left while grabbing: desktop.look.leftTwist.

const v1 = new Vector3(), v2 = new Vector3(), v3 = new Vector3(), m1 = new Matrix4(), m2 = new Matrix4();
const at = (model: Object3D, name: string, out: Vector3) => model.getObjectByName(name)!.getWorldPosition(out);

/** The turn that takes model-space `fingers` and `back` to world `F` and `B` (each made square to the first). */
function facing(made: Made, F: Vector3, B: Vector3, out: Quaternion) {
  const f = made.fingers, b = v3.copy(made.back).addScaledVector(f, -made.back.dot(f)).normalize();
  m1.makeBasis(f, b, v1.crossVectors(f, b));
  const Bs = v2.copy(B).addScaledVector(F, -B.dot(F)).normalize();
  m2.makeBasis(F, Bs, v1.crossVectors(F, Bs));
  return out.setFromRotationMatrix(m2.multiply(m1.transpose()));
}

export function createDesktopHands(world: World) {
  const made: Partial<Record<Side, Made>> = {};
  for (const side of ['left', 'right'] as const) {
    void new GLTFLoader().loadAsync(`${DEFAULT_PROFILES_PATH}/generic-hand/${side}.glb`).then(gltf => {
      const model = gltf.scene;
      // (the left: posed as How to Play's card hand is, read from the model's flat bones before anything moves them;
      // 2026-11-15, "use the same model for the hand open palm and close in the how to play card")
      const curl = side === 'left' ? handPoser(model, side).curl : undefined;
      const visual = new AnimatedControllerHand(model, world.scene, world.camera, {} as ConstructorParameters<typeof AnimatedControllerHand>[3]);
      const pad = { buttons: [0, 1, 2, 3].map(() => ({ value: side === 'right' ? 1 : 0 })) };
      visual.connect({ handedness: side, gamepad: pad } as unknown as XRInputSource, true);
      // measured once in the hand's open pose, in its own space: the way the fingers run and the way its back faces
      if (curl) curl(0); else visual.update(0.05);
      model.updateMatrixWorld(true);
      const wrist = at(model, 'wrist', new Vector3()), knuckle = at(model, 'middle-finger-phalanx-proximal', new Vector3());
      const fingers = knuckle.sub(wrist).normalize();
      const across = at(model, 'index-finger-phalanx-proximal', new Vector3()).sub(at(model, 'pinky-finger-phalanx-proximal', new Vector3())).normalize();
      // (fingers x first-to-little: the back of a right hand, the palm of a left one)
      const back = new Vector3().crossVectors(fingers, across).normalize().multiplyScalar(side === 'right' ? 1 : -1);
      model.matrixAutoUpdate = false; model.visible = false;
      world.scene.add(model);
      made[side] = { visual, model, pad, fingers, back, curl };
    }).catch(() => undefined);      // (no hands if the model cannot be fetched: the game plays the same)
  }
  const eye = new Vector3(), right = new Vector3(), up = new Vector3(), forward = new Vector3(), F = new Vector3(), B = new Vector3();
  const want = new Quaternion(), twist = new Quaternion(), turn = new Quaternion(), point = new Vector3(), lean = new Matrix4(), unit = new Vector3(1, 1, 1);
  const thumb = new Vector3(), finger = new Vector3();
  const left = { at: new Vector3(), q: new Quaternion(), placed: false, curl: 0 };
  return {
    /** Every frame, after the weapon is placed and before the letters. `shown`: the Hands setting; `rightShown`: no glove. */
    update(dt: number, shown: boolean, rightShown: boolean, tilt: number) {
      const on = desktop.active;
      const right_ = made.right;
      if (right_) {
        right_.model.visible = on && shown && rightShown && desktop.gripValid;
        if (right_.model.visible) {
          // closed round the handle and leaned with it, as the VR fist is (src/hands.ts)
          right_.model.matrix.copy(desktop.grip).multiply(lean.makeRotationX(-tilt * Math.PI / 180));
          right_.model.matrixWorldNeedsUpdate = true;
          right_.visual.update(dt);
        }
      }
      const hand = made.left;
      if (!hand) return;
      hand.model.visible = on && shown && !desktop.touch;      // (a phone: no left hand drawn, the GRAB button is the hand: 2026-11-15)
      if (!on) { left.placed = false; return; }
      const out = desktop.grab || desktop.sinceGrab < 0.25;
      const cam = world.camera; cam.updateMatrixWorld(); cam.getWorldPosition(eye);
      const e = cam.matrixWorld.elements;
      right.set(e[0], e[1], e[2]).normalize(); up.set(e[4], e[5], e[6]).normalize(); forward.set(-e[8], -e[9], -e[10]).normalize();
      cam.getWorldQuaternion(turn);
      if (out) {
        // reaching towards the letter held up in the middle, the back of the hand up and to you
        desktop.holdPoint(cam, v2); point.copy(LEFT_REST).add(LEFT_REACH); point.x *= narrow(cam); point.applyQuaternion(turn).add(eye);
        F.copy(v2).sub(point).normalize();
        B.copy(up).multiplyScalar(0.7).addScaledVector(forward, -0.7).normalize();
      } else {
        // at rest: reaching forward and a little up and in, the back of the hand up and to you
        F.copy(forward).multiplyScalar(0.8).addScaledVector(up, 0.4).addScaledVector(right, 0.3).normalize();
        B.copy(up).multiplyScalar(0.75).addScaledVector(forward, -0.65).normalize();
      }
      facing(hand, F, B, want);
      // grabbing, twisted a bit to the left about its reach ("can you model the hand twisting a bit to the left"): seen
      // from here, its top turns anticlockwise
      if (out) want.premultiply(twist.setFromAxisAngle(F, -desktop.look.leftTwist * Math.PI / 180));
      // where it is wanted: low on the left, and grabbing only a little up and in from there
      if (!out) { point.copy(LEFT_REST); point.x *= narrow(cam); point.applyQuaternion(turn).add(eye); }      // (in from the edge on a narrow screen)
      const k = left.placed ? 1 - Math.exp(-dt * FOLLOW) : 1;
      left.at.lerp(point, k); left.q.slerp(want, k); left.placed = true;
      hand.model.matrix.compose(left.at, left.q, unit.set(1, 1, 1)); hand.model.matrixWorldNeedsUpdate = true;
      // the card's hand: an open palm, closing to its fist while Space is held (little finger first, thumb last)
      left.curl += ((desktop.grab ? 1 : 0) - left.curl) * (1 - Math.exp(-dt * 9));
      hand.curl?.(left.curl);
      // where its thumb and first finger close: the thread to the letter starts there
      hand.model.updateMatrixWorld(true);
      at(hand.model, 'thumb-tip', thumb); at(hand.model, 'index-finger-tip', finger);
      if (!desktop.touch) { desktop.handAt.addVectors(thumb, finger).multiplyScalar(0.5); desktop.handAtSet = true; }      // (a phone: main.ts puts it at the GRAB button)
    },
  };
}
