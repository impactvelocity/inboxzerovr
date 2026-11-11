/**
 * Sound for the level (Unity: Sfx.cs). Bare hands have no haptics, which makes these the main
 * "it hit" feedback.
 *
 * The sounds (slash1, slash2, wrong, sort, arrive, blip, done) are files; the ping that climbs
 * with a combo is synthesised here. Any file that is missing, or has not loaded yet, falls back
 * to a synthesised sound, built sample by sample exactly as Unity builds it.
 *
 * Not here: music and the saber's hum. The Kyoto level has neither. Its katana has swing sounds
 * instead: swing1 (a light flick) to swing6 (a long sweep), ElevenLabs sound effects cut by
 * tools/ambience.py. A missing one is simply not played.
 *
 * A browser only lets sound start after the player has done something: call `unlock()` from a
 * click, a key or the start of an XR session. Until then every sound is silently skipped.
 */

const Rate = 44100;
const Master = 0.5;
const Files = ['slash1', 'slash2', 'wrong', 'sort', 'arrive', 'blip', 'done',
  'swing1', 'swing2', 'swing3', 'swing4', 'swing5', 'swing6'] as const;
/**
 * Blade-tip speeds, m/s: a swing starts above SwingStart, is at full strength by SwingFull, and
 * the next one waits until the blade is slower than SwingRearm.
 */
const SwingStart = 2.8, SwingFull = 9, SwingRearm = 1.8;
const Swings = 6;

type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth';
type Filter = 'lowpass' | 'highpass' | 'bandpass';

const climb = (combo: number): number => Math.pow(2, Math.min(combo, 12) / 12);
const between = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private readonly files = new Map<string, AudioBuffer>();
  private readonly clips = new Map<string, AudioBuffer>();
  private readonly pending = new Map<string, ArrayBuffer>();
  private mix: number[] = [];
  private swingArmed = true;
  private swingRise = -1;
  private swingPeak = 0;
  private swingWait = 0;
  private lastSwing = -1;

  /** `audioUrl` gives the address of a clip by name (ctx.assets.audioUrl). */
  constructor(audioUrl: (name: string) => string) {
    // Fetch now; decode once there is an audio context to decode with.
    for (const name of Files) {
      let url: string;
      try {
        url = audioUrl(name);
      } catch {
        continue;
      }
      fetch(url)
        .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status)))))
        .then((data) => {
          this.pending.set(name, data);
          this.decodePending();
        })
        .catch(() => {
          /* missing: the synthesised sound is used */
        });
    }
  }

  /** True once sound can be heard. */
  get running(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Call from a user gesture (and again whenever one happens: it is cheap). */
  unlock(): void {
    if (this.ctx === null) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor === undefined) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.out = this.ctx.createGain();
      this.out.gain.value = 1;
      this.out.connect(this.ctx.destination);
      this.decodePending();
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
  }

  private decodePending(): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    for (const [name, data] of this.pending) {
      this.pending.delete(name);
      // The callback form works everywhere, including older WebKit; where a promise comes back
      // as well, a failed decode must not surface as an unhandled rejection.
      const decoding: Promise<AudioBuffer> | undefined = ctx.decodeAudioData(data, (buffer) => this.files.set(name, buffer), () => undefined);
      decoding?.catch(() => undefined);
    }
  }

  private start(buffer: AudioBuffer, pitch: number, volume: number): void {
    if (this.muted || this.ctx === null || this.out === null || this.ctx.state !== 'running') return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = pitch;
    if (volume === 1) source.connect(this.out);
    else {
      const gain = this.ctx.createGain();
      gain.gain.value = volume;
      source.connect(gain).connect(this.out);
    }
    source.start();
  }

  /** Play a sound file at a pitch. False if there is no such file (yet). */
  private playFile(name: string, pitch = 1, volume = 1): boolean {
    const clip = this.files.get(name);
    if (clip === undefined) return false;
    this.start(clip, pitch, volume);
    return true;
  }

  // ------------------------------------------------------------ synthesis

  private tone(wave: Wave, from: number, to: number, seconds: number, gain: number, delay = 0): void {
    const mix = this.mix;
    const end = Math.max(20, to);
    const start = Math.floor(delay * Rate);
    const count = Math.floor(seconds * Rate);
    while (mix.length < start + count) mix.push(0);
    let phase = 0;
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const hz = from * Math.pow(end / from, t);
      phase += hz / Rate;
      const p = phase - Math.floor(phase);
      const s =
        wave === 'sine' ? Math.sin(p * 2 * Math.PI) :
        wave === 'triangle' ? 1 - 4 * Math.abs(p - 0.5) :
        wave === 'square' ? (p < 0.5 ? 1 : -1) :
        2 * p - 1;
      mix[start + i] += s * gain * Math.pow(0.001 / gain, t);
    }
  }

  /** Filtered noise whose filter sweeps from one frequency to another. */
  private burst(filter: Filter, from: number, to: number, seconds: number, gain: number): void {
    const mix = this.mix;
    const count = Math.floor(seconds * Rate);
    while (mix.length < count) mix.push(0);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
    for (let i = 0; i < count; i++) {
      const t = i / count;
      if (i % 16 === 0) {
        const w = (2 * Math.PI * Math.min(from * Math.pow(to / from, t), Rate * 0.45)) / Rate;
        const cos = Math.cos(w);
        const alpha = Math.sin(w) / 2; // Q = 1
        const a0 = 1 + alpha;
        if (filter === 'lowpass') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
        else if (filter === 'highpass') { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
        else { b0 = alpha; b1 = 0; b2 = -alpha; }
        b0 /= a0; b1 /= a0; b2 /= a0; a1 = (-2 * cos) / a0; a2 = (1 - alpha) / a0;
      }
      const x = Math.random() * 2 - 1;
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      mix[i] += y * gain * Math.pow(0.001 / gain, t);
    }
  }

  private play(key: string, build: () => void): void {
    const ctx = this.ctx;
    if (this.muted || ctx === null || ctx.state !== 'running') return;
    let clip = this.clips.get(key);
    if (clip === undefined) {
      this.mix = [];
      build();
      const length = Math.max(1, this.mix.length);
      clip = ctx.createBuffer(1, length, Rate);
      const data = clip.getChannelData(0);
      for (let i = 0; i < this.mix.length; i++) data[i] = Math.min(1, Math.max(-1, this.mix[i] * Master));
      this.mix = [];
      this.clips.set(key, clip);
    }
    this.start(clip, 1, 1);
  }

  /** A little ping that climbs the scale as a combo grows. */
  private ping(combo: number): void {
    this.play(`ping${Math.min(combo, 12)}`, () => this.tone('triangle', 520 * climb(combo), 1040, 0.12, 0.2));
  }

  // --------------------------------------------------------------- sounds

  /** Blade through an email. Two takes, picked at random, so it never repeats exactly. */
  slash(combo: number): void {
    const take = Math.random() < 0.5 ? 'slash1' : 'slash2';
    const pitch = between(0.94, 1.06) + Math.min(combo, 12) * 0.012;
    if (this.playFile(take, pitch)) this.ping(combo);
    else {
      this.play(`slash${Math.min(combo, 12)}`, () => {
        this.burst('bandpass', 5200, 900, 0.16, 0.9);
        this.tone('triangle', 520 * climb(combo), 1040, 0.12, 0.25);
      });
    }
  }

  /**
   * The katana through the air. Call every frame with the blade tip's speed; each swing gets one
   * whoosh, picked to suit how hard it is (light takes for a flick, the long sweeps for a full
   * cut) and never the same take twice running.
   */
  swing(on: boolean, speed: number, dt: number): void {
    this.swingWait = Math.max(0, this.swingWait - dt);
    if (!on) { this.swingRise = -1; return; }
    if (!this.swingArmed) { if (speed < SwingRearm && this.swingWait <= 0) this.swingArmed = true; return; }
    if (this.swingRise < 0) { if (speed > SwingStart) { this.swingRise = 0; this.swingPeak = speed; } return; }
    // a few hundredths of a second to see how hard the swing is, then its sound
    this.swingRise += dt;
    const slowing = speed < this.swingPeak * 0.97;
    this.swingPeak = Math.max(this.swingPeak, speed);
    if (!slowing && this.swingRise < 0.06) return;
    const strength = Math.min(1, Math.max(0, (this.swingPeak - SwingStart) / (SwingFull - SwingStart)));
    this.swingArmed = false; this.swingRise = -1; this.swingWait = 0.2;

    const weight = (i: number): number =>
      i === this.lastSwing || !this.files.has(`swing${i + 1}`) ? 0 : Math.exp(-(((i / (Swings - 1)) - strength) ** 2) / 0.09);
    let total = 0;
    for (let i = 0; i < Swings; i++) total += weight(i);
    if (total <= 0) return;
    let roll = Math.random() * total, pick = -1;
    for (let i = 0; i < Swings && pick < 0; i++) { roll -= weight(i); if (roll <= 0) pick = i; }
    if (pick < 0) return;
    this.lastSwing = pick;
    this.playFile(`swing${pick + 1}`, 0.93 + 0.17 * strength + between(-0.05, 0.05), 0.3 + 0.5 * strength);
  }

  /** A card sent on its way: kept, replied to, or left for tomorrow. */
  sort(combo: number): void {
    if (this.playFile('sort', between(0.97, 1.05), 0.8)) {
      this.ping(combo);
      return;
    }
    this.play(`sort${Math.min(combo, 12)}`, () => {
      const b = 440 * climb(combo);
      this.tone('sine', b, b * 1.5, 0.12, 0.3);
      this.tone('sine', b * 1.5, b * 2, 0.14, 0.25, 0.08);
    });
  }

  wrong(): void {
    if (this.playFile('wrong')) return;
    this.play('wrong', () => {
      this.tone('sawtooth', 180, 90, 0.32, 0.35);
      this.tone('square', 120, 70, 0.32, 0.2);
    });
  }

  arrive(): void {
    if (this.playFile('arrive', between(0.94, 1.08), 0.55)) return;
    this.play('arrive', () => this.burst('highpass', 1800, 4200, 0.07, 0.12));
  }

  /** An email left alone, rushing past. */
  pass(): void {
    if (this.playFile('arrive', 0.68, 0.5)) return;
    this.play('pass', () => this.burst('highpass', 3200, 900, 0.18, 0.14));
  }

  /** A small console beep: taking hold of a card, pressing a button. */
  blip(pitch = 1): void {
    if (this.playFile('blip', pitch, 0.6)) return;
    this.play('blip', () => this.tone('sine', 300, 380, 0.06, 0.18));
  }

  /** The inbox is clear. */
  done(): void {
    if (this.playFile('done')) return;
    this.play('fanfare', () => {
      const notes = [523, 659, 784, 1047];
      for (let i = 0; i < notes.length; i++) this.tone('triangle', notes[i], notes[i], 0.3, 0.3, i * 0.11);
      this.tone('sine', 1047, 2094, 0.7, 0.2, 0.44);
    });
  }
}
