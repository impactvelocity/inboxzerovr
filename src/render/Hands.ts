import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Vector3,
} from 'three';
import { BLADE, PALETTE } from '../config';

const BOX = new BoxGeometry(1, 1, 1);
/** Distance from the controller origin to where the blade starts. */
export const BLADE_BASE = 0.05;

function box(mat: MeshBasicMaterial | MeshLambertMaterial, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0): Mesh {
  const m = new Mesh(BOX, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}

/** Thin ray along -z, used for the UI pointer and the magnetic grab ray. */
class Ray {
  readonly mesh: Mesh<BoxGeometry, MeshBasicMaterial>;
  constructor(color: number) {
    this.mesh = new Mesh(BOX, new MeshBasicMaterial({ color, transparent: true, opacity: 0.7, toneMapped: false }));
    this.mesh.visible = false;
  }
  set(length: number | null): void {
    this.mesh.visible = length !== null;
    if (length === null) return;
    this.mesh.scale.set(0.004, 0.004, length);
    this.mesh.position.set(0, 0, -length / 2 - 0.03);
  }
}

const TRAIL_POINTS = 10;

/** A short ribbon behind the armed blade. Off entirely in reduced-effects mode. */
class Trail {
  readonly mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  private positions = new Float32Array(TRAIL_POINTS * 2 * 3);
  private count = 0;

  constructor() {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.positions, 3));
    const index: number[] = [];
    for (let i = 0; i < TRAIL_POINTS - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(index);
    this.mesh = new Mesh(
      geo,
      new MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.28, side: DoubleSide, depthWrite: false, toneMapped: false }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  reset(): void {
    this.count = 0;
    this.mesh.visible = false;
  }

  push(base: Vector3, tip: Vector3): void {
    // Shift older samples back by one pair, newest at the front.
    this.positions.copyWithin(6, 0, (TRAIL_POINTS - 1) * 6);
    base.toArray(this.positions, 0);
    tip.toArray(this.positions, 3);
    this.count = Math.min(TRAIL_POINTS, this.count + 1);
    // Collapse unused samples onto the oldest real one so no stray triangles show.
    for (let i = this.count; i < TRAIL_POINTS; i++) this.positions.copyWithin(i * 6, (this.count - 1) * 6, this.count * 6);
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.visible = this.count > 1;
  }
}

/** Chunky low-poly visuals attached to one controller: blade, sorting mitt, pointer rays. */
export class HandVisual {
  readonly group = new Group();
  readonly pointer = new Ray(0xffffff);
  readonly magnet = new Ray(PALETTE.magenta);
  readonly trail = new Trail();
  private blade = new Group();
  private mitt = new Group();
  private edge: Mesh;
  private edgeMat = new MeshBasicMaterial({ color: PALETTE.cyan, toneMapped: false });
  private mittMat = new MeshLambertMaterial({ color: PALETTE.magenta, flatShading: true, emissive: new Color(PALETTE.magenta), emissiveIntensity: 0.35 });
  private armed = false;

  constructor() {
    const dark = new MeshLambertMaterial({ color: 0x1c2542, flatShading: true });
    const hilt = new Mesh(new CylinderGeometry(0.017, 0.02, 0.12, 6), dark);
    hilt.rotation.x = Math.PI / 2;
    hilt.position.z = 0.02;
    const guard = box(dark, 0.07, 0.022, 0.018, 0, 0, -BLADE_BASE + 0.008);
    this.edge = box(this.edgeMat, 0.03, 0.008, BLADE.length, 0, 0, -BLADE_BASE - BLADE.length / 2);
    this.blade.add(hilt, guard, this.edge);

    // An angular open hand: palm, three fingers, thumb.
    this.mitt.add(box(this.mittMat, 0.075, 0.022, 0.08, 0, 0, 0));
    for (let i = -1; i <= 1; i++) this.mitt.add(box(this.mittMat, 0.02, 0.02, 0.055, i * 0.027, 0.004, -0.068));
    this.mitt.add(box(this.mittMat, 0.02, 0.02, 0.045, 0.052, 0, -0.02));

    this.group.add(this.blade, this.mitt, this.pointer.mesh, this.magnet.mesh);
    this.setRole('none', false);
  }

  /** Which tool this hand shows. A parked blade is hidden and the hand acts as a pointer. */
  setRole(role: 'blade' | 'sort' | 'none', bladeActive: boolean, mirror = false): void {
    this.blade.visible = role === 'blade' && bladeActive;
    this.mitt.visible = role === 'sort' || (role === 'blade' && !bladeActive);
    this.mitt.scale.x = mirror ? -1 : 1;
    if (!this.blade.visible) this.trail.reset();
  }

  setArmed(armed: boolean): void {
    if (armed === this.armed) return;
    this.armed = armed;
    this.edgeMat.color.set(PALETTE.cyan).multiplyScalar(armed ? 1 : 0.5);
    if (armed) this.edgeMat.color.lerp(new Color(0xffffff), 0.35);
    this.edge.scale.x = armed ? 0.042 : 0.03;
    this.edge.scale.y = armed ? 0.012 : 0.008;
    if (!armed) this.trail.reset();
  }

  setGrabbing(on: boolean): void {
    this.mittMat.emissiveIntensity = on ? 0.9 : 0.35;
  }
}
