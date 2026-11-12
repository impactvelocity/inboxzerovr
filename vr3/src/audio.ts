/**
 * Streaming music keeps the four-minute track out of decoded Web Audio memory. One player for every
 * level: setTrack() changes what it plays (each track picks up where it was left).
 */
export class GardenMusic {
  private readonly track = new Audio(`${import.meta.env.BASE_URL}audio/kyoto/music.m4a`);
  private url = 'audio/kyoto/music.m4a';
  private readonly positions = new Map<string, number>();
  private active = false;
  private enabled = true;
  private volume = .95;       // the music leads (asked for on 2026-11-11: music 85%, background 30%, game sounds 100%)
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
  /** A share of the volume to play at for now (round two's dictation softens the song: 1 is all of it). It eases there. */
  private soft = 1;
  setSoft(share: number) { this.soft = Math.max(0, Math.min(1, share)); }
  /**
   * Seconds the song waits before it starts (or starts again), then in at full volume at once: a game
   * starts its song as round one's countdown begins, not before (asked for on 2026-11-11), and a
   * round's stinger has a moment to itself.
   */
  private ducked = 0;
  duck(seconds: number) { this.ducked = Math.max(this.ducked, seconds); if (!this.track.paused) this.track.pause(); this.gain = 0; this.track.volume = 0; }
  /** Every track back to its beginning: a level starts its song from the top. */
  restart() { this.stopAnthem(); this.positions.clear(); try { this.track.currentTime = 0; } catch { /* not loaded yet: it starts at 0 anyway */ } }

  /**
   * A level's celebration (Kyoto's end anthem, 2026-11-11): the song fades out and this comes in over it,
   * once, at the song's volume. Asking again while it plays does nothing; `endCelebration()` fades it away
   * and lets the song back.
   */
  private anthem: HTMLAudioElement | null = null;
  private anthemUrl = '';
  private anthemGain = 0;
  private anthemWant = 0;
  /** It could not play (not allowed, or music is off): nothing to wait for. */
  private anthemFailed = false;
  /** How much of the song is let through: 1, or down to 0 under the anthem. */
  private songShare = 1;
  celebrate(url: string) {
    if (this.disposed || (this.anthem && this.anthemUrl === url && this.anthemWant > 0)) return;
    this.stopAnthem();
    const anthem = new Audio(`${import.meta.env.BASE_URL}${url}`);
    anthem.preload = 'auto'; anthem.loop = false; anthem.volume = 0;
    this.anthem = anthem; this.anthemUrl = url; this.anthemGain = 0; this.anthemWant = 1; this.pulseOf(url);
    this.anthemFailed = !this.enabled;
    if (this.enabled) void anthem.play().catch(() => { if (this.anthem === anthem) this.anthemFailed = true; });
  }
  endCelebration() { if (this.anthem) this.anthemWant = 0; }
  /** Is a celebration song playing (not yet over)? */
  celebrating() { return !!this.anthem && this.anthemWant > 0 && !this.anthem.ended && !this.anthemFailed && this.enabled; }
  /**
   * The beat of what is playing now, 0 to 1 (from <song>-pulse.json beside it, made by tools/pulse.py),
   * or -1 if there is none to go by. For things that pulse with the music.
   */
  private pulses = new Map<string, number[] | null>();
  private pulseOf(url: string) {
    if (!this.pulses.has(url)) {
      this.pulses.set(url, null);
      void fetch(`${import.meta.env.BASE_URL}${url.replace(/\.\w+$/, '-pulse.json')}`).then(r => (r.ok ? r.json() : null)).then((d: { pulse?: number[] } | null) => { if (d?.pulse) this.pulses.set(url, d.pulse); }).catch(() => undefined);
    }
    return this.pulses.get(url) ?? null;
  }
  pulse() {
    const anthem = this.anthem && this.anthemWant > 0 ? this.anthem : null, element = anthem ?? this.track;
    if (element.paused) return -1;
    const env = this.pulseOf(anthem ? this.anthemUrl : this.url);
    return env ? env[Math.floor(element.currentTime / 0.05)] ?? 0 : -1;
  }
  private stopAnthem() {
    if (this.anthem) { this.anthem.pause(); this.anthem.removeAttribute('src'); this.anthem.load(); }
    this.anthem = null; this.anthemUrl = ''; this.anthemGain = 0; this.anthemWant = 0; this.songShare = 1;
  }

  /** Play this track (a path under public/) from now on, from where it was last left. */
  setTrack(url: string) {
    if (url === this.url || this.disposed) return;
    this.positions.set(this.url, this.track.currentTime);
    this.track.pause(); this.gain = 0; this.track.volume = 0;
    this.url = url;
    this.track.src = `${import.meta.env.BASE_URL}${url}`;
    const at = this.positions.get(url) ?? 0;
    if (at > 0) this.track.addEventListener('loadedmetadata', () => { if (this.url === url) this.track.currentTime = at; }, { once: true });
    if (this.active) this.resume();
  }

  setActive(active: boolean) {
    this.active = active;
    if (!active) this.endCelebration();      // (back to the home screen: the anthem fades away there)
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
    if (this.disposed || !this.active || !this.enabled || this.requesting || !this.track.paused || this.ducked > 0) return;
    this.requesting = true;
    this.status('Starting music…');
    this.gain = this.volume * this.soft * this.songShare; this.track.volume = Math.max(0, Math.min(1, this.gain));
    void this.track.play().then(() => {
      // A load can finish after leaving VR or disabling the track.
      if (!this.active || !this.enabled || this.disposed) { this.track.pause(); return; }
      // in at full volume at once, no fade up (2026-11-12)
      this.gain = this.volume * this.soft * this.songShare; this.track.volume = Math.max(0, Math.min(1, this.gain));
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
    // the anthem: in over about a second and a half while the song goes out; away over about a second
    if (this.anthem) {
      const want = this.anthemWant * this.volume * (this.enabled ? 1 : 0);
      this.anthemGain += (want - this.anthemGain) * (1 - Math.exp(-dt * (want > this.anthemGain ? 2.2 : 3)));
      this.anthem.volume = Math.max(0, Math.min(1, this.anthemGain));
      this.songShare += ((this.anthemWant > 0 ? 0 : 1) - this.songShare) * (1 - Math.exp(-dt * 2.4));
      if (this.anthemWant === 0 && this.anthemGain < 0.01) this.stopAnthem();
    }
    if (this.ducked > 0) {
      // waiting to start: when the wait is over, in at full volume at once
      this.ducked = Math.max(0, this.ducked - dt);
      if (this.ducked === 0) { this.gain = this.volume * this.soft; this.track.volume = this.gain; this.resume(); }
      return;
    }
    if (!this.active || !this.enabled || this.track.paused) return;
    // Smooth gain changes and a gentle approximately two-second entrance.
    this.gain += (this.volume*this.soft*this.songShare-this.gain)*(1-Math.exp(-dt*2.5));
    if (Math.abs(this.track.volume-this.gain) > .001) this.track.volume = this.gain;
  }

  diagnostics() {
    return { active: this.active, enabled: this.enabled, paused: this.track.paused,
      track: this.url, time: this.track.currentTime, duration: this.track.duration, volume: this.track.volume,
      loop: this.track.loop, readyState: this.track.readyState, status: this.state,
      anthem: this.anthem ? { url: this.anthemUrl, volume: +this.anthem.volume.toFixed(2), paused: this.anthem.paused, time: +this.anthem.currentTime.toFixed(1) } : null, songShare: +this.songShare.toFixed(2) };
  }

  dispose() {
    this.stopAnthem();
    this.disposed = true;
    this.track.pause();
    this.track.removeEventListener('error', this.onError);
    this.track.removeAttribute('src');
    this.track.load();
  }
}
