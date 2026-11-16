/**
 * Everything the game reads from the player's hands in a headset goes through here (CONTROLS-PLAN.md). Two ways to
 * play so far, chosen side by side by what the player is holding: the Quest controllers (./controller.ts, exactly as
 * they always were) and tracked hands (./hand.ts: a fist closes the hand). A mouse and a touch screen
 * come next, each in a file of its own.
 *
 * A source with a `hand` is a tracked hand; anything else goes down the controller path untouched.
 */
import * as controller from './controller';
import * as hands from './hand';
import type { Side } from './controller';

export type { Side } from './controller';
export { desktop } from './desktop';      // (a mouse and keyboard on a monitor: its own file, read only while no headset is presenting)
type Pose = { transform: { matrix: Float32Array } };

/** What is in the player's hand on that side: a controller, a tracked hand, or nothing. */
export function kind(session: XRSession, side: Side): 'controller' | 'hand' | 'none' {
  for (const source of session.inputSources) if (source.handedness === side) return source.hand ? 'hand' : 'controller';
  return 'none';
}

export const controls = {
  kind,
  /** Once a frame, before anything reads the hands (main.ts): tracked hands are read here; controllers are read as asked. */
  update(session: XRSession | null, frame: XRFrame | undefined, space: XRReferenceSpace | null, time: number) {
    if (session && frame && space) hands.update(session, frame, space, time);
  },
  /** Where a held weapon sits in that hand, or null this frame. */
  gripPose(session: XRSession, frame: XRFrame, space: XRReferenceSpace, side: Side): Pose | XRPose | null {
    if (kind(session, side) === 'hand') return hands.gripPose(side);
    return controller.gripPose(session, frame, space, side);
  },
  /** The source a hand grabs with (the first on that side with a grip, as always), or null. */
  gripSource(session: XRSession, side: Side): XRInputSource | null {
    const source = controller.gripSource(session, side);
    if (source) return source;
    for (const one of session.inputSources) if (one.handedness === side && one.hand) return one;
    return null;
  },
  /** That source's grip pose this frame (a tracked hand's is held a moment if tracking drops), or null. */
  poseOf(source: XRInputSource, frame: XRFrame, space: XRReferenceSpace): Pose | XRPose | null {
    if (source.hand) return hands.gripPose(source.handedness as Side);
    return frame.getPose(source.gripSpace!, space) ?? null;
  },
  /** How closed a hand is, 0 to 1: a controller's trigger or grip; a hand's fist. */
  squeeze(source: XRInputSource): number {
    return source.hand ? hands.stateOf(source.handedness as Side).closed : controller.squeeze(source);
  },
  rayPose: controller.rayPose,
  /** What makes the weapon live, 0 to 1: a controller's trigger; a hand's fist. */
  trigger(session: XRSession, side: Side): number {
    let last: XRInputSource | null = null;
    for (const source of session.inputSources) if (source.handedness === side) last = source;
    if (last?.hand) return hands.stateOf(side).closed;
    return controller.trigger(session, side);
  },
  /** A rumble on a controller; a hand has none. */
  buzz: controller.buzz,
  /** Is that side a tracked hand just now (for the hand numbers in letters.ts)? */
  isHand(session: XRSession | null, side: Side): boolean { return !!session && kind(session, side) === 'hand'; },
  diagnostics: hands.diagnostics,
  /** The weapon fist's lean, degrees, as the drawn hands have it (main.ts hands it over: src/hands.ts `fist`). */
  lean: hands.lean,
};
