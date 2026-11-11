import { CanvasTexture, Color, Group, Mesh, MeshBasicMaterial, Quaternion, ShapeGeometry, Vector3 } from 'three';
import { LAYOUT, PALETTE, TIMING } from '../config';
import type { Message } from '../domain/types';
import { chamferPath, clampLines, drawIcon, fitText, font, measureCtx, wrapText, type Ctx } from './text';
import { Panel, chamferGeometry } from './ui3d';

export type CardMode = 'hidden' | 'arriving' | 'idle' | 'locked' | 'held' | 'returning';

const BORDER = 0.008;
const PAD = 46;
const SUBJECT = { size: 41, line: 51, max: 3 };
const PREVIEW = { size: 30, line: 42, max: 4 };

interface CardLayout {
  height: number;
  subject: string[];
  preview: string[];
  attachments: string;
}

function layout(ctx: Ctx, msg: Message, w: number): CardLayout {
  const inner = w - PAD * 2;
  ctx.font = font(SUBJECT.size, 700);
  const subject = clampLines(ctx, wrapText(ctx, msg.subject || '(no subject)', inner), SUBJECT.max, inner);
  ctx.font = font(PREVIEW.size, 400);
  const preview = msg.preview.trim() ? clampLines(ctx, wrapText(ctx, msg.preview, inner), PREVIEW.max, inner) : [];
  const n = msg.attachmentMetadata.length;
  const attachments = n
    ? `${n} attachment${n === 1 ? '' : 's'}: ${msg.attachmentMetadata.map((a) => a.name).join(', ')}`
    : '';
  const height =
    PAD + 44 + 22 + subject.length * SUBJECT.line + 34 + Math.max(1, preview.length) * PREVIEW.line + (n ? 50 : 0) + PAD - 12;
  return { height, subject, preview, attachments };
}

function drawCard(ctx: Ctx, w: number, h: number, msg: Message, time: string, l: CardLayout): void {
  ctx.clearRect(0, 0, w, h);
  chamferPath(ctx, 0, 0, w, h, 20);
  ctx.fillStyle = PALETTE.cardFace;
  ctx.fill();

  let y = PAD;
  drawIcon(ctx, 'mail', PAD, y, 40, PALETTE.css.coral);
  ctx.textBaseline = 'middle';
  ctx.font = font(27, 500);
  ctx.fillStyle = PALETTE.textDim;
  const timeW = ctx.measureText(time).width;
  ctx.fillText(time, w - PAD - timeW, y + 22);
  ctx.font = font(33, 600);
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(fitText(ctx, msg.senderName, w - PAD * 2 - 60 - timeW - 24), PAD + 58, y + 22);
  y += 44 + 22;

  ctx.font = font(SUBJECT.size, 700);
  ctx.textBaseline = 'alphabetic';
  for (const line of l.subject) {
    ctx.fillText(line, PAD, y + SUBJECT.size);
    y += SUBJECT.line;
  }
  y += 12;
  ctx.fillStyle = 'rgba(182,193,216,0.28)';
  ctx.fillRect(PAD, y, w - PAD * 2, 2);
  y += 22;

  if (l.preview.length) {
    ctx.font = font(PREVIEW.size, 400);
    ctx.fillStyle = '#D9E1F2';
    for (const line of l.preview) {
      ctx.fillText(line, PAD, y + PREVIEW.size);
      y += PREVIEW.line;
    }
  } else {
    ctx.font = font(PREVIEW.size, 400, true);
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText('No preview text', PAD, y + PREVIEW.size);
    y += PREVIEW.line;
  }
  if (l.attachments) {
    y += 12;
    drawIcon(ctx, 'clip', PAD, y, 30, PALETTE.textDim);
    ctx.font = font(25, 500);
    ctx.fillStyle = PALETTE.textDim;
    ctx.textBaseline = 'middle';
    ctx.fillText(fitText(ctx, l.attachments, w - PAD * 2 - 42), PAD + 42, y + 16);
  }
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * The one email in front of the player. It is a child of the arena root, so
 * all poses here are in arena space. State lives in the session controller;
 * this class only shows a message and animates between poses.
 */
export class EmailCard {
  readonly group = new Group();
  readonly home = new Vector3(0, LAYOUT.cardCenterY, -LAYOUT.cardDistance);
  readonly homeQuat = new Quaternion();
  width = LAYOUT.cardWidth;
  height = 0.4;
  mode: CardMode = 'hidden';
  messageId: string | null = null;

  private face: Panel;
  private frame: Mesh<ShapeGeometry, MeshBasicMaterial>;
  private tint = new Color(PALETTE.coral);
  private t = 0;
  private from = { pos: new Vector3(), quat: new Quaternion(), scale: 1 };

  constructor() {
    // Tilt the face slightly up toward the seated eye.
    const drop = LAYOUT.eyeHeight - LAYOUT.cardCenterY;
    this.homeQuat.setFromAxisAngle(new Vector3(1, 0, 0), -Math.atan2(drop, LAYOUT.cardDistance));
    this.frame = new Mesh(chamferGeometry(1, 1, 0.02), new MeshBasicMaterial({ color: this.tint, toneMapped: false }));
    this.face = new Panel(this.width - BORDER * 2, this.height);
    this.face.mesh.position.z = 0.003;
    this.group.add(this.frame, this.face.mesh);
    this.group.visible = false;
  }

  get hasVisual(): boolean {
    return this.face.mesh.material.map !== null;
  }

  /** Show a message and bring the card in from just behind its resting place. */
  show(msg: Message, timeLabel: string): void {
    const wMm = (this.width - BORDER * 2) * 1000;
    const l = layout(measureCtx(), msg, wMm);
    const faceH = Math.min(0.66, l.height / 1000);
    this.height = faceH + BORDER * 2;
    this.face.draw((ctx, w, h) => drawCard(ctx, w, h, msg, timeLabel, l), this.width - BORDER * 2, faceH);
    this.frame.geometry.dispose();
    this.frame.geometry = chamferGeometry(this.width, this.height, 0.024);
    this.messageId = msg.id;
    this.setTint(PALETTE.coral);
    this.group.visible = true;
    this.group.position.copy(this.home).add(new Vector3(0, -0.04, -0.45));
    this.group.quaternion.copy(this.homeQuat);
    this.group.scale.setScalar(0.82);
    this.startTween('arriving');
  }

  hide(): void {
    this.mode = 'hidden';
    this.group.visible = false;
    this.messageId = null;
  }

  setTint(color: number): void {
    this.tint.set(color);
    this.frame.material.color.copy(this.tint);
  }

  /** Give the card's texture to an exit effect and hide the card. */
  takeVisual(): { texture: CanvasTexture; width: number; height: number; pos: Vector3; quat: Quaternion; scale: number; tint: Color } | null {
    const texture = this.face.takeTexture();
    if (!texture) return null;
    const out = {
      texture,
      width: this.face.width,
      height: this.face.height,
      pos: this.group.position.clone(),
      quat: this.group.quaternion.clone(),
      scale: this.group.scale.x,
      tint: this.tint.clone(),
    };
    this.group.visible = false;
    this.mode = 'locked';
    return out;
  }

  /** While held: ease toward a pose supplied each frame. */
  follow(pos: Vector3, quat: Quaternion, scale: number, dt: number): void {
    const k = Math.min(1, dt * 14);
    this.group.position.lerp(pos, k);
    this.group.quaternion.slerp(quat, k);
    this.group.scale.setScalar(this.group.scale.x + (scale - this.group.scale.x) * k);
  }

  /** Glide back to the resting place. Used for a missed throw or a cancelled grab. */
  returnHome(): void {
    if (!this.group.visible) return;
    this.setTint(PALETTE.coral);
    this.startTween('returning');
  }

  private startTween(mode: 'arriving' | 'returning'): void {
    this.mode = mode;
    this.t = 0;
    this.from.pos.copy(this.group.position);
    this.from.quat.copy(this.group.quaternion);
    this.from.scale = this.group.scale.x;
  }

  update(dt: number): void {
    if (this.mode !== 'arriving' && this.mode !== 'returning') return;
    const dur = this.mode === 'arriving' ? TIMING.cardArrive : TIMING.cardReturn;
    this.t = Math.min(1, this.t + dt / dur);
    const e = easeOut(this.t);
    this.group.position.lerpVectors(this.from.pos, this.home, e);
    this.group.quaternion.slerpQuaternions(this.from.quat, this.homeQuat, e);
    this.group.scale.setScalar(this.from.scale + (1 - this.from.scale) * e);
    if (this.t >= 1) this.mode = 'idle';
  }
}
