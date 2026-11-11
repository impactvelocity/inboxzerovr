import { Vector3 } from 'three';

export interface AimTarget<T extends string = string> {
  id: T;
  position: Vector3;
}

export interface AimOptions {
  /** Half-angle within which a held card counts as aimed at a portal. */
  aimConeDeg: number;
  /** Wider half-angle used for the direction of a throw. */
  throwConeDeg: number;
  throwMinSpeed: number;
}

const v = new Vector3();
const w = new Vector3();

function angleTo(dir: Vector3, from: Vector3, target: Vector3): number {
  w.copy(target).sub(from);
  if (dir.lengthSq() < 1e-8 || w.lengthSq() < 1e-8) return Math.PI;
  return dir.angleTo(w);
}

/**
 * Which portal, if any, a held card is headed for. Three gentle signals count,
 * and the best one wins:
 *  - a throw: the hand's velocity points at the portal (wide cone);
 *  - pointing: the controller points at the portal;
 *  - placement: the hand has moved toward the portal's side of the seat.
 * Returns null when nothing is clearly aimed, so a miss is never a decision.
 */
export function choosePortal<T extends string>(
  seat: Vector3,
  hand: Vector3,
  pointDir: Vector3,
  velocity: Vector3,
  targets: AimTarget<T>[],
  opts: AimOptions,
): T | null {
  const aimCone = (opts.aimConeDeg * Math.PI) / 180;
  const throwCone = (opts.throwConeDeg * Math.PI) / 180;
  let best: T | null = null;
  let bestScore = Infinity;

  const speed = velocity.length();
  // Hand offset from the seat, flattened so reaching up or down does not matter.
  v.copy(hand).sub(seat);
  v.y = 0;
  const reach = v.length();
  const offset = v.clone();

  for (const t of targets) {
    if (speed >= opts.throwMinSpeed) {
      const ang = angleTo(velocity, hand, t.position);
      if (ang <= throwCone && ang / throwCone < bestScore) {
        bestScore = ang / throwCone;
        best = t.id;
      }
    }
    const point = angleTo(pointDir, hand, t.position);
    if (point <= aimCone && point / aimCone < bestScore) {
      bestScore = point / aimCone;
      best = t.id;
    }
    if (reach > 0.28) {
      w.copy(t.position).sub(seat);
      w.y = 0;
      const side = offset.angleTo(w);
      if (side <= aimCone * 0.75 && side / aimCone < bestScore) {
        bestScore = side / aimCone;
        best = t.id;
      }
    }
  }
  return best;
}
