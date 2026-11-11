/**
 * All sound is synthesised with Web Audio: no audio files, nothing licensed.
 * The context is created on the first user gesture, so nothing plays before
 * the player has pressed a button.
 */
export class AudioFeedback {
  soundOn = true;
  musicOn = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private hum: { osc: OscillatorNode; gain: GainNode } | null = null;
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private progress = 0;
  private duck = 1;

  /** Call from a click/select handler. Safe to call repeatedly. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.7;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0;
        this.musicGain.connect(this.master);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, len);
        const data = this.noise.getChannelData(0);
        let seed = 1;
        for (let i = 0; i < len; i++) {
          seed = (seed * 16807) % 2147483647;
          data[i] = (seed / 2147483647) * 2 - 1;
        }
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      this.syncMusic();
    } catch {
      this.ctx = null;
    }
  }

  setSound(on: boolean): void {
    this.soundOn = on;
    if (!on) this.grab(false);
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    this.syncMusic();
  }

  /** 0..1 share of the batch triaged; adds layers to the loop. */
  setProgress(p: number): void {
    this.progress = Math.max(0, Math.min(1, p));
  }

  /** 1 = normal, lower while reading or reviewing. */
  setDuck(level: number): void {
    this.duck = level;
    this.applyMusicGain(0.6);
  }

  /** Silence everything while the headset is off or the app is hidden. */
  suspend(on: boolean): void {
    if (!this.ctx) return;
    if (on) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  // ---- one-shots -----------------------------------------------------------

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, endFreq?: number, delay = 0): void {
    if (!this.ctx || !this.master || !this.soundOn) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private burst(dur: number, gain: number, from: number, to: number, q = 1.2): void {
    if (!this.ctx || !this.master || !this.noise || !this.soundOn) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, 0, dur + 0.05);
  }

  /** Soft whoosh while the armed blade moves quickly. */
  swing(speed: number): void {
    this.burst(0.22, Math.min(0.16, 0.04 + speed * 0.02), 500, 1900);
  }

  /** Crisp slice: a short bright noise tick plus a falling synth blip. */
  slice(): void {
    this.burst(0.11, 0.3, 5200, 1800, 0.8);
    this.tone(1320, 0.16, 'triangle', 0.16, 520);
  }

  /** Magnetic hum while a card is held. */
  grab(on: boolean): void {
    if (!this.ctx || !this.master) return;
    if (on && this.soundOn && !this.hum) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 92;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 420;
      gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.07, this.ctx.currentTime + 0.08);
      osc.connect(f).connect(gain).connect(this.master);
      osc.start();
      this.hum = { osc, gain };
      this.tone(240, 0.12, 'sine', 0.12, 360);
    } else if (!on && this.hum) {
      const { osc, gain } = this.hum;
      this.hum = null;
      const t = this.ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setTargetAtTime(0.0001, t, 0.04);
      osc.stop(t + 0.25);
    }
  }

  /** Two-note chime when a portal captures a card. */
  chime(kind: 'keep' | 'tomorrow'): void {
    const [a, b] = kind === 'keep' ? [659.25, 987.77] : [587.33, 783.99];
    this.tone(a, 0.3, 'sine', 0.16);
    this.tone(b, 0.42, 'sine', 0.14, undefined, 0.09);
  }

  /** Gentle rewind for undo. */
  undo(): void {
    this.tone(880, 0.26, 'triangle', 0.13, 330);
    this.burst(0.24, 0.05, 2400, 500);
  }

  click(): void {
    this.tone(520, 0.06, 'triangle', 0.1, 700);
  }

  /** A soft, neutral note when something is not accepted. Deliberately not a buzzer. */
  nudge(): void {
    this.tone(300, 0.14, 'sine', 0.08, 260);
  }

  /** Small rising figure for the end of the session. */
  finish(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.11, undefined, i * 0.12));
  }

  // ---- music ---------------------------------------------------------------

  private applyMusicGain(seconds: number): void {
    if (!this.ctx || !this.musicGain) return;
    const target = this.musicOn ? 0.5 * this.duck : 0;
    this.musicGain.gain.setTargetAtTime(Math.max(0.0001, target), this.ctx.currentTime, seconds / 3);
  }

  private syncMusic(): void {
    if (!this.ctx) return;
    this.applyMusicGain(1.2);
    if (this.musicOn && this.timer === null) {
      this.nextTime = this.ctx.currentTime + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 60);
    } else if (!this.musicOn && this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private note(freq: number, t: number, dur: number, type: OscillatorType, gain: number, cutoff: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f).connect(g).connect(this.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A restrained 16-step loop at 104 bpm. Layers join as the batch is cleared. */
  private schedule(): void {
    if (!this.ctx) return;
    const stepDur = 60 / 104 / 4;
    const roots = [110, 110, 87.31, 98]; // A, A, F, G: one bar each
    const arp = [0, 7, 12, 15, 12, 7, 19, 12];
    while (this.nextTime < this.ctx.currentTime + 0.2) {
      const s = this.step % 16;
      const root = roots[Math.floor(this.step / 16) % roots.length];
      const t = this.nextTime;
      if (s % 4 === 0) this.note(root / 2, t, 0.34, 'sine', 0.5, 300);
      if (s % 8 === 6) this.note(root, t, 0.18, 'triangle', 0.12, 700);
      if (this.progress > 0.2 && s % 2 === 0) {
        this.note(root * 2 * Math.pow(2, arp[(s / 2) % arp.length] / 12), t, 0.16, 'triangle', 0.07, 2200);
      }
      if (this.progress > 0.55 && s % 4 === 2) this.note(root * 4, t, 0.05, 'square', 0.02, 5000);
      if (this.progress > 0.8 && s === 0) this.note(root * 3, t, stepDur * 14, 'sawtooth', 0.035, 900);
      this.nextTime += stepDur;
      this.step++;
    }
  }
}
