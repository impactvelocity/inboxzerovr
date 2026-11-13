import { Vector3, type Mesh, type Object3D } from '@iwsdk/core';

/**
 * Where the katana's blade is and how fast it is moving, for whatever wants to answer a swing: the
 * swing sounds (ambience.ts), the petals and sparks it throws off (swingfx.ts) and the drifting
 * petals it knocks aside (garden.ts).
 *
 * The sword is found in the scene by its blade mesh's name rather than handed in, so sword.ts can
 * change freely; rename that mesh and all three go quiet.
 */
export class BladeTracker {
  /** False while the sword is hidden or its tracking has just jumped: nothing below means anything then. */
  moving = false;
  /** World space: the blade's tip, and its base just above the guard. */
  readonly tip = new Vector3();
  readonly base = new Vector3();
  /** The tip's velocity, m/s, and its speed smoothed over a few hundredths of a second. */
  readonly velocity = new Vector3();
  speed = 0;

  private blade: Mesh | null = null;
  /** The blade's own mesh, once it has been found in the scene (for liveblade.ts, which lights it). */
  get mesh(): Mesh | null { return !this.held && this.blade && this.blade.parent ? this.blade : null; }
  private readonly tipLocal = new Vector3();
  private readonly baseLocal = new Vector3();
  private readonly last = new Vector3();
  private tracked = false;
  private search = 0;
  private held: { root: Object3D; tip: Vector3; base: Vector3 } | null = null;
  private off = false;

  /**
   * Follow something other than the katana: a level's own weapon (its root, and the two ends of
   * what hits things in that root's space). null goes back to the katana; 'none' is a level whose
   * tool is not swung at all (the sprayer).
   */
  use(target: { root: Object3D; tip: Vector3; base: Vector3 } | null | 'none') {
    this.off = target === 'none'; this.held = target && target !== 'none' ? target : null;
    this.blade = null; this.search = 0; this.reset();
  }

  /** Forget the last position: the sword is about to be somewhere else (entering or leaving VR). */
  reset() { this.tracked = false; this.moving = false; this.speed = 0; this.velocity.set(0, 0, 0); }

  /** Every frame, after the sword has been placed. */
  update(dt: number, scene: Object3D) {
    if (this.off) { this.reset(); return; }
    if (this.held) {
      if (this.blade !== this.held.root) { this.blade = this.held.root as Mesh; this.tipLocal.copy(this.held.tip); this.baseLocal.copy(this.held.base); this.reset(); }
    } else if (!this.blade || !this.blade.parent) {
      this.blade = null; this.reset();
      if ((this.search -= dt) > 0) return;
      this.search = 1;
      const found = scene.getObjectByName('Curved beveled satin blade') as Mesh | undefined;
      const points = found?.geometry?.getAttribute('position');
      if (!found || !points) return;
      let top = 0, bottom = 0;
      for (let i = 1; i < points.count; i++) {
        if (points.getY(i) > points.getY(top)) top = i;
        if (points.getY(i) < points.getY(bottom)) bottom = i;
      }
      this.tipLocal.set(points.getX(top), points.getY(top), points.getZ(top));
      this.baseLocal.set(points.getX(bottom), points.getY(bottom), points.getZ(bottom));
      this.blade = found;
    }
    let shown = true;
    for (let o: Object3D | null = this.blade; o; o = o.parent) if (!o.visible) { shown = false; break; }
    if (!shown || dt <= 0.001 || dt > 0.1) { this.reset(); return; }
    this.tip.copy(this.tipLocal).applyMatrix4(this.blade.matrixWorld);
    this.base.copy(this.baseLocal).applyMatrix4(this.blade.matrixWorld);
    const moved = this.tracked ? this.tip.distanceTo(this.last) : 0;
    // a jump in tracking is not a swing
    if (!this.tracked || moved > 0.5 || moved / dt > 30) { this.last.copy(this.tip); this.reset(); this.tracked = true; return; }
    this.velocity.copy(this.tip).sub(this.last).divideScalar(dt);
    this.last.copy(this.tip);
    this.speed += (moved / dt - this.speed) * (1 - Math.exp(-dt / 0.03));
    this.moving = true;
  }
}
