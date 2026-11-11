import { Vector3, type Object3D, type WebGLRenderer, type XRTargetRaySpace } from 'three';

export class ButtonState {
  value = 0;
  pressed = false;
  /** True only on the frame the button went down / came up. */
  down = false;
  up = false;

  update(value: number): void {
    this.value = value;
    // Hysteresis so a half-squeezed trigger does not chatter.
    const next = this.pressed ? value > 0.35 : value > 0.6;
    this.down = next && !this.pressed;
    this.up = !next && this.pressed;
    this.pressed = next;
  }

  /** Forget any held state without firing an edge (pause, focus loss). */
  clear(): void {
    this.value = 0;
    this.pressed = this.down = this.up = false;
  }
}

/** One tracked controller: where it is, where it points, and its buttons. */
export class HandInput {
  /** Target-ray space: -z is the pointing direction. */
  readonly space: XRTargetRaySpace;
  handedness: 'left' | 'right' | 'none' = 'none';
  connected = false;
  readonly trigger = new ButtonState();
  readonly grip = new ButtonState();
  readonly stickClick = new ButtonState();
  stickX = 0;
  stickY = 0;
  readonly origin = new Vector3();
  readonly dir = new Vector3(0, 0, -1);
  /** Smoothed world-space velocity in m/s. */
  readonly velocity = new Vector3();
  private source: XRInputSource | null = null;
  private last = new Vector3();
  private hasLast = false;

  constructor(space: XRTargetRaySpace) {
    this.space = space;
    space.addEventListener('connected', (e) => {
      const src = e.data;
      this.source = src;
      this.handedness = src.handedness === 'left' || src.handedness === 'right' ? src.handedness : 'none';
      this.connected = !!src.gamepad;
      this.hasLast = false;
    });
    space.addEventListener('disconnected', () => {
      this.source = null;
      this.connected = false;
      this.clearButtons();
    });
  }

  clearButtons(): void {
    this.trigger.clear();
    this.grip.clear();
    this.stickClick.clear();
    this.stickX = this.stickY = 0;
    this.hasLast = false;
    this.velocity.set(0, 0, 0);
  }

  update(dt: number): void {
    if (!this.connected || !this.source?.gamepad) return;
    const gp = this.source.gamepad;
    // xr-standard mapping: 0 trigger, 1 squeeze, 3 thumbstick click; axes 2/3 thumbstick.
    this.trigger.update(gp.buttons[0]?.value ?? 0);
    this.grip.update(gp.buttons[1]?.value ?? 0);
    this.stickClick.update(gp.buttons[3]?.pressed ? 1 : 0);
    this.stickX = gp.axes[2] ?? 0;
    this.stickY = gp.axes[3] ?? 0;

    this.space.getWorldPosition(this.origin);
    this.space.getWorldDirection(this.dir).negate();
    if (this.hasLast && dt > 0) {
      const k = Math.min(1, dt * 18);
      this.velocity.lerp(this.last.sub(this.origin).multiplyScalar(-1 / dt), k);
    }
    this.last.copy(this.origin);
    this.hasLast = true;
  }

  /** Haptic pulse if the controller supports it; silent otherwise. */
  pulse(intensity: number, ms: number): void {
    try {
      const gp = this.source?.gamepad as (Gamepad & { hapticActuators?: { pulse?: (i: number, d: number) => unknown }[] }) | undefined;
      const act = gp?.hapticActuators?.[0];
      if (act?.pulse) void act.pulse(intensity, ms);
      else void gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity });
    } catch {
      /* haptics are optional */
    }
  }
}

/** Both controllers, addressed by role so handedness swaps as a complete pair. */
export class XRInput {
  readonly hands: HandInput[];

  constructor(renderer: WebGLRenderer, parent: Object3D) {
    this.hands = [0, 1].map((i) => {
      const space = renderer.xr.getController(i);
      parent.add(space);
      return new HandInput(space);
    });
  }

  byHandedness(side: 'left' | 'right'): HandInput | null {
    return this.hands.find((h) => h.connected && h.handedness === side) ?? null;
  }

  update(dt: number): void {
    for (const h of this.hands) h.update(dt);
  }

  clear(): void {
    for (const h of this.hands) h.clearButtons();
  }
}
