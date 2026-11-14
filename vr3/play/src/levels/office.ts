import type { Vector3 } from 'three';
import type { LetterTheme } from '../letters';
import { officeCard } from './cards';
import { paneSoup } from './shapes';
import type { FxStyle, LevelSound } from './types';

/**
 * The office's mail, bits and sounds, which Keyboard Smash (office2.ts) is built on. The first office
 * itself (an endless carpet painting, public/levels/office) was removed on 2026-11-13; it is in git.
 *
 * Positions are u (0 left to 1 right over 270 degrees) and v (0 bottom to 1 top over 90, the eye
 * line at .48), as they were measured off that painting.
 */

/**
 * The screen, as a direction from the eye and a distance: where letters come out of. (Second
 * paintings, 2026-11-11: the desk lower and nearer, the screen bigger, about ten degrees under the
 * eye line, just behind where a letter waits.)
 */
const SCREEN = { u: 0.4998, v: 0.3711, metres: 1.75 };
/** The view was a foot further back than the painting was made from. */
const DOLLY = 0.3;

export const officeLetters: LetterTheme = {
  special: { colours: ['#ff3b30', '#ffb020'], label: 'URGENT' },
  id: 'office', face: 'paint', paint: officeCard, shape: paneSoup, mechanic: 'cut', title: 'Keyboard Smash', accent: '#7dffc9', bar: ['#2bffb0', '#2fb8ff'],
  look: { sheet: '#a9f9d8', ink: '#0a3a2b', back: '#4fbf98', selfLit: 1, night: '#ffffff',
    hover: '#e4fff4', cutWide: '#7dffc9', cutHot: '#f4fffa', mark: '#ffe9a0', flash: '#f6fff0', gold: '#fff3b8',
    burn: '#6dffb8', burnStyle: 1, streak: ['#8dffd0', '#ffffff'], thread: ['#8dffd0', '#f0fff8'], aura: ['#27c98e', '#a8ffe0'], spell: { wisps: 0.12, sparkles: 0, trail: false, glow: 0.8 } },
  // Out of the screen: a dot of light on the glass, growing as it comes.
  origin(head: Vector3, home: Vector3, from: Vector3, via: Vector3) {
    const across = (SCREEN.u - 0.5) * 4.71238898, up = (SCREEN.v - 0.48) * 1.57079633;
    from.set(head.x + Math.sin(across) * Math.cos(up) * SCREEN.metres, head.y + Math.sin(up) * SCREEN.metres, head.z - Math.cos(across) * Math.cos(up) * SCREEN.metres - DOLLY);
    via.lerpVectors(from, home, 0.5); via.y += 0.16;
    return { scale: 0.07, pose: 'face' as const };
  },
};

export const officeFx: FxStyle = { bit: 'cap', bits: ['#dccbaa', '#93a9a2'], paper: ['#a9f9d8', '#7eedc2'], sparks: ['#c2ffe6', '#7dffc9'], shedBits: 0.45, shedSparks: 0.5, gravity: 3.4, drag: 0.7, flutter: 0.12, size: 0.6 };

export const officeSound: LevelSound = {
  id: 'office',
  // Keyboard Smash's round two begins with the user's own sting (2026-11-13; tools/level-src/office/keyboard-r2-sting.mp3, set to -3 dBFS)
  roundStinger: { name: 'stinger2', volume: 0.9 },
  // a keyboard is no blade: the sword whoosh on swings read as a knife (the user, 2026-11-13)
  swings: false,
  layers: [
    { name: 'room', at: null, level: () => 0.85 },
    // the people thin out as the day goes
    { name: 'typing', at: [-5, -0.2, -6], level: c => (1 - 0.8 * c.blend) * (0.35 + 0.65 * c.drift(c.t * 0.2, 2.2)) },
    { name: 'voices', at: [7, 0, -9], level: c => (1 - 0.88 * c.blend) * (0.4 + 0.6 * c.drift(c.t * 0.15, 5.1)) },
  ],
  occasional: [
    { name: 'fax', every: [24, 50], volume: 0.5, region: [-10, -5, -0.3, 0.3, -11, -5] },
    { name: 'printer', every: [16, 36], volume: 0.5, region: [5, 10, -0.3, 0.3, -9, -4] },
    { name: 'phone', every: [30, 70], volume: 0.45, region: [-8, 8, -0.2, 0.2, -15, -9] },
  ],
  // Haunted Halls' power-up while the trigger is held (castle/hum.mp3 copied to office/hum.mp3, 2026-11-14: "use the older haunted
  // hall sound, that kind of held the sound, not a knife sound"): in quickly, held, out; no one-shot as it is made ready (letters.ts).
  // (it is a sustained sound, so held past 2 s it eases to half and is full again on the next press: 2026-11-14, "lower to 50% after
  // 2 seconds of holding, and reset on release")
  hum: { level: 0.45, swing: false, fadeIn: 0.15, fadeOut: 0.25, settle: { after: 2, to: 0.5, over: 0.6 } },
};
