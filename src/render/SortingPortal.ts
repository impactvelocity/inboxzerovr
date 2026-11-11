import { CircleGeometry, Color, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, TorusGeometry, Vector3 } from 'three';
import { LAYOUT, PALETTE } from '../config';
import { drawIcon, font, type IconName } from './text';
import { Panel, drawFace } from './ui3d';

export type PortalId = 'keep' | 'tomorrow';

/** A large angular frame the player sends cards into. Identified by its word and icon, not just colour. */
export class SortingPortal {
  readonly group = new Group();
  readonly id: PortalId;
  private ring: Mesh<TorusGeometry, MeshBasicMaterial>;
  private core: Mesh<CircleGeometry, MeshBasicMaterial>;
  private label: Panel;
  private color: Color;
  private highlight = 0;
  private target = 0;
  private pulse = 0;
  private sub = '';

  constructor(id: PortalId, side: -1 | 1, title: string, icon: IconName, color: number) {
    this.id = id;
    this.color = new Color(color);
    const r = LAYOUT.portalRadius;
    const angle = (LAYOUT.portalAngleDeg * Math.PI) / 180;
    this.group.position.set(side * Math.sin(angle) * LAYOUT.portalDistance, LAYOUT.portalY, -Math.cos(angle) * LAYOUT.portalDistance);
    this.group.lookAt(0, LAYOUT.eyeHeight, 0);

    const housing = new Mesh(
      new TorusGeometry(r + 0.1, 0.1, 4, 6),
      new MeshLambertMaterial({ color: PALETTE.navy, flatShading: true }),
    );
    housing.position.z = -0.06;
    this.ring = new Mesh(new TorusGeometry(r, 0.035, 4, 6), new MeshBasicMaterial({ color, toneMapped: false }));
    this.core = new Mesh(new CircleGeometry(r * 0.94, 6), new MeshBasicMaterial({ color: 0x000000, toneMapped: false }));
    this.core.position.z = -0.1;
    // Torus and circle put a vertex on +x; turn them so a flat edge is on top.
    for (const m of [housing, this.ring, this.core]) m.rotation.z = Math.PI / 6;

    this.label = new Panel(0.78, 0.27);
    this.label.mesh.position.set(0, 0, 0.02);
    this.group.add(housing, this.core, this.ring, this.label.mesh);
    this.title = title;
    this.icon = icon;
    this.setSub('');
    this.applyLook();
  }

  private title: string;
  private icon: IconName;

  /** Second line under the portal's name, e.g. the reminder time. */
  setSub(sub: string): void {
    if (sub === this.sub && this.label.mesh.material.map) return;
    this.sub = sub;
    const accent = `#${this.color.getHexString()}`;
    this.label.draw((ctx, w, h) => {
      drawFace(ctx, w, h, accent, 26, 6, '#060A16');
      ctx.font = font(92, 800);
      const tw = ctx.measureText(this.title).width;
      const icon = 84;
      const total = icon + 26 + tw;
      const scale = Math.min(1, (w - 30) / total);
      ctx.save();
      ctx.translate(w / 2, sub ? h * 0.38 : h / 2);
      ctx.scale(scale, scale);
      drawIcon(ctx, this.icon, -total / 2, -icon / 2, icon, accent);
      ctx.fillStyle = PALETTE.text;
      ctx.textBaseline = 'middle';
      ctx.fillText(this.title, -total / 2 + icon + 26, 6);
      ctx.restore();
      if (sub) {
        ctx.font = font(44, 600);
        ctx.fillStyle = PALETTE.textDim;
        ctx.textBaseline = 'middle';
        ctx.fillText(sub, (w - ctx.measureText(sub).width) / 2, h * 0.8);
      }
    });
  }

  /** World position of the capture volume's centre. */
  center(out: Vector3): Vector3 {
    return this.group.getWorldPosition(out);
  }

  setHighlighted(on: boolean): void {
    this.target = on ? 1 : 0;
  }

  /** Brief brightening when a card is captured. */
  capture(): void {
    this.pulse = 1;
  }

  update(dt: number): void {
    const before = this.highlight + this.pulse;
    this.highlight += (this.target - this.highlight) * Math.min(1, dt * 12);
    this.pulse = Math.max(0, this.pulse - dt / 0.45);
    if (Math.abs(before - (this.highlight + this.pulse)) > 0.001) this.applyLook();
  }

  private applyLook(): void {
    const level = Math.min(1, this.highlight + this.pulse);
    this.ring.material.color.copy(this.color).lerp(new Color(0xffffff), level * 0.55);
    this.ring.scale.setScalar(1 + level * 0.07);
    this.core.material.color.copy(this.color).multiplyScalar(0.07 + level * 0.25);
  }
}
