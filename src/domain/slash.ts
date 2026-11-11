import { Matrix4, Vector3 } from 'three';

export interface BladePose {
  base: Vector3;
  tip: Vector3;
}

export interface SlashOptions {
  minSpeed: number;
  depthFront: number;
  depthBack: number;
  margin: number;
  maxFrameGap: number;
}

export interface SlashResult {
  hit: boolean;
  /** Blade-tip speed over the frame, m/s. */
  speed: number;
  /** Direction of travel across the card face, radians, in the card's own x/y plane. */
  angle: number;
}

const a = new Vector3();
const b = new Vector3();
const p = new Vector3();
const SAMPLES_ALONG_BLADE = 6;
const MAX_STEP = 0.03;
const MAX_SUBSTEPS = 48;

/**
 * Did the blade, moving from `prev` to `cur` over `dt` seconds, pass through
 * the card? The card is a box in its own local space: x/y across the face,
 * +z toward the player. The sweep is subdivided by distance travelled, so a
 * fast swing at a low frame rate cannot tunnel through between two frames.
 *
 * Speed is part of the test, not a separate gate: a blade resting inside the
 * volume, or drifting through it slowly, is never a hit.
 */
export function sweepHitsCard(
  prev: BladePose,
  cur: BladePose,
  dt: number,
  worldToCard: Matrix4,
  halfWidth: number,
  halfHeight: number,
  opts: SlashOptions,
): SlashResult {
  const tipTravel = prev.tip.distanceTo(cur.tip);
  const speed = dt > 0 ? tipTravel / dt : 0;
  const localPrev = a.copy(prev.tip).applyMatrix4(worldToCard);
  const localCur = b.copy(cur.tip).applyMatrix4(worldToCard);
  const angle = Math.atan2(localCur.y - localPrev.y, localCur.x - localPrev.x);
  const miss: SlashResult = { hit: false, speed, angle };

  if (dt <= 0 || dt > opts.maxFrameGap || speed < opts.minSpeed) return miss;

  const substeps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(tipTravel / MAX_STEP)));
  const hw = halfWidth + opts.margin;
  const hh = halfHeight + opts.margin;
  for (let s = 0; s < SAMPLES_ALONG_BLADE; s++) {
    // Skip the part of the blade nearest the grip; sample out to the tip.
    const t = 0.2 + (0.8 * s) / (SAMPLES_ALONG_BLADE - 1);
    for (let k = 0; k <= substeps; k++) {
      const alpha = k / substeps;
      a.lerpVectors(prev.base, prev.tip, t);
      b.lerpVectors(cur.base, cur.tip, t);
      p.lerpVectors(a, b, alpha).applyMatrix4(worldToCard);
      if (Math.abs(p.x) <= hw && Math.abs(p.y) <= hh && p.z <= opts.depthFront && p.z >= -opts.depthBack) {
        return { hit: true, speed, angle };
      }
    }
  }
  return miss;
}
