import type { Object3D, Vector3 } from '@iwsdk/core';
import type { BladeTracker } from './blade';
import type { LevelSound } from './levels/types';

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
/** A level other than Kyoto: its loops, its own takes of the letters' sounds, its hum, and when it next makes one of its now-and-then sounds. */
interface LevelSet {
  def: LevelSound; loops: Record<string, LoopInfo>; layers: Layer[]; started: Set<string>;
  hum: { source: AudioBufferSourceNode; gain: GainNode } | null; humLoop: LoopInfo | null; next: number[];
  /** Whether the hum was on last frame (for its `off` sound). */
  humOn: boolean;
}

/**
 * Which take of a level's held-trigger sound to use, if the level has several (set.json's `variants`,
 * written by tools/flameoptions.py): ?flame=<x> in the address, kept for next time; else the last one
 * picked (public/flame.html sets it); else the original. "0" is the original.
 */
export function humVariant(level: string): string {
  const fallback = HUM_DEFAULT[level] ?? '0', key = `vr3.hum.${level}${level in HUM_DEFAULT ? '.v2' : ''}`;      // (a new key where the default changed, so an older pick does not hide it)
  try {
    const asked = new URLSearchParams(location.search).get('flame');
    if (asked) localStorage.setItem(key, asked);
    return localStorage.getItem(key) ?? fallback;
  } catch { return fallback; }
}
/** A level whose held-trigger sound is one of its options unless another is picked: the lab's sprayer is Foamy (2026-11-13: "use D ..foam sound for spray - and make .loud"). */
const HUM_DEFAULT: Record<string, string> = { lab: 'd' };

const BASE = `${import.meta.env.BASE_URL}audio/`;
const SWINGS = 6;                   // swing1.wav (a light flick) .. swing6.wav (a long sweep)
/** The letters' own sounds (letters.ts), from the Unity game: one arriving, cut, kept, taken hold of. */
// ('sort', the Unity game's chime, is no longer loaded: the user disliked it, 2026-11-11, "remove it from everywhere")
const SHOTS = ['arrive', 'slash1', 'slash2', 'blip', 'arm', 'swoosh1', 'swoosh2', 'swoosh3', 'throw', 'round2', 'count5', 'fight', 'reply'];      // count5: the user's five-second countdown (2026-11-12)      // throw: the user's own, for a letter thrown away (2026-11-11)      // swoosh: a letter thrown to keep it (tools/swooshes.py)        // 'arm': the sword made ready (tools/swordsounds.py)
/** Blade-tip speeds, m/s: a swing starts above START, is at full strength by FULL, and the next one waits for REARM. */
const START = 2.8, FULL = 10, REARM = 1.8;
const SWING_LEVEL = 0.9;
/** The samurai's yells on hard swings in Kyoto (kiai()): off. */
const KIAI = false;
/** How loud the live blade's hum is at full swing: it is meant to be felt more than heard. */
const HUM_LEVEL = 0;      // (Kyoto's live-blade hum, a whirr that rose with the swing: silenced at the user's asking, 2026-11-11; it was 0.55)

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smoothstep = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
/** A slow wander between 0 and 1 that never quite repeats. */
const drift = (t: number, seed: number) =>
  clamp01(0.5 + 0.28 * Math.sin(t * 0.37 + seed) + 0.17 * Math.sin(t * 0.83 + seed * 2.3) + 0.11 * Math.sin(t * 1.71 + seed * 4.1));

/** While the end song plays: the level's background at this share of its volume, and the game's sounds at this. */
const END_BACKGROUND = 0.25, END_EFFECTS = 0.45;

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
  private readonly shots = new Map<string, AudioBuffer>();
  /** The live blade's hum: a loop that is always running once loaded, and silent unless the blade is live. */
  private hum: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private humLoop: LoopInfo | null = null;
  private started = new Set<string>();
  /** Which level is being played ('kyoto' is the garden above), the other levels' sounds as they are asked for, and how hot the lab is. */
  private level = 'kyoto';
  private readonly sets = new Map<string, LevelSet>();
  private readonly levelShots = new Map<string, AudioBuffer>();
  private hot = 0;
  private enabled = true;
  private active = false;
  /** How loud the background is (loops and now-and-then sounds), and the game's own sounds (cuts, swings, the hum). */
  private volume = 0.3;
  private effectsVolume = 1;
  private clock = 0;
  private disposed = false;
  private sleep = 0;

  // the swing: what the blade's tip has been doing
  private speed = 0;
  private armed = true;
  private rising = -1;
  private peak = 0;
  private wait = 0;
  private lastSwing = -1;
  private swingCount = 0;
  /** Told of each swing as its sound starts: how hard (0 a flick, 1 a full cut) and where the tip is. */
  onSwing: ((strength: number, tip: Vector3) => void) | null = null;

  /** Fetch a sound; `as` is the name it is known by once loaded (a variant standing in for the usual file). */
  private load = (name: string, as = name) => fetch(BASE + name)
    .then(response => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(`${name}: ${response.status}`))))
    .then(data => { this.files.set(as, data); this.decode(); })
    .catch(() => { /* a missing sound is silence, never an error on screen */ });

  /**
   * Change level. null is Kyoto's garden; any other brings its own loops, shots and hum from
   * public/audio/<id> (fetched the first time it is asked for) and the garden falls silent.
   */
  setLevel(def: LevelSound | null) {
    this.level = def?.id ?? 'kyoto';
    this.hot = 0;
    if (!def || this.sets.has(def.id)) return;
    const set: LevelSet = { def, loops: {}, layers: def.layers.map(l => ({ name: l.name, at: l.at, gain: null, level: 0 })), started: new Set(), hum: null, humLoop: null, humOn: false,
      next: (def.occasional ?? []).map(o => 6 + Math.random() * o.every[0]) };
    this.sets.set(def.id, set);
    fetch(`${BASE}${def.id}/set.json`).then(response => (response.ok ? response.json() : Promise.reject(new Error('no set'))))
      .then((info: { loops: Record<string, LoopInfo>; shots: string[]; hum: LoopInfo | null; variants?: Record<string, LoopInfo> }) => {
        set.loops = info.loops; set.humLoop = info.hum;
        // another take of the held-trigger sound: its own loop, ignition (arm) and cut-off (off)
        const pick = humVariant(def.id), variant = info.variants?.[pick] ? pick : null;
        if (variant) set.humLoop = info.variants![variant];
        for (const layer of set.layers) if (info.loops[layer.name]) void this.load(`${def.id}/${layer.name}.mp3`);
        for (const shot of info.shots) if (!(variant && shot === 'arm')) void this.load(`${def.id}/${shot}.wav`);
        if (variant) for (const shot of ['arm', 'off']) void this.load(`${def.id}/${shot}-${variant}.wav`, `${def.id}/${shot}.wav`);
        if (set.humLoop && def.hum) void this.load(variant ? `${def.id}/hum-${variant}.mp3` : `${def.id}/hum.mp3`, `${def.id}/hum.mp3`);
      }).catch(() => { /* no sounds for this level: it is silent */ });
  }
  /** Where the level's cut note is on its scale (an index), and which way it went last. */
  private noteAt = 1;
  private noteWay = 1;
  /**
   * A cut has landed: the level's note, if it has one (LevelSound.cutNote), at the next note of its
   * scale. It wanders: usually a step, sometimes two, more often on in the way it was going than
   * back, turning at the ends, and never the same note twice running, so a run of cuts is a tune.
   */
  note(at?: Vector3) {
    const def = this.sets.get(this.level)?.def.cutNote;
    if (!def || def.scale.length < 2) return;
    const top = def.scale.length - 1;
    if (Math.random() < 0.3) this.noteWay = -this.noteWay;
    let next = this.noteAt + this.noteWay * (Math.random() < 0.7 ? 1 : 2);
    if (next < 0 || next > top) { this.noteWay = -this.noteWay; next = this.noteAt + this.noteWay; }
    this.noteAt = Math.max(0, Math.min(top, next));
    this.play(def.name, Math.pow(2, def.scale[this.noteAt] / 12), def.volume, at);
  }
  /** Told when a stinger starts, with its length in seconds, so the music can dip under it. */
  onStinger: ((seconds: number) => void) | null = null;
  /** When the samurai last called out, and which call it was. */
  private lastKiai = -9;
  private lastCall = '';
  /**
   * A swing has been made with the live blade (strength 0 a flick, 1 a full cut). In Kyoto the
   * samurai sometimes yells with it (asked for on 2026-11-11: "samurai yells when swinging"; the
   * grunts there were for a while were taken out at the user's asking): on swings of some force,
   * never twice within a second, never the same yell twice running, and not on every swing.
   */
  kiai(strength: number) {
    // (switched off at the user's asking, 2026-11-11: "remove the grunt sounds". Set KIAI true to bring the yells back.)
    if (!KIAI) return;
    if (this.level !== 'kyoto' || strength < 0.3 || this.clock - this.lastKiai < 1.1) return;
    if (Math.random() > 0.25 + 0.6 * strength) return;
    let call = '';
    for (let tries = 0; tries < 4 && (!call || call === this.lastCall); tries++) call = `yell${1 + Math.floor(Math.random() * 4)}`;
    this.lastKiai = this.clock; this.lastCall = call;
    this.play(call, 0.95 + Math.random() * 0.1, 0.75);      // from the player's own head: no direction
  }
  /** Which round the game was in, and whether it was playing, last frame: for LevelSound.afterRound. */
  private lastRound = 0;
  private lastPhase = '';
  /**
   * Every frame, the game's progress (letters.ts). When a round has just ended (the next one's intro
   * has begun) the level's sounds for that moment play.
   */
  watchRound(progress: { readonly phase: string; readonly round: number }) {
    const ended = progress.phase === 'intro' && progress.round === this.lastRound + 1 && this.lastPhase === 'play';
    const began = progress.phase === 'intro' && (this.lastPhase !== 'intro' || this.lastRound !== progress.round);
    this.lastRound = progress.round; this.lastPhase = progress.phase;
    // As round two's intro begins, in every level: a voice announcing it (the user's, 2026-11-12, round2.wav), over
    // the song at full volume (2026-11-12: "keep the same volume to keep the energy"; the song stopped under the voice
    // before). (Kyoto had a short stinger for each round here before: kyoto/stinger1 and 2, unused now.)
    if (began && progress.round === 2 && this.shots.has('round2')) this.play('round2', 1, 1);
    if (!ended) return;
    const moment = this.sets.get(this.level)?.def.afterRound?.find(m => m.round === progress.round - 1);
    for (const s of moment?.sounds ?? []) {
      const at = s.at ? ({ x: s.at[0], y: 1.6 + s.at[1], z: s.at[2] } as Vector3) : undefined;
      window.setTimeout(() => { if (!this.disposed) this.play(s.name, 1, s.volume, at); }, s.delay * 1000);
    }
  }
  /** The lab: how much radioactive mail is in front of the player (0 to 1). Its Geiger counter listens. */
  setHot(level: number) { this.hot = level; }

  constructor() {
    const load = this.load;
    fetch(`${BASE}ambience/loops.json`).then(response => (response.ok ? response.json() : {}))
      .then((loops: Record<string, LoopInfo>) => {
        this.loops = loops;
        for (const layer of this.layers) if (loops[layer.name]) void load(`ambience/${layer.name}.mp3`);
      }).catch(() => { /* no loops: the garden stays quiet */ });
    for (let i = 1; i <= SWINGS; i++) void load(`swing${i}.wav`);
    for (const name of SHOTS) void load(`${name}.wav`);
    // Kyoto's own cuts, and the samurai's yells and grunts (tools/kyotosounds.py)
    for (const name of ['slash1', 'slash2', 'slash3', 'slash4', 'slash5', 'yell1', 'yell2', 'yell3', 'yell4', 'arm1', 'arm2', 'arm3', 'arm4', 'stinger1', 'stinger2']) void load(`kyoto/${name}.wav`);
    fetch(`${BASE}hum.json`).then(response => (response.ok ? response.json() : Promise.reject(new Error('no hum'))))
      .then((loop: LoopInfo) => { this.humLoop = loop; void load('hum.mp3'); }).catch(() => { /* no hum: the live blade is silent */ });
  }

  setEnabled(enabled: boolean) { this.enabled = enabled; }
  setVolume(volume: number) { this.volume = clamp01(volume); }
  setEffectsVolume(volume: number) { this.effectsVolume = clamp01(volume); }
  /**
   * The end of a game, while its end song plays: the level's background and the game's sounds step back, so the song
   * is the main thing (2026-11-12). 1 is all the way back: background to END_BACKGROUND, game sounds to END_EFFECTS.
   */
  private endSoft = 0;
  setEndSoft(amount: number) { this.endSoft = clamp01(amount); }

  /** The garden is heard while a VR session is showing. */
  setActive(active: boolean) {
    this.active = active;
    // Entering or leaving VR moves the sword from one hand to another: that jump is not a swing.
    this.rising = -1; this.speed = 0; this.armed = false; this.wait = 0.4;
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
        const [folder, file] = name.split('/'), set = file ? this.sets.get(folder) : undefined;
        if (set) {
          // one of a level's own
          if (file.endsWith('.wav')) this.levelShots.set(`${folder}/${file.slice(0, -4)}`, buffer);
          else if (file === 'hum.mp3') this.startLevelHum(set, buffer);
          else this.startLevelLoop(set, file.slice(0, -4), buffer);
          return;
        }
        const swing = /^swing(\d)\.wav$/.exec(name);
        if (swing) this.swings[Number(swing[1]) - 1] = buffer;
        else if (name.endsWith('.wav')) this.shots.set(name.slice(0, -'.wav'.length), buffer);
        else if (name === 'hum.mp3') this.startHum(buffer);
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

  private startLevelLoop(set: LevelSet, name: string, buffer: AudioBuffer) {
    const ctx = this.ctx, layer = set.layers.find(l => l.name === name), info = set.loops[name];
    if (!ctx || !this.nature || !layer || !info || set.started.has(name)) return;
    set.started.add(name);
    const source = ctx.createBufferSource();
    source.buffer = buffer; source.loop = true;
    source.loopStart = info.lead / 2; source.loopEnd = info.lead / 2 + info.seconds;
    layer.gain = ctx.createGain(); layer.gain.gain.value = 0;
    source.connect(layer.gain);
    if (layer.at) layer.gain.connect(new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', rolloffFactor: 0,
      positionX: layer.at[0], positionY: 1.6 + layer.at[1], positionZ: layer.at[2] })).connect(this.nature);
    else layer.gain.connect(this.nature);
    source.start(0, info.lead / 2 + Math.random() * info.seconds);
  }
  private startLevelHum(set: LevelSet, buffer: AudioBuffer) {
    const ctx = this.ctx, loop = set.humLoop;
    if (!ctx || !this.effects || !loop || set.hum) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer; source.loop = true;
    source.loopStart = loop.lead / 2; source.loopEnd = loop.lead / 2 + loop.seconds;
    const gain = ctx.createGain(); gain.gain.value = 0;
    source.connect(gain).connect(this.effects);
    source.start(0, loop.lead / 2);
    set.hum = { source, gain };
  }

  /**
   * Every frame. `blend` is the evening (0 dusk, 1 twilight), `breeze` the Breeze control, `head`
   * the viewer's camera and `blade` the katana as blade.ts follows it.
   */
  update(dt: number, blend: number, breeze: number, head: Object3D, blade: BladeTracker) {
    this.clock += dt;
    this.trackBlade(dt, blade);
    const ctx = this.ctx;
    if (!ctx || !this.nature || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    // the ears
    const m = head.matrixWorld.elements, ears = ctx.listener;
    // A camera with no size yet (a canvas not laid out, a headset's first frame) has no position.
    // Web Audio throws on that, and a throw here would stop everything after it in the frame.
    const placed = [4, 5, 6, 8, 9, 10, 12, 13, 14].every(i => Number.isFinite(m[i]));
    if (!placed) { /* leave the ears where they were */ }
    else if (ears.positionX) {
      ears.positionX.value = m[12]; ears.positionY.value = m[13]; ears.positionZ.value = m[14];
      ears.forwardX.value = -m[8]; ears.forwardY.value = -m[9]; ears.forwardZ.value = -m[10];
      ears.upX.value = m[4]; ears.upY.value = m[5]; ears.upZ.value = m[6];
    } else {
      ears.setPosition(m[12], m[13], m[14]);
      ears.setOrientation(-m[8], -m[9], -m[10], m[4], m[5], m[6]);
    }
    const backSoft = 1 - (1 - END_BACKGROUND) * this.endSoft, gameSoft = 1 - (1 - END_EFFECTS) * this.endSoft;
    this.nature.gain.setTargetAtTime(this.active && this.enabled ? this.volume * backSoft : 0, now, this.active ? (this.endSoft > 0 ? 0.6 : 0.9) : 0.15);
    if (this.effects) this.effects.gain.setTargetAtTime(this.enabled ? this.effectsVolume * gameSoft : 0, now, this.endSoft > 0 ? 0.4 : 0.05);

    // The wind comes and goes on its own, and the leaves answer it a moment later.
    const t = this.clock, swell = drift(t * 0.35, 1.7), gust = drift((t - 1.2) * 0.35, 1.7);
    const air = 0.25 + 0.75 * clamp01(breeze / 0.7);
    const garden = this.level === 'kyoto';
    for (const layer of this.layers) {
      if (!layer.gain) continue;
      const level = !garden ? 0 :
        layer.name === 'wind' ? air * (0.55 + 0.45 * swell) :
        layer.name === 'leaves' ? air * (0.3 + 0.7 * gust * gust) :
        layer.name === 'water' ? 0.17 + 0.05 * drift(t * 0.2, 9.1) :          // barely there: a drip you notice only when you listen for it
        layer.name === 'birds' ? (1 - smoothstep(0.3, 0.75, blend)) * smoothstep(0.35, 0.6, drift(t * 0.22, 4.4)) :
        smoothstep(0.15, 0.85, blend) * 0.85;
      if (Math.abs(level - layer.level) > 0.004) { layer.level = level; layer.gain.gain.setTargetAtTime(level, now, 0.35); }
    }
    // The other levels: the one being played is heard, each loop as loud as the level says; and now
    // and then, from somewhere in the room, one of its occasional sounds.
    const c = { t, blend, hot: this.hot, drift };
    for (const [id, set] of this.sets) {
      const on = id === this.level;
      set.layers.forEach((layer, i) => {
        if (!layer.gain) return;
        const level = on ? clamp01(set.def.layers[i].level(c)) : 0;
        if (Math.abs(level - layer.level) > 0.004) { layer.level = level; layer.gain.gain.setTargetAtTime(level, now, 0.35); }
      });
      if (!on || !this.active || !this.enabled) continue;
      (set.def.occasional ?? []).forEach((o, i) => {
        if ((set.next[i] -= dt) > 0) return;
        set.next[i] = o.every[0] + Math.random() * (o.every[1] - o.every[0]);
        const r = o.region, at = { x: r[0] + Math.random() * (r[1] - r[0]), y: 1.6 + r[2] + Math.random() * (r[3] - r[2]), z: r[4] + Math.random() * (r[5] - r[4]) };
        this.play(o.name, 0.96 + Math.random() * 0.08, o.volume * this.volume / 0.7, at as Vector3);      // (background: as loud as the loops are, against the 0.7 they were set at)
      });
    }
  }

  private startHum(buffer: AudioBuffer) {
    const ctx = this.ctx, loop = this.humLoop;
    if (!ctx || !this.effects || !loop || this.hum) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer; source.loop = true;
    source.loopStart = loop.lead / 2; source.loopEnd = loop.lead / 2 + loop.seconds;
    const gain = ctx.createGain(); gain.gain.value = 0;
    source.connect(gain).connect(this.effects);
    source.start(0, loop.lead / 2);
    this.hum = { source, gain };
  }

  /**
   * The blade is live (`live` 1) or not (0): its hum, quiet while the blade is still and rising in
   * pitch and loudness as it is swung (`speed`, the tip's, m/s). Every frame.
   */
  live(live: number, speed: number) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const swing = clamp01(speed / 7), garden = this.level === 'kyoto';
    if (this.hum) {
      this.hum.gain.gain.setTargetAtTime(garden ? live * HUM_LEVEL * (0.45 + 0.55 * swing) : 0, ctx.currentTime, live > 0 ? 0.05 : 0.12);
      this.hum.source.playbackRate.setTargetAtTime(1 + 0.45 * swing, ctx.currentTime, 0.06);
    }
    // each level's own: a blade's rises with the swing, a spray's is simply on
    for (const [id, set] of this.sets) {
      const hum = set.hum, how = set.def.hum;
      if (!hum || !how) continue;
      const on = id === this.level ? live : 0;
      // (setTargetAtTime's time constant is a third of the time to come most of the way)
      const sweep = (how.sweep ?? 0) * swing;
      hum.gain.gain.setTargetAtTime(on * how.level * (how.swing ? 0.45 + 0.55 * swing : 1) * (1 + 0.4 * sweep), ctx.currentTime, on > 0 ? (how.fadeIn ?? 0.12) / 3 : (how.fadeOut ?? 0.3) / 3);
      if (how.swing) hum.source.playbackRate.setTargetAtTime(1 + 0.45 * swing, ctx.currentTime, 0.06);
      else if (how.sweep) hum.source.playbackRate.setTargetAtTime(1 + 0.1 * sweep, ctx.currentTime, 0.08);
      // the trigger let go: the level's cut-off sound, if it has one
      if (id === this.level && set.humOn && on === 0) this.play('off', 0.96 + Math.random() * 0.08, 0.8);
      if (id === this.level) set.humOn = on > 0;
    }
  }

  /** Watch the katana's tip and give a swing its sound. */
  private trackBlade(dt: number, blade: BladeTracker) {
    if (!blade.moving) { this.speed = 0; this.rising = -1; return; }
    this.speed = blade.speed;
    this.wait = Math.max(0, this.wait - dt);
    if (!this.armed) { if (this.speed < REARM && this.wait === 0) this.armed = true; return; }
    if (this.rising < 0) { if (this.speed > START) { this.rising = 0; this.peak = this.speed; } return; }
    // a few hundredths of a second to see how hard the swing is, then its sound
    this.rising += dt;
    const slowing = this.speed < this.peak * 0.97;
    this.peak = Math.max(this.peak, this.speed);
    if (!slowing && this.rising < 0.06) return;
    const strength = clamp01((this.peak - START) / (FULL - START));
    this.swing(strength, blade.tip);
    this.onSwing?.(strength, blade.tip);
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
    if (at && Number.isFinite(at.x + at.y + at.z)) gain.connect(new PannerNode(ctx, { panningModel: 'equalpower', distanceModel: 'inverse', rolloffFactor: 0,
      positionX: at.x, positionY: at.y, positionZ: at.z })).connect(this.effects);
    else gain.connect(this.effects);
    source.start();
  }

  /**
   * One of the letters' sounds ('arrive', 'slash1', 'slash2', 'sort', 'blip'), heard from `at` if
   * given. `pitch` is a playback rate, `volume` 0..1. Nothing happens until sound has been unlocked.
   */
  play(name: string, pitch = 1, volume = 1, at?: Vector3) {
    // (a level's own take of it if it has one, else the garden's)
    const ctx = this.ctx, buffer = this.levelShots.get(`${this.level}/${name}`) ?? this.shots.get(`${this.level}/${name}`) ?? this.shots.get(name);
    if (!ctx || !this.effects || !buffer || ctx.state !== 'running') return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = pitch;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    if (at && Number.isFinite(at.x + at.y + at.z)) gain.connect(new PannerNode(ctx, { panningModel: 'equalpower', distanceModel: 'inverse', rolloffFactor: 0,
      positionX: at.x, positionY: at.y, positionZ: at.z })).connect(this.effects);
    else gain.connect(this.effects);
    source.start();
  }

  diagnostics() {
    return { context: this.ctx?.state ?? 'none', active: this.active, enabled: this.enabled, volume: this.volume, effectsVolume: this.effectsVolume, level: this.level,
      levelLoops: Object.fromEntries([...this.sets].map(([id, set]) => [id, Object.fromEntries(set.layers.map(l => [l.name, l.gain ? Number(l.level.toFixed(2)) : 'not loaded']))])), levelShots: this.levelShots.size,
      loops: [...this.started], levels: Object.fromEntries(this.layers.map(l => [l.name, Number(l.level.toFixed(2))])),
      swingsLoaded: this.swings.filter(Boolean).length, shotsLoaded: this.shots.size, hum: this.hum ? Number(this.hum.gain.gain.value.toFixed(3)) : 'not loaded', swingsSeen: this.swingCount, lastSwing: this.lastSwing + 1,
      tipSpeed: Number(this.speed.toFixed(2)) };
  }

  dispose() {
    this.disposed = true;
    window.clearTimeout(this.sleep);
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}
