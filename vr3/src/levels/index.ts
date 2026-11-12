import type { WebGLRenderer } from 'three';
import { KYOTO_LETTERS, type LetterTheme } from '../letters';
import { KYOTO_FX } from '../swingfx';
import type { HeldSpec } from '../weapons/held';
import { buildKeyboard } from '../weapons/keyboard';
import { buildKnightSword } from '../weapons/knightsword';
import { buildSprayer } from '../weapons/sprayer';
import type { StageDef } from './backdrop';
import { castleFx, castleLetters, castleSound, castleStage } from './castle';
import { labFx, labLetters, labSound, labStage } from './lab';
import type { LevelId } from './lights';
import { officeFx, officeLetters, officeSound, officeStage } from './office';
import { office2Fx, office2Letters, office2Sound, office2Stage } from './office2';
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
  /** Its colour on the home screen, and behind everything while it loads. */
  accent: string; ground: string;
  /** The time-of-day slider's words: three phases, and its two ends. */
  phases: [string, string, string]; ends: [string, string];
  letters: LetterTheme; fx: FxStyle;
  /** null: Kyoto's own garden sounds. */
  sound: LevelSound | null;
  /** Its music, a path under public/ (user-supplied tracks, kept out of git), or null for none. */
  music: string | null;
  /** A celebration song for the end of a game, crossfaded in as the last email is dealt with (the user's own: Kyoto's anthem). */
  anthem?: string;
  /** Kyoto has neither: its backdrop and katana are its own files. */
  stage: StageDef | null;
  held: ((renderer: WebGLRenderer) => HeldSpec) | null;
}

export const LEVELS: Level[] = [
  { id: 'kyoto', number: '01', name: 'Kyoto Nights', weapon: 'Katana', line: 'After the rain', art: ['garden/dusk-v2.webp', 'garden/twilight-v2.webp'], accent: '#f6b3cc', ground: '#17151e',
    phases: ['Dusk', 'Blue hour', 'Twilight'], ends: ['DUSK', 'TWILIGHT'], letters: KYOTO_LETTERS, fx: KYOTO_FX, sound: null, music: 'audio/kyoto/music.m4a', anthem: 'audio/kyoto/anthem.m4a',     // 忍道の鼓動, the user's track (late 2026-11-11; before it 竹林の冒険, and before that 京都の静けさ, still at audio/kyoto-serenity-aac.m4a); its end anthem, theirs too
    stage: null, held: null },
  { id: 'office', number: '02', name: 'The Corner Desk', weapon: 'Keyboard', line: 'You have mail', art: officeStage.art, accent: '#7dffc9', ground: '#1a2a47',
    phases: ['Office hours', 'Closing time', 'After hours'], ends: ['OFFICE HOURS', 'AFTER HOURS'], letters: officeLetters, fx: officeFx, sound: officeSound, music: null, stage: officeStage, held: buildKeyboard },
  { id: 'castle', number: '03', name: 'The Haunted Hall', weapon: 'Sword', line: 'Royal dispatches', art: castleStage.art, accent: '#b79cff', ground: '#120d1c',
    phases: ['Candlelight', 'Witching hour', 'Haunted'], ends: ['CANDLELIGHT', 'HAUNTED'], letters: castleLetters, fx: castleFx, sound: castleSound, music: 'audio/castle/music.m4a', stage: castleStage, held: buildKnightSword },
  { id: 'lab', number: '04', name: 'Toxic Danger', weapon: 'Sprayer', line: 'Contaminated mail', art: labStage.art, accent: '#8dff6a', ground: '#0c1f2a',
    phases: ['Lights on', 'Lockdown', 'Blackout'], ends: ['LIGHTS ON', 'BLACKOUT'], letters: labLetters, fx: labFx, sound: labSound, music: null, stage: labStage, held: buildSprayer },
  // The office again, the monitor and what is on the desk real (asked for on 2026-11-11): the emails are on its screen, and it is what gets hit.
  { id: 'office2', number: '05', name: 'The Office v2', weapon: 'Keyboard', line: 'Smash the monitor', art: office2Stage.art, accent: '#7dffc9', ground: '#1a2a47',
    phases: ['Office hours', 'Closing time', 'After hours'], ends: ['OFFICE HOURS', 'AFTER HOURS'], letters: office2Letters, fx: office2Fx, sound: office2Sound, music: null, stage: office2Stage, held: buildKeyboard },
];
export const levelById = (id: string | null | undefined) => LEVELS.find(level => level.id === id) ?? null;
