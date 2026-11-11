import {
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Raycaster,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import { PALETTE } from '../config';
import { chamferPath, drawIcon, fitText, font, makeCanvas, toTexture, type Ctx, type IconName } from './text';

const UNIT_PLANE = new PlaneGeometry(1, 1);

export type DrawFn = (ctx: Ctx, w: number, h: number) => void;

/** Chamfered rectangle outline as flat geometry, centred on the origin. Sizes in metres. */
export function chamferGeometry(w: number, h: number, c: number): ShapeGeometry {
  const x = -w / 2;
  const y = -h / 2;
  const s = new Shape();
  s.moveTo(x + c, y);
  s.lineTo(x + w - c, y);
  s.lineTo(x + w, y + c);
  s.lineTo(x + w, y + h - c);
  s.lineTo(x + w - c, y + h);
  s.lineTo(x + c, y + h);
  s.lineTo(x, y + h - c);
  s.lineTo(x, y + c);
  s.closePath();
  return new ShapeGeometry(s);
}

/** Fill the whole canvas with a bordered, chamfered dark face. Sizes in mm. */
export function drawFace(ctx: Ctx, w: number, h: number, border: string, chamfer = 16, borderWidth = 5, fill: string = PALETTE.cardFace): void {
  ctx.clearRect(0, 0, w, h);
  chamferPath(ctx, 0, 0, w, h, chamfer);
  ctx.fillStyle = border;
  ctx.fill();
  chamferPath(ctx, borderWidth, borderWidth, w - borderWidth * 2, h - borderWidth * 2, chamfer - borderWidth * 0.4);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** A flat quad showing a canvas drawn in millimetres. Redraw only when its content changes. */
export class Panel {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  width: number;
  height: number;
  private texture: CanvasTexture | null = null;

  constructor(width: number, height: number, draw?: DrawFn) {
    this.width = width;
    this.height = height;
    const material = new MeshBasicMaterial({ color: 0xffffff, alphaTest: 0.5, toneMapped: false });
    this.mesh = new Mesh(UNIT_PLANE, material);
    this.mesh.scale.set(width, height, 1);
    if (draw) this.draw(draw);
  }

  draw(fn: DrawFn, width = this.width, height = this.height): void {
    this.width = width;
    this.height = height;
    const { canvas, ctx, w, h } = makeCanvas(width, height);
    fn(ctx, w, h);
    this.texture?.dispose();
    this.texture = toTexture(canvas);
    this.mesh.material.map = this.texture;
    this.mesh.material.needsUpdate = true;
    this.mesh.scale.set(width, height, 1);
  }

  /** Hand the current texture to someone else (an exit effect). The panel no longer disposes it. */
  takeTexture(): CanvasTexture | null {
    const t = this.texture;
    this.texture = null;
    this.mesh.material.map = null;
    return t;
  }

  dispose(): void {
    this.texture?.dispose();
    this.mesh.material.dispose();
  }
}

export interface ButtonOptions {
  width: number;
  height: number;
  label: string;
  sub?: string;
  icon?: IconName;
  color?: number;
  fontMm?: number;
  onPress: () => void;
}

const WHITE = new Color(0xffffff);

/** A world-space button: coloured frame, dark face, icon and words. Never colour alone. */
export class Button3D {
  readonly group = new Group();
  readonly face: Panel;
  enabled = true;
  hovered = false;
  onPress: () => void;
  private frame: Mesh<ShapeGeometry, MeshBasicMaterial>;
  private color: Color;
  private opts: ButtonOptions;
  private active = false;

  constructor(opts: ButtonOptions) {
    this.opts = { ...opts };
    this.onPress = opts.onPress;
    this.color = new Color(opts.color ?? PALETTE.cyan);
    this.frame = new Mesh(
      chamferGeometry(opts.width, opts.height, Math.min(0.014, opts.height * 0.2)),
      new MeshBasicMaterial({ color: this.color, toneMapped: false }),
    );
    this.face = new Panel(opts.width - 0.008, opts.height - 0.008);
    this.face.mesh.position.z = 0.002;
    this.face.mesh.userData.button = this;
    this.group.add(this.frame, this.face.mesh);
    this.redraw();
  }

  setLabel(label: string, sub?: string): void {
    if (label === this.opts.label && sub === this.opts.sub) return;
    this.opts.label = label;
    this.opts.sub = sub;
    this.redraw();
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) this.hovered = false;
    this.redraw();
    this.applyLook();
  }

  /** Persistent highlight, e.g. the selected option of a toggle. */
  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.redraw();
  }

  setHover(hovered: boolean): void {
    if (hovered === this.hovered) return;
    this.hovered = hovered && this.enabled;
    this.applyLook();
  }

  private applyLook(): void {
    this.frame.material.color.copy(this.hovered ? WHITE : this.color);
    if (!this.enabled) this.frame.material.color.multiplyScalar(0.3);
    this.group.scale.setScalar(this.hovered ? 1.06 : 1);
  }

  private redraw(): void {
    const { label, sub, icon } = this.opts;
    const accent = `#${this.color.getHexString()}`;
    this.face.draw((ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      chamferPath(ctx, 0, 0, w, h, Math.min(11, h * 0.18));
      ctx.fillStyle = this.active ? '#12314A' : '#0B1226';
      ctx.fill();
      ctx.globalAlpha = this.enabled ? 1 : 0.35;
      let size = this.opts.fontMm ?? Math.min(26, h * (sub ? 0.3 : 0.36));
      const subSize = size * 0.7;
      const iconSize = icon ? Math.min(h * 0.46, size * 1.25) : 0;
      const gap = icon ? iconSize * 0.4 : 0;
      const maxText = w - iconSize - gap - 16;
      // Shrink a little before resorting to an ellipsis.
      const floor = size * 0.72;
      ctx.font = font(size, 700);
      while (size > floor && ctx.measureText(label).width > maxText) ctx.font = font(--size, 700);
      const text = fitText(ctx, label, maxText);
      const textW = ctx.measureText(text).width;
      const total = iconSize + gap + textW;
      const x0 = (w - total) / 2;
      const midY = sub ? h * 0.37 : h / 2;
      if (icon) drawIcon(ctx, icon, x0, midY - iconSize / 2, iconSize, accent);
      ctx.fillStyle = PALETTE.text;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x0 + iconSize + gap, midY + size * 0.04);
      if (sub) {
        ctx.font = font(subSize, 500);
        ctx.fillStyle = PALETTE.textDim;
        const s = fitText(ctx, sub, w - 14);
        ctx.fillText(s, (w - ctx.measureText(s).width) / 2, h * 0.76);
      }
      ctx.globalAlpha = 1;
    });
  }
}

/** True when the object and all its ancestors are visible. */
export function isShown(obj: Object3D | null): boolean {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}

export interface UiHit {
  button: Button3D;
  distance: number;
  point: Vector3;
}

/** Finds the button under a ray and tracks hover per pointer, for controllers and the mouse alike. */
export class UIManager {
  private buttons: Button3D[] = [];
  private raycaster = new Raycaster();
  private hovers = new Map<string, Button3D | null>();
  /** Called when a pointer starts hovering a new button. */
  onHover: (pointerId: string, button: Button3D) => void = () => {};

  add<T extends Button3D>(button: T): T {
    this.buttons.push(button);
    return button;
  }

  hit(origin: Vector3, direction: Vector3, maxDistance = 6): UiHit | null {
    const targets: Object3D[] = [];
    for (const b of this.buttons) if (b.enabled && isShown(b.face.mesh)) targets.push(b.face.mesh);
    if (targets.length === 0) return null;
    this.raycaster.set(origin, direction);
    this.raycaster.far = maxDistance;
    const hits = this.raycaster.intersectObjects(targets, false);
    if (hits.length === 0) return null;
    return { button: hits[0].object.userData.button as Button3D, distance: hits[0].distance, point: hits[0].point };
  }

  /** Update one pointer's ray (or null to clear it). Returns what it is hovering. */
  point(pointerId: string, origin: Vector3 | null, direction?: Vector3): UiHit | null {
    const hit = origin && direction ? this.hit(origin, direction) : null;
    const before = this.hovers.get(pointerId) ?? null;
    const now = hit?.button ?? null;
    if (before !== now) {
      this.hovers.set(pointerId, now);
      if (before && ![...this.hovers.values()].includes(before)) before.setHover(false);
      if (now) {
        now.setHover(true);
        this.onHover(pointerId, now);
      }
    }
    return hit;
  }

  /** Press whatever this pointer is hovering. Returns true if a button took the press. */
  press(pointerId: string): boolean {
    const b = this.hovers.get(pointerId);
    if (!b || !b.enabled || !isShown(b.face.mesh)) return false;
    b.onPress();
    return true;
  }

  hovering(pointerId: string): Button3D | null {
    return this.hovers.get(pointerId) ?? null;
  }
}
