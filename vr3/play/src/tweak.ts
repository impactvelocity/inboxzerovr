import { Matrix4 } from 'three';
import savedHolds from './weapon-holds.json';

/**
 * Weapon tuning (development only, 2026-11-12: "a debug thing, where its the settings for each weapon and I can play
 * with the angle position, make the edits in this browser then try them in the headset").
 *
 * Each level's weapon can be turned and moved about the fist, on top of how it is already held. The numbers are
 * edited on tune.html (any browser on this dev server); the dev server keeps them in tools/weapon-tweaks.json and
 * sends every change to every open page at once, so the headset's game picks them up live, in VR or out of it.
 * A build has no dev server: there every weapon sits exactly as its code says. Once a tweak feels right, its
 * numbers are folded into the weapon's own hold and the tweak is reset to zero.
 *
 * All in the controller's grip space, about the middle of the fist:
 *   tipForward  degrees the weapon tips forward, towards the knuckles (negative: back towards the wrist)
 *   tipRight    degrees its tip swings to the player's right (negative: left)
 *   spin        degrees it spins about the fist's own axis, the line through the closed fist; positive turns
 *               what faces the knuckles (a blade's edge) towards the right
 *   right       cm moved to the player's right
 *   up          cm moved along the fist's axis, out past the thumb
 *   forward     cm moved towards the knuckles
 */
export interface Tweak { tipForward: number; tipRight: number; spin: number; right: number; up: number; forward: number }
export const TWEAK_KEYS = ['tipForward', 'tipRight', 'spin', 'right', 'up', 'forward'] as const;
export const ZERO: Tweak = { tipForward: 0, tipRight: 0, spin: 0, right: 0, up: 0, forward: 0 };

const RAD = Math.PI / 180;
const all: Record<string, Tweak> = {};
/**
 * Saved as each weapon's default from tune.html ("Save as default"): the tweaks kept in src/weapon-holds.json, one
 * after another, in the order they were saved. These are part of the game, builds too; the live tweak goes on top.
 */
const saved = savedHolds as Record<string, Partial<Tweak>[]>;
const savedMatrices = new Map<string, Matrix4>();
for (const [level, list] of Object.entries(saved)) {
  if (!Array.isArray(list) || !list.length) continue;
  const m = new Matrix4(); for (const t of list) m.multiply(build({ ...ZERO, ...t }));
  savedMatrices.set(level, m);
}
const matrices = new Map<string, Matrix4>(), combined = new Map<string, Matrix4>();
const identity = new Matrix4();
const listeners = new Set<() => void>();

function build(t: Tweak) {
  // moved first (in grip space), then turned about the fist: forward is about grip x, right about grip y, spin about grip z
  return new Matrix4().makeTranslation(t.right / 100, -t.forward / 100, -t.up / 100)
    .multiply(new Matrix4().makeRotationX(-t.tipForward * RAD))
    .multiply(new Matrix4().makeRotationY(-t.tipRight * RAD))
    .multiply(new Matrix4().makeRotationZ(t.spin * RAD));
}

const current = { level: '' };
export const tweaks = {
  /** The level being played on this page (main.ts sets it); its weapon is the one the tweak applies to. */
  get level() { return current.level; },
  set level(id: string) { current.level = id; },
  /** Every level's tweak (only levels that have one). */
  all: all as Readonly<Record<string, Tweak>>,
  get(level: string): Tweak { return { ...ZERO, ...all[level] }; },
  /** The grip-space matrix to put between the controller's grip and the weapon's own hold (identity when untouched). */
  matrix(level?: string): Matrix4 {
    const id = level ?? current.level, live = matrices.get(id), kept = savedMatrices.get(id);
    if (!kept) return live ?? identity;
    if (!live) return kept;
    let both = combined.get(id); if (!both) { both = new Matrix4(); combined.set(id, both); }
    return both.multiplyMatrices(kept, live);
  },
  /** How many tweaks have been saved as this level's default (src/weapon-holds.json). */
  savedCount(level: string): number { return saved[level]?.length ?? 0; },
  /** Make this level's live tweak part of its default (written into src/weapon-holds.json by the dev server), and zero it. */
  saveAsDefault(level: string) { import.meta.hot?.send('vr3:tweak:save', { level }); },
  /** Forget every tweak saved as this level's default. */
  clearDefault(level: string) { import.meta.hot?.send('vr3:tweak:clear-saved', { level }); },
  /** Change one level's tweak here and on every other page (the dev server passes it on). */
  set(level: string, next: Tweak) {
    receive({ ...all, [level]: next });
    import.meta.hot?.send('vr3:tweak:set', { level, tweak: next });
  },
  onChange(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
};

function receive(state: Record<string, Tweak>) {
  for (const key of Object.keys(all)) delete all[key];
  matrices.clear();
  for (const [level, t] of Object.entries(state ?? {})) {
    const clean = { ...ZERO, ...t };
    all[level] = clean;
    if (TWEAK_KEYS.some(k => clean[k] !== 0)) matrices.set(level, build(clean));
  }
  for (const listener of listeners) listener();
}

/** A page says what it is now and then, so the tuning page can show whether the headset is listening. */
export function announce(info: Record<string, unknown>) { import.meta.hot?.send('vr3:tweak:hello', info); }

if (import.meta.hot) {
  import.meta.hot.on('vr3:tweak:all', (state: Record<string, Tweak>) => receive(state));
  import.meta.hot.send('vr3:tweak:get', {});
}
