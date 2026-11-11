/**
 * Synthesised sound effects, so the prototype ships no audio files. Bare hands
 * have no haptics, which makes these the main "it hit" feedback.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** Browsers only allow audio after a user gesture; call this from one. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const length = Math.floor(this.ctx.sampleRate * 0.5);
      this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(
    type: OscillatorType,
    from: number,
    to: number,
    seconds: number,
    gain: number,
    delay = 0,
  ): void {
    if (!this.ctx || !this.master || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + seconds);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(amp).connect(this.master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  private burst(
    filter: BiquadFilterType,
    from: number,
    to: number,
    seconds: number,
    gain: number,
  ): void {
    if (!this.ctx || !this.master || !this.noise) return;
    if (this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const biquad = this.ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.setValueAtTime(from, t);
    biquad.frequency.exponentialRampToValueAtTime(to, t + seconds);
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    src.connect(biquad).connect(amp).connect(this.master);
    src.start(t);
    src.stop(t + seconds + 0.02);
  }

  /** Sword through paper. The ping climbs with the combo. */
  slash(combo: number): void {
    this.burst('bandpass', 5200, 900, 0.16, 0.9);
    this.tone('triangle', 520 * 2 ** (Math.min(combo, 12) / 12), 1040, 0.12, 0.25);
  }

  /** Hammer through paper. */
  smash(combo: number): void {
    this.tone('sine', 150, 42, 0.28, 0.9);
    this.burst('lowpass', 2400, 200, 0.22, 0.8);
    this.tone('triangle', 392 * 2 ** (Math.min(combo, 12) / 12), 784, 0.1, 0.2);
  }

  /** A card landing in a bin. */
  sort(combo: number): void {
    const base = 440 * 2 ** (Math.min(combo, 12) / 12);
    this.tone('sine', base, base * 1.5, 0.12, 0.3);
    this.tone('sine', base * 1.5, base * 2, 0.14, 0.25, 0.08);
  }

  wrong(): void {
    this.tone('sawtooth', 180, 90, 0.32, 0.35);
    this.tone('square', 120, 70, 0.32, 0.2);
  }

  arrive(): void {
    this.burst('highpass', 1800, 4200, 0.07, 0.12);
  }

  grab(): void {
    this.tone('sine', 300, 380, 0.06, 0.18);
  }

  swap(): void {
    this.tone('square', 660, 880, 0.07, 0.12);
  }

  fanfare(): void {
    const notes = [523, 659, 784, 1047];
    notes.forEach((hz, i) => this.tone('triangle', hz, hz, 0.3, 0.3, i * 0.11));
    this.tone('sine', 1047, 2094, 0.7, 0.2, 0.44);
  }
}
