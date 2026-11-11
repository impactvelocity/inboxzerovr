/** Streaming music keeps the four-minute track out of decoded Web Audio memory. */
export class GardenMusic {
  private readonly track = new Audio(`${import.meta.env.BASE_URL}audio/kyoto-serenity-aac.m4a`);
  private active = false;
  private enabled = true;
  private volume = .5;
  private gain = 0;
  private requesting = false;
  private disposed = false;
  private state = 'Music starts in VR';

  constructor(private readonly report: (message: string) => void) {
    this.track.loop = true;
    this.track.preload = 'auto';
    this.track.volume = 0;
    this.track.addEventListener('error', this.onError);
    this.report(this.state);
  }

  private onError = () => this.status('Music could not load. Exit VR and reload to retry.');
  private status(message: string) {
    if (message === this.state) return;
    this.state = message;
    this.report(message);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.track.pause();
      this.gain = 0;
      this.track.volume = 0;
      this.status('Music off');
    } else if (this.active) {
      this.resume();
    } else {
      this.status('Music starts in VR');
    }
  }

  setVolume(volume: number) { this.volume = Math.max(0, Math.min(1, volume)); }

  setActive(active: boolean) {
    this.active = active;
    if (active) this.resume();
    else {
      this.track.pause();
      this.track.volume = 0;
      this.gain = 0;
      this.status(this.enabled ? 'Music paused — resumes in VR' : 'Music off');
    }
  }

  /** Called from VR entry and a native controller select (user activation). */
  resume = () => {
    if (this.disposed || !this.active || !this.enabled || this.requesting || !this.track.paused) return;
    this.requesting = true;
    this.status('Starting music…');
    void this.track.play().then(() => {
      // A load can finish after leaving VR or disabling the track.
      if (!this.active || !this.enabled || this.disposed) { this.track.pause(); return; }
      this.status('Music playing');
    }).catch((error: unknown) => {
      if (!this.active || !this.enabled || this.disposed) return;
      const name = error instanceof DOMException ? error.name : '';
      this.status(name === 'NotAllowedError'
        ? 'Press a controller trigger in VR to start music.'
        : 'Music could not start. Press a controller trigger to retry.');
    }).finally(() => { this.requesting = false; });
  };

  update(dt: number) {
    if (!this.active || !this.enabled || this.track.paused) return;
    // Smooth gain changes and a gentle approximately two-second entrance.
    this.gain += (this.volume-this.gain)*(1-Math.exp(-dt*2));
    if (Math.abs(this.track.volume-this.gain) > .001) this.track.volume = this.gain;
  }

  diagnostics() {
    return { active: this.active, enabled: this.enabled, paused: this.track.paused,
      time: this.track.currentTime, duration: this.track.duration, volume: this.track.volume,
      loop: this.track.loop, readyState: this.track.readyState, status: this.state };
  }

  dispose() {
    this.disposed = true;
    this.track.pause();
    this.track.removeEventListener('error', this.onError);
    this.track.removeAttribute('src');
    this.track.load();
  }
}
