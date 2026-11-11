import * as THREE from 'three';
import { flipPoint, type GameContext } from '../api';
import * as CardArt from './cardArt';
import { makeSurface, type Painter, type Surface } from './painter';

/**
 * A monitor's input: the keys from the README table, and the mouse, which clicks the home
 * screen (Unity: InboxGame.Update, Keys). Also the line of key hints along the bottom.
 */

/** What a key does, by the name Unity's InboxGame.Key takes. */
const Keys: Record<string, string> = {
  Space: 'Space', Enter: 'Space', NumpadEnter: 'Space', KeyD: 'Space',
  ArrowLeft: 'A', KeyA: 'A',
  Digit1: '1', Numpad1: '1',
  Digit2: '2', Numpad2: '2',
  KeyM: 'M',
  ArrowUp: 'W', KeyW: 'W',
};

export interface DesktopHandlers {
  /** A game key: 'Space', 'A', '1', '2', 'M' or 'W'. */
  key(name: string): void;
  /** The mouse pressed along this ray, in Unity space. */
  click(origin: THREE.Vector3, direction: THREE.Vector3): void;
  /** The player did something: sound may start now. */
  gesture(): void;
}

const _near = new THREE.Vector3();
const _eye = new THREE.Vector3();

export class DesktopInput {
  private readonly dispose: (() => void)[] = [];

  constructor(ctx: GameContext, handlers: DesktopHandlers) {
    const listen = <K extends keyof WindowEventMap>(type: K, fn: (event: WindowEventMap[K]) => void, options?: AddEventListenerOptions) => {
      window.addEventListener(type, fn, options);
      this.dispose.push(() => window.removeEventListener(type, fn, options));
    };

    listen('keydown', (event) => {
      handlers.gesture();
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const name = Keys[event.code];
      if (name === undefined) return;
      event.preventDefault(); // Space and the arrows would scroll the page
      handlers.key(name);
    });

    // A focused button would take Space or Enter for itself when the key comes back up.
    listen('keyup', (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (Keys[event.code] !== undefined && !event.ctrlKey && !event.metaKey && !event.altKey) event.preventDefault();
    });

    // Any press anywhere counts as the gesture a browser wants before it plays sound.
    listen('pointerdown', () => handlers.gesture(), { capture: true });
    listen('touchend', () => handlers.gesture(), { capture: true });
    listen('click', () => handlers.gesture(), { capture: true });

    const canvas = ctx.renderer.domElement;
    const press = (event: PointerEvent) => {
      if (event.button !== 0 || ctx.inXR()) return;
      const box = canvas.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return;
      const x = ((event.clientX - box.left) / box.width) * 2 - 1;
      const y = -((event.clientY - box.top) / box.height) * 2 + 1;
      ctx.camera.updateWorldMatrix(true, false);
      _near.set(x, y, 0.5).unproject(ctx.camera);
      _eye.setFromMatrixPosition(ctx.camera.matrixWorld);
      const direction = _near.sub(_eye).normalize();
      // Out of three's world and into Unity space: a direction flips like a point.
      handlers.click(flipPoint(_eye, new THREE.Vector3()), flipPoint(direction, new THREE.Vector3()));
    };
    canvas.addEventListener('pointerdown', press);
    this.dispose.push(() => canvas.removeEventListener('pointerdown', press));
  }

  destroy(): void {
    for (const undo of this.dispose) undo();
    this.dispose.length = 0;
  }
}

/**
 * Keyboard hints along the bottom of the picture. Not shown in a headset.
 *
 * Unity hangs this label half a metre in front of the head. Here the same drawing is a canvas
 * laid over the page, in the same place and at the same size in the picture, so it stays sharp
 * and out of the way of the scene's effects.
 */
export class HintBar {
  /** Unity: the label is 0.62 m wide, 1400 x 72 pixels. */
  private static readonly Width = 0.62;
  private static readonly PxW = 1400;
  private static readonly PxH = 72;
  private readonly surface: Surface;
  private shown = false;
  private last = '';

  constructor(private readonly ctx: GameContext, private readonly painter: Painter) {
    this.surface = makeSurface(HintBar.PxW, HintBar.PxH, { scale: 2, texture: false });
    const style = this.surface.canvas.style;
    style.position = 'fixed';
    style.pointerEvents = 'none';
    style.userSelect = 'none';
    style.zIndex = '5';
    style.display = 'none';
    this.surface.canvas.setAttribute('aria-hidden', 'true');
    this.surface.canvas.dataset.inboxZero = 'key-hints';
    (ctx.renderer.domElement.parentElement ?? document.body).appendChild(this.surface.canvas);
  }

  draw(keys: readonly (readonly [string, string])[]): void {
    CardArt.hints(this.painter, this.surface, keys);
  }

  show(on: boolean): void {
    if (on === this.shown) return;
    this.shown = on;
    this.surface.canvas.style.display = on ? 'block' : 'none';
    this.last = '';
  }

  /**
   * Keep it where Unity's sits: centred, 5% of the picture's height above the bottom edge, as
   * wide in the picture as 0.62 m is at half a metre (narrower in a narrow window).
   */
  layout(): void {
    if (!this.shown) return;
    const canvas = this.ctx.renderer.domElement;
    const camera = this.ctx.camera;
    const key = `${canvas.clientWidth}x${canvas.clientHeight}:${camera.fov}:${camera.aspect}`;
    if (key === this.last) return;
    this.last = key;
    const box = canvas.getBoundingClientRect();
    const halfHeight = Math.tan((camera.fov * Math.PI) / 360) * 0.5;
    const viewWidth = halfHeight * 2 * camera.aspect;
    const scale = Math.min(1, viewWidth / (Math.tan((35 * Math.PI) / 180) * 1.6));
    const width = ((HintBar.Width * scale) / viewWidth) * box.width;
    const height = (width * HintBar.PxH) / HintBar.PxW;
    const style = this.surface.canvas.style;
    style.width = `${width}px`;
    style.height = `${height}px`;
    style.left = `${box.left + (box.width - width) / 2}px`;
    style.top = `${box.top + box.height * 0.95 - height / 2}px`;
  }

  destroy(): void {
    this.surface.canvas.remove();
  }
}
