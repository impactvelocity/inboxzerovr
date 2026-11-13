import type { Rgba } from './color';

/** A level's two colours, as the card drawing takes them (the Unity game's Level.accent and second). */
export interface LevelLook {
  accent: Rgba;
  second: Rgba;
}
