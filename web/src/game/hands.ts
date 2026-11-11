import * as THREE from 'three';
import { flipPoint, flipQuaternion, type GameContext } from '../api';
import { SkinMaterial } from './look';
import { lookRotation } from './mathx';

/**
 * The player's hands: what the headset reports for each (a controller, or a bare hand's
 * joints), and what the player sees of them.
 *
 * Unity reads these through XR Hands and XRNode devices (InboxGame.ReadJoints, ReadHand). Here
 * they come from three's WebXR controllers, which live in the play space (`ctx.rig`, three's
 * own convention); every pose is brought into Unity space on the way out of this file.
 */

export type Side = 'left' | 'right';

/** Joints are stored in XR Hands order (XRHandJointID.ToIndex()), as in Unity. */
export const JointCount = 26;
export const Wrist = 0;
export const Palm = 1;
export const ThumbTip = 5;
export const IndexKnuckle = 7;
export const IndexTip = 10;
export const MiddleMetacarpal = 11;
export const MiddleKnuckle = 12;
export const MiddleTip = 15;
export const LittleKnuckle = 22;

/**
 * WebXR's 25 joints, in its order. XR Hands has the same list with a palm joint slipped in
 * after the wrist, so WebXR joint n (n > 0) is XR Hands joint n + 1.
 */
const WebXRJoints: XRHandJoint[] = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
];

/** One hand as the game thinks of it (Unity: InboxGame.Hand). Everything is in Unity space. */
export class Hand {
  tracked = false;
  closed = false;
  trigger = false;
  triggerWas = false;
  poking = false;
  /** Finger joints, when the bare hand is tracked. */
  hasJoints = false;
  readonly joints: THREE.Vector3[] = Array.from({ length: JointCount }, () => new THREE.Vector3());
  /** After a card leaves, the hand must open before it grabs again. */
  mustOpen = false;
  readonly palm = new THREE.Vector3();
  readonly prev = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly turn = new THREE.Quaternion();
  /** Where a controller points from and along, for pressing a button at a distance. */
  readonly rayFrom = new THREE.Vector3();
  readonly rayDir = new THREE.Vector3(0, 0, 1);

  /** Stand-in pose for tests, used instead of a headset (Unity: FakeHand). */
  fake = false;
  fakeClosed = false;
  readonly fakeAt = new THREE.Vector3();
  readonly fakeTurn = new THREE.Quaternion();
  fakeJoints: THREE.Vector3[] | null = null;

  constructor(readonly side: Side) {}
}

/** What the headset says about one hand this frame. */
export interface Reading {
  found: boolean;
  /** Hand.joints has been filled in. */
  joints: boolean;
  /** A controller's grip or trigger is down (bare hands: work it out from the joints). */
  closed: boolean;
  trigger: boolean;
  at: THREE.Vector3;
  turn: THREE.Quaternion;
  rayFrom: THREE.Vector3;
  rayDir: THREE.Vector3;
}

export function makeReading(): Reading {
  return {
    found: false, joints: false, closed: false, trigger: false,
    at: new THREE.Vector3(), turn: new THREE.Quaternion(), rayFrom: new THREE.Vector3(), rayDir: new THREE.Vector3(0, 0, 1),
  };
}

interface Slot {
  ray: THREE.XRTargetRaySpace;
  grip: THREE.XRGripSpace;
  hand: THREE.XRHandSpace;
  source: XRInputSource | null;
}

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

/** three's WebXR controllers and hands, read as Unity reads its devices. */
export class XrInput {
  private readonly slots: Slot[] = [];

  /** `onGesture` is called when the player pulls a trigger, squeezes or pinches (sound may start). */
  constructor(private readonly ctx: GameContext, onGesture: () => void) {
    const xr = ctx.renderer.xr;
    for (let i = 0; i < 2; i++) {
      const slot: Slot = { ray: xr.getController(i), grip: xr.getControllerGrip(i), hand: xr.getHand(i), source: null };
      // The play space, never the mirrored Unity group: their poses must line up with the head.
      for (const space of [slot.ray, slot.grip, slot.hand]) {
        if (space.parent !== ctx.rig) ctx.rig.add(space);
      }
      slot.ray.addEventListener('connected', (event) => {
        slot.source = event.data;
      });
      slot.ray.addEventListener('disconnected', () => {
        slot.source = null;
      });
      slot.ray.addEventListener('selectstart', onGesture);
      slot.ray.addEventListener('squeezestart', onGesture);
      this.slots.push(slot);
    }
  }

  private slotFor(side: Side): Slot | null {
    for (const slot of this.slots) {
      if (slot.source !== null && slot.source.handedness === side) return slot;
    }
    return null;
  }

  /** Which kind of thing each hand is, for the status line. */
  describe(side: Side): string {
    const slot = this.slotFor(side);
    return slot === null ? '-' : slot.source !== null && slot.source.hand ? 'hand' : 'controller';
  }

  /**
   * Where one hand is. With a tracked bare hand, fills `hand.joints` (Unity space, XR Hands
   * order) and reports the palm; with a controller, reports its grip pose, its buttons and the
   * ray it points along. Not found: nothing connected on that side, or it is out of view.
   */
  read(hand: Hand, out: Reading): void {
    out.found = out.joints = out.closed = out.trigger = false;
    if (!this.ctx.inXR()) return;
    const slot = this.slotFor(hand.side);
    if (slot === null || slot.source === null) return;

    if (slot.source.hand) {
      // A bare hand. Every joint must have a pose, as in Unity; otherwise it is not tracked.
      if (!slot.hand.visible) return;
      slot.hand.updateWorldMatrix(true, false);
      const world = slot.hand.matrixWorld;
      for (let n = 0; n < WebXRJoints.length; n++) {
        const joint = slot.hand.joints[WebXRJoints[n]];
        if (joint === undefined || !joint.visible) return;
        _p.copy(joint.position).applyMatrix4(world);
        flipPoint(_p, hand.joints[n === 0 ? Wrist : n + 1]);
      }
      // WebXR has no palm joint: OpenXR's sits in the middle of the middle metacarpal bone.
      hand.joints[Palm].copy(hand.joints[MiddleMetacarpal]).lerp(hand.joints[MiddleKnuckle], 0.5);
      out.found = out.joints = true;
      out.at.copy(hand.joints[Palm]);
      const wrist = slot.hand.joints.wrist;
      if (wrist !== undefined) flipQuaternion(wrist.getWorldQuaternion(_q), out.turn);
      out.rayFrom.copy(out.at);
      out.rayDir.set(0, 0, 1).applyQuaternion(out.turn);
      return;
    }

    // A controller: the grip is the hand; the target ray is where it points.
    const held = slot.grip.visible ? slot.grip : slot.ray.visible ? slot.ray : null;
    if (held === null) return;
    held.updateWorldMatrix(true, false);
    held.matrixWorld.decompose(_p, _q, _s);
    flipPoint(_p, out.at);
    flipQuaternion(_q, out.turn);
    out.found = true;
    const buttons = slot.source.gamepad ? slot.source.gamepad.buttons : null;
    const trigger = buttons !== null && buttons.length > 0 && (buttons[0].pressed || buttons[0].value > 0.6);
    const grip = buttons !== null && buttons.length > 1 && (buttons[1].pressed || buttons[1].value > 0.6);
    out.trigger = trigger;
    out.closed = grip || trigger;
    const aim = slot.ray.visible ? slot.ray : held;
    aim.updateWorldMatrix(true, false);
    aim.matrixWorld.decompose(_p, _q, _s);
    flipPoint(_p, out.rayFrom);
    // three's spaces point down their own -z; flipped into Unity space that is +z.
    out.rayDir.set(0, 0, 1).applyQuaternion(flipQuaternion(_q, _q));
  }
}

/** The joint each joint hangs from: fingers chain back to the wrist. */
const jointParent = (joint: number): number => (joint === 2 || (joint >= 6 && (joint - 6) % 5 === 0) ? Wrist : joint - 1);

const _m = new THREE.Matrix4();
const _mid = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _rot = new THREE.Quaternion();
const _none = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * What the player sees of a hand: a light skeleton for a tracked bare hand, and a dot for a
 * controller (Unity: InboxGame.BuildHand, DrawHand). The joints and the bones are one instanced
 * mesh each.
 */
export class HandVisual {
  private readonly dots: THREE.InstancedMesh;
  private readonly bones: THREE.InstancedMesh;
  private readonly marker: THREE.Mesh;

  constructor(parent: THREE.Object3D, ctx: GameContext, side: Side, renderOrder: number) {
    const skin = new SkinMaterial(new THREE.Color().setRGB(0.78, 0.92, 1, THREE.SRGBColorSpace), 0.85);
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 12, 8), skin, JointCount);
    this.bones = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), skin, JointCount);
    for (const mesh of [this.dots, this.bones]) {
      mesh.name = `${side}Hand`;
      mesh.frustumCulled = false;
      mesh.renderOrder = renderOrder;
      mesh.visible = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < JointCount; i++) mesh.setMatrixAt(i, _none);
      parent.add(mesh);
    }
    this.marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 10),
      ctx.ui.material({ color: new THREE.Color().setRGB(0.78, 0.92, 1, THREE.SRGBColorSpace), opacity: 0.85, doubleSide: true }),
    );
    this.marker.name = `${side}Controller`;
    this.marker.scale.setScalar(0.035);
    this.marker.renderOrder = renderOrder;
    this.marker.visible = false;
    parent.add(this.marker);
  }

  /** `armed`: this hand holds the weapon, so its controller dot is hidden. */
  draw(hand: Hand, armed: boolean): void {
    const skeleton = hand.tracked && hand.hasJoints;
    this.dots.visible = this.bones.visible = skeleton;
    this.marker.visible = hand.tracked && !hand.hasJoints && !armed;
    if (this.marker.visible) this.marker.position.copy(hand.palm);
    if (!skeleton) return;
    for (let i = 0; i < JointCount; i++) {
      if (i === Palm) continue; // the palm centre is not a knuckle
      const at = hand.joints[i];
      _scale.setScalar(i === Wrist ? 0.02 : 0.013);
      this.dots.setMatrixAt(i, _m.compose(at, _rot.identity(), _scale));
      if (i === Wrist) continue;
      const from = hand.joints[jointParent(i)];
      _dir.subVectors(at, from);
      const length = _dir.length();
      if (length <= 1e-4) {
        this.bones.setMatrixAt(i, _none);
        continue;
      }
      _mid.addVectors(from, at).multiplyScalar(0.5);
      lookRotation(_dir, undefined, _rot);
      this.bones.setMatrixAt(i, _m.compose(_mid, _rot, _scale.set(0.007, 0.007, length)));
    }
    this.dots.instanceMatrix.needsUpdate = true;
    this.bones.instanceMatrix.needsUpdate = true;
  }
}
