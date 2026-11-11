import { Vector2 } from 'three';
import type { SessionController } from '../app/SessionController';
import type { GameView } from '../render/GameView';

/** Shortcuts shown in the desktop overlay. Each sends the same command as its VR gesture. */
export const SHORTCUTS: [string, string][] = [
  ['A', 'Archive'],
  ['K', 'Keep'],
  ['T', 'Tomorrow'],
  ['R', 'Read'],
  ['Z', 'Undo'],
  ['M', 'Menu'],
  ['Esc', 'Close / back'],
];

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/**
 * Mouse and keyboard for development and demos. The mouse presses the same
 * world-space buttons the controllers do; keys dispatch the same commands.
 */
export class DesktopControls {
  /** False while the launch screen covers the scene. */
  enabled = false;
  private down: { ndc: Vector2; time: number; x: number; y: number } | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private controller: SessionController,
    private view: GameView,
  ) {
    canvas.addEventListener('pointermove', (e) => this.view.pointerMove(this.ndc(e)));
    canvas.addEventListener('pointerleave', () => this.view.pointerMove(null));
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 0) this.down = { ndc: this.ndc(e), time: performance.now(), x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerup', (e) => {
      const start = this.down;
      this.down = null;
      if (!start || !this.enabled) return;
      const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      const ms = performance.now() - start.time;
      // A short, quick drag is a slash; anything else is a click.
      if (dist > 90 && ms < 700) this.view.pointerSlash(start.ndc, this.ndc(e));
      else if (dist < 8) {
        this.view.pointerMove(this.ndc(e));
        this.view.pointerClick();
      }
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (this.enabled && this.controller.ui.reading) this.view.reading.turn(e.deltaY > 0 ? 1 : -1);
      },
      { passive: true },
    );
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  private ndc(e: PointerEvent): Vector2 {
    const r = this.canvas.getBoundingClientRect();
    return new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.enabled || this.view.inVR) return;
    if (e.key === 'Escape' && isTyping(e.target)) {
      (e.target as HTMLElement).blur();
      return;
    }
    // Shortcuts are off while typing so a reply can contain the letter A.
    if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const c = this.controller;
    const ui = c.ui;
    switch (e.key.toLowerCase()) {
      case 'a':
        return this.view.dispatch({ type: 'archive' });
      case 'k':
        return this.view.dispatch({ type: 'keep' });
      case 't':
        return this.view.dispatch({ type: 'defer' });
      case 'r':
        return this.view.dispatch(ui.reading ? { type: 'closeRead' } : { type: 'read' });
      case 'z':
        return this.view.dispatch({ type: 'undo' });
      case 'm':
        return this.view.dispatch({ type: 'setMenu', open: !ui.menuOpen });
      case 'escape':
        if (ui.menuOpen) return this.view.dispatch({ type: 'setMenu', open: false });
        if (ui.reading) return this.view.dispatch({ type: 'closeRead' });
        if (c.phase === 'review') return this.view.dispatch({ type: 'reviewBack' });
        return;
      case 'arrowright':
      case 'arrowdown':
      case 'pagedown':
        if (ui.reading) this.view.reading.turn(1);
        return;
      case 'arrowleft':
      case 'arrowup':
      case 'pageup':
        if (ui.reading) this.view.reading.turn(-1);
        return;
    }
  }
}
