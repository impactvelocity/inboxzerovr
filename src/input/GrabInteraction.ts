import { Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { GRAB, PALETTE } from '../config';
import { choosePortal } from '../domain/aim';
import type { EmailCard } from '../render/EmailCard';
import type { HandVisual } from '../render/Hands';
import type { PortalId, SortingPortal } from '../render/SortingPortal';
import type { HandInput } from './XRInput';

const local = new Vector3();
const world = new Vector3();
const toCard = new Vector3();
const target = new Vector3();
const q = new Quaternion();
const parentQ = new Quaternion();
const look = new Matrix4();
const UP = new Vector3(0, 1, 0);
const ZERO = new Vector3();

/**
 * The sorting hand: grip to pick the card up (by reach or by a short magnetic
 * ray), release toward a portal to send it there. A release that is not
 * clearly aimed sends the card home; it is never lost and never archived.
 */
export class GrabInteraction {
  holding = false;
  private candidate: PortalId | null = null;
  private wasAimed = false;
  private targets: { id: PortalId; position: Vector3 }[];
  onGrab: (hand: HandInput) => void = () => {};
  onAimStart: (hand: HandInput) => void = () => {};
  /** The card was released toward a portal. */
  onThrow: (portal: PortalId, hand: HandInput) => void = () => {};
  onMiss: () => void = () => {};

  constructor(
    private arena: Object3D,
    private portals: SortingPortal[],
  ) {
    this.targets = portals.map((p) => ({ id: p.id, position: new Vector3() }));
  }

  /** Let go without deciding anything (pause, focus loss, phase change). */
  cancel(card: EmailCard, visual?: HandVisual): void {
    if (this.holding) {
      this.holding = false;
      card.returnHome();
    }
    this.setCandidate(null);
    this.wasAimed = false;
    visual?.magnet.set(null);
    visual?.setGrabbing(false);
  }

  /** Is the hand close enough, or pointing closely enough, to pick the card up? Returns ray length or null. */
  private aimAt(hand: HandInput, card: EmailCard): number | null {
    card.group.getWorldPosition(world);
    const dist = hand.origin.distanceTo(world);
    if (dist <= GRAB.directReach) return dist;
    if (dist > GRAB.rayMaxDistance) return null;
    toCard.copy(world).sub(hand.origin).normalize();
    // The card is wide, so widen the cone by the angle it subtends.
    const half = Math.atan2(card.width * 0.45, dist) + (GRAB.rayConeDeg * Math.PI) / 180;
    return hand.dir.angleTo(toCard) <= half ? dist : null;
  }

  update(dt: number, hand: HandInput, visual: HandVisual, head: Vector3, card: EmailCard | null, enabled: boolean): void {
    if (!card || !enabled) {
      if (card) this.cancel(card, visual);
      else {
        this.holding = false;
        this.setCandidate(null);
        visual.magnet.set(null);
      }
      return;
    }
    this.portals.forEach((p, i) => p.center(this.targets[i].position));

    if (!this.holding) {
      const reach = card.mode === 'idle' ? this.aimAt(hand, card) : null;
      visual.magnet.set(reach !== null && reach > GRAB.directReach ? reach : null);
      if (reach !== null && !this.wasAimed) this.onAimStart(hand);
      this.wasAimed = reach !== null;
      if (reach !== null && hand.grip.down) {
        this.holding = true;
        card.mode = 'held';
        card.setTint(PALETTE.magenta);
        visual.magnet.set(null);
        visual.setGrabbing(true);
        this.onGrab(hand);
      }
      return;
    }

    // Held: the card rides just ahead of the hand, facing the player.
    world.copy(hand.origin).addScaledVector(hand.dir, GRAB.heldDistance);
    world.y += 0.06;
    look.lookAt(head, world, UP);
    q.setFromRotationMatrix(look);
    local.copy(world);
    this.arena.worldToLocal(local);
    this.arena.getWorldQuaternion(parentQ).invert();
    card.follow(local, q.premultiply(parentQ), GRAB.heldScale, dt);

    const aimed = choosePortal(head, hand.origin, hand.dir, ZERO, this.targets, GRAB);
    this.setCandidate(aimed);
    card.setTint(aimed === 'keep' ? PALETTE.cyan : aimed === 'tomorrow' ? PALETTE.coral : PALETTE.magenta);

    if (!hand.grip.pressed) {
      this.holding = false;
      visual.setGrabbing(false);
      // On release the throw direction counts too.
      const chosen = choosePortal(head, hand.origin, hand.dir, hand.velocity, this.targets, GRAB);
      this.setCandidate(null);
      if (chosen) {
        this.onThrow(chosen, hand);
      } else {
        card.returnHome();
        this.onMiss();
      }
    }
  }

  /** Where a portal sits in arena space, for the capture flight. */
  portalPosition(id: PortalId): Vector3 {
    return target.copy(this.portals.find((p) => p.id === id)!.group.position);
  }

  private setCandidate(id: PortalId | null): void {
    if (id === this.candidate) return;
    this.candidate = id;
    for (const p of this.portals) p.setHighlighted(p.id === id);
  }
}
