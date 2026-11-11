import { Matrix4, Vector3 } from 'three';
import { BLADE } from '../config';
import { sweepHitsCard, type BladePose } from '../domain/slash';
import type { EmailCard } from '../render/EmailCard';
import { BLADE_BASE, type HandVisual } from '../render/Hands';
import type { HandInput } from './XRInput';

const inv = new Matrix4();

/**
 * Turns blade motion into at most one slash per card. The trigger is a clutch:
 * without it the blade is inert. The previous pose is dropped whenever input
 * is interrupted, so a pause or recentre can never read as a giant sweep.
 */
export class BladeInteraction {
  private prev: BladePose = { base: new Vector3(), tip: new Vector3() };
  private cur: BladePose = { base: new Vector3(), tip: new Vector3() };
  private hasPrev = false;
  private swingCooldown = 0;
  onSlash: (angle: number, hand: HandInput) => void = () => {};
  onSwing: (speed: number) => void = () => {};

  /** Forget the last pose. Call after pause, focus loss, recentre or parking the blade. */
  reset(): void {
    this.hasPrev = false;
  }

  /**
   * @param armed   trigger held and not captured by a UI press
   * @param card    the card to test, or null when slashing is not possible
   */
  update(dt: number, hand: HandInput, visual: HandVisual, armed: boolean, card: EmailCard | null, trails: boolean): void {
    this.cur.base.copy(hand.origin).addScaledVector(hand.dir, BLADE_BASE);
    this.cur.tip.copy(hand.origin).addScaledVector(hand.dir, BLADE_BASE + BLADE.length);
    visual.setArmed(armed);

    if (this.hasPrev && armed) {
      if (trails) visual.trail.push(this.cur.base, this.cur.tip);
      const speed = dt > 0 ? this.prev.tip.distanceTo(this.cur.tip) / dt : 0;
      this.swingCooldown -= dt;
      if (speed > 1.6 && this.swingCooldown <= 0) {
        this.swingCooldown = 0.28;
        this.onSwing(speed);
      }
      if (card && card.mode === 'idle') {
        card.group.updateWorldMatrix(true, false);
        inv.copy(card.group.matrixWorld).invert();
        const res = sweepHitsCard(this.prev, this.cur, dt, inv, card.width / 2, card.height / 2, BLADE);
        if (res.hit) {
          // Lock first, so later frames of the same swing cannot count again.
          card.mode = 'locked';
          this.onSlash(res.angle, hand);
        }
      }
    }
    this.prev.base.copy(this.cur.base);
    this.prev.tip.copy(this.cur.tip);
    this.hasPrev = true;
  }
}
