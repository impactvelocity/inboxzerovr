/**
 * Everything the game reads from the player's hands in a headset goes through here (step 0 of
 * CONTROLS-PLAN.md, 2026-11-14). For now there is one way to play, the Quest controllers
 * (./controller.ts, as they always were); tracked hands, a mouse and a touch screen come next,
 * each in a file of its own, chosen here by what the player is holding.
 */
import * as controller from './controller';

export type { Side } from './controller';

/** What is in the player's hand on that side: a controller, a tracked hand (not played yet), or nothing. */
export function kind(session: XRSession, side: 'left' | 'right'): 'controller' | 'hand' | 'none' {
  for (const source of session.inputSources) if (source.handedness === side) return source.hand ? 'hand' : 'controller';
  return 'none';
}

export const controls = {
  kind,
  /** Where a held weapon sits in the right hand (or the left), or null this frame. */
  gripPose: controller.gripPose,
  /** The source the left hand grabs with, its grip and how hard it is closed, and where it points. */
  gripSource: controller.gripSource,
  squeeze: controller.squeeze,
  rayPose: controller.rayPose,
  /** What makes the weapon live (the trigger), 0 to 1. */
  trigger: controller.trigger,
  buzz: controller.buzz,
};
