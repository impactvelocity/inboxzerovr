import { hex, type Rgba } from './color';

/**
 * Everything worth adjusting on a headset (Unity: InboxGame.Tuning, same names and values),
 * plus the few choices that belong to the web build alone.
 */
export const tuning = {
  swordSpeed: 1.0, // m/s the blade must be moving to cut
  hitDepth: 0.1, // the card's hit volume reaches this far in front and behind
  hitMargin: 0.03, // and this far past its edges
  weaponTiltDeg: 20, // how far the weapon leans toward the fingers
  grabReach: 0.12, // a palm this close to the card can grab it
  pinchOn: 0.025, // thumb-to-index distance that closes a pinch
  pinchOff: 0.045, // and the distance that opens it again
  fistCurl: 0.09, // middle fingertip this close to the wrist is a fist
  pokeDepth: 0.025, // a fingertip this close to a button presses it
  swipeSpeed: 0.9, // m/s throw that sends a held card without letting go
  swipeTravel: 0.07, // the card must also have moved this far
  dropTravel: 0.13, // or: carry it this far and let go
  arriveSeconds: 1.1, // how long the next email takes to come out of the distance
  readSeconds: 5, // then it waits this long, drifting closer, before it flies past
  approach: 0.12, // how far back it starts its wait, in metres
  passSeconds: 0.6, // how long flying past takes
  nextDelay: 0.12, // pause between one email and the next
  hitStop: 0.07, // the world holds its breath this long on a hit
  swingSeconds: 0.16, // the desktop katana's swing, from wind-up to follow-through
  cardDistance: 0.72, // how far in front of the chair the email floats
  introSeconds: 3, // countdown before round 1
  intro2Seconds: 3, // and before round 2
  doneSeconds: 8, // summary on screen before going home
  replyHold: 3, // seconds over a reply to send it
  micHold: 2, // seconds over the mic to start dictating
  dictateSeconds: 2.6, // how long the pretend dictation runs
  gripToHit: false, // the weapon only hits while the right hand is closed
  roundSize: 12, // emails in round 1
  junkShare: 0.65, // fraction of them that are junk

  // ---- web only ----
  /** Canvas pixels per Unity texture pixel for letters and labels: 2 keeps text sharp up close. Read once, at start. */
  textScale: 2,
  /**
   * The scrolling preview on newsletters and offers. Unity's Ink shader is written to show it,
   * but in the Unity checks of this level the window comes out blank; false matches that.
   */
  scrollPreview: true,
  /**
   * False (the default): labels and buttons draw with the game's own LabelMaterial, which
   * filters their canvases premultiplied, so text edges have no dark fringe and a pop-up can
   * fade. True: they draw with ctx.ui.material({ map }) instead. Read once, at start.
   */
  labelsThroughUiKit: false,
  /** The monitor's field-of-view punch on a hit, in degrees (Unity: 2.5). Done with camera.zoom. */
  fovKickDeg: 2.5,
};

export type Tuning = typeof tuning;

/** Unity: Levels.All[2], "KYOTO V2". The only level this build plays. */
export const level = {
  name: 'KYOTO V2',
  accent: hex(0xff8fb8),
  second: hex(0xffa860),
  third: hex(0x7a6ad8),
  trail: hex(0xfff0f6),
} as const;

export interface LevelLook {
  accent: Rgba;
  second: Rgba;
}

/** The card quad, in metres (Unity: InboxGame.CardW, CardH). */
export const CardW = 0.5;
export const CardH = 0.3125;
/** The blade runs from here to here along the katana's +Y. */
export const SwordBladeStart = 0.11;
export const SwordBladeEnd = 0.66;
/** What the big button on the home screen says. */
export const PlayWords = 'CLEAR MY INBOX';
