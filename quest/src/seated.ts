import { createSystem, VisibilityState } from '@iwsdk/core';

/** Eye height, in metres above the arena floor, that the scene is built for. */
export const SEATED_EYE_HEIGHT = 1.15;

/**
 * Keeps the player at a seated eye height. On entering VR the play space is
 * raised or lowered so the head sits at SEATED_EYE_HEIGHT, whether the person
 * is on a chair, a sofa or standing. If they change posture and hold it, the
 * view eases to the new height.
 */
export class SeatedSystem extends createSystem({}) {
  private calibrated = false;
  private offTimer = 0;
  private easing = false;

  update(delta: number): void {
    const player = this.player;
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      this.calibrated = false;
      this.easing = false;
      player.position.y = 0;
      return;
    }
    const headY = player.head.position.y; // relative to the play-space floor
    if (headY < 0.2) return; // no head pose yet
    const target = SEATED_EYE_HEIGHT - headY;
    if (!this.calibrated) {
      player.position.y = target;
      this.calibrated = true;
      return;
    }
    const error = target - player.position.y;
    if (this.easing) {
      player.position.y += error * (1 - Math.exp(-3 * delta));
      if (Math.abs(error) < 0.02) this.easing = false;
      return;
    }
    // Leaning and reaching are play; only a held change of posture re-seats.
    this.offTimer = Math.abs(error) > 0.22 ? this.offTimer + delta : 0;
    if (this.offTimer > 1.5) {
      this.offTimer = 0;
      this.easing = true;
    }
  }
}
