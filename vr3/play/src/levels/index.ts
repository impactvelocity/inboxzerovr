import type { WebGLRenderer } from 'three';
import { KYOTO_LETTERS, type LetterTheme } from '../letters';
import { KYOTO_FX } from '../swingfx';
import type { HeldSpec } from '../weapons/held';
import { buildAxe } from '../weapons/axe';
import { buildFlameThrower } from '../weapons/flamethrower';
import { buildGlove } from '../weapons/glove';
import { buildKeyboard } from '../weapons/keyboard';
import { buildKnightSword } from '../weapons/knightsword';
import { buildSaber } from '../weapons/saber';
import { buildSprayer } from '../weapons/sprayer';
import type { StageDef } from './backdrop';
import { castleFx, castleLetters, castleSound, castleStage } from './castle';
import { knockoutFx, knockoutLetters, knockoutSound, knockoutStage } from './knockout';
import { infernoFx, infernoLetters, infernoSound, infernoStage } from './inferno';
import { labFx, labLetters, labSound, labStage } from './lab';
import type { LevelId } from './lights';
import { lumberFx, lumberLetters, lumberSound, lumberStage } from './lumber';
import { officeFx, officeLetters, officeSound, officeStage } from './office';
import { office2Fx, office2Letters, office2Sound, office2Stage } from './office2';
import { spaceFx, spaceLetters, spaceSound, spaceStage } from './space';
import type { FxStyle, LevelSound } from './types';

/**
 * The levels, in the order the home screen shows them. Kyoto came first and is built by its own
 * files (../garden.ts, ../sword.ts); the others are each one file here plus a weapon in ../weapons.
 */
export interface Level {
  id: LevelId; number: string; name: string;
  /** Under the name on its card: the weapon, and a few words. */
  weapon: string; line: string;
  /** Its two paintings (start and end lighting), under public/. */
  art: [string, string];
  /** Its card on the level select, if not those paintings (start lighting, then end, shown on hover). */
  card?: [string, string];
  /** Its colour on the home screen, and behind everything while it loads. */
  accent: string; ground: string;
  /** The time-of-day slider's words: three phases, and its two ends. */
  phases: [string, string, string]; ends: [string, string];
  letters: LetterTheme; fx: FxStyle;
  /** null: Kyoto's own garden sounds. */
  sound: LevelSound | null;
  /** Its music, a path under public/ (user-supplied tracks, kept out of git), or null for none. */
  music: string | null;
  /** A celebration song for the end of a game, crossfaded in as the last email is dealt with (the user's own: Kyoto's anthem, Haunted Hall, Keyboard Smash and Toxic Danger's, from 2026-11-12). */
  anthem?: string;
  /** A short fun music sting as a game begins (about ten seconds; tools/stingers.py), the song coming in as it ends. */
  stinger?: string;
  /** Kyoto has neither: its backdrop and katana are its own files. */
  stage: StageDef | null;
  held: ((renderer: WebGLRenderer) => HeldSpec) | null;
  /** Kept but off the home screen and the VR menu (2026-11-12: Knockout, "boxing doesn't feel good in VR in this game"; Keyboard Smash v1, v2 now the main one). Still reachable with ?level=<id>. */
  hidden?: true;
  /** What comes out of a pointing tool: the lab's mist if not given, or fire (../flame.ts). */
  jet?: 'flame';
}

export const LEVELS: Level[] = [
  { id: 'kyoto', number: '01', name: 'Kyoto Nights', weapon: 'Katana', line: 'After the rain', art: ['garden/dusk-v2.webp', 'garden/twilight-v2.webp'], card: ['levels/kyoto/card-start.webp', 'levels/kyoto/card-end.webp'],      // (the user's card art, 2026-11-12)
    accent: '#f6b3cc', ground: '#17151e',
    phases: ['Dusk', 'Blue hour', 'Twilight'], ends: ['DUSK', 'TWILIGHT'], letters: KYOTO_LETTERS, fx: KYOTO_FX, sound: null, music: 'audio/kyoto/music.m4a', anthem: 'audio/kyoto/anthem.m4a', stinger: 'audio/stingers/kyoto.m4a',     // 忍道の鼓動, the user's track (late 2026-11-11; before it 竹林の冒険, and before that 京都の静けさ, still at audio/kyoto-serenity-aac.m4a); its end anthem, theirs too (replaced 2026-11-12 with kyoto-end-song; the old one is tools/level-src/kyoto/anthem-before-2026-11-12.m4a)
    stage: null, held: null },
  // The office again, the monitor and what is on the desk real (asked for on 2026-11-11): the emails are on its screen, and it is what gets hit.
  { id: 'office2', number: '02', name: 'Keyboard Smash', weapon: 'Keyboard', line: 'Smash the monitor', art: office2Stage.art, card: ['levels/office2/card-start.webp', 'levels/office2/card-end.webp'],      // (the user's card art, 2026-11-12)
    accent: '#7dffc9', ground: '#1a2a47',
    phases: ['Office hours', 'Closing time', 'After hours'], ends: ['OFFICE HOURS', 'AFTER HOURS'], letters: office2Letters, fx: office2Fx, sound: office2Sound, music: 'audio/office/music.m4a', anthem: 'audio/office/anthem.m4a', stinger: 'audio/stingers/office.m4a', stage: office2Stage, held: buildKeyboard },
  { id: 'office', number: '02', name: 'Keyboard Smash v1', hidden: true, weapon: 'Keyboard', line: 'You have mail', art: officeStage.art, accent: '#7dffc9', ground: '#1a2a47',
    phases: ['Office hours', 'Closing time', 'After hours'], ends: ['OFFICE HOURS', 'AFTER HOURS'], letters: officeLetters, fx: officeFx, sound: officeSound, music: null, stinger: 'audio/stingers/office.m4a', stage: officeStage, held: buildKeyboard },
  { id: 'castle', number: '03', name: 'Haunted Halls', weapon: 'Sword', line: 'Royal dispatches', art: castleStage.art, card: ['levels/castle/card-start.webp', 'levels/castle/card-end.webp'],      // (the user's card art, 2026-11-12)
    accent: '#b79cff', ground: '#120d1c',
    phases: ['Candlelight', 'Witching hour', 'Haunted'], ends: ['CANDLELIGHT', 'HAUNTED'], letters: castleLetters, fx: castleFx, sound: castleSound, music: 'audio/castle/music.m4a', anthem: 'audio/castle/anthem.m4a', stinger: 'audio/stingers/castle.m4a', stage: castleStage, held: buildKnightSword },
  { id: 'lab', number: '04', name: 'Toxic Danger', weapon: 'Sprayer', line: 'Contaminated mail', art: labStage.art, card: ['levels/lab/card-start.webp', 'levels/lab/card-end.webp'],      // (the user's card art, 2026-11-12)
    accent: '#8dff6a', ground: '#0c1f2a',
    phases: ['Lights on', 'Lockdown', 'Blackout'], ends: ['LIGHTS ON', 'BLACKOUT'], letters: labLetters, fx: labFx, sound: labSound, music: 'audio/lab/music.m4a', anthem: 'audio/lab/anthem.m4a', stinger: 'audio/stingers/lab.m4a', stage: labStage, held: buildSprayer },
  // Super Space (asked for on 2026-11-12): a flight through pixel-art space, the mail incoming transmissions, the weapon a saber. Its music is the user's to add (its sting is theirs: 2026-11-12).
  // (Its song is the user's "Galactic Run", 2026-11-13: tools/level-src/space/music-source.m4a, at the other songs' -20 LUFS.)
  // (Its cards are the user's own art since 2026-11-13, "super space level select images": the bridge, day and night. Before, a piece cut from the side of the painting: tools/level-src/space/*-before-2026-11-13.webp.)
  { id: 'space', number: '05', name: 'Super Space', weapon: 'Saber', line: 'Incoming transmissions', art: spaceStage.art, card: ['levels/space/card-start.webp', 'levels/space/card-end.webp'], accent: '#35e8ff', ground: '#0a0820',
    phases: ['Cruising', 'The jump', 'Deep space'], ends: ['CRUISING', 'DEEP SPACE'], letters: spaceLetters, fx: spaceFx, sound: spaceSound, music: 'audio/space/music.m4a', stinger: 'audio/stingers/space.m4a', stage: spaceStage, held: buildSaber },
  // Inferno (asked for on 2026-11-12): the furnace hall, the mail down a chute, the weapon a flame thrower. Its music is the user's to add (its sting is theirs: 2026-11-12).
  { id: 'inferno', number: '06', name: 'Inferno', weapon: 'Flame thrower', line: 'Burn after reading', art: infernoStage.art, card: ['levels/inferno/card-start.webp', 'levels/inferno/card-end.webp'],      // (the user's card art, 2026-11-12)
    accent: '#ff8a3d', ground: '#1a0f12',
    phases: ['Stoked', 'Banked', 'Lights out'], ends: ['STOKED', 'LIGHTS OUT'], letters: infernoLetters, fx: infernoFx, sound: infernoSound, music: null, stinger: 'audio/stingers/inferno.m4a', stage: infernoStage, held: buildFlameThrower, jet: 'flame' },
  // Knockout (asked for on 2026-11-12): the main event from inside the ring, the mail the evening paper flung in over the ropes, the weapon a boxing glove: it is punched, not cut (letters.ts, "the punch"). Its music is the user's to add (its sting is theirs: 2026-11-12).
  { id: 'knockout', number: '08', hidden: true, name: 'Knockout', weapon: 'Glove', line: 'The main event', art: knockoutStage.art, accent: '#ffcf4a', ground: '#0d1030',
    phases: ['Main event', 'Lights down', 'Final round'], ends: ['MAIN EVENT', 'FINAL ROUND'], letters: knockoutLetters, fx: knockoutFx, sound: knockoutSound, music: null, stinger: 'audio/stingers/knockout.m4a', stage: knockoutStage, held: buildGlove },
  // LumberHack (asked for on 2026-11-12): a timber yard in autumn, the mail flung out of the barn's hatch, the weapon an axe. Its music is the user's to add (its sting is theirs: 2026-11-12).
  { id: 'lumber', number: '07', name: 'LumberHack', weapon: 'Axe', line: 'Timber post', art: lumberStage.art, card: ['levels/lumber/card-start.webp', 'levels/lumber/card-end.webp'],      // (the user's card art, 2026-11-12)
    accent: '#ffc440', ground: '#2a1a12',
    phases: ['Golden hour', 'Dusk', 'Lamplight'], ends: ['GOLDEN HOUR', 'LAMPLIGHT'], letters: lumberLetters, fx: lumberFx, sound: lumberSound, music: 'audio/lumber/music.m4a', anthem: 'audio/lumber/anthem.m4a', stinger: 'audio/stingers/lumber.m4a', stage: lumberStage, held: buildAxe },
];
/** The levels to choose from: the home screen's cards and the menu in VR. */
export const SHOWN: Level[] = LEVELS.filter(level => !level.hidden);
export const levelById = (id: string | null | undefined) => LEVELS.find(level => level.id === id) ?? null;
/** A level to open on: a hidden one only when asked for by name (?level=), never from an old saved pick (v1's pick opens v2). */
export const shownById = (id: string | null | undefined) => { const level = levelById(id === 'office' ? 'office2' : id); return level && !level.hidden ? level : null; };
