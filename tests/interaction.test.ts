import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { choosePortal } from '../src/domain/aim';
import { sweepHitsCard, type BladePose } from '../src/domain/slash';

const OPTS = { minSpeed: 0.4, depthFront: 0.3, depthBack: 0.12, margin: 0.04, maxFrameGap: 0.25 };
// A card facing +z, centred 1.1 m in front of the origin at chest height.
const worldToCard = new Matrix4().makeTranslation(0, 1.05, -1.1).invert();
const HALF_W = 0.45;
const HALF_H = 0.25;

/** A blade 0.42 m long pointing straight ahead, with its tip at the given point. */
function blade(tipX: number, tipY: number, tipZ = -1.05): BladePose {
  return { base: new Vector3(tipX, tipY, tipZ + 0.42), tip: new Vector3(tipX, tipY, tipZ) };
}

const sweep = (a: BladePose, b: BladePose, dt: number) => sweepHitsCard(a, b, dt, worldToCard, HALF_W, HALF_H, OPTS);

describe('slash detection', () => {
  it('a deliberate swing through the card hits', () => {
    const r = sweep(blade(-0.1, 1.05), blade(0.1, 1.05), 1 / 72);
    expect(r.hit).toBe(true);
    expect(r.speed).toBeGreaterThan(10);
  });

  it('a blade resting in the card does nothing', () => {
    expect(sweep(blade(0, 1.05), blade(0, 1.05), 1 / 72).hit).toBe(false);
    // Slow drift: 2 mm per frame is about 0.14 m/s.
    expect(sweep(blade(0, 1.05), blade(0.002, 1.05), 1 / 72).hit).toBe(false);
  });

  it('a low-frame-rate sweep that starts and ends outside the card still hits', () => {
    // One 10 fps frame carries the blade from left of the card to right of it.
    const r = sweep(blade(-0.8, 1.05), blade(0.8, 1.05), 0.1);
    expect(r.hit).toBe(true);
  });

  it('a swing that passes beside the card misses', () => {
    expect(sweep(blade(-0.8, 1.6), blade(0.8, 1.6), 1 / 30).hit).toBe(false);
    // In line with the card but far short of it.
    expect(sweep(blade(-0.3, 1.05, -0.4), blade(0.3, 1.05, -0.4), 1 / 30).hit).toBe(false);
  });

  it('ignores a jump after a long gap, such as a pause or recentre', () => {
    expect(sweep(blade(-0.8, 1.05), blade(0.8, 1.05), 0.6).hit).toBe(false);
    expect(sweep(blade(-0.8, 1.05), blade(0.8, 1.05), 0).hit).toBe(false);
  });

  it('accepts any direction and reports it', () => {
    const down = sweep(blade(0, 1.4), blade(0, 0.7), 1 / 30);
    expect(down.hit).toBe(true);
    expect(down.angle).toBeCloseTo(-Math.PI / 2, 2);
    const diagonal = sweep(blade(-0.5, 0.75), blade(0.5, 1.35), 1 / 30);
    expect(diagonal.hit).toBe(true);
    expect(diagonal.angle).toBeGreaterThan(0);
  });
});

describe('portal aim', () => {
  const AIM = { aimConeDeg: 32, throwConeDeg: 42, throwMinSpeed: 0.5 };
  const seat = new Vector3(0, 1.15, 0);
  const rad = (30 * Math.PI) / 180;
  const targets = [
    { id: 'keep' as const, position: new Vector3(-Math.sin(rad) * 2.3, 1.2, -Math.cos(rad) * 2.3) },
    { id: 'tomorrow' as const, position: new Vector3(Math.sin(rad) * 2.3, 1.2, -Math.cos(rad) * 2.3) },
  ];
  const still = new Vector3();
  const forward = new Vector3(0, 0, -1);
  const down = new Vector3(0, -1, 0);

  it('a card held straight ahead has no target', () => {
    expect(choosePortal(seat, new Vector3(0, 1.0, -0.45), forward, still, targets, AIM)).toBeNull();
  });

  it('a gentle placement toward one side picks that portal', () => {
    expect(choosePortal(seat, new Vector3(-0.3, 1.0, -0.4), down, still, targets, AIM)).toBe('keep');
    expect(choosePortal(seat, new Vector3(0.3, 1.0, -0.4), down, still, targets, AIM)).toBe('tomorrow');
  });

  it('pointing at a portal picks it', () => {
    const hand = new Vector3(0, 1.0, -0.4);
    const dir = targets[1].position.clone().sub(hand).normalize();
    expect(choosePortal(seat, hand, dir, still, targets, AIM)).toBe('tomorrow');
  });

  it('a throw follows its velocity, and a throw at nothing has no target', () => {
    const hand = new Vector3(0, 1.0, -0.45);
    const toKeep = targets[0].position.clone().sub(hand).normalize().multiplyScalar(1.5);
    expect(choosePortal(seat, hand, down, toKeep, targets, AIM)).toBe('keep');
    expect(choosePortal(seat, hand, down, new Vector3(0, -2, 0), targets, AIM)).toBeNull();
  });
});
