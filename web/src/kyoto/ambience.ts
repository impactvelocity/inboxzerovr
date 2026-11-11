import * as THREE from 'three';
import { clamp01, inverseLerp, perlin, smoothstep01 } from './unitymath';

/**
 * What the courtyard sounds like (Unity: KyotoAmbience.cs): a breeze, the cherry's leaves, the
 * bamboo by the left wall, the pond, a few birds while there is light and crickets as it goes.
 * No music.
 *
 * Each sound is a loop in public/kyoto/audio/ambience, placed in the garden where the thing that
 * makes it stands, so it stays put as the head turns. The loops are ElevenLabs sound effects, cut
 * and levelled by tools/ambience.py. The courtyard drives them with the numbers it already has:
 * the wind that bends the trees sets how loud the leaves are, and the evening's fade takes the
 * birds out and brings the crickets in.
 *
 * A browser only lets sound start after the player has done something: call `unlock()` from a
 * click, a key or the start of an XR session.
 */

const BASE = `${import.meta.env.BASE_URL}kyoto/audio/ambience/`;
/** The whole soundscape's volume (Unity: KyotoAmbience.Volume). */
const Volume = 0.7;

interface Layer {
  name: string;
  /** Where it stands in the Unity scene's space (x right, z towards the gate); null is all around. */
  at: [number, number, number] | null;
  source: AudioBufferSourceNode | null;
  gain: GainNode | null;
  level: number;
}
interface LoopInfo { seconds: number; lead: number }

export class Ambience {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private readonly layers: Layer[] = [
    { name: 'wind', at: null, source: null, gain: null, level: -1 },
    { name: 'leaves', at: [-4.2, 4.6, 8.2], source: null, gain: null, level: -1 },     // the cherry's canopy
    { name: 'bamboo', at: [-5.6, 3.0, 4.4], source: null, gain: null, level: -1 },     // the stand along the left wall
    { name: 'water', at: [2.45, -0.1, 5.6], source: null, gain: null, level: -1 },     // the lily pond by the machiya
    { name: 'birds', at: [9, 7, 18], source: null, gain: null, level: -1 },            // past the back wall, to the right
    { name: 'crickets', at: null, source: null, gain: null, level: -1 },
  ];
  private loops: Record<string, LoopInfo> = {};
  private readonly pending = new Map<string, ArrayBuffer>();
  private readonly spot = new THREE.Vector3();
  quiet = false;

  /** `root` is the courtyard's root, already in place: the sounds are put in its space. */
  constructor(private readonly root: THREE.Object3D) {
    fetch(`${BASE}loops.json`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((loops: Record<string, LoopInfo>) => {
        this.loops = loops;
        for (const layer of this.layers) {
          if (!loops[layer.name]) continue;
          fetch(`${BASE}${layer.name}.mp3`)
            .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status)))))
            .then((data) => { this.pending.set(layer.name, data); this.decodePending(); })
            .catch(() => { /* not made yet: that layer is silent */ });
        }
      })
      .catch(() => { /* no loops: the courtyard is quiet */ });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend().catch(() => undefined);
      else void this.ctx.resume().catch(() => undefined);
    });
  }

  /** True once it can be heard. */
  get running(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** How loud each layer is being played, for the readout. */
  get levels(): Record<string, number> {
    return Object.fromEntries(this.layers.filter((l) => l.gain).map((l) => [l.name, Math.round(Math.max(0, l.level) * 100) / 100]));
  }

  /** Call from a user gesture (and again whenever one happens: it is cheap). */
  unlock = (): void => {
    if (this.ctx === null) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor === undefined) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.out = this.ctx.createGain();
      this.out.gain.value = 0;                  // comes in gently (see step)
      this.out.connect(this.ctx.destination);
      this.decodePending();
    }
    if (this.ctx.state !== 'running' && !document.hidden) void this.ctx.resume().catch(() => undefined);
  };

  private decodePending(): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    for (const [name, data] of this.pending) {
      this.pending.delete(name);
      const decoding: Promise<AudioBuffer> | undefined = ctx.decodeAudioData(data, (buffer) => this.start(name, buffer), () => undefined);
      decoding?.catch(() => undefined);
    }
  }

  private start(name: string, buffer: AudioBuffer): void {
    const ctx = this.ctx, layer = this.layers.find((l) => l.name === name), info = this.loops[name];
    if (!ctx || !this.out || !layer || !info || layer.source) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    // The file is one period of the sound with a little of itself either side, so that the
    // silence an MP3 decoder adds at the ends is never inside the stretch that repeats.
    source.loop = true;
    source.loopStart = info.lead / 2;
    source.loopEnd = info.lead / 2 + info.seconds;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    if (layer.at) {
      // Direction, not distance, is what tells these apart: the seat does not move.
      this.root.updateWorldMatrix(true, false);
      this.root.localToWorld(this.spot.set(layer.at[0], layer.at[1], layer.at[2]));
      const panner = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', rolloffFactor: 0,
        positionX: this.spot.x, positionY: this.spot.y, positionZ: this.spot.z });
      gain.connect(panner).connect(this.out);
    } else gain.connect(this.out);
    // Not all from the top: the loops are different lengths and should never line up.
    source.start(0, info.lead / 2 + Math.random() * info.seconds);
    layer.source = source;
    layer.gain = gain;
  }

  /**
   * Every frame. `evening` is the scene's eased fade (0 the sun up, 1 night); `swell` the wind's
   * slow rise and fall and `force` its strength as the trees feel it (0.85 still air, about 2.8 a
   * strong gust), both as the courtyard works them out; `clock` its time; `head` the viewer.
   */
  step(evening: number, swell: number, force: number, clock: number, head: THREE.Object3D): void {
    const ctx = this.ctx;
    if (!ctx || !this.out || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const m = head.matrixWorld.elements, ears = ctx.listener;
    if (ears.positionX) {
      ears.positionX.value = m[12]; ears.positionY.value = m[13]; ears.positionZ.value = m[14];
      ears.forwardX.value = -m[8]; ears.forwardY.value = -m[9]; ears.forwardZ.value = -m[10];
      ears.upX.value = m[4]; ears.upY.value = m[5]; ears.upZ.value = m[6];
    } else {
      ears.setPosition(m[12], m[13], m[14]);
      ears.setOrientation(-m[8], -m[9], -m[10], m[4], m[5], m[6]);
    }
    this.out.gain.setTargetAtTime(this.quiet ? 0 : Volume, now, this.quiet ? 0.15 : 0.8);

    const blow = clamp01((force - 0.85) / 1.9);
    // The bamboo stands upwind of the tree and is its own plant: partly the same wind, partly its own.
    const stand = 0.5 * blow + 0.5 * perlin(clock * 0.07, 21.4);
    // Birds come and go while there is light, and are gone when the scene's own birds are (0.42).
    const calling = smoothstep01(inverseLerp(0.35, 0.6, perlin(clock * 0.05, 5.5)));
    for (const layer of this.layers) {
      if (!layer.gain || !layer.source) continue;
      const level =
        layer.name === 'wind' ? 0.5 + 0.5 * swell :
        layer.name === 'leaves' ? 0.3 + 0.7 * blow :
        layer.name === 'bamboo' ? 0.3 + 0.6 * stand :
        layer.name === 'water' ? 0.17 + 0.05 * perlin(clock * 0.04, 9.1) :        // barely there: heard only when listened for
        layer.name === 'birds' ? (1 - smoothstep01(inverseLerp(0.18, 0.42, evening))) * calling :
        smoothstep01(inverseLerp(0.12, 0.5, evening)) * 0.85;
      if (Math.abs(level - layer.level) > 0.004) {
        layer.level = level;
        layer.gain.gain.setTargetAtTime(level, now, 0.4);
      }
      // A breath of pitch on the two wind sounds, so a loop coming round is never quite the same.
      if (layer.name === 'wind') layer.source.playbackRate.setTargetAtTime(0.97 + 0.06 * perlin(clock * 0.03, 14.2), now, 0.5);
      else if (layer.name === 'leaves') layer.source.playbackRate.setTargetAtTime(0.97 + 0.07 * blow, now, 0.5);
    }
  }
}
