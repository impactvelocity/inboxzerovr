import { Vector3, type Mesh, type Object3D } from '@iwsdk/core';

/**
 * The garden's own sound, under the music: a breeze, the cherry's leaves, rain still dripping into
 * the pond, a few birds while there is light and crickets as it goes. And the katana's swing.
 *
 * Nothing here is music. The loops and the swings are ElevenLabs sound effects, cut and levelled
 * by ../web/tools/ambience.py (which also says how to swap a take). Each loop is placed where the
 * painting has the thing that makes it, so turning the head turns the garden's sound with it.
 *
 * Like the music, the garden is heard only in VR. The swing can also be heard from the desktop
 * preview button, which is a click and so allowed to start sound.
 */

interface Layer {
  name: string;
  /** Where it comes from, in metres from the seat; null is all around. */
  at: [number, number, number] | null;
  gain: GainNode | null;
  level: number;
}

interface LoopInfo { seconds: number; lead: number }

const BASE = `${import.meta.env.BASE_URL}audio/`;
const SWINGS = 6;                   // swing1.wav (a light flick) .. swing6.wav (a long sweep)
/** Blade-tip speeds, m/s: a swing starts above START, is at full strength by FULL, and the next one waits for REARM. */
const START = 2.8, FULL = 10, REARM = 1.8;
const SWING_LEVEL = 0.9;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smoothstep = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
/** A slow wander between 0 and 1 that never quite repeats. */
const drift = (t: number, seed: number) =>
  clamp01(0.5 + 0.28 * Math.sin(t * 0.37 + seed) + 0.17 * Math.sin(t * 0.83 + seed * 2.3) + 0.11 * Math.sin(t * 1.71 + seed * 4.1));

export class GardenSounds {
  private ctx: AudioContext | null = null;
  private nature: GainNode | null = null;
  private effects: GainNode | null = null;
  private readonly layers: Layer[] = [
    { name: 'wind', at: null, gain: null, level: 0 },
    { name: 'leaves', at: [-6, 4.5, -10], gain: null, level: 0 },       // the cherry, ahead and to the left
    { name: 'water', at: [0.6, -1.4, -6.5], gain: null, level: 0 },     // the pond round the stepping stones
    { name: 'birds', at: [10, 7, -14], gain: null, level: 0 },          // past the wall, over the machiya
    { name: 'crickets', at: null, gain: null, level: 0 },
  ];
  private loops: Record<string, LoopInfo> = {};
  private readonly files = new Map<string, ArrayBuffer>();
  private readonly swings: (AudioBuffer | null)[] = Array.from({ length: SWINGS }, () => null);
  private started = new Set<string>();
  private enabled = true;
  private active = false;
  private volume = 0.7;
  private clock = 0;
  private disposed = false;
  private sleep = 0;

  // the swing: what the blade's tip has been doing
  private blade: Mesh | null = null;
  private readonly tipLocal = new Vector3();
  private readonly tip = new Vector3();
  private readonly lastTip = new Vector3();
  private tracked = false;
  private speed = 0;
  private armed = true;
  private rising = -1;
  private peak = 0;
  private wait = 0;
  private search = 0;
  private lastSwing = -1;
  private swingCount = 0;

  constructor() {
    const load = (name: string) => fetch(BASE + name)
      .then(response => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(`${name}: ${response.status}`))))
      .then(data => { this.files.set(name, data); this.decode(); })
      .catch(() => { /* a missing sound is silence, never an error on screen */ });
    fetch(`${BASE}ambience/loops.json`).then(response => (response.ok ? response.json() : {}))
      .then((loops: Record<string, LoopInfo>) => {
        this.loops = loops;
        for (const layer of this.layers) if (loops[layer.name]) void load(`ambience/${layer.name}.mp3`);
      }).catch(() => { /* no loops: the garden stays quiet */ });
    for (let i = 1; i <= SWINGS; i++) void load(`swing${i}.wav`);
  }

  setEnabled(enabled: boolean) { this.enabled = enabled; }
  setVolume(volume: number) { this.volume = clamp01(volume); }

  /** The garden is heard while a VR session is showing. */
  setActive(active: boolean) {
    this.active = active;
    // Entering or leaving VR moves the sword from one hand to another: that jump is not a swing.
    this.tracked = false; this.rising = -1; this.speed = 0; this.armed = false; this.wait = 0.4;
    if (active) this.unlock();
    else if (this.ctx) {
      // let the fade finish, then stop the audio thread until the next entry or swing
      window.clearTimeout(this.sleep);
      this.sleep = window.setTimeout(() => { if (!this.active) void this.ctx?.suspend().catch(() => undefined); }, 900);
    }
  }

  /** Call from anything the player does (VR entry, a trigger, a click): only then may sound start. */
  unlock = () => {
    if (this.disposed) return;
    window.clearTimeout(this.sleep);
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try { this.ctx = new Ctor(); } catch { return; }
      this.nature = this.ctx.createGain(); this.nature.gain.value = 0; this.nature.connect(this.ctx.destination);
      this.effects = this.ctx.createGain(); this.effects.gain.value = 1; this.effects.connect(this.ctx.destination);
      this.decode();
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
  };

  private decode() {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const [name, data] of this.files) {
      this.files.delete(name);
      const done = (buffer: AudioBuffer) => {
        if (this.disposed) return;
        const swing = /^swing(\d)\.wav$/.exec(name);
        if (swing) this.swings[Number(swing[1]) - 1] = buffer;
        else this.startLoop(name.slice('ambience/'.length, -'.mp3'.length), buffer);
      };
      const decoding: Promise<AudioBuffer> | undefined = ctx.decodeAudioData(data, done, () => undefined);
      decoding?.catch(() => undefined);
    }
  }

  private startLoop(name: string, buffer: AudioBuffer) {
    const ctx = this.ctx, layer = this.layers.find(l => l.name === name), info = this.loops[name];
    if (!ctx || !this.nature || !layer || !info || this.started.has(name)) return;
    this.started.add(name);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    // The file is one period of the sound with a little of itself either side, so that the
    // silence an MP3 decoder adds at the ends is never inside the stretch that repeats.
    source.loop = true;
    source.loopStart = info.lead / 2;
    source.loopEnd = info.lead / 2 + info.seconds;
    layer.gain = ctx.createGain();
    layer.gain.gain.value = 0;
    source.connect(layer.gain);
    if (layer.at) {
      const panner = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', rolloffFactor: 0,
        positionX: layer.at[0], positionY: 1.6 + layer.at[1], positionZ: layer.at[2] });
      layer.gain.connect(panner).connect(this.nature);
    } else layer.gain.connect(this.nature);
    // not all from the top: the loops are different lengths and should never line up
    source.start(0, info.lead / 2 + Math.random() * info.seconds);
  }

  /**
   * Every frame. `blend` is the evening (0 dusk, 1 twilight), `breeze` the Breeze control, `head`
   * the viewer's camera and `scene` where the katana is looked for.
   */
  update(dt: number, blend: number, breeze: number, head: Object3D, scene: Object3D) {
    this.clock += dt;
    this.trackBlade(dt, scene);
    const ctx = this.ctx;
    if (!ctx || !this.nature || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    // the ears
    const m = head.matrixWorld.elements, ears = ctx.listener;
    if (ears.positionX) {
      ears.positionX.value = m[12]; ears.positionY.value = m[13]; ears.positionZ.value = m[14];
      ears.forwardX.value = -m[8]; ears.forwardY.value = -m[9]; ears.forwardZ.value = -m[10];
      ears.upX.value = m[4]; ears.upY.value = m[5]; ears.upZ.value = m[6];
    } else {
      ears.setPosition(m[12], m[13], m[14]);
      ears.setOrientation(-m[8], -m[9], -m[10], m[4], m[5], m[6]);
    }
    this.nature.gain.setTargetAtTime(this.active && this.enabled ? this.volume : 0, now, this.active ? 0.9 : 0.15);
    if (this.effects) this.effects.gain.setTargetAtTime(this.enabled ? Math.min(1, this.volume / 0.7) : 0, now, 0.05);

    // The wind comes and goes on its own, and the leaves answer it a moment later.
    const t = this.clock, swell = drift(t * 0.35, 1.7), gust = drift((t - 1.2) * 0.35, 1.7);
    const air = 0.25 + 0.75 * clamp01(breeze / 0.7);
    for (const layer of this.layers) {
      if (!layer.gain) continue;
      const level =
        layer.name === 'wind' ? air * (0.55 + 0.45 * swell) :
        layer.name === 'leaves' ? air * (0.3 + 0.7 * gust * gust) :
        layer.name === 'water' ? 0.17 + 0.05 * drift(t * 0.2, 9.1) :          // barely there: a drip you notice only when you listen for it
        layer.name === 'birds' ? (1 - smoothstep(0.3, 0.75, blend)) * smoothstep(0.35, 0.6, drift(t * 0.22, 4.4)) :
        smoothstep(0.15, 0.85, blend) * 0.85;
      if (Math.abs(level - layer.level) > 0.004) { layer.level = level; layer.gain.gain.setTargetAtTime(level, now, 0.35); }
    }
  }

  /** Watch the katana's tip and give a swing its sound. */
  private trackBlade(dt: number, scene: Object3D) {
    // The sword is found by its mesh rather than handed in, so sword.ts can change freely.
    if (!this.blade || !this.blade.parent) {
      this.blade = null; this.tracked = false;
      if ((this.search -= dt) > 0) return;
      this.search = 1;
      const found = scene.getObjectByName('Curved beveled satin blade') as Mesh | undefined;
      const points = found?.geometry?.getAttribute('position');
      if (!found || !points) return;
      let top = 0;
      for (let i = 1; i < points.count; i++) if (points.getY(i) > points.getY(top)) top = i;
      this.tipLocal.set(points.getX(top), points.getY(top), points.getZ(top));
      this.blade = found;
    }
    let shown = true;
    for (let o: Object3D | null = this.blade; o; o = o.parent) if (!o.visible) { shown = false; break; }
    if (!shown || dt <= 0.001 || dt > 0.1) { this.tracked = false; this.speed = 0; this.rising = -1; return; }
    this.tip.copy(this.tipLocal).applyMatrix4(this.blade.matrixWorld);
    const moved = this.tracked ? this.tip.distanceTo(this.lastTip) : 0;
    this.lastTip.copy(this.tip);
    if (!this.tracked || moved > 0.5 || moved / dt > 30) { this.tracked = true; this.speed = 0; this.rising = -1; return; }   // a jump in tracking is not a swing
    this.speed += (moved / dt - this.speed) * (1 - Math.exp(-dt / 0.03));
    this.wait = Math.max(0, this.wait - dt);
    if (!this.armed) { if (this.speed < REARM && this.wait === 0) this.armed = true; return; }
    if (this.rising < 0) { if (this.speed > START) { this.rising = 0; this.peak = this.speed; } return; }
    // a few hundredths of a second to see how hard the swing is, then its sound
    this.rising += dt;
    const slowing = this.speed < this.peak * 0.97;
    this.peak = Math.max(this.peak, this.speed);
    if (!slowing && this.rising < 0.06) return;
    this.swing(clamp01((this.peak - START) / (FULL - START)), this.tip);
    this.armed = false; this.rising = -1; this.wait = 0.2;
  }

  /** One swing: `strength` 0 (a flick) to 1 (a full cut), heard from where the blade is. */
  swing(strength: number, at?: Vector3) {
    const ctx = this.ctx;
    this.swingCount++;
    if (!ctx || !this.effects || ctx.state !== 'running') return;
    // Light takes for light swings and the long sweeps for hard ones, with some overlap, and never
    // the same take twice running.
    let pick = -1, total = 0;
    const weight = (i: number) => (this.swings[i] && i !== this.lastSwing ? Math.exp(-(((i / (SWINGS - 1)) - strength) ** 2) / 0.09) : 0);
    for (let i = 0; i < SWINGS; i++) total += weight(i);
    if (total <= 0) return;
    for (let i = 0, roll = Math.random() * total; i < SWINGS; i++) { roll -= weight(i); if (roll <= 0) { pick = i; break; } }
    if (pick < 0) return;
    this.lastSwing = pick;
    const source = ctx.createBufferSource();
    source.buffer = this.swings[pick];
    source.playbackRate.value = 0.93 + 0.17 * strength + (Math.random() - 0.5) * 0.1;
    const gain = ctx.createGain();
    gain.gain.value = SWING_LEVEL * (0.35 + 0.65 * strength);
    source.connect(gain);
    if (at) gain.connect(new PannerNode(ctx, { panningModel: 'equalpower', distanceModel: 'inverse', rolloffFactor: 0,
      positionX: at.x, positionY: at.y, positionZ: at.z })).connect(this.effects);
    else gain.connect(this.effects);
    source.start();
  }

  diagnostics() {
    return { context: this.ctx?.state ?? 'none', active: this.active, enabled: this.enabled, volume: this.volume,
      loops: [...this.started], levels: Object.fromEntries(this.layers.map(l => [l.name, Number(l.level.toFixed(2))])),
      swingsLoaded: this.swings.filter(Boolean).length, swingsSeen: this.swingCount, lastSwing: this.lastSwing + 1,
      bladeFound: !!this.blade, tipSpeed: Number(this.speed.toFixed(2)) };
  }

  dispose() {
    this.disposed = true;
    window.clearTimeout(this.sleep);
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}
