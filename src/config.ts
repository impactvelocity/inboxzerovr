/** Tunable starting points. Everything here is meant to be adjusted on device. */

export const PALETTE = {
  background: 0x080d1c,
  navy: 0x151d35,
  cyan: 0x20e7f2,
  coral: 0xff5e7e,
  magenta: 0xc864ff,
  text: '#F3F7FF',
  textDim: '#B6C1D8',
  cardFace: '#0A1022',
  css: { cyan: '#20E7F2', coral: '#FF5E7E', magenta: '#C864FF', navy: '#151D35', bg: '#080D1C' },
} as const;

export const LAYOUT = {
  /** Eye height above the arena floor that the scene is built for (seated). */
  eyeHeight: 1.15,
  cardDistance: 1.1,
  cardCenterY: 1.0,
  cardWidth: 0.9,
  portalAngleDeg: 30,
  portalDistance: 2.3,
  portalY: 1.2,
  portalRadius: 0.52,
} as const;

export const BLADE = {
  length: 0.42,
  /** Minimum blade-tip speed for a slash to count, in m/s. */
  minSpeed: 0.4,
  /** How far in front of / behind the card face the slash volume extends. */
  depthFront: 0.3,
  depthBack: 0.12,
  /** Extra margin around the card edge. */
  margin: 0.04,
  /** Longest gap between frames still treated as one sweep, in seconds. */
  maxFrameGap: 0.25,
} as const;

export const GRAB = {
  directReach: 0.32,
  rayConeDeg: 14,
  rayMaxDistance: 2.2,
  aimConeDeg: 32,
  throwConeDeg: 42,
  throwMinSpeed: 0.5,
  heldDistance: 0.34,
  heldScale: 0.42,
} as const;

export const TIMING = {
  cardArrive: 0.3,
  cardSplit: 0.22,
  shardFade: 0.6,
  portalCapture: 0.4,
  cardReturn: 0.35,
  reviewTransition: 1.5,
  toast: 4.5,
} as const;

/** Canvas pixels per metre for world-space text. */
export const PX_PER_M = 1500;

export const DEFAULT_REMINDER_HOUR = 9;
