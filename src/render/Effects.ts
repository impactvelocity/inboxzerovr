import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Plane,
  PlaneGeometry,
  Quaternion,
  TetrahedronGeometry,
  Vector3,
} from 'three';
import { PALETTE, TIMING } from '../config';

export interface CardVisual {
  texture: CanvasTexture;
  width: number;
  height: number;
  pos: Vector3;
  quat: Quaternion;
  scale: number;
  tint: Color;
}

const MAX_SHARDS = 20;
const UNIT = new PlaneGeometry(1, 1);
const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpV = new Vector3();
const tmpS = new Vector3();

interface Shard {
  pos: Vector3;
  vel: Vector3;
  axis: Vector3;
  spin: number;
  life: number;
}

/**
 * Short, pooled exit effects for the card. Nothing here is allocated per
 * action except the card texture it is handed, which it disposes when done.
 * All poses are in arena space (this group is a child of the arena root).
 */
export class Effects {
  readonly group = new Group();
  reduced = false;

  // Slash: two halves of the same card texture, each clipped to one side of the cut.
  private halves: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private planes = [new Plane(), new Plane()];
  private cut: Mesh<BoxGeometry, MeshBasicMaterial>;
  private split: { visual: CardVisual; normal: Vector3; t: number } | null = null;

  private shardMesh: InstancedMesh;
  private shards: Shard[] = [];

  // Portal capture: one quad that flies, shrinks and vanishes inside the portal.
  private flyer: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private flight: { visual: CardVisual; to: Vector3; t: number; onArrive: () => void } | null = null;

  constructor() {
    for (let i = 0; i < 2; i++) {
      const mat = new MeshBasicMaterial({
        alphaTest: 0.5,
        transparent: true,
        side: DoubleSide,
        toneMapped: false,
        clippingPlanes: [this.planes[i]],
      });
      const half = new Mesh(UNIT, mat);
      half.visible = false;
      this.halves.push(half);
      this.group.add(half);
    }
    this.cut = new Mesh(
      new BoxGeometry(1, 0.012, 0.004),
      new MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, toneMapped: false }),
    );
    this.cut.visible = false;
    this.group.add(this.cut);

    this.shardMesh = new InstancedMesh(
      new TetrahedronGeometry(0.03),
      new MeshBasicMaterial({ color: PALETTE.coral, toneMapped: false }),
      MAX_SHARDS,
    );
    this.shardMesh.count = 0;
    this.shardMesh.frustumCulled = false;
    this.group.add(this.shardMesh);

    this.flyer = new Mesh(UNIT, new MeshBasicMaterial({ alphaTest: 0.5, side: DoubleSide, toneMapped: false }));
    this.flyer.visible = false;
    this.group.add(this.flyer);
  }

  /** Split the card along `angle` (radians, in the card's own plane) and scatter a few shards. */
  slash(visual: CardVisual, angle: number): void {
    this.endSplit();
    const dir = new Vector3(Math.cos(angle), Math.sin(angle), 0).applyQuaternion(visual.quat);
    const normal = new Vector3(-Math.sin(angle), Math.cos(angle), 0).applyQuaternion(visual.quat);
    this.split = { visual, normal, t: 0 };
    for (const half of this.halves) {
      half.material.map = visual.texture;
      half.material.opacity = 1;
      half.material.needsUpdate = true;
      half.quaternion.copy(visual.quat);
      half.scale.set(visual.width, visual.height, 1);
      half.visible = true;
    }
    this.cut.position.copy(visual.pos).addScaledVector(new Vector3(0, 0, 0.01).applyQuaternion(visual.quat), 1);
    this.cut.quaternion.copy(visual.quat).multiply(tmpQ.setFromAxisAngle(new Vector3(0, 0, 1), angle));
    this.cut.scale.set(Math.hypot(visual.width, visual.height) * 1.1, 1, 1);
    this.cut.material.opacity = 1;
    this.cut.visible = true;
    this.updateSplit(0);

    // Shards start on the cut line and leave to either side of it.
    const count = this.reduced ? 6 : MAX_SHARDS;
    this.shards.length = 0;
    (this.shardMesh.material as MeshBasicMaterial).color.copy(visual.tint);
    for (let i = 0; i < count; i++) {
      const along = (i / (count - 1) - 0.5) * visual.width * 0.9;
      const side = i % 2 === 0 ? 1 : -1;
      const r = (n: number) => Math.sin(i * 12.9898 + n * 78.233) * 0.5 + 0.5; // deterministic scatter
      const pos = visual.pos.clone().addScaledVector(dir, along);
      const vel = normal
        .clone()
        .multiplyScalar(side * (0.5 + r(1) * 0.9))
        .addScaledVector(dir, (r(2) - 0.5) * 0.8)
        .add(new Vector3(0, 0.25, 0.3 * r(3)));
      this.shards.push({ pos, vel, axis: new Vector3(r(4) - 0.5, r(5) - 0.5, r(6) - 0.5).normalize(), spin: 4 + r(7) * 8, life: 0 });
    }
    this.shardMesh.count = count;
  }

  /** Send the card visual into a portal. `onArrive` fires when it enters the capture volume. */
  fly(visual: CardVisual, to: Vector3, onArrive: () => void): void {
    this.endFlight(false);
    this.flight = { visual, to: to.clone(), t: 0, onArrive };
    this.flyer.material.map = visual.texture;
    this.flyer.material.needsUpdate = true;
    this.flyer.visible = true;
    this.updateFlight(0);
  }

  get flying(): boolean {
    return this.flight !== null;
  }

  /** Stop a flight without it counting as a capture (pause, focus loss). */
  cancelFlight(): void {
    this.endFlight(false);
  }

  update(dt: number): void {
    if (this.split) this.updateSplit(dt);
    if (this.flight) this.updateFlight(dt);
    if (this.shardMesh.count > 0) this.updateShards(dt);
  }

  private updateSplit(dt: number): void {
    const s = this.split!;
    s.t += dt;
    const k = Math.min(1, s.t / TIMING.cardSplit);
    const spread = 0.02 + k * 0.16;
    this.halves.forEach((half, i) => {
      const side = i === 0 ? 1 : -1;
      half.position.copy(s.visual.pos).addScaledVector(s.normal, side * spread);
      half.position.y -= k * k * 0.05;
      half.material.opacity = 1 - k;
      // The clip plane travels with its half, so each keeps exactly its side of the cut.
      this.group.localToWorld(tmpV.copy(half.position));
      tmpS.copy(s.normal).multiplyScalar(side).transformDirection(this.group.matrixWorld);
      this.planes[i].setFromNormalAndCoplanarPoint(tmpS, tmpV);
    });
    this.cut.material.opacity = 1 - k;
    this.cut.scale.y = 1 + k * 2;
    if (k >= 1) this.endSplit();
  }

  private endSplit(): void {
    if (!this.split) return;
    this.split.visual.texture.dispose();
    this.split = null;
    for (const half of this.halves) {
      half.visible = false;
      half.material.map = null;
    }
    this.cut.visible = false;
  }

  private updateFlight(dt: number): void {
    const f = this.flight!;
    f.t += dt;
    const k = Math.min(1, f.t / TIMING.portalCapture);
    const e = k * k * (3 - 2 * k);
    this.flyer.position.lerpVectors(f.visual.pos, f.to, e);
    this.flyer.position.y += Math.sin(k * Math.PI) * 0.12;
    this.flyer.quaternion.copy(f.visual.quat);
    // Shrink on the way, then dissolve to nothing inside the frame.
    const s = f.visual.scale * (1 - e * 0.55) * (k > 0.8 ? (1 - k) / 0.2 : 1);
    this.flyer.scale.set(f.visual.width * s, f.visual.height * s, 1);
    if (k >= 1) this.endFlight(true);
  }

  private endFlight(arrived: boolean): void {
    const f = this.flight;
    if (!f) return;
    this.flight = null;
    f.visual.texture.dispose();
    this.flyer.visible = false;
    this.flyer.material.map = null;
    if (arrived) f.onArrive();
  }

  private updateShards(dt: number): void {
    let alive = 0;
    for (const s of this.shards) {
      s.life += dt;
      const k = Math.min(1, s.life / TIMING.shardFade);
      if (k < 1) alive++;
      s.vel.y -= 1.6 * dt;
      s.pos.addScaledVector(s.vel, dt);
      tmpQ.setFromAxisAngle(s.axis, s.life * s.spin);
      tmpS.setScalar(1 - k);
      tmpM.compose(s.pos, tmpQ, tmpS);
      this.shardMesh.setMatrixAt(this.shards.indexOf(s), tmpM);
    }
    this.shardMesh.instanceMatrix.needsUpdate = true;
    if (alive === 0) this.shardMesh.count = 0;
  }
}
