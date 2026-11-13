/** What a swing, a cut or a melt throws into the air in a level (../swingfx.ts). Colours are at the level's start and end lighting. */
export interface FxStyle {
  /** The little things: cherry petals, key caps, splinters, droplets. */
  bit: 'star' | 'petal' | 'cap' | 'shard' | 'drop';
  bits: [string, string];
  /** Optional: each thrown bit takes one of these at random instead of the dusk-to-night pair (the lab's melts, 2026-11-13: "more gradient color, not just the green"). */
  mix?: string[];
  /** Optional: how see-through the bits are, 0 to 1 (1, solid, if not given). The lab's melt drops, 2026-11-13: "less opacity, so more subtle like before". */
  bitOpacity?: number;
  /** Shreds of the letter itself. */
  paper: [string, string];
  sparks: [string, string];
  /** How much the weapon sheds by itself as it is swung: 1 as the katana sheds petals and lights, 0 nothing. */
  shedBits: number; shedSparks: number;
  /** How the bits fall: m/s2, how fast they lose speed, how much they flutter side to side, and their size (1: a petal's). */
  gravity: number; drag: number; flutter: number; size: number;
}

/** A level's sound (../ambience.ts): loops that are always there, things heard now and then, and the hum of the live weapon. */
export interface LevelSound {
  /** Its folder under public/audio, holding set.json (tools/levelsounds.py writes it). */
  id: string;
  layers: {
    name: string;
    /** Where it comes from, metres from the seat; null is all around. */
    at: [number, number, number] | null;
    /** How loud, every frame: t seconds, blend the time of day (0 to 1), hot (0 to 1, the lab's radioactive mail), drift a slow wander. */
    level(c: { t: number; blend: number; hot: number; drift(t: number, seed: number): number }): number;
  }[];
  /** One-shots heard now and then: every so many seconds (from, to), from somewhere in a box (x0, x1, y0, y1, z0, z1). */
  occasional?: { name: string; every: [number, number]; volume: number; region: [number, number, number, number, number, number] }[];
  /**
   * The loop heard while the trigger is held: how loud, whether it rises with the swing (a blade) or
   * is steady (a spray), and how quickly it fades in and out (seconds to come most of the way).
   * `sweep` (0 to 1): a steady one still swells and rises a little in pitch as the weapon is swept about.
   * A level's `off` shot, if it has one, plays as the trigger is let go.
   */
  hum: { level: number; swing: boolean; fadeIn?: number; fadeOut?: number; sweep?: number } | null;
  /**
   * A note played on every cut, each time another note of `scale` (semitones from the recording's
   * own pitch), wandering up and down it a step or two at a time so that the cuts make a tune.
   */
  cutNote?: { name: string; scale: number[]; volume: number };
  /**
   * Sounds for the moment a round is over (as the next round's intro begins): after round `round`,
   * each of `sounds` (one of the level's shots), `delay` seconds later, from `at` (metres from the
   * seat) if given.
   */
  afterRound?: { round: number; sounds: { name: string; delay: number; volume: number; at?: [number, number, number] }[] }[];
}
