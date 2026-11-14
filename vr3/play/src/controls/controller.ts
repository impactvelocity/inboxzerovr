/**
 * The Quest controllers, as the game has always read them (2026-11-14: moved here unchanged from
 * letters.ts, sword.ts, weapons/held.ts, main.ts and howto.ts, so other ways of playing can sit
 * beside them). The controllers are dialed in: every read here is exactly what those files did,
 * the same buttons, the same sources and the same order. Change nothing here for another mode;
 * give that mode its own file (CONTROLS-PLAN.md).
 */
export type Side = 'left' | 'right';
type Rumble = Gamepad & { hapticActuators?: { pulse?(value: number, duration: number): Promise<boolean> }[] };

/** The first source on that side that has a grip, as every reader took it. */
export function gripSource(session: XRSession, side: Side): XRInputSource | null {
  for (const source of session.inputSources) if (source.handedness === side && source.gripSpace) return source;
  return null;
}

/** Where the controller on that side is held: its grip pose, or null (none on that side, or not tracked this frame). */
export function gripPose(session: XRSession, frame: XRFrame, space: XRReferenceSpace, side: Side): XRPose | null {
  const source = gripSource(session, side);
  return source ? frame.getPose(source.gripSpace!, space) ?? null : null;
}

/** The trigger on that side, 0 to 1: the last source on that side has the say, as the readers had it. */
export function trigger(session: XRSession, side: Side): number {
  let value = 0;
  for (const source of session.inputSources) if (source.handedness === side) value = source.gamepad?.buttons?.[0]?.value ?? 0;
  return value;
}

/** How hard a controller is closed, 0 to 1: trigger or grip, whichever is pressed more (the left hand's grab). */
export function squeeze(source: XRInputSource): number {
  const buttons = source.gamepad?.buttons;
  return Math.max(buttons?.[0]?.value ?? 0, buttons?.[1]?.value ?? 0);
}

/** Where a controller points: its target ray's pose, or null. */
export function rayPose(source: XRInputSource, frame: XRFrame, space: XRReferenceSpace): XRPose | null {
  return source.targetRaySpace ? frame.getPose(source.targetRaySpace, space) ?? null : null;
}

/** A rumble in every controller on that side (nothing, where there is no rumble). */
export function buzz(session: XRSession, side: Side, strength: number, ms: number) {
  for (const source of session.inputSources) {
    if (source.handedness !== side) continue;
    const pad = source.gamepad as Rumble | undefined;
    try { void pad?.hapticActuators?.[0]?.pulse?.(strength, ms)?.catch(() => undefined); } catch { /* no rumble on this controller */ }
  }
}
