import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  Scene,
  TorusGeometry,
  Vector3,
} from 'three';
import { PALETTE } from '../config';

const m4 = new Matrix4();
const q = new Quaternion();

function instanced(
  geometry: BoxGeometry | CylinderGeometry,
  material: MeshBasicMaterial | MeshLambertMaterial,
  placements: { pos: [number, number, number]; scale: [number, number, number]; rotY?: number }[],
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, placements.length);
  placements.forEach((p, i) => {
    q.setFromAxisAngle(new Vector3(0, 1, 0), p.rotY ?? 0);
    m4.compose(new Vector3(...p.pos), q, new Vector3(...p.scale));
    mesh.setMatrixAt(i, m4);
  });
  mesh.instanceMatrix.needsUpdate = true;
  // Instances are spread far apart; the default bounding sphere would cull them wrongly.
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * The room: a dark, stationary, low-poly arena. Everything is built from a
 * few instanced primitives so it costs about ten draw calls and no downloads.
 * The origin of `root` is the floor point under the seated player, facing -z.
 */
export class ArenaScene {
  readonly root = new Group();
  private accents: { material: MeshBasicMaterial; base: Color; phase: number }[] = [];
  private time = 0;
  private flash = 0;
  /** 0 = full background motion, 1 = calm (review, reduced effects). */
  calm = 0;
  reduced = false;

  constructor(scene: Scene) {
    scene.background = new Color(PALETTE.background);
    scene.fog = new Fog(PALETTE.background, 7, 46);
    scene.add(new HemisphereLight(0x8fa4ff, 0x05070f, 1.5));
    const sun = new DirectionalLight(0xc7d4ff, 1.1);
    sun.position.set(-2, 6, 3);
    scene.add(sun);
    scene.add(this.root);

    const navy = new MeshLambertMaterial({ color: PALETTE.navy, flatShading: true });
    const dark = new MeshLambertMaterial({ color: 0x0c1226, flatShading: true });

    // Semicircular platform under and in front of the seat.
    const platform = new Mesh(new CylinderGeometry(2.3, 2.55, 0.16, 14, 1, false, Math.PI / 2, Math.PI), navy);
    platform.position.y = -0.08;
    this.root.add(platform);
    const rimMat = this.accent(PALETTE.cyan, 0);
    const rim = new Mesh(new TorusGeometry(2.32, 0.018, 4, 14, Math.PI), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.012;
    this.root.add(rim);

    // A wide matte floor far below the rails, so the horizon is not a void.
    const floor = new Mesh(new BoxGeometry(60, 0.1, 70), dark);
    floor.position.set(0, -0.6, -30);
    this.root.add(floor);

    // Rails receding forward. None run directly behind the card.
    const box = new BoxGeometry(1, 1, 1);
    const rails = (xs: number[], color: number, phase: number) =>
      instanced(
        box,
        this.accent(color, phase),
        xs.map((x) => ({ pos: [x, -0.5, -24] as [number, number, number], scale: [0.05, 0.03, 44] as [number, number, number] })),
      );
    this.root.add(rails([-1.5, 1.5, -6.5, 6.5], PALETTE.cyan, 0.4));
    this.root.add(rails([-3.4, 3.4], PALETTE.coral, 1.3));

    // Broad overhead light bars.
    const bars = [-4, -9, -15, -22, -30].map((z, i) => ({
      pos: [0, 5.2 + i * 0.25, z] as [number, number, number],
      scale: [7 - i * 0.5, 0.08, 0.3] as [number, number, number],
    }));
    this.root.add(instanced(box, this.accent(PALETTE.magenta, 2.1), bars.filter((_, i) => i % 2 === 0)));
    this.root.add(instanced(box, this.accent(PALETTE.cyan, 2.9), bars.filter((_, i) => i % 2 === 1)));

    // Faceted pillars down both sides, each with one light strip.
    const pillarGeo = new CylinderGeometry(0.55, 0.85, 1, 5, 1);
    const pillars: { pos: [number, number, number]; scale: [number, number, number]; rotY: number }[] = [];
    const strips: { pos: [number, number, number]; scale: [number, number, number] }[] = [];
    for (let i = 0; i < 7; i++) {
      const z = -3 - i * 4.6;
      const h = 4.5 + ((i * 37) % 5) * 0.8;
      for (const side of [-1, 1]) {
        const x = side * (5 + ((i * 13) % 3) * 0.7);
        pillars.push({ pos: [x, h / 2 - 0.6, z], scale: [1, h, 1], rotY: i * 0.7 + side });
        strips.push({ pos: [x - side * 0.72, h * 0.45, z], scale: [0.04, h * 0.5, 0.04] });
      }
    }
    this.root.add(instanced(pillarGeo, navy, pillars));
    this.root.add(instanced(box, this.accent(PALETTE.coral, 0.9), strips.filter((_, i) => i % 3 !== 0)));
    this.root.add(instanced(box, this.accent(PALETTE.cyan, 1.7), strips.filter((_, i) => i % 3 === 0)));
  }

  private accent(color: number, phase: number): MeshBasicMaterial {
    const material = new MeshBasicMaterial({ color, toneMapped: false });
    this.accents.push({ material, base: new Color(color), phase });
    return material;
  }

  /** One brief, gentle brightening of the room lights. Skipped when effects are reduced. */
  celebrate(): void {
    if (!this.reduced) this.flash = 1;
  }

  update(dt: number): void {
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt / 1.6);
    const motion = this.reduced ? 0 : 1 - this.calm * 0.75;
    for (const a of this.accents) {
      // Slow breathing, never a strobe: under 0.2 Hz and a small range.
      const pulse = 0.78 + 0.16 * motion * Math.sin(this.time * 0.9 + a.phase);
      const level = Math.min(1.15, pulse * (1 - this.calm * 0.35) + this.flash * 0.3);
      a.material.color.copy(a.base).multiplyScalar(level);
    }
  }
}
