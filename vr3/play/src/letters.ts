import { AdditiveBlending, BackSide, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DoubleSide, FrontSide, InterleavedBuffer, InterleavedBufferAttribute, LinearSRGBColorSpace, Matrix4, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Points, Quaternion, ShaderMaterial, SphereGeometry, SRGBColorSpace, TextureLoader, Vector2, Vector3, Vector4, type Texture, type World } from '@iwsdk/core';
import type { BladeTracker } from './blade';
import { covers, cut, measure, recentre, STRIDE, type Soup } from './cut';
import { emailCard } from './mail/cardArt';
import { layoutEmail, STRIP_TALL, type CardStyle, type Scroll } from './mail/layout';
import { type Email } from './mail/emails';
import { mail } from './mail/source';
import { makeSurface, Painter, type Surface } from './mail/painter';
import * as PixelFont from './mail/pixelFont';
import { createRoundUi, MARKS } from './roundui';
import { dictate } from './dictate';
/** The word for one left for later in round two. */
const LATER = '#ffb347';

/**
 * The game, as far as it goes: emails arrive one at a time as paper letters. Each comes out of the
 * garden to the middle of the view, out by the veranda's edge, then keeps coming slowly, growing,
 * down towards the hands; not dealt with, it goes past the shoulder and the next one comes.
 *
 * The katana cuts one in two wherever and whichever way the blade goes through it, at any point
 * of its life, and the pieces hang in the air to be cut again until the next letter is in place.
 * The left hand takes hold of one (grip or trigger; reaching towards it is enough) and throws it,
 * in any direction. A thrown letter flashes and wears a gold edge: it matters. It can still be cut
 * out of the air; left to fly away, it is kept. No score, no rounds, no end: this is for getting
 * the feel right.
 *
 * The letter is the Unity game's own (tools/letter.py brings it over), and each email is drawn by
 * that game's own card code (src/mail) and shown as ink on the paper.
 *
 * On a monitor there are no hands: X cuts the letter in front of you and C throws it, and the
 * Preview sword swing button swings the real blade through it.
 */

/** The sheet, in metres (the Unity game's CardW and CardH). */
const W = 0.5, H = 0.3125;
const remembered = (key: string) => { try { return localStorage.getItem('vr3.' + key); } catch { return null; } };
/**
 * Everything worth trying on a headset. These are for Quest controllers, which is what is being
 * played with for now; bare hands will want numbers of their own (no trigger, shorter throws), as
 * a second set chosen by what the player is holding.
 */
const tune = {
  // With a controller the sword only cuts while the trigger is held, so it can be waved about
  // without cutting anything. The Sword controls' "Trigger cuts" box, or ?triggerCut=0 in the address.
  triggerToCut: (new URLSearchParams(location.search).get('triggerCut') ?? remembered('hold.triggerCut') ?? '1') !== '0',
  focus: 1.5,           // where a letter arrives: this far in front of the head, out towards the veranda's edge
  focusDrop: 0.26,      // and this far below eye level: about ten degrees down, where a seated player's eyes rest
  near: 0.8,            // it keeps coming, slowly, to this far away
  nearDrop: 0.3,        // sinking this far below eye level, where the hands are
  arriveSeconds: 1.15,  // from the garden to where it arrives
  waitSeconds: 7,       // how long the slow approach takes; then, not dealt with, it goes past
  passSeconds: 0.6,     // how long going past the shoulder takes
  nextAfterCut: 0.5,    // the pause before the next letter
  nextAfterKeep: 0.45,
  hitDepth: 0.12,       // the blade cuts a letter it passes this close to, in front or behind
  hitMargin: 0.05,      // and this far past its edges
  cutToMiddle: 0.3,     // a cut is drawn this far towards the letter's middle, so a clipped corner is still a proper cut
  cutSpeed: 0.9,        // m/s the blade must be moving where it meets the paper
  // The sword's long reach, like the left hand's: past its tip the blade goes on as a line, so a
  // swing cuts a letter that is still small and far. Only once the letter is in its place, and only
  // for a real swing: a resting wrist must not cut what is two metres away.
  swordReach: 1.3,      // how far past the tip the line runs, in metres
  swordWiden: 0.18,     // the hit box grows this much for every metre past the tip
  swordReachSpeed: 2.0, // m/s the real tip must be moving for the line to count
  grabReach: 0.13,      // a hand this far off the sheet's edge can take it
  grabDepth: 0.45,      // reaching towards it from this far in front: it comes to the hand
  // The left hand's long reach, as in Needle VR: its hit box is a line from the hand on outwards,
  // away from the shoulder, so a seated player takes a letter by reaching towards it, not by touching it.
  // Pointing the controller at it counts as well: there are two lines, and either will do.
  reachLine: 1.7,       // how far past the hand the line runs, in metres
  reachRadius: 0.2,     // the line takes a letter it passes this close to
  reachWiden: 0.45,     // and this much further off for every metre out along it: only one letter is ever there to take
  pointRadius: 0.14,    // the same two numbers for the line the controller points along: tighter, or a
  pointWiden: 0.06,     // controller lying in the lap, pointing vaguely forward, would always have the letter
  shoulder: [-0.17, -0.2, 0.02] as [number, number, number],   // the left shoulder, from the head (seated, facing the garden)
  holdDistance: 0.45,   // a letter taken from afar flies in to this far from the hand, not into it
  workHold: 0.6,        // round two: it is held out this far (further than in round one), out where the replies are (0.72 for a while on 2026-11-12, after the replies moved back: it felt off, so back to 0.6)
  dockShrink: 0.15,     // round two: held at a target, it is this much smaller (only a bit: 40% was too much, 2026-11-11)
  replyHalf: 1.2,       // round two, a reply: seconds the ring takes to go three quarters of the way round, steadily from the first touch
  replyRest: 0.25,      // and the last quarter, snapping shut (2026-11-12: "intentional at the start, then finish quickly"), sent at 1.45 s
  micHalf: 0.9,         // the mic: three quarters of its ring, steadily from the first touch
  micRest: 0.2,         // and the last quarter, snapping shut: recording at 1.1 s (2026-11-12: "a bit faster, so slow to start ( ring) then be quick"; it was 2 s)
  chooseHold: 1.5,      // and at KEEP or REDO, after dictating
  wordSeconds: 0.24,    // the mock dictation: a word every this long
  holdGrow: 1.35,       // held, it looks this much bigger than it did where it was taken from: its size as seen, and a good bit more (1.15 until 2026-11-12, then 1.21, 1.25, 1.8 to test, 1.5, then "make 1.35 for email")
  // The rounds. One is so many emails; round two brings back the ones that were kept.
  // Round one's emails. 10 for demos for now (asked for on 2026-11-11); it will vary from day to day later, never more than 20.
  roundEmails: 10,
  demoEmails: [6, 18] as [number, number],      // the demo's inbox: somewhere from this many to this many, at random
  workSeconds: 16,      // round two: how long a letter waits to be answered before it is left for tomorrow
  readySeconds: 5,      // the ring under the round's title fills over this long before the first letter comes
  flickSpeed: 1.3,      // a held letter swept this fast leaves the hand without letting go
  // A thrown letter is thrown: it leaves at the hand's speed (and a bit), and from there it is
  // paper in the air, falling and slowing as paper does. No slow start.
  throwBoost: 1.5,      // its speed as it leaves, as a multiple of the hand's
  throwGravity: 2.4,    // m/s2 it falls at: less than a stone, it is a sheet of paper
  throwDrag: 0.35,      // how fast it loses speed, per second
  throwLife: 1.5,       // seconds in the air before it is kept; sooner if it lands, or gets 8 m away
};
/** The sprayer's numbers (the lab, where nothing is cut: a letter is sprayed until it melts). */
const spray = {
  range: 3.4,           // how far the mist carries, metres
  cone: 0.2,            // how far off the nozzle's line still wets a letter, radians (on top of the letter's own size)
  // One touch of the mist is enough, as one cut is (asked for on 2026-11-11): from where it lands
  // the froth spreads over the whole sheet by itself, and then it melts.
  spread: 0.5,          // seconds the froth takes to cover an ordinary letter
  hazardSpread: 0.85,   // and a radioactive one
  meltSeconds: 0.85,    // how long it takes to melt away once it is covered
};
const SHEETS = 5, STREAKS = 3, MAX_LOOSE = 24;
/**
 * How a cut breaks a letter (asked for on 2026-11-11: "more dynamic, maybe smaller pieces"). A gentle
 * swing still cuts it cleanly in two; a harder one breaks each half again, into up to four pieces a
 * side, that fly apart faster and spin harder; and the level throws out fragments of its own.
 */
const shatter = {
  once: 0.3,            // swing strength (0 to 1; about 3 m/s at the blade) above which each half breaks again
  twice: 0.62,          // and above which it breaks again after that (about 5.3 m/s)
  smallest: 0.006,      // a piece with less paper than this (m2) is not broken further
  most: 20,             // no more breaking once this many pieces are in the air
  burst: 0.75,          // how hard the pieces of a broken half fly out from where the blade went in, at full strength (m/s)
};

/** The colours of a level's letters and of everything that happens to them. Hex strings, as on screen. */
export interface LetterLook {
  /** Ink faces: the paper and the ink. Painted faces: `back` is the letter's back and edges. */
  sheet: string; ink: string; back: string;
  /** 0 paper, lit by the room; 1 a screen, which shines by itself. */
  selfLit: number;
  /** What the room's end lighting does to it (a multiplier). */
  night: string;
  hover: string; cutWide: string; cutHot: string; mark: string; flash: string; gold: string;
  /** The edge of what is left as it goes, and how it goes: 0 burns away like paper, 1 breaks up into blocks, 2 melts and runs, 3 catches fire where the flame touched it and burns away from there (Inferno). */
  burn: string; burnStyle: 0 | 1 | 2 | 3;
  streak: [string, string]; thread: [string, string];
  /** A glow round a whole letter (two colours it moves between), or none. */
  aura: [string, string] | null;
  /**
   * How that glow behaves: `wisps` 0 a still bloom to 1 cold fire licking off it, `sparkles` so many
   * motes of light going round its edge, `trail` leaving lights behind it as it arrives.
   */
  spell?: { wisps: number; sparkles: number; trail: boolean; glow?: number };
}
/**
 * How a punch feels, in a level whose mail is punched rather than cut (Knockout). Speeds are m/s at
 * the glove; "strength" is 0 at `speed` (the least that counts) and 1 at `full`.
 */
export interface PunchFeel {
  speed: number; full: number;
  /** How squarely the glove must be heading for the thing: the cosine of the most it may be off by. */
  into: number;
  /** The glove as a hit box (metres round the front of the knuckles); how far a fast punch carries past it, from what speed, and how the box widens out there. */
  glove: number; reach: number; reachSpeed: number; widen: number;
  /** From this strength a punch breaks the letter up; lighter ones knock it about, and after `hits` of those the next breaks it anyway. */
  hard: number; hits: number;
  /** What a knocked letter leaves at (lightest, hardest), how much of that is upwards, how much of its way is the punch's own, and its tumble. */
  launch: [number, number]; lift: [number, number]; carry: number; spin: number;
  gravity: number; drag: number;
  /** The ring: ropes `radius` metres from the seat up to `top` over the canvas, the canvas `drop` under the eye; past `out`, the crowd. */
  ropes: { radius: number; top: number; bounce: number }; floor: { drop: number; bounce: number; grip: number }; out: number;
  /** The dent a hit leaves (metres deep: lightest, hardest), and how wide. */
  dent: [number, number]; dentRadius: number;
  hitStop: [number, number];
  /** What each thing does to the crowd (0 to 1), and how fast they calm down again. */
  hype: { jab: number; ko: number; ropes: number; out: number; fade: number };
  /** What a knockout says, and in what colours. */
  words: string[]; wordColours: string[];
}
/** What a level makes of the letters: how they look, where they come from, what is done to them. */
export interface LetterTheme {
  id: string;
  /** 'ink': the Unity game's card as ink on washi (Kyoto). 'paint': painted in full colour by `paint` (levels/cards.ts). */
  face: 'ink' | 'paint';
  /** Paints the card's decoration, and for an email says where its words go (they are set by mail/layout.ts, the same in every level). */
  paint?: (g: CanvasRenderingContext2D, email: Email | null, hazard: boolean) => CardStyle | void;
  /** Its own shape (levels/shapes.ts); the curled paper sheet if none. */
  shape?: () => Float32Array;
  look: LetterLook;
  /** 'cut': the right hand's weapon cuts them. 'spray': the right hand's nozzle wets them until they melt. */
  mechanic: 'cut' | 'spray' | 'punch';
  /** A 'punch' level's numbers: what a hit does, and the ring the mail flies about in (levels/knockout.ts). */
  punch?: PunchFeel;
  /** The level's name on Kyoto's title letter, and its colour on the progress bar and the round's intro. */
  title: string;
  accent?: string;
  /** The progress bar's two colours, left to right: vivid, the level's own. From `accent` if not given. */
  bar?: [string, string];
  /**
   * Where a letter comes from: sets `from` and `via` (world space; `home` is where it will arrive,
   * and may be moved: something standing in the way) and says how big it starts (1 is full size) and
   * how it is turned: tumbling in, already facing the player, or lying flat; or exactly `turn`.
   */
  origin?(head: Vector3, home: Vector3, from: Vector3, via: Vector3): { scale: number; pose: 'tumble' | 'face' | 'flat'; turn?: Quaternion;
    /** How long it takes to arrive (tune.arriveSeconds if not given), how gently it slows (3 quick then slow, 2 a steady glide), and how much it rocks on the way (radians). */
    seconds?: number; ease?: number; sway?: number };
  /** Where the round's intro card goes, if something stands where it would be (as `dock.intro`), and the seconds between a round's last letter and what comes next (as `dock.pause`). */
  intro?: { up: number; nearer: number; size: number }; pause?: number;
  /** Is this one dangerous (the lab's radioactive mail)? It takes more, and glows. */
  hazard?(email: Email): boolean;
  /**
   * The letters are not in the air: each is shown on something that stands in the level (the second
   * office's monitor) until it is dealt with. `place` is asked every frame where that is (world
   * space) and returns the letter's size there (1: full size). A hit anywhere in the box that runs
   * `behind` metres back from the letter and `margin` metres past its edges counts: that is the
   * thing itself being hit. Cut, its pieces come `out` of it at so many m/s. `wait` is how long one
   * is shown before it goes by itself, and `intro` moves the round's intro card clear of the thing.
   */
  dock?: { place(position: Vector3, quaternion: Quaternion): number; behind: number; margin: number; out: number; wait?: number;
    /** Seconds between a round's last letter and what comes next. */
    pause?: number;
    intro?: { up: number; nearer: number; size: number } };
}
const KYOTO_LOOK: LetterLook = {
  sheet: '#f5ebd4', ink: '#1a1721', back: '#f5ebd4', selfLit: 0, night: '#e2dff8',
  hover: '#ffdae7', cutWide: '#ffc3dd', cutHot: '#fff6f9', mark: '#ffe7ae', flash: '#fff8e4', gold: '#ffecbf',
  burn: '#ffcee4', burnStyle: 0, streak: ['#ffdaec', '#ffffff'], thread: ['#ffddec', '#fff9fb'], aura: null,
};
export const KYOTO_LETTERS: LetterTheme = { id: 'kyoto', face: 'ink', look: KYOTO_LOOK, mechanic: 'cut', title: '', accent: '#f6b3cc', bar: ['#ff5fa2', '#ffc46b'] };

/** What the right hand points with in a 'spray' level: the nozzle, and how hard the trigger is held. */
export interface SprayTool { origin: Vector3; direction: Vector3; on: number; valid: boolean }

interface Sounds { play(name: string, pitch?: number, volume?: number, at?: Vector3): void; swing(strength: number, at?: Vector3): void; note?(at?: Vector3): void }
interface Fx { spray(from: Vector3, to: Vector3, push: Vector3, petals: number, sparks: number, paper?: boolean, scatter?: number): void }

/** A drawing of one email and the paper that shows it. A letter and all the pieces cut from it share one. */
interface Sheet {
  surface: Surface; material: ShaderMaterial;
  users: number; cuts: number; cutAt: number; burnAt: number; burn: number; reserved: boolean;
  /** Where the spray last landed on it (which of the three places is written next). */
  splats: number;
  /** A message too long for the card: the strip all of it is painted on (made when first needed), how far it has to scroll (card units; 0: it does not) and for how long it has been read. */
  strip?: Surface; scrollRange?: number; readFor?: number;
}
/** Something made of paper that is in the air: a whole letter, or a piece of one. */
interface Body {
  mesh: Mesh; sheet: Sheet; soup: Soup; whole: boolean;
  /** Where this piece's middle was on the whole letter (x, y in metres from its centre). */
  offset: [number, number];
  vel: Vector3; spin: Vector3; age: number; seed: number;
  mode: 'held' | 'cut' | 'kept' | 'sent' | 'show'; life: number;      // (show: the level's logo at the end of a game, floating until it is cut)
  /** The email it is (null: the title letter), which band of the progress bar is its, and in round two where it has been sent (0, 1 the replies, 2 the mic). */
  email: Email | null; mark: number; target: number;
  /** Its size (a held letter is smaller), and for a thrown one, how far it has gone towards being kept: -1 not yet, then 0 to 1. */
  size: number; going: number; from: Vector3;
  /** Sprayed: how much of what it takes it has had (1 and it melts), whether it is a radioactive one, and whether it is melting. */
  dose: number; hazard: boolean; melting: boolean;
  /** Hit by the mist: the froth is spreading over it by itself (dose climbs to 1, then it melts). */
  spreading: boolean;
  /** Punched (Knockout): how many hits it has taken. From the first it is no longer paper adrift: it flies about the ring. */
  knock: number;
}
interface Current {
  body: Body; email: Email | null; state: 'arriving' | 'waiting' | 'held' | 'passing';
  /** home is where it arrives, near where its slow approach ends, past where it goes if nobody deals with it. */
  t: number; from: Vector3; via: Vector3; home: Vector3; near: Vector3; past: Vector3; face: Quaternion; start: Quaternion;
  grip: Matrix4; grabbedAt: Vector3; heldFor: number;
  /** Since a sweep fast enough to throw began, or -1. */
  flick: number;
  /** How big it was when it set out (1: full size), and, on a monitor, whether the X key is spraying it. */
  startScale: number; forced: boolean;
  /** Taken hold of: how big it looked from the head at that moment (size over distance), and the size it is held at. */
  seen: number; holdSize: number;
  /** Round two, held: where the hand would have it (before it is drawn to a target), how far it is drawn to one (0 to 1), and which. */
  free: Vector3; docked: number; dockedAt: number;
  /** Its arrival: how long, how it slows, how much it rocks. */
  arriveSeconds: number; arriveEase: number; sway: number;
}

const rand = (spread: number) => (Math.random() - 0.5) * 2 * spread;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function geometryOf(soup: Soup) {
  const buffer = new InterleavedBuffer(soup.data, STRIDE);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new InterleavedBufferAttribute(buffer, 3, 0));
  geometry.setAttribute('normal', new InterleavedBufferAttribute(buffer, 3, 3));
  geometry.setAttribute('uv', new InterleavedBufferAttribute(buffer, 2, 6));
  return geometry;
}

function paperMaterial(washi: Texture, face: Texture, paint: boolean) {
  return new ShaderMaterial({
    side: paint ? DoubleSide : FrontSide,
    uniforms: {
      face: { value: face }, paperMap: { value: washi }, paint: { value: paint ? 1 : 0 },
      sheet: { value: new Color() }, inkColor: { value: new Color() }, backColor: { value: new Color() }, nightTint: { value: new Color() },
      hoverColor: { value: new Color() }, cutWide: { value: new Color() }, cutHot: { value: new Color() }, markColor: { value: new Color() },
      flashColor: { value: new Color() }, goldColor: { value: new Color() }, burnColor: { value: new Color() },
      selfLit: { value: 0 }, burnStyle: { value: 0 }, time: { value: 0 },
      night: { value: 0 }, hover: { value: 0 }, burn: { value: 0 }, gold: { value: 0 }, mark: { value: 0 }, flash: { value: 0 },
      wet: { value: 0 }, hazard: { value: 0 }, splats: { value: [new Vector3(), new Vector3(), new Vector3()] },
      cutout: { value: 0 }, span: { value: new Vector2(W, H) }, shine: { value: -1 },
      cuts: { value: [new Vector4(), new Vector4(), new Vector4()] }, heat: { value: new Vector3() },
      // punched (Knockout): where on the sheet (x, y), how wide, how deep. Every piece of the sheet keeps them.
      // (none: a Vector4 starts at w 1, which is a dent a metre deep at the middle. Things drawn with this that are
      // never reset, the end logo, the bar, the summary and the menu's cards, wore one as a dark wedge: fixed 2026-11-12)
      dents: { value: [new Vector4(0, 0, 0, 0), new Vector4(0, 0, 0, 0), new Vector4(0, 0, 0, 0)] },
      // a message that scrolls (mail/layout.ts): its strip (red: how much plain ink, green: bold), its window on the
      // face (uv: left, bottom, right, top; all 0: none), the two inks, and where it has got to (how far down the
      // strip the window's top is, how much of the strip's height the window shows, and of its width; then how much
      // of the strip is written on, all as parts of the strip)
      scrollMap: { value: washi }, scrollBox: { value: new Vector4(0, 0, 0, 0) }, scrollInk: { value: [new Color(), new Color()] }, scrollAt: { value: new Vector4(0, 1, 1, 1) },
    },
    vertexShader: /* glsl */ `
      uniform float burn,burnStyle,wet; uniform vec4 dents[3]; uniform vec2 span;
      varying vec2 vUv; varying vec3 vNormalW; varying vec3 vWorld; varying float vFront;
      void main(){
        vUv=uv;
        vFront=smoothstep(0.,.5,normal.z);          // the sheet's own front: the back is blank paper
        vec3 p=position;
        // punched: it gives where it was hit (by where on the sheet this corner is, so a piece cut from it keeps its dent)
        for(int i=0;i<3;i++){ vec2 rel=(uv-.5)*span-dents[i].xy; float r=max(dents[i].z,.001); p.z-=dents[i].w*exp(-dot(rel,rel)/(r*r)); }
        // soaked, it sags; melting, it runs: the lower it is on the sheet the further it drips
        float run=burnStyle>1.5&&burnStyle<2.5?burn:0.;
        float alight=step(2.5,burnStyle);          // (on fire, not soaked: it does not sag, it buckles in the heat and lifts)
        float drip=.5+.5*sin(position.x*57.+3.*sin(position.x*23.));
        p.y-=((.012*wet*(1.-alight))+run*run*(.05+.2*drip))*(1.-uv.y);
        p.z+=alight*(wet*.35+burn)*.016*sin(position.x*43.+position.y*29.+burn*6.);
        p.y+=alight*burn*.02;
        p.z-=run*.03*sin(position.x*31.)*(1.-uv.y);
        vec4 world=modelMatrix*vec4(p,1.);
        vWorld=world.xyz; vNormalW=mat3(modelMatrix)*normal;
        gl_Position=projectionMatrix*viewMatrix*world;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D face,paperMap,scrollMap; uniform vec4 scrollBox,scrollAt; uniform vec3 scrollInk[2]; uniform vec3 sheet,inkColor,backColor,nightTint,hoverColor,cutWide,cutHot,markColor,flashColor,goldColor,burnColor,heat;
      uniform float paint,selfLit,burnStyle,time,night,hover,burn,gold,mark,flash,wet,hazard,cutout,shine; uniform vec2 span; uniform vec4 cuts[3]; uniform vec4 dents[3]; uniform vec3 splats[3];
      varying vec2 vUv; varying vec3 vNormalW; varying vec3 vWorld; varying float vFront;
      float grain(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
        float a=fract(sin(dot(i,vec2(12.9898,78.233)))*43758.5453), b=fract(sin(dot(i+vec2(1.,0.),vec2(12.9898,78.233)))*43758.5453);
        float c=fract(sin(dot(i+vec2(0.,1.),vec2(12.9898,78.233)))*43758.5453), d=fract(sin(dot(i+vec2(1.,1.),vec2(12.9898,78.233)))*43758.5453);
        return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
      void main(){
        vec4 tex=texture2D(face,vUv); vec3 t=tex.rgb;
        {
          // a long message, moving through its window: faded out at the window's edge where there is more beyond it
          vec2 q=(vUv-scrollBox.xy)/max(scrollBox.zw-scrollBox.xy,vec2(1e-5)); float down=1.-q.y;
          vec4 words=texture2D(scrollMap,vec2(q.x*scrollAt.z,1.-(scrollAt.x+down*scrollAt.y)));
          float inside=step(0.,q.x)*step(q.x,1.)*step(0.,q.y)*step(q.y,1.)*step(1e-4,scrollBox.z);
          inside*=mix(1.,smoothstep(0.,.1,down),clamp(scrollAt.x*60.,0.,1.))*mix(1.,smoothstep(0.,.1,q.y),clamp((scrollAt.w-scrollAt.y-scrollAt.x)*60.,0.,1.));
          t=mix(t,scrollInk[0],words.r*inside); t=mix(t,scrollInk[1],words.g*inside);
        }
        // (a picture with see-through parts, the end-of-game logo: only where it is drawn is there anything)
        if(cutout>.5&&tex.a<.45) discard;
        vec2 rim=min(vUv,1.-vUv);
        float edge=min(rim.x,rim.y*1.6);
        // shaded a little by its curl, cooler and dimmer as the room's light goes
        vec3 n=normalize(vNormalW); if(dot(n,vWorld-cameraPosition)>0.) n=-n;
        float shade=.9+.1*clamp(dot(n,normalize(vec3(-.35,.5,.8))),0.,1.)+.06*n.y;
        vec3 dim=mix(vec3(1.),nightTint,night);
        vec3 c;
        if(paint>.5){
          // Painted in full colour (levels/cards.ts): the face as drawn, the back and edges plain.
          // A screen (selfLit) is not shaded by the room, and flickers a little.
          float front=gl_FrontFacing?vFront:0.;       // (seen from inside, through a cut: bare)
          vec3 lit=mix(vec3(shade)*dim,vec3(1.),selfLit);
          c=mix(backColor*shade*dim,t*lit,front);
          c*=1.+selfLit*front*(.025*sin(time*40.)+.05*sin(vUv.y*9.-time*2.3))*(1.-cutout);
          // a glint across it now and then, as on a title screen
          c+=vec3(1.)*exp(-pow((vUv.x+vUv.y*.35-shine)*12.,2.))*.55*front*step(-.5,shine);
        } else {
          // The email is drawn as light writing on dark glass (the Unity game's cards); here the
          // brighter the drawing, the darker the ink. Coloured labels keep a trace of their hue.
          float bright=max(t.r,max(t.g,t.b)), dull=min(t.r,min(t.g,t.b));
          float ink=smoothstep(.2,.62,bright);
          ink*=smoothstep(.018,.04,edge)*vFront;
          vec3 inkColour=mix(inkColor,t*.42,clamp((bright-dull)*1.6,0.,1.)*.85);
          c=sheet*texture2D(paperMap,vUv).rgb/.94*shade*dim;
          c=mix(c,inkColour,ink);
        }
        vec2 at=(vUv-.5)*span;
        // Sprayed: froth gathers where the mist lands and spreads as the sheet soaks.
        if(wet>0.){
          float foam=0.;
          for(int i=0;i<3;i++){ vec2 rel=at-splats[i].xy; foam+=splats[i].z*exp(-dot(rel,rel)/(.003+.035*wet)); }
          if(burnStyle>2.5){
            // Alight (Inferno): the fire spreads from where the jet touched. Ahead of it the paper browns;
            // its front is bright; behind it the sheet is char, with embers crawling in it.
            float crawl=grain(vUv*vec2(13.,8.)+vec2(0.,-time*.5))*.65+grain(vUv*vec2(42.,26.)+vec2(time*.3,-time*.9))*.35;
            float reach=min(1.,foam)*(.55+.6*wet)+wet*.8-crawl*.42;
            float charred=smoothstep(.36,.52,reach);
            float front=smoothstep(.2,.36,reach)*(1.-smoothstep(.36,.56,reach));
            float veins=smoothstep(.55,.85,grain(vUv*vec2(20.,13.)+vec2(0.,time*.7))*.7+grain(vUv*vec2(64.,40.))*.3)*(.6+.4*sin(time*7.+vUv.x*23.+vUv.y*17.));
            c=mix(c,c*vec3(.72,.5,.32),smoothstep(0.,.3,reach)*.85);
            c=mix(c,mix(vec3(.07,.04,.03),vec3(.2,.08,.035),crawl)+vec3(1.,.2,.02)*veins*.5,charred*.95);
            c+=mix(vec3(1.,.38,.04),vec3(1.,.92,.55),front)*front*2.;
          } else {
          float bubbles=grain(vUv*vec2(64.,40.)+vec2(0.,time*.5))*.6+grain(vUv*vec2(150.,94.)-vec2(0.,time*.8))*.4;
          float cover=smoothstep(.3,.8,min(1.,foam)*(.55+.6*wet)+wet*.75-bubbles*.6);
          vec3 froth=mix(vec3(.45,.95,.55),vec3(.92,1.,.94),smoothstep(.35,.75,bubbles));
          c=mix(c,froth,cover*.9);
          }
        }
        // Radioactive: it glows from its edges, beating.
        vec3 hazardEdge=burnStyle>2.5?vec3(1.,.36,.05):vec3(.45,1.,.15), hazardFill=burnStyle>2.5?vec3(.42,.12,.02):vec3(.16,.4,.04);      // (Inferno's smoulders; the lab's is radioactive)
        c+=(hazardEdge*(1.-smoothstep(0.,.2,edge))*(.55+.45*sin(time*5.))*.9+hazardFill*.2)*hazard*(1.-wet*.6)*(burnStyle>2.5?.55:1.);      // (Inferno's toned down: "reduce a bit of the glow / fire around emails", 2026-11-13)
        // A hand close enough to take it warms its edge.
        c+=hoverColor*(1.-smoothstep(0.,.08,edge))*hover*.45;
        // Where the blade went through, it glows and cools.
        for(int i=0;i<3;i++){
          vec2 rel=at-cuts[i].xy; float off=abs(rel.x*cuts[i].w-rel.y*cuts[i].z);
          c+=(cutWide*exp(-off*off/.00007)+cutHot*exp(-off*off/.000006))*heat[i]*1.5;
        }
        // Where it was punched: the crater's far wall catches the light and its near one is in shadow, and creases run out from it.
        for(int i=0;i<3;i++){
          vec2 rel=at-dents[i].xy; float r=max(dents[i].z,.001), g=exp(-dot(rel,rel)/(r*r));
          float crease=.5+.5*sin(atan(rel.y,rel.x)*7.+dents[i].x*90.);
          c*=1.-dents[i].w*(4.5*g*(.5+.5*crease*smoothstep(0.,1.,length(rel)/r))+7.*dot(rel,vec2(-.6,.8))/r*g);
        }
        // Thrown to be kept, it is marked as mattering: a flash as it leaves the hand, and an
        // edge that beats while it is in the air; kept, it turns to light as it goes.
        c+=markColor*(1.-smoothstep(0.,.11,edge))*mark;
        c=mix(c,flashColor*1.7,flash*.85);
        c=mix(c,goldColor*1.25,gold*.8);
        // And one that has been dealt with goes: paper burns away from nothing in particular,
        // a screen breaks up into blocks, a soaked sheet melts from the top and runs.
        if(burn>0.){
          float left;
          if(burnStyle<.5) left=grain(vUv*vec2(26.,16.))*.75+grain(vUv*vec2(70.,44.))*.25;
          else if(burnStyle<1.5){ vec2 cell=floor(vUv*vec2(32.,20.)); left=fract(sin(dot(cell,vec2(12.9898,78.233)))*43758.5453)*.86+.07+.07*sin(time*30.+cell.y); }
          else if(burnStyle<2.5) left=clamp((1.-vUv.y)*.5+grain(vUv*vec2(24.,2.5))*.38+grain(vUv*vec2(70.,44.))*.12,0.,.999);
          else left=clamp(length(at-splats[0].xy)*1.75+grain(vUv*vec2(11.,7.))*.2+grain(vUv*vec2(38.,24.))*.07,0.,.999);      // (burnt through from where the flame touched)
          if(left<burn) discard;
          if(burnStyle>2.5) c=mix(c,vec3(.06,.03,.02),1.-smoothstep(burn+.07,burn+.22,left));      // (char ahead of the glowing edge)
          c=mix(c,burnColor*1.5,1.-smoothstep(burn,burn+.09,left));
        }
        gl_FragColor=vec4(c,1.);
        #include <colorspace_fragment>
      }`,
  });
}

/**
 * The glow round a whole letter in the levels that have one: a soft light that falls away smoothly
 * from its edge (no hard rim: the user found one harsh, 2026-11-11), reaching a little further
 * above it than below, and stirred by slow rising noise (how much is the level's `spell.wisps`).
 * `spell.glow` sets how strong it is.
 */
function auraMaterial() {
  return new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
    uniforms: { a: { value: new Color() }, b: { value: new Color() }, time: { value: 0 }, level: { value: 0 }, wisps: { value: 0.5 }, strength: { value: 1 } },
    vertexShader: 'varying vec2 at; void main(){ at=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: /* glsl */ `
      uniform vec3 a,b; uniform float time,level,wisps,strength; varying vec2 at;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y); }
      float fbm(vec2 p){ return .5*noise(p)+.3*noise(p*2.1+3.7)+.2*noise(p*4.3+9.1); }
      void main(){
        // how far outside the letter's own rectangle this is, in metres (inside it is hidden by the letter)
        vec2 q=abs(at)-vec2(${W / 2},${H / 2});
        float d=max(0.,length(max(q,0.))+min(max(q.x,q.y),0.));
        // it reaches further above the letter than below, as light and heat rise
        float up=smoothstep(-${H / 2},${H / 2}+.06,at.y);
        float dd=d/mix(.75,1.35,up);
        // a smooth fall-off: a gentle core and a long soft tail, nothing crisp anywhere
        float glow=exp(-dd*dd/.0028)*.6+exp(-dd/.06)*.25;
        // stirred by slow noise drifting upwards: brighter and dimmer patches, never lines
        vec2 flow=at*vec2(5.,4.)+vec2(0.,-time*.55);
        flow+=.6*vec2(fbm(at*3.5+vec2(time*.18,0.)),fbm(at*3.5+vec2(5.2,-time*.15)));
        float n=fbm(flow);
        glow*=mix(1.,.35+1.3*n,wisps);
        glow*=.88+.12*sin(time*2.3);
        // faded out well before the edges of the quad it is drawn on
        float room=min(${(W * 1.05).toFixed(4)}-abs(at.x),min(${(H * 1.68).toFixed(4)}-at.y,at.y+${(H * 1.32).toFixed(4)}));
        glow*=smoothstep(0.,.12,room);
        float hue=smoothstep(.3,.7,fbm(at*3.+vec2(0.,-time*.3)));
        gl_FragColor=vec4(mix(a,b,hue)*glow*strength*level,1.);
        #include <colorspace_fragment>
      }`,
  });
}

/** Motes of light that go round a letter's edge, each at its own pace: the spell on it. */
function sparkleMaterial() {
  return new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { a: { value: new Color() }, b: { value: new Color() }, time: { value: 0 }, pixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec2 seed; uniform float time,pixelRatio; varying float fade; varying float which;
      void main(){
        // where along the letter's edge it is: once round is 2(W+H)
        float s=fract(seed.x+time*(.045+.075*seed.y))*${2 * (W + H)};
        vec2 c=s<${W}?vec2(-${W / 2}+s,${H / 2}):s<${W + H}?vec2(${W / 2},${H / 2}-(s-${W})):s<${2 * W + H}?vec2(${W / 2}-(s-${W + H}),-${H / 2}):vec2(-${W / 2},-${H / 2}+(s-${2 * W + H}));
        c*=1.07+.11*sin(time*(1.3+seed.y)+seed.x*40.);
        vec3 p=vec3(c.x,c.y+.02*sin(time*3.+seed.y*17.),.025+.035*sin(time*2.1+seed.x*23.));
        vec4 mv=modelViewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*mv;
        float twinkle=.5+.5*sin(time*(4.+6.*seed.y)+seed.x*60.);
        gl_PointSize=clamp((4.+7.*seed.y)*(.45+.55*twinkle)*pixelRatio/-mv.z,1.,12.*pixelRatio);
        fade=(.3+.7*twinkle)*.75; which=seed.y;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 a,b; varying float fade; varying float which;
      void main(){
        float r=length(gl_PointCoord-.5)*2.;
        float glow=exp(-r*r*5.)*(1.-smoothstep(.7,1.,r))*.55+exp(-r*r*40.);
        gl_FragColor=vec4(mix(mix(a,b,step(.5,which)),vec3(1.),exp(-r*r*30.)*.7)*glow*fade,1.);
        #include <colorspace_fragment>
      }`,
  });
}

export async function createLetters(world: World, sounds: Sounds, fx: Fx) {
  const [model, washi] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}mail/letter.json`).then(r => r.json() as Promise<{ position: number[]; normal: number[]; uv: number[]; index: number[] }>),
    new TextureLoader().loadAsync(`${import.meta.env.BASE_URL}mail/washi.webp`),
  ]);
  washi.colorSpace = SRGBColorSpace;
  // The whole letter as a soup of triangles (cut.ts), which is what gets cut.
  const whole = new Float32Array(model.index.length * STRIDE);
  model.index.forEach((v, i) => {
    whole.set(model.position.slice(v * 3, v * 3 + 3), i * STRIDE);
    whole.set(model.normal.slice(v * 3, v * 3 + 3), i * STRIDE + 3);
    whole.set(model.uv.slice(v * 2, v * 2 + 2), i * STRIDE + 6);
  });
  // The paper sheet is every level's letter unless the level brings a shape of its own.
  const paperSoup = measure(whole);
  const shapes = new Map<string, { soup: Soup; geometry: BufferGeometry }>([['paper', { soup: paperSoup, geometry: geometryOf(paperSoup) }]]);
  let wholeSoup = paperSoup, wholeGeometry = shapes.get('paper')!.geometry;
  let theme: LetterTheme = KYOTO_LETTERS, active = true;
  const events: { on: ((kind: 'arrive' | 'cut' | 'melt' | 'punch' | 'ko' | 'ropes' | 'out' | 'thrown' | 'kept' | 'missed' | 'home' | 'pick' | 'start' | 'exit', at: Vector3, id?: string) => void) | null } = { on: null };      // (home: the game is over, back to the home screen)

  const root = new Object3D(); root.name = 'Letters';
  world.createTransformEntity(root);
  const painter = new Painter();
  // Two sets of sheets: ink ones carry the Unity card's numbers for the ink shader, painted ones a picture.
  const makeSheets = (paint: boolean): Sheet[] => Array.from({ length: SHEETS }, () => {
    const surface = makeSurface(1024, 640, paint ? { scale: 1.5, ink: false, premultiplied: false } : { scale: 1.5, ink: true });
    return { surface, material: paperMaterial(washi, surface.texture!, paint), users: 0, cuts: 0, cutAt: Infinity, burnAt: Infinity, burn: 0, reserved: false, splats: 0 };
  });
  const sheetSets: { ink: Sheet[]; paint: Sheet[] | null } = { ink: makeSheets(false), paint: null };
  let sheets = sheetSets.ink;
  // The glow round a whole letter, in the levels that have one.
  const aura = auraMaterial(), auraGeometry = new PlaneGeometry(W * 2.1, H * 3).translate(0, H * 0.18, -0.014);
  // ...and the motes of light that go round its edge, in the levels with a spell on their mail
  const SPARKLES = 40, sparkle = sparkleMaterial(), sparkleGeometry = new BufferGeometry();
  { const seeds = new Float32Array(SPARKLES * 2); for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    sparkleGeometry.setAttribute('position', new InterleavedBufferAttribute(new InterleavedBuffer(new Float32Array(SPARKLES * 3), 3), 3, 0));
    sparkleGeometry.setAttribute('seed', new InterleavedBufferAttribute(new InterleavedBuffer(seeds, 2), 2, 0)); }

  // The slash itself: a streak of light along the cut, gone in a moment.
  const streakGeometry = new PlaneGeometry(1, 1);
  const streaks = Array.from({ length: STREAKS }, () => {
    const material = new ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending, side: DoubleSide, uniforms: { fade: { value: 0 }, wide: { value: new Color() }, hot: { value: new Color() } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: /* glsl */ `
        uniform float fade; uniform vec3 wide,hot; varying vec2 vUv;
        void main(){
          float across=(vUv.y-.5)*2., along=abs(vUv.x-.5)*2.;
          float taper=(1.-along)*(1.-along*along);
          float a=(exp(-across*across*14.)*.55+exp(-across*across*160.))*taper*fade;
          gl_FragColor=vec4(mix(wide,hot,exp(-across*across*120.)),a);
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new Mesh(streakGeometry, material); mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 5; root.add(mesh);
    return { mesh, material, age: 1, size: 1 };
  });
  let nextStreak = 0;
  // The reach, shown: a thread of light from the left hand to the letter it has found, or is drawing in.
  const threadGeometry = new CylinderGeometry(1, 1, 1, 5, 1, true).translate(0, 0.5, 0);
  const threadMaterial = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, uniforms: { fade: { value: 0 }, near: { value: new Color() }, far: { value: new Color() } },
    vertexShader: 'varying float along; void main(){ along=position.y; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: /* glsl */ `
      uniform float fade; uniform vec3 near,far; varying float along;
      void main(){
        // faint at the hand, brightest where it meets the paper
        gl_FragColor=vec4(mix(near,far,along),fade*(.12+.88*along*along));
        #include <colorspace_fragment>
      }`,
  });
  const thread = new Mesh(threadGeometry, threadMaterial); thread.visible = false; thread.frustumCulled = false; thread.renderOrder = 4; root.add(thread);
  const up = new Vector3(0, 1, 0);
  let threadFade = 0;

  const loose: Body[] = [];
  let current: Current | null = null;
  let prepared: Sheet | null = null;
  let order: Email[] = [], nextIn = 0.8, clock = 0, hitStop = 0;
  // The rounds. It begins on the title letter; dealing with that starts round one's intro. Round one
  // is tune.roundEmails emails to cut or keep; round two brings the kept ones back to be answered.
  const ui = createRoundUi(world);
  const game = { phase: 'ready' as 'ready' | 'intro' | 'play' | 'summary' | 'menu', round: 1, timer: 0, beat: -1, total: 0, dealt: 0,
    deck: [] as Email[], kept: [] as Email[], marks: [] as string[], cutInRoundOne: 0, left: 0, tally: { cut: 0, replied: 0, tomorrow: 0 }, dayTotal: 0, dayDeck: [] as Email[],
    /** Round two, for the letter of the moment: picking a reply, recording one, or keeping or redoing what was recorded. */
    stage: 'pick' as 'pick' | 'recording' | 'choose', recording: false, heardFor: 0, heard: '',
    /** Which target it is being held at (-1: none), for how long, and on a monitor which one a key is holding it at. */
    aim: -1, aimFor: 0, keyAim: -1 };
  const seat = new Vector3();
  const counts = { cut: 0, thrown: 0, kept: 0, missed: 0, pieces: 0 };

  // ---------------------------------------------------------------- drawing

  function freeSheet(): Sheet | null {
    const sheet = sheets.find(s => s.users === 0 && !s.reserved);
    if (!sheet) return null;
    const u = sheet.material.uniforms;
    u.hover.value = 0; u.burn.value = 0; u.gold.value = 0; u.mark.value = 0; u.flash.value = 0; (u.heat.value as Vector3).set(0, 0, 0);
    (u.scrollBox.value as Vector4).set(0, 0, 0, 0); sheet.scrollRange = 0;
    u.wet.value = 0; u.hazard.value = 0; for (const dent of u.dents.value as Vector4[]) dent.set(0, 0, 0, 0); for (const splat of u.splats.value as Vector3[]) splat.set(0, 0, 0);
    sheet.splats = 0; sheet.cuts = 0; sheet.cutAt = Infinity; sheet.burnAt = Infinity; sheet.burn = 0;
    return sheet;
  }
  /**
   * A message too long for its card (mail/layout.ts): all of it goes on the sheet's strip, and the
   * shader shows a window of that on the face. None: the window is shut.
   */
  const STRIP_WIDE = 920, inkOf = new Color();
  function setScroll(sheet: Sheet, scroll: Scroll | null) {
    const u = sheet.material.uniforms;
    sheet.scrollRange = 0; sheet.readFor = 0;
    if (!scroll) { (u.scrollBox.value as Vector4).set(0, 0, 0, 0); return; }
    if (!sheet.strip) {
      sheet.strip = makeSurface(STRIP_WIDE, STRIP_TALL, { scale: 1.5, ink: true });      // (ink: as written, no colour conversion; it is amounts of ink, not a picture)
      u.scrollMap.value = sheet.strip.texture;
    }
    const strip = sheet.strip, g = strip.g, face = sheet.surface;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = '#000'; g.fillRect(0, 0, strip.canvas.width, strip.canvas.height);
    g.setTransform(strip.scale, 0, 0, strip.scale, 0, 0);
    scroll.paint(g);
    g.setTransform(1, 0, 0, 1, 0, 0);
    strip.texture!.needsUpdate = true;
    (u.scrollBox.value as Vector4).set(scroll.x / face.width, 1 - (scroll.y + scroll.h) / face.height, (scroll.x + scroll.w) / face.width, 1 - scroll.y / face.height);
    (u.scrollAt.value as Vector4).set(0, scroll.h / STRIP_TALL, scroll.w / STRIP_WIDE, scroll.tall / STRIP_TALL);
    // the inks as the face has them: a painted face is a picture (sRGB), Kyoto's is the ink shader's own numbers
    const inks = u.scrollInk.value as Color[], space = theme.face === 'paint' ? SRGBColorSpace : LinearSRGBColorSpace;
    scroll.inks.forEach((ink, i) => inks[i].copy(inkOf.setStyle(ink, space)));
    sheet.scrollRange = Math.max(0, scroll.tall - scroll.h);
  }
  /**
   * A long message read while its letter is up: it waits, goes down slowly to its end, waits, comes
   * back up quicker, and again. (2026-11-13: "scroll the body a bit slowly so they can read / scan
   * the entire one".)
   */
  const READ = { wait: 1.6, speed: 26, back: 150, rest: 1.8 };      // seconds before it moves; card units a second down, and back up; seconds at the foot
  function read(sheet: Sheet, dt: number) {
    const range = sheet.scrollRange ?? 0;
    if (range <= 0) return;
    sheet.readFor = (sheet.readFor ?? 0) + dt;
    const down = range / READ.speed, up = range / READ.back, t = sheet.readFor % (READ.wait + down + READ.rest + up);
    const smooth = (x: number) => x * x * (3 - 2 * x);
    const at = t < READ.wait ? 0 : t < READ.wait + down ? (t - READ.wait) / down : t < READ.wait + down + READ.rest ? 1 : 1 - smooth((t - READ.wait - down - READ.rest) / up);
    (sheet.material.uniforms.scrollAt.value as Vector4).x = at * range / STRIP_TALL;
  }
  /** A painted level's face (levels/cards.ts): its decoration straight onto the sheet's canvas, then the words, set as in every level. */
  function paintFace(sheet: Sheet, email: Email | null, hazard: boolean, still = false) {
    const s = sheet.surface, g = s.g;
    g.setTransform(s.scale, 0, 0, s.scale, 0, 0); g.globalAlpha = 1; g.clearRect(0, 0, s.width, s.height);
    const style = theme.paint!(g, email, hazard);
    setScroll(sheet, email && style ? layoutEmail(g, email, style, !still) : null);
    g.setTransform(1, 0, 0, 1, 0, 0);
    s.texture!.needsUpdate = true;
  }
  /** `still`: a card nobody will read (the day's mail, swirling at the end): a long message is cut short, not scrolled. */
  function drawEmail(sheet: Sheet, email: Email, still = false) {
    if (theme.paint) { paintFace(sheet, email, !!theme.hazard?.(email), still); return; }
    setScroll(sheet, emailCard(painter, sheet.surface, email, !still));
  }
  // Real mail's replies come in while the game goes on: if the email is up in round two, its bubbles change from WRITING to them.
  mail.onReplies = email => { if (game.phase === 'play' && game.round === 2 && current?.email === email && game.stage === 'pick') ui.replies(email.replies[0], email.replies[1]); };
  function shuffled(): Email[] {
    order = mail.demoEmails();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    return order;
  }
  const nextEmail = (): Email => game.deck[game.dealt++];
  /** Is there another email to come in this round? */
  const more = () => game.phase === 'play' && game.dealt < game.total;
  let preparedEmail: Email | null = null;
  /** Draw the next letter while nothing is happening, so its cost never lands on a cut. */
  function prepare() {
    if (prepared || !more()) return;
    const sheet = freeSheet();
    if (!sheet) return;
    preparedEmail = nextEmail();
    drawEmail(sheet, preparedEmail);
    sheet.reserved = true; prepared = sheet;
  }

  // ---------------------------------------------------------------- bodies

  const v1 = new Vector3(), v2 = new Vector3(), v3 = new Vector3(), v4 = new Vector3(), q1 = new Quaternion(), m1 = new Matrix4(), look = new Object3D();
  function add(sheet: Sheet, soup: Soup, wholeLetter: boolean): Body {
    const mesh = new Mesh(wholeLetter ? wholeGeometry : geometryOf(soup), sheet.material);
    mesh.frustumCulled = false; root.add(mesh);
    sheet.users++;
    return { mesh, sheet, soup, whole: wholeLetter, offset: [0, 0], vel: new Vector3(), spin: new Vector3(), age: 0, seed: Math.random() * 6.283, mode: 'held', life: 0, size: 1, going: -1, from: new Vector3(), dose: 0, hazard: false, melting: false, spreading: false, email: null, mark: -1, target: -1, knock: 0 };
  }
  function remove(body: Body) {
    root.remove(body.mesh);
    if (!body.whole) body.mesh.geometry.dispose();
    body.sheet.users--;
    const at = loose.indexOf(body); if (at >= 0) loose.splice(at, 1);
  }

  function spawn(head: Vector3) {
    let sheet = prepared, email = preparedEmail;
    if (sheet) { sheet.reserved = false; prepared = null; preparedEmail = null; }
    else {
      sheet = freeSheet();
      if (!sheet) return false;             // every sheet is still in the air: wait a moment
      email = nextEmail(); drawEmail(sheet, email);
    }
    const body = add(sheet, wholeSoup, true);
    const home = new Vector3(head.x * 0.7, head.y - tune.focusDrop, head.z - tune.focus);
    const near = new Vector3(head.x * 0.7, head.y - tune.nearDrop, head.z - tune.near);
    // past the left shoulder more often than the right, where the sword is
    const past = new Vector3(head.x + (Math.random() < 0.7 ? -0.42 : 0.42), head.y + 0.02, head.z + 0.9);
    // (they come from the centre, straight down the middle of the view: asked for on 2026-11-11)
    const from = new Vector3(home.x, home.y + 0.8 + Math.random() * 0.5, home.z - 7.5);
    const via = new Vector3(home.x, home.y + 0.5, home.z - 2.4);
    // (a level may have its letters come from somewhere of its own: out of a screen, off a table)
    const begin: ReturnType<NonNullable<LetterTheme['origin']>> = theme.origin ? theme.origin(head, home, from, via) : { scale: 1, pose: 'tumble' };
    // Waiting, it faces whoever is reading it.
    look.position.copy(home); look.up.set(0, 1, 0); look.lookAt(head.x, head.y - 0.04, head.z);
    const face = look.quaternion.clone();
    const start = begin.turn ? begin.turn.clone() : begin.pose === 'tumble' ? face.clone().multiply(q1.setFromAxisAngle(v1.set(rand(1), rand(1), rand(1)).normalize(), 0.9 + Math.random() * 0.8))
      : begin.pose === 'flat' ? face.clone().multiply(q1.setFromAxisAngle(v1.set(1, 0, 0), -1.25)).multiply(new Quaternion().setFromAxisAngle(v2.set(0, 0, 1), rand(0.5)))
      : face.clone().multiply(q1.setFromAxisAngle(v1.set(rand(0.3), 1, rand(0.3)).normalize(), rand(0.45)));
    const dock = theme.dock;
    if (dock) { body.size = dock.place(home, face); from.copy(home); via.copy(home); near.copy(home); start.copy(face); }
    body.mesh.position.copy(from); body.mesh.quaternion.copy(start); body.mesh.scale.setScalar(dock ? 0.001 : begin.scale);
    body.hazard = !!(email && theme.hazard?.(email)); sheet.material.uniforms.hazard.value = body.hazard ? 1 : 0;
    body.email = email;
    if (email && game.round === 1) mail.arrived(email);
    if (email && game.round === 2) { game.stage = 'pick'; game.recording = false; game.aim = -1; game.keyAim = -1; mail.want(email); ui.replies(email.replies[0], email.replies[1]); }
    if (theme.look.aura && (!theme.hazard || body.hazard)) {
      const glow = new Mesh(auraGeometry, aura); glow.name = 'aura'; glow.frustumCulled = false; glow.renderOrder = 2; body.mesh.add(glow);
      if (theme.look.spell && theme.look.spell.sparkles > 0) { const motes = new Points(sparkleGeometry, sparkle); motes.name = 'spell'; motes.frustumCulled = false; motes.renderOrder = 3; body.mesh.add(motes); }
    }
    current = { body, email, state: 'arriving', t: 0, from, via, home, near, past, face, start, grip: new Matrix4(), grabbedAt: new Vector3(), heldFor: 0, flick: -1, startScale: begin.scale, forced: false, seen: 1, holdSize: 1, free: new Vector3(), docked: 0, dockedAt: -1,
      arriveSeconds: dock ? 0.34 : begin.seconds ?? tune.arriveSeconds, arriveEase: begin.ease ?? 3, sway: begin.sway ?? 0 };
    sounds.play('arrive', 0.92 + Math.random() * 0.16, 0.5, from);
    events.on?.('arrive', from);
    return true;
  }

  /** The thing this body is being shown on (theme.dock), if it is the letter of the moment and nobody has taken it off. */
  const docked = (body: Body) => (current && current.body === body && current.state !== 'held' ? theme.dock : undefined);
  /** Let a body go: from here on it is paper in the air. */
  function release(body: Body, mode: Body['mode'], life: number) {
    body.mode = mode; body.age = 0; body.life = life; loose.push(body);
  }

  // ---------------------------------------------------------------- the end of a game

  /**
   * When the day's mail is done the level fades darker and its own logo comes in, big, with a burst in
   * the level's colours, a rising chime, a glow behind it and a glint across it now and then; and it can
   * be cut up (or in the lab, sprayed away) like any letter (asked for on 2026-11-11). It is a flat slab
   * the logo's shape, painted with the logo and see-through where the picture is.
   */
  const LOGO_FILE: Record<string, string> = { lumber: 'lumber', knockout: 'knockout', kyoto: 'kyoto', office: 'office', office2: 'office', castle: 'castle', lab: 'lab', space: 'space', inferno: 'inferno' };
  const LOGO_WIDTH = 0.66;      // (a bit smaller since 2026-11-12; smaller again as it came nearer, so it looks a little bigger than it did)
  // The end, tried as pure hitting (2026-11-12: "try end with no grab, but its same position now, but make the weapon hit
  // even if its further way, so its just hitting and slashing a fun mayhem"): nothing there can be taken hold of, and
  // a swing reaches the logo, bar and line from much further off. (The grab and its thread are kept, off.)
  const END_GRAB = false;
  /** The progress bar and the CLEARED line at the end, as things to cut too: off since 2026-11-12, "drop the end subtitle and progress bar, just logo" (the bar swells and floats away instead). */
  const END_PARTS = false;
  /** How far past the weapon's tip a swing reaches the end's pieces, how much wider it gets per metre out, and how fast the tip must move. */
  const END_REACH = { metres: 2.6, widen: 0.4, speed: 1.2 };
  const GRAB_LOOKS = 1.2;      // the end's pieces, held: how much bigger they look than where they floated, at most
  const END_DARKEN_SECONDS = 20;      // the end of a game: how long the level takes to go dark behind the logo
  const LOGO_DISTANCE = 0.95;   // how far in front of the seat it floats (2026-11-12: "make the logo a closer, it feels far away to smash"; it was 1.45 m. Then 1.0, then 1.2: "a bit further from the player", then 0.95: "make end logo and parts closer to player")
  const LOGO_SPREAD = LOGO_DISTANCE / 1.0;      // the bar above it and the line below it, spaced to stay at the same angles as at 1 m
  const SMASHED_TO_HOME = 2.5;  // seconds after the logo is smashed before the game fades out to the home screen (2026-11-12)
  // hits it takes: the last of them breaks it up. A boss to beat (2026-11-12: "many more cuts to beat, more like a boss
  // battle"): 12 for the logo and 8 for the bar and the line, then "make less hits for ending": 7 and 5, then "a bit less hits": 5 and 4. They were 4 and 3.
  const LOGO_HITS = 5;
  const STRIP_HITS = 4;         // (the progress bar and the line under the logo, the same way: 2026-11-12, "also need a few cuts to be done, so its more fun")
  /** Each hit before the last chips off this much of what is left, so a third of it is left for the last: smaller chips the more hits it takes. */
  const chipFor = (hits: number) => 1 - Math.pow(0.35, 1 / Math.max(1, hits - 1));
  const LOGO_RECOVER = 0.45;    // seconds after a hit before it can be hit again (one swing, one hit)
  const logoSheets = new Map<string, Promise<Sheet>>();
  function logoSheet(file: string) {
    let made = logoSheets.get(file);
    if (!made) {
      made = new Promise<Sheet>((done, fail) => {
        const image = new Image(); image.decoding = 'async';
        image.onload = () => {
          const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = Math.round(2048 * image.naturalHeight / image.naturalWidth);
          const g = canvas.getContext('2d')!; g.drawImage(image, 0, 0, canvas.width, canvas.height);
          done(canvasSheet(canvas));
        };
        image.onerror = () => { logoSheets.delete(file); fail(new Error(`no logo for ${file}`)); };
        image.src = `${import.meta.env.BASE_URL}logos/${file}.webp`;
      });
      logoSheets.set(file, made);
    }
    return made;
  }
  /** A sheet for a picture with see-through parts (the logo, the end's cards): only where it is drawn is there anything to cut. */
  function canvasSheet(canvas: HTMLCanvasElement): Sheet {
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = world.renderer.capabilities.getMaxAnisotropy();
    const material = paperMaterial(washi, texture, true); material.uniforms.cutout.value = 1;
    const surface: Surface = { canvas, g: canvas.getContext('2d')!, width: canvas.width, height: canvas.height, scale: 1, ink: false, texture };
    return { surface, material, users: 0, cuts: 0, cutAt: Infinity, burnAt: Infinity, burn: 0, reserved: false, splats: 0 };
  }
  /** A flat slab w by h (a face and a back), in a grid of quads so it cuts cleanly; uv across the whole of it. */
  function slabSoup(w: number, h: number): Float32Array {
    const out: number[] = [], columns = 16, rows = 4, f = 0.006, b = -0.006;
    const put = (p: number[], n: number[]) => out.push(p[0], p[1], p[2], n[0], n[1], n[2], p[0] / w + 0.5, p[1] / h + 0.5);
    const quad = (a: number[], c1: number[], c2: number[], d: number[], n: number[]) => { for (const p of [a, c1, c2, a, c2, d]) put(p, n); };
    for (let i = 0; i < columns; i++) for (let j = 0; j < rows; j++) {
      const x0 = -w / 2 + w * i / columns, x1 = -w / 2 + w * (i + 1) / columns, y0 = -h / 2 + h * j / rows, y1 = -h / 2 + h * (j + 1) / rows;
      quad([x0, y0, f], [x1, y0, f], [x1, y1, f], [x0, y1, f], [0, 0, 1]);
    }
    const X0 = -w / 2, X1 = w / 2, Y0 = -h / 2, Y1 = h / 2;
    // the back, the logo's shape too; no edges (they would smear the picture's border along them)
    quad([X1, Y0, b], [X0, Y0, b], [X0, Y1, b], [X1, Y1, b], [0, 0, -1]);
    return new Float32Array(out);
  }
  /** A soft light behind the logo in the level's two colours, breathing. */
  const logoGlow = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
    uniforms: { a: { value: new Color() }, b: { value: new Color() }, strength: { value: 0 }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: /* glsl */ `
      uniform vec3 a,b; uniform float strength,time; varying vec2 vUv;
      void main(){
        vec2 p=(vUv-.5)*2.; float d=length(p*vec2(1.,1.15));
        // soft all the way to nothing well inside its plane
        float g=(exp(-d*d*4.)*(.8+.2*sin(time*2.2))+exp(-d*d*12.)*.3)*(1.-smoothstep(.55,.95,d));
        gl_FragColor=vec4(mix(a,b,vUv.x)*g*strength,1.);
        #include <colorspace_fragment>
      }`,
  });
  /**
   * What is out to be cut at the end: the logo, the line under it (CLEARED 10 EMAILS) and the progress
   * bar, full (the line and the bar handed over from roundui.ts, the same pictures in the same places).
   * Each floats until it is cut (or melted), then it is gone.
   */
  interface Show {
    body: Body; sheet: Sheet; kind: 'logo' | 'line' | 'bar' | 'card' | 'start' | 'exit' | 'mail' | 'bonus'; home: Vector3; face: Quaternion; gone: number; id?: string; delay?: number;
    /** The end (2026-11-11, "more chaotic"): where it is anchored now (it glides to home), whether the hand has it, or it was thrown and flies free. */
    anchor: Vector3; held: boolean; free: boolean; grip: Matrix4; vel: Vector3; spin: Vector3;
    /** An email of the day swirling round: how far out, how high, round which way, how fast; and when it rises. */
    orbit?: { r: number; y: number; base: number; amp: number; speed: number; phase: number; rise: number };
    /** Burst out from behind the logo: it flies free at first, then joins the swirl. */
    settle?: boolean;
    /** The menu: chosen by the left hand, not cut (the levels, EXIT); and how far the hand is on it, 0 to 1. */
    pointed?: boolean; hover?: number;
    /** The end's logo, taking hits: how many, how big it was, where what is left sits on the whole (metres, its own x, y), and how hard it is shaking. */
    hits?: number; area0?: number; shiftX?: number; shiftY?: number; shake?: number; hitAt?: number;
    /** The bar and the line: how far from the seat each was handed over; it shrinks as it comes nearer, keeping its size to the eye (a little bigger at the end), and that size now. */
    reach?: number; keep?: number;
    /** Held: its size now (1 where it floated), and its size, distance from the seat and the clock when it was taken. */
    grabSize?: number; grabFrom?: number; grabAway?: number; grabbedAt?: number;
  }
  const shows: Show[] = [];
  /** The cards' own sheets, made for one end and let go at the next (their pieces may still be burning). */
  let oldSheets: Sheet[] = [], endSheets: Sheet[] = [];
  const logo = { started: false, wanted: false, cutAt: -1, sparkle: 0, chime: -1, home: new Vector3(), outro: -1, homed: false, exploded: true, air: 0 };
  /** Colour a sheet for the end, from the level's look. */
  function dress(sheet: Sheet, w: number, h: number) {
    const u = sheet.material.uniforms, look = theme.look, bar = theme.bar ?? [theme.accent ?? '#f6b3cc', theme.accent ?? '#f6b3cc'];
    u.backColor.value.set(bar[0]).multiplyScalar(0.07); u.nightTint.value.set('#ffffff');      // (a dark back in the level's colour: linear, so a little is a lot) u.hoverColor.value.set(look.hover);
    u.cutWide.value.set(look.cutWide); u.cutHot.value.set(look.cutHot); u.markColor.value.set(look.mark); u.flashColor.value.set(look.flash);
    u.goldColor.value.set(look.gold); u.burnColor.value.set(look.burn); u.selfLit.value = 1; u.burnStyle.value = look.burnStyle;
    u.burn.value = 0; u.wet.value = 0; u.flash.value = 0; u.gold.value = 0; u.mark.value = 0; u.shine.value = -1; (u.heat.value as Vector3).set(0, 0, 0);
    u.span.value.set(w, h);
    sheet.burn = 0; sheet.cutAt = Infinity; sheet.burnAt = Infinity; sheet.cuts = 0;
  }
  /** Put something out to be cut, w by h metres, at `at` turned `turn`. */
  function putOut(sheet: Sheet, w: number, h: number, kind: Show['kind'], at: Vector3, turn: Quaternion) {
    dress(sheet, w, h);
    const body = add(sheet, measure(slabSoup(w, h)), false);
    body.mode = 'show'; body.age = 0; body.life = Infinity; loose.push(body);
    body.mesh.position.copy(at); body.mesh.quaternion.copy(turn); body.mesh.scale.setScalar(kind === 'logo' ? 0.001 : 1);
    const show: Show = { body, sheet, kind, home: at.clone(), face: turn.clone(), gone: -1, anchor: at.clone(), held: false, free: false, grip: new Matrix4(), vel: new Vector3(), spin: new Vector3() };
    shows.push(show);
    return show;
  }
  /**
   * The progress bar, full, and the line under it (CLEARED 10 EMAILS) stay at the end as things to cut and to
   * take hold of (2026-11-12: "dont animate away the progress - keep that to cut", then "add back the ability to
   * grab the logo and progress bar at end and the subtitle to end ( also grab )"). Each glides in from where it
   * was, the bar to just above the logo and the line to just under it, in reach, keeping its size to the eye.
   */
  function handBar(parts: readonly ('bar' | 'line')[] = ['bar', 'line']) {
    for (const which of parts) {
      const handed = ui.handOver(which);
      if (!handed) continue;
      const sheet = canvasSheet(handed.canvas); endSheets.push(sheet);
      const show = putOut(sheet, handed.width, handed.height, which, handed.at, handed.turn);
      show.reach = handed.at.distanceTo(seat);
      if (which === 'bar') show.home.set(seat.x * 0.7, seat.y + 0.3 * LOGO_SPREAD, seat.z - LOGO_DISTANCE - 0.1);
      else show.home.set(seat.x * 0.7, seat.y - 0.36 * LOGO_SPREAD, seat.z - LOGO_DISTANCE + 0.05);
    }
  }
  /** The line under the logo at the end: what it says, when it pops in (clock; -1 not yet) and when it becomes cuttable. */
  const endLine = { text: '', introAt: -1, handAt: -1 };
  const LINE_AFTER_LOGO = 0.9;      // seconds after the logo appears that its line follows
  /** The end comes in: the line and the bar change to things that can be cut, and the logo arrives. */
  async function showLogo() {
    logo.wanted = true;
    // the line and the bar: the same pictures, in the same places, from now on cuttable
    for (const sheet of oldSheets) { sheet.material.dispose(); sheet.surface.texture?.dispose(); }
    oldSheets = endSheets; endSheets = [];
    // (2026-11-11, later: the logo alone, the main thing, centred at eye level; the bar has gone and the
    // line of how many were cleared is no more; two and a half seconds on, everything bursts out of it)
    logo.exploded = false;
    let sheet: Sheet;
    try { sheet = await logoSheet(LOGO_FILE[theme.id] ?? 'kyoto'); } catch { if (END_PARTS && game.phase === 'summary') endLine.introAt = clock; return; }
    if (!logo.wanted || game.phase !== 'summary' || shows.some(x => x.kind === 'logo')) return;
    if (END_PARTS) endLine.introAt = clock + LINE_AFTER_LOGO;      // (the line under it, once it is in: it pops in over 0.8 s)
    const h = LOGO_WIDTH * sheet.surface.height / sheet.surface.width, bar = theme.bar ?? [theme.accent ?? '#f6b3cc', theme.accent ?? '#f6b3cc'];
    logo.home.set(seat.x * 0.7, seat.y - 0.06 * LOGO_SPREAD, seat.z - LOGO_DISTANCE);      // (a little lower too, in the swing)
    look3.position.copy(logo.home); look3.up.set(0, 1, 0); look3.lookAt(seat.x, seat.y - 0.04, seat.z);
    const show = putOut(sheet, LOGO_WIDTH, h, 'logo', logo.home, look3.quaternion);
    sheet.material.uniforms.flash.value = 1;
    logoGlow.uniforms.a.value.set(bar[0]); logoGlow.uniforms.b.value.set(bar[1]);
    const glow = new Mesh(new PlaneGeometry(LOGO_WIDTH * 1.7, h * 4), logoGlow); glow.position.z = -0.04; glow.renderOrder = 1; glow.frustumCulled = false; show.body.mesh.add(glow);
    logo.cutAt = -1; logo.sparkle = 0; logo.chime = 0;
    // in it comes: a burst of the level's colours right across it, and a stinger in Kyoto
    celebrate(show.body, 1.4);      // (Kyoto's stinger played here until its end anthem came: that is the celebration now, src/audio.ts)
  }
  /** Bursts of the level's petals, sparks and bits, across the logo and up out of it. */
  function celebrate(body: Body, strength: number) {
    body.mesh.updateMatrixWorld(true);
    // (from just behind it and away from the player, so nothing passes in front of it: it stays sharp, 2026-11-11)
    const away = v2.set(0, 0, -1).applyQuaternion(body.mesh.quaternion);
    for (let k = 0; k < 3; k++) {
      const a = v3.set(-LOGO_WIDTH / 2 + k * LOGO_WIDTH / 3, rand(0.05), -0.08); body.mesh.localToWorld(a);
      const b = v4.set(-LOGO_WIDTH / 2 + (k + 1) * LOGO_WIDTH / 3, rand(0.05), -0.08); body.mesh.localToWorld(b);
      fx.spray(a, b, v1.set(rand(0.4), 1.1 + Math.random() * 0.6, 0).addScaledVector(away, 0.6), Math.round(8 * strength), Math.round(30 * strength), Math.random() < 0.5, 1.4);
    }
  }
  /**
   * Every frame, each thing out to be cut. At the end of a game (2026-11-11: "more moving and pulsing with
   * the music ... a bit more chaotic and celebration freak out"): the logo pops in, and with the line and the
   * bar glides to its place, bobs, wobbles and swells on the beat; the day's emails rise and swirl round in
   * front; anything thrown tumbles free and drifts back in reach. The menu's cards pop in and hang.
   */
  function floatShow(show: Show, dt: number) {
    const body = show.body, t = body.age, u = body.sheet.material.uniforms;
    u.time.value = clock;
    if (show.held) return;                                   // (the hand moves it: grabShows)
    const amp = show.kind === 'logo' ? 0.08 : show.kind === 'mail' ? 0.06 : 0.05;
    const swell = 1 + amp * beatNow;
    if (show.free) {
      // thrown: it flies on, slowing, tumbling; too far off and it is drawn back towards the player
      body.mesh.position.addScaledVector(show.vel, dt); show.vel.multiplyScalar(Math.exp(-dt * 0.9));
      const off = v1.copy(body.mesh.position).sub(seat), far = off.length();
      if (far > 2.3) show.vel.addScaledVector(off, -(far - 2.3) * 3 * dt / far);
      // and drawn back into view: towards a place in front if it has gone off to a side, up, down or behind
      const ahead = v2.set(seat.x, seat.y, seat.z - 1.5), wide = Math.abs(Math.atan2(off.x, -off.z)) > 0.6 || off.z > -0.3 || Math.abs(off.y) > 0.6;
      if (wide) show.vel.addScaledVector(ahead.sub(body.mesh.position), 1.6 * dt);
      const turn = show.spin.length();
      if (turn > 1e-3) body.mesh.quaternion.premultiply(q1.setFromAxisAngle(v2.copy(show.spin).divideScalar(turn), turn * dt));
      show.spin.multiplyScalar(Math.exp(-dt * 0.5));
      // (let go of: from the size it was in the hand back to its own, easily, with no jump)
      const own = show.kind === 'mail' ? 1 : show.keep ?? 1;
      if (show.grabSize !== undefined) show.grabSize += (own - show.grabSize) * (1 - Math.exp(-dt * 3));
      body.mesh.scale.setScalar(swell * (show.kind === 'mail' ? MAIL_SIZE : 1) * (show.grabSize ?? own) * Math.min(1, 0.2 + t * 2.5));
      // burst out: once it has slowed, it joins the swirl round in front from where it is
      if (show.settle && t > 0.9 && show.vel.length() < 0.8) {
        const off2 = v1.copy(body.mesh.position).sub(seat), speed = (0.35 + Math.random() * 0.4) * (Math.random() < 0.5 ? -1 : 1);
        show.free = false; show.settle = false;
        show.orbit = { r: Math.max(0.95, Math.min(2, Math.hypot(off2.x, off2.z))), y: Math.max(-0.35, Math.min(0.4, off2.y)), base: Math.atan2(off2.x, -off2.z) * 180 / Math.PI,
          amp: 8 + Math.random() * 12, speed, phase: -t * speed, rise: -10 };
      }
      return;
    }
    if (show.orbit) {
      // an email of the day: up from below, then round and round in front, never still
      const o = show.orbit, rise = clamp01((t - o.rise) / 1.3), ease = 1 - Math.pow(1 - rise, 3);
      const a = (o.base + o.amp * Math.sin(t * o.speed + o.phase)) * Math.PI / 180;
      const y = seat.y + o.y + Math.sin(t * 1.3 + o.phase) * 0.08;
      v1.set(seat.x + Math.sin(a) * o.r, seat.y - 1.4, seat.z - Math.cos(a) * o.r);
      body.mesh.position.set(v1.x, v1.y + (y - v1.y) * ease, v1.z);
      look3.position.copy(body.mesh.position); look3.up.set(0, 1, 0); look3.lookAt(seat.x, seat.y - 0.04, seat.z);
      body.mesh.quaternion.copy(look3.quaternion).multiply(q1.setFromAxisAngle(v2.set(Math.sin(t * 0.8 + o.phase), Math.cos(t * 0.6), Math.sin(t * 1.1) * 0.7).normalize(), 0.35 + 0.15 * Math.sin(t * 2 + o.phase)));
      body.mesh.scale.setScalar(Math.max(0.001, ease) * swell * (show.kind === 'mail' ? MAIL_SIZE : 1));
      return;
    }
    if (show.kind !== 'logo') {
      if (show.delay !== undefined) {
        // the menu's cards pop in one after another, and hang
        body.mesh.position.copy(show.home); body.mesh.position.y += Math.sin(t * 1.1 + show.delay * 9) * 0.006;
        const p = clamp01((t - show.delay) / 0.45), e = 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2);
        // (one the left hand is on swells a little, comes a little forward, and its edge lights)
        const on = show.hover ?? 0;
        body.mesh.scale.setScalar(Math.max(0.001, p <= 0 ? 0.001 : e) * (1 + 0.1 * on));
        body.mesh.position.addScaledVector(v1.copy(seat).sub(show.home).normalize(), 0.05 * on);
        u.hover.value = on;
        return;
      }
      // the line and the bar: down to their places, bobbing, wobbling, swelling on the beat
      show.anchor.lerp(show.home, 1 - Math.exp(-dt * 2.2));
      const phase = show.kind === 'bar' ? 1.7 : 0;
      body.mesh.position.copy(show.anchor); body.mesh.position.y += Math.sin(t * 1.6 + phase) * 0.022;
      look3.position.copy(body.mesh.position); look3.up.set(0, 1, 0); look3.lookAt(seat.x, seat.y - 0.04, seat.z);
      body.mesh.quaternion.copy(look3.quaternion).multiply(q1.setFromAxisAngle(v1.set(0, 0, 1), Math.sin(t * 2.1 + phase) * 0.05 + beatNow * 0.03 * Math.sin(t * 9)));
      if (show.reach) show.keep = Math.min(1, Math.max(0.55, body.mesh.position.distanceTo(seat) / show.reach));
      body.mesh.scale.setScalar(swell * (show.keep ?? 1));
      // chipped (it takes a few hits, like the logo): what is left sits where it was on the whole, shaking from the hit
      if (show.shiftX !== undefined) body.mesh.position.add(v1.set(show.shiftX, show.shiftY ?? 0, 0).multiplyScalar(body.mesh.scale.x).applyQuaternion(body.mesh.quaternion));
      if (show.shake) { body.mesh.position.add(v1.set(rand(0.03), rand(0.03), rand(0.015)).multiplyScalar(show.shake)); show.shake *= Math.exp(-dt * 7); if (show.shake < 0.01) show.shake = 0; }
      u.flash.value *= Math.exp(-dt * 3);
      return;
    }
    const pop = Math.min(1, t / 0.8), back = 1 + 2.4 * Math.pow(pop - 1, 3) + 1.4 * Math.pow(pop - 1, 2);     // overshoots, settles
    body.mesh.scale.setScalar(Math.max(0.001, back) * swell);
    show.anchor.lerp(show.home, 1 - Math.exp(-dt * 2.2));
    body.mesh.position.copy(show.anchor); body.mesh.position.y += Math.sin(t * 1.3) * 0.035;
    look3.position.copy(body.mesh.position); look3.up.set(0, 1, 0); look3.lookAt(seat.x, seat.y - 0.04, seat.z);
    body.mesh.quaternion.copy(look3.quaternion).multiply(q1.setFromAxisAngle(v1.set(0, 1, 0), Math.sin(t * 0.9) * 0.1)).multiply(new Quaternion().setFromAxisAngle(v2.set(0, 0, 1), Math.sin(t * 1.2) * 0.045));
    // what is left of it sits where it was on the whole; a hit sets it shaking
    if (show.shiftX !== undefined) body.mesh.position.add(v1.set(show.shiftX, show.shiftY ?? 0, 0).multiplyScalar(body.mesh.scale.x).applyQuaternion(body.mesh.quaternion));
    if (show.shake) { body.mesh.position.add(v1.set(rand(0.03), rand(0.03), rand(0.015)).multiplyScalar(show.shake)); show.shake *= Math.exp(-dt * 7); if (show.shake < 0.01) show.shake = 0; }
    u.flash.value *= Math.exp(-dt * 3);      // (the arrival's flash only: one on every beat washed it out)
    // a glint every few seconds
    const cycle = (t + 1.2) % 3.2; u.shine.value = cycle < 1 ? -0.3 + cycle * 1.9 : -1;
    logoGlow.uniforms.strength.value = Math.min(1, t / 0.6) * (0.35 + 0.5 * beatNow); logoGlow.uniforms.time.value = clock;
    logoFloat(show, dt, t);
  }
  /** The logo's chime and its bursts (wherever it is: held, thrown or in its place). */
  function logoFloat(show: Show, dt: number, t: number) {
    const body = show.body;
    // the chime: up the scale, one note at a time
    if (logo.chime >= 0) {
      const before = logo.chime; logo.chime += dt;
      [0, 0.1, 0.2, 0.3, 0.45].forEach((at, i) => { if (before < at && logo.chime >= at) sounds.play('blip', [1, 1.26, 1.5, 2, 2.52][i], 0.5, show.home); });
      if (logo.chime > 0.5) logo.chime = -1;
    }
    // more bursts for a few seconds, then a twinkle now and then, and one on every big beat
    if ((logo.sparkle -= dt) <= 0 || (beatNow > 0.85 && logo.sparkle < 0.35)) {
      logo.sparkle = t < 3 ? 0.45 : 0.9;
      body.mesh.updateMatrixWorld(true);
      const at = v3.set(rand(LOGO_WIDTH / 2), rand(0.08), -0.08); body.mesh.localToWorld(at);
      fx.spray(at, at, v1.set(0, t < 3 ? 0.9 : 0.5, 0).addScaledVector(v2.set(0, 0, -1).applyQuaternion(body.mesh.quaternion), 0.4), t < 3 ? 5 : 2, t < 3 ? 18 : 10, false, 0.9);
    }
  }
  /** The beat to move to: the music's (main.ts sets it, from the song's pulse), or a steady one if it has none. */
  let beatNow = 0, beatIn = -1, endSong = false, endSongHeard = false;
  function stepBeat(dt: number) {
    const want = beatIn >= 0 ? beatIn : Math.pow(1 - ((clock * 2) % 1), 4);      // (120 beats a minute, a kick on each)
    beatNow = want > beatNow ? want : beatNow * Math.exp(-dt * 7);
  }
  const MAIL_SIZE = 0.6;
  /**
   * Two and a half seconds after the logo comes (or at once, if it is cut first): everything bursts out from
   * behind it, the day's emails and a handful of pixel things in the level's colours, flying out, then
   * swirling round in front to be grabbed, thrown and cut. Inbox zero: and now a mess to cut up.
   */
  function explode() {
    logo.exploded = true;
    const from = logo.home;
    spawnMails(true); spawnBonus();
    fx.spray(from, from, v1.set(0, 0.6, 0.6), 24, 90, true, 2.6);
    fx.spray(from, from, v1.set(0, 1.4, 0), 10, 40, false, 1.8);
    sounds.play('blip', 1.5, 0.6, from); sounds.play('blip', 2, 0.5, from); sounds.play('throw', 0.8, 0.6, from);
    buzz('left', 0.8, 120); buzz('right', 0.8, 120);
  }
  /** Out of the logo: from just behind it, outwards and up, spinning. */
  function burstOut(show: Show) {
    const body = show.body;
    body.mesh.position.copy(logo.home).add(v1.set(rand(0.25), rand(0.08), -0.05));
    const a = Math.random() * Math.PI * 2;
    show.vel.set(Math.cos(a) * (1.6 + Math.random() * 1.6), Math.sin(a) * (1.1 + Math.random() * 1.2) + 0.4, 0.4 + Math.random() * 0.9);
    show.spin.set(rand(4), rand(4), rand(4));
    show.free = true; show.settle = true; show.orbit = undefined;
    body.mesh.scale.setScalar(0.2);
  }
  /** Little things in pixels to cut: stars, hearts, envelopes, @ signs and zeros, in the level's colours. */
  const BONUS_ART: Record<string, string[]> = {
    star: ['....#....', '...###...', '...###...', '#########', '.#######.', '..#####..', '..##.##..', '.##...##.', '##.....##'],
    heart: ['.##...##.', '####.####', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....'],
    mail: ['#########', '##.....##', '#.#...#.#', '#..#.#..#', '#...#...#', '#.......#', '#########'],
    at: ['..#####..', '.#.....#.', '#..###..#', '#.#..#..#', '#.#..#..#', '#..####.#', '.#.......', '..######.'],
    zero: ['.#####.', '##...##', '##..###', '##.#.##', '###..##', '##...##', '.#####.'],
  };
  function bonusCanvas(art: string[], fill: string, edge: string) {
    const cell = 24, pad = 2, w = art[0].length + pad * 2, h = art.length + pad * 2;
    const canvas = document.createElement('canvas'); canvas.width = w * cell; canvas.height = h * cell;
    const g = canvas.getContext('2d')!;
    const on = (x: number, y: number) => art[y - pad]?.[x - pad] === '#';
    // a dark outline a cell round it, then the shape, a light cell at the top of each column
    g.fillStyle = edge;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!on(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => on(x + dx, y + dy))) g.fillRect(x * cell, y * cell, cell, cell);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) { g.fillStyle = on(x, y - 1) ? fill : '#ffffff'; g.fillRect(x * cell, y * cell, cell, cell); }
    return canvas;
  }
  function spawnBonus() {
    const bar = theme.bar ?? [theme.accent ?? '#f6b3cc', theme.accent ?? '#f6b3cc'], kinds = Object.keys(BONUS_ART);
    for (let i = 0; i < 10; i++) {
      const art = BONUS_ART[kinds[i % kinds.length]], canvas = bonusCanvas(art, bar[i % 2], '#14101f');
      const sheet = canvasSheet(canvas); endSheets.push(sheet);
      const size = 0.15 + Math.random() * 0.07;
      const show = putOut(sheet, size, size * canvas.height / canvas.width, 'bonus', logo.home, facing(logo.home));
      burstOut(show);
    }
  }
  /** The day's emails, all of them, up from below to swirl round in front: to be grabbed, thrown, and cut. */
  function spawnMails(burst = false) {
    const day = game.dayDeck.length ? game.dayDeck : game.deck;
    day.slice(0, 12).forEach((email, i, all) => {
      const sheet = freeSheet() ?? extraSheet();
      drawEmail(sheet, email, true); sheet.material.uniforms.hazard.value = theme.hazard?.(email) ? 1 : 0;
      const at = new Vector3(seat.x, seat.y - 1.4, seat.z - 1);
      const show = putOut(sheet, W, H, 'mail', at, facing(at));
      // (putOut built a flat slab the letter's size; the letter's own shape is used instead)
      root.remove(show.body.mesh); show.body.mesh.geometry.dispose();
      show.body.soup = wholeSoup; show.body.mesh = new Mesh(geometryOf(wholeSoup), sheet.material); show.body.mesh.frustumCulled = false; root.add(show.body.mesh);
      show.body.mesh.position.copy(at); show.body.mesh.scale.setScalar(0.001);
      dress(sheet, W, H); sheet.material.uniforms.selfLit.value = theme.look.selfLit;
      sheet.material.uniforms.backColor.value.set(theme.look.back);
      const side = i % 2 ? 1 : -1;
      // (to the sides more than the middle, where the logo is; smaller than in play)
      // (in the main view, round and through the middle, some nearer and some further than the logo: 2026-11-11, they had gone out of view)
      show.orbit = { r: 1.1 + Math.random() * 0.8, y: -0.32 + Math.random() * 0.68, base: side * (6 + Math.random() * 16), amp: 8 + Math.random() * 12,
        speed: (0.35 + Math.random() * 0.4) * (Math.random() < 0.5 ? -1 : 1), phase: Math.random() * 6.28, rise: 0.3 + i * (2.2 / Math.max(1, all.length)) };
      if (burst) burstOut(show);
    });
  }
  /** One more sheet, made like the others (the end needs one per email of the day). */
  function extraSheet(): Sheet {
    const paint = theme.face === 'paint';
    const surface = makeSurface(1024, 640, paint ? { scale: 1.5, ink: false, premultiplied: false } : { scale: 1.5, ink: true });
    const sheet: Sheet = { surface, material: paperMaterial(washi, surface.texture!, paint), users: 0, cuts: 0, cutAt: Infinity, burnAt: Infinity, burn: 0, reserved: false, splats: 0 };
    const from = sheets[0].material.uniforms, to = sheet.material.uniforms;
    for (const key of ['sheet', 'inkColor', 'backColor', 'nightTint', 'hoverColor', 'cutWide', 'cutHot', 'markColor', 'flashColor', 'goldColor', 'burnColor']) (to[key].value as Color).copy(from[key].value as Color);
    to.selfLit.value = from.selfLit.value; to.burnStyle.value = from.burnStyle.value;
    sheets.push(sheet);
    return sheet;
  }
  /** Is the left hand's reach on this (0 or less: it is)? Its reach line, or where it points, near enough the thing's middle. */
  const threadAt = new Vector3();      // (where the end's thread goes: reachShow uses v1 and v2)
  function reachShow(show: Show) {
    const p = show.body.mesh.position, r = show.body.soup.radius * show.body.mesh.scale.x * 0.65;
    let best = Infinity;
    for (const end of hand.pointing ? [hand.far, hand.pointed] : [hand.far]) {
      const ab = v1.copy(end).sub(hand.pos), t = clamp01(v2.copy(p).sub(hand.pos).dot(ab) / Math.max(1e-6, ab.lengthSq()));
      best = Math.min(best, v2.copy(hand.pos).addScaledVector(ab, t).distanceTo(p));
    }
    return best - r - 0.1;
  }
  /** The end: the left hand takes hold of anything out (the logo, the line, the bar, an email), and throws it. */
  function grabShows(dt: number, head: Vector3) {
    const held = shows.find(x => x.held);
    if (held) {
      const body = held.body;
      if (!hand.valid || !hand.pressed || body.mode !== 'show' || !loose.includes(body)) {
        held.held = false; held.free = true; held.orbit = undefined;
        held.vel.copy(hand.best).multiplyScalar(tune.throwBoost);
        held.spin.set(rand(3), rand(3), rand(3)).multiplyScalar(0.5 + Math.min(2, held.vel.length() * 0.4));
        sounds.play('throw', 0.95 + Math.random() * 0.1, 0.4, body.mesh.position); buzz('left', 0.5, 35);
        return;
      }
      // taken from afar it comes in to the hand, then follows a breath behind
      v2.setFromMatrixPosition(held.grip); const out = v2.length();
      if (out > tune.holdDistance) held.grip.setPosition(v2.multiplyScalar(Math.max(tune.holdDistance / out, Math.exp(-dt * 9))));
      m1.copy(hand.matrix).multiply(held.grip); v1.setFromMatrixPosition(m1); q1.setFromRotationMatrix(m1);
      const ease = 1 - Math.exp(-dt * 25);
      body.mesh.position.lerp(v1, ease); body.mesh.quaternion.slerp(q1, ease);
      // held, it shrinks as it comes nearer, so it looks only a little bigger than where it floated (2026-11-12: "the zoom
      // scale when grabbing the logo, progress, is too large": it kept its size and filled the view). Then, "the
      // grabbing is a bit weird": it jumped to full size as it was taken and shrank back, and jumped again when let
      // go. Now it starts at the size it was, the extra comes in over a moment, and the size follows the distance
      // exactly, as a grabbed email's does. (The day's emails keep their size, as they did.)
      const from = held.grabFrom ?? 1;
      if (held.kind === 'logo' || held.kind === 'bar' || held.kind === 'line') {
        const away = Math.max(0.05, held.grabAway ?? held.home.distanceTo(seat)), nowAway = body.mesh.position.distanceTo(seat);
        const ramp = clamp01((clock - (held.grabbedAt ?? clock)) / 0.45), grow = 1 + (GRAB_LOOKS - 1) * ramp * ramp * (3 - 2 * ramp);
        held.grabSize = Math.min(from * 1.2, Math.max(from * 0.25, from * grow * nowAway / away));
      } else held.grabSize = from;
      body.mesh.scale.setScalar((1 + 0.05 * beatNow) * (held.kind === 'mail' ? MAIL_SIZE : 1) * held.grabSize);
      if (held.kind === 'logo') logoFloat(held, dt, body.age);
      return;
    }
    if (!hand.valid || !hand.pressed || hand.used || hand.pressAge > 0.6) return;
    let best: Show | null = null, bestGap = 0;
    for (const show of shows) {
      if (show.gone >= 0 || show.body.mode !== 'show' || !loose.includes(show.body) || show.body.age < 0.5) continue;
      const gap = reachShow(show);
      if (gap <= bestGap) { bestGap = gap; best = show; }
    }
    if (!best) return;
    hand.used = true; best.held = true; best.free = false; best.orbit = undefined;
    // (taken at the size it is now, from where it is now: see above)
    best.grabFrom = best.body.mesh.scale.x / (best.kind === 'mail' ? MAIL_SIZE : 1) / (1 + (best.kind === 'logo' ? 0.08 : best.kind === 'mail' ? 0.06 : 0.05) * beatNow);
    best.grabAway = best.body.mesh.position.distanceTo(seat); best.grabbedAt = clock; best.grabSize = best.grabFrom;
    best.grip.copy(hand.matrix).invert().multiply(m1.compose(best.body.mesh.position, best.body.mesh.quaternion, v1.set(1, 1, 1)));
    sounds.play('blip', 1.25, 0.45, hand.pos); buzz('left', 0.4, 25);
    void head;
  }

  // ---------------------------------------------------------------- the menu, in VR

  /**
   * Choosing a level without leaving the headset (asked for on 2026-11-11: "cut to select"): the levels as
   * cards in an arc at arm's reach, CLEAN YOUR INBOX under them, EXIT VR off to the right, and the chosen
   * level's logo floating above with a line saying what to do. Every card is cut like a letter: a level's
   * shatters and the view goes to black while main.ts changes level (then the menu comes again); START's
   * begins a game; EXIT's leaves VR. It is where a game ends, in VR.
   */
  interface MenuLevel { id: string; name: string; accent: string; picture: string }
  const DIP = 0.38;      // how dark the view goes for a change of level in the menu
  const menu = { from: 1, on: null as Show | null, levels: [] as MenuLevel[], chosen: '', age: 0, pending: null as { kind: 'pick' | 'start' | 'exit'; id?: string; at: number } | null, planes: [] as Mesh[], sheets: [] as Sheet[] };
  const pictures = new Map<string, Promise<HTMLImageElement | null>>();
  function picture(url: string) {
    let got = pictures.get(url);
    if (!got) {
      got = new Promise(done => { const image = new Image(); image.decoding = 'async'; image.onload = () => done(image); image.onerror = () => done(null); image.src = `${import.meta.env.BASE_URL}${url}`; });
      pictures.set(url, got);
    }
    return got;
  }
  /** Pixel words on a canvas, centred on (x, y): a dark drop under them. */
  function pixelWords(g: CanvasRenderingContext2D, text: string, x: number, y: number, cell: number, colour: string, drop = true) {
    const upper = text.toUpperCase(), left = Math.round(x - PixelFont.width(upper, cell) / 2), top = Math.round(y - PixelFont.Rows * cell / 2);
    if (drop) { g.fillStyle = 'rgba(0,0,0,.75)'; PixelFont.cells(upper, left + Math.round(cell * 0.5), top + Math.round(cell * 0.5), cell, (cx, cy, cw, ch) => g.fillRect(cx, cy, cw, ch)); }
    g.fillStyle = colour; PixelFont.cells(upper, left, top, cell, (cx, cy, cw, ch) => g.fillRect(cx, cy, cw, ch));
  }
  /** A box with its corners stepped off twice by s, filled. */
  function steppedBox(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, s: number, fill: string | CanvasGradient) {
    g.fillStyle = fill;
    g.fillRect(x + 2 * s, y, w - 4 * s, h); g.fillRect(x + s, y + s, w - 2 * s, h - 2 * s); g.fillRect(x, y + 2 * s, w, h - 4 * s);
  }
  function levelCard(level: MenuLevel, image: HTMLImageElement | null, chosen: boolean) {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 400;
    const g = canvas.getContext('2d')!, w = 640, h = 400, edge = chosen ? 18 : 9, s = 12;
    steppedBox(g, 0, 0, w, h, s, chosen ? level.accent : 'rgba(255,255,255,.7)');
    g.save(); g.beginPath(); g.rect(edge, edge, w - 2 * edge, h - 2 * edge); g.clip();
    if (image) { const scale = Math.max((w - 2 * edge) / image.width, (h - 2 * edge) / image.height), iw = image.width * scale, ih = image.height * scale; g.drawImage(image, (w - iw) / 2, (h - ih) / 2, iw, ih); }
    else { g.fillStyle = '#17141f'; g.fillRect(0, 0, w, h); }
    const shade = g.createLinearGradient(0, h * 0.45, 0, h); shade.addColorStop(0, 'rgba(6,5,12,0)'); shade.addColorStop(1, 'rgba(6,5,12,.88)');
    g.fillStyle = shade; g.fillRect(0, 0, w, h);
    g.restore();
    const name = level.name.toUpperCase(), cell = Math.max(4, Math.min(8, Math.floor((w - 80) / PixelFont.widthCells(name))));
    pixelWords(g, name, w / 2, h - 52, cell, '#ffffff');
    if (chosen) { steppedBox(g, w - 92, 26, 62, 56, 6, level.accent); pixelWords(g, 'OK', w - 61, 54, 5, '#14121a', false); }
    return canvas;
  }
  /** A place for a level to come: a dim dashed card saying so. */
  function blankCard() {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 400;
    const g = canvas.getContext('2d')!;
    steppedBox(g, 0, 0, 640, 400, 12, 'rgba(255,255,255,.18)'); steppedBox(g, 6, 6, 628, 388, 11, 'rgba(10,8,18,.72)');
    pixelWords(g, 'Coming soon', 320, 200, 5, 'rgba(255,255,255,.55)', false);
    return canvas;
  }
  function wordCard(text: string, under: string, w: number, h: number, fill: string, ink: string) {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const g = canvas.getContext('2d')!, s = Math.round(h / 16);
    steppedBox(g, 0, 0, w, h, s, '#0b0912'); steppedBox(g, s, s, w - 2 * s, h - 2 * s, s, fill);
    g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(3 * s, s, w - 6 * s, Math.round(s * 0.8));
    const cell = Math.max(3, Math.min(Math.floor(h / 13), Math.floor((w - 8 * s) / PixelFont.widthCells(text.toUpperCase()))));
    pixelWords(g, text, w / 2, under ? h * 0.44 : h / 2, cell, ink, false);
    if (under) pixelWords(g, under, w / 2, h * 0.76, Math.max(2, Math.round(cell * 0.4)), ink, false);
    return canvas;
  }
  /** A flat picture that is only to be looked at (the logo, the hint), facing the seat. */
  function plane(canvasOrImage: HTMLCanvasElement | HTMLImageElement, width: number, at: Vector3) {
    let canvas = canvasOrImage as HTMLCanvasElement;
    if (!(canvasOrImage instanceof HTMLCanvasElement)) { canvas = document.createElement('canvas'); canvas.width = canvasOrImage.naturalWidth; canvas.height = canvasOrImage.naturalHeight; canvas.getContext('2d')!.drawImage(canvasOrImage, 0, 0); }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace; texture.needsUpdate = true;
    const h = width * (canvas.height / canvas.width);
    const mesh = new Mesh(new PlaneGeometry(width, h), new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
    mesh.position.copy(at); look3.position.copy(at); look3.up.set(0, 1, 0); look3.lookAt(seat.x, seat.y - 0.04, seat.z); mesh.quaternion.copy(look3.quaternion);
    mesh.renderOrder = 6; mesh.frustumCulled = false; root.add(mesh); menu.planes.push(mesh);
    return mesh;
  }
  /** Where something sits in the arc: `angle` degrees round from straight ahead, `r` metres out, `drop` under the eyes. */
  function arc(angle: number, r: number, drop: number) {
    const a = angle * Math.PI / 180;
    return new Vector3(seat.x + Math.sin(a) * r, seat.y - drop, seat.z - Math.cos(a) * r);
  }
  function facing(at: Vector3) { look3.position.copy(at); look3.up.set(0, 1, 0); look3.lookAt(seat.x, seat.y - 0.04, seat.z); return look3.quaternion.clone(); }
  /** Put the menu out, with `chosen` as the level picked. */
  /**
   * Put the menu out, with `chosen` as the level picked. `quick`: it is coming back after a pick, so it is
   * there at once, not popping in, and the view comes up from only a little dimmer (a change of level is a
   * gentle dip, as on the flat home screen, not a trip through black: 2026-11-12).
   */
  async function showMenu(levels: MenuLevel[], chosen: string, quick = false) {
    clear();
    game.phase = 'menu'; menu.levels = levels; menu.chosen = chosen; menu.age = 0; menu.pending = null; menu.from = quick ? DIP : 1;
    const ticket = ++menuTicket;
    const images = await Promise.all(levels.map(l => picture(l.picture)));
    const logoImage = await picture(`logos/${LOGO_FILE[chosen] ?? 'kyoto'}.webp`);
    if (ticket !== menuTicket || game.phase !== 'menu') return;
    const level = levels.find(l => l.id === chosen) ?? levels[0];
    // Rows of four in an arc (room for eight, as on the flat home screen), the last row filled out with
    // blanks for levels still to come; CLEAN YOUR INBOX under them, EXIT VR off to the right, the logo above.
    const perRow = 4, rows = Math.max(1, Math.ceil(levels.length / perRow)), step = 19, cardW = 0.3, cardH = cardW * 400 / 640, rowDrop = 0.215;
    const pop = (i: number) => (quick ? -1 : 0.15 + i * 0.06);
    for (let i = 0; i < rows * perRow; i++) {
      const row = Math.floor(i / perRow), col = i % perRow, at = arc((col - (perRow - 1) / 2) * step, 1.2, 0.03 + row * rowDrop), l = levels[i];
      if (!l) { plane(blankCard(), cardW * 0.97, at); continue; }
      const sheet = canvasSheet(levelCard(l, images[i], l.id === chosen)); menu.sheets.push(sheet);
      const show = putOut(sheet, cardW, cardH, 'card', at, facing(at)); show.id = l.id; show.delay = pop(i); show.body.mesh.scale.setScalar(quick ? 1 : 0.001);
      show.pointed = true; noCut.add(show.body);
    }
    const under = 0.03 + rows * rowDrop + 0.06;
    { const at = arc(0, 1.0, under), sheet = canvasSheet(wordCard('Clean your inbox', 'cut to start', 900, 220, level.accent, '#14121a')); menu.sheets.push(sheet);
      const show = putOut(sheet, 0.46, 0.46 * 220 / 900, 'start', at, facing(at)); show.delay = quick ? -1 : 0.6; show.body.mesh.scale.setScalar(quick ? 1 : 0.001); }
    { const at = arc(48, 1.0, under), sheet = canvasSheet(wordCard('Exit VR', '', 420, 150, '#2a2638', '#ffffff')); menu.sheets.push(sheet);
      const show = putOut(sheet, 0.2, 0.2 * 150 / 420, 'exit', at, facing(at)); show.delay = quick ? -1 : 0.7; show.body.mesh.scale.setScalar(quick ? 1 : 0.001);
      show.pointed = true; noCut.add(show.body); }
    if (logoImage) plane(logoImage, 0.82, arc(0, 1.7, -0.33));
    { const canvas = document.createElement('canvas'); canvas.width = 1800; canvas.height = 70; pixelWords(canvas.getContext('2d')!, 'Point and squeeze to choose  ·  slash start to play', 900, 35, 5, '#ffffff');
      plane(canvas, 1.1, arc(0, 1.65, -0.15)); }
  }
  let menuTicket = 0;
  /** Things out that the blade and the spray pass through (the menu's levels and EXIT: the left hand chooses those). */
  const noCut = new Set<Body>();
  /** The menu goes (a game begins, or VR is left). */
  function leaveMenu() {
    menuTicket++;
    for (const mesh of menu.planes) { root.remove(mesh); mesh.geometry.dispose(); const m = mesh.material as MeshBasicMaterial; m.map?.dispose(); m.dispose(); }
    menu.planes = []; menu.pending = null; noCut.clear(); menu.on = null;
    for (const show of shows) if (loose.includes(show.body) && show.body.mode === 'show') remove(show.body);
    shows.length = 0;
    if (game.phase === 'menu') game.phase = 'ready';
  }
  /** Every frame in the menu: a card cut is a choice, acted on once its burst has had a moment (a new level: once it is black). */
  function updateMenu(dt: number, head: Vector3) {
    menu.age += dt;
    // The left hand chooses a level (or EXIT): its reach line, or where it points, on a card lights it;
    // a squeeze takes it, and it breaks as a cut one would (2026-11-12: "left hand select the level, and
    // slash to play"; the levels and EXIT are no longer cut).
    let on: Show | null = null, best = 0;
    if (hand.valid && !menu.pending) for (const show of shows) {
      if (!show.pointed || show.gone >= 0 || show.body.age < (show.delay ?? 0) + 0.3) continue;
      const gap = reachShow(show);
      if (gap <= best) { best = gap; on = show; }
    }
    for (const show of shows) if (show.pointed) show.hover = (show.hover ?? 0) + ((show === on ? 1 : 0) - (show.hover ?? 0)) * (1 - Math.exp(-dt * (show.hover! > 1 ? 6 : 14)));
    if (on && on !== menu.on) { buzz('left', 0.15, 12); sounds.play('blip', 1.3, 0.25, on.body.mesh.position); }
    menu.on = on;
    if (on && hand.pressed && !hand.used && hand.pressAge < 0.6) {
      // taken: it pulses, its sparkle goes up, and (a level) the view dips while it changes (EXIT: out of VR)
      hand.used = true; on.hover = 2;
      const at = on.body.mesh.position;
      fx.spray(at, at, v1.set(0, 0.8, 0.3), 6, 24, false, 0.8); sounds.play('blip', 1.6, 0.5, at); buzz('left', 0.7, 60);
      menu.pending = { kind: on.kind === 'exit' ? 'exit' : 'pick', id: on.id, at: menu.age };
    }
    for (const show of shows) {
      if (show.gone >= 0 || (show.body.mode === 'show' && loose.includes(show.body))) continue;
      show.gone = menu.age;
      if (show.sheet.burnAt === Infinity && show.sheet.cutAt < Infinity) show.sheet.burnAt = clock + 1.5;
      const at = show.body.mesh.position;
      fx.spray(at, at, v1.set(0, 1, 0.4), 10, 40, true, 1.4); sounds.play('blip', 1.8, 0.6, at); buzz('right', 0.8, 70);
      if (!menu.pending) menu.pending = { kind: show.kind === 'card' ? 'pick' : show.kind === 'start' ? 'start' : 'exit', id: show.id, at: menu.age };
    }
    const p = menu.pending;
    if (p && menu.age - p.at > (p.kind === 'pick' ? 0.3 : 0.55) && !('sent' in p)) {
      (p as typeof p & { sent: boolean }).sent = true;
      if (p.kind === 'start') leaveMenu();
      events.on?.(p.kind, head, p.id);
    }
  }
  /** How black the view is for the menu: in from black as it opens, and to black for a change of level. */
  function menuBlack() {
    if (game.phase !== 'menu') return 0;
    const fadeIn = menu.from * (1 - clamp01(menu.age / (menu.from < 1 ? 0.45 : 0.8)));
    const p = menu.pending, fadeOut = p && p.kind === 'pick' ? DIP * clamp01((menu.age - p.at) / 0.28) : 0;
    return Math.max(fadeIn, fadeOut);
  }

  /** The level, dimmed for the end: a dark shell round the player, nearer than the painting and further than the logo. */
  const dimmer = new Mesh(new SphereGeometry(2.7, 32, 16), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: BackSide, depthWrite: false }));
  dimmer.name = 'End of game: the level dimmed'; dimmer.renderOrder = -1; dimmer.frustumCulled = false; dimmer.visible = false; root.add(dimmer);
  const look3 = new Object3D();
  /** And at the very end, black: a small shell round the head over everything, hands and all, before the home screen. */
  const blackout = new Mesh(new SphereGeometry(0.4, 24, 12), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: BackSide, depthWrite: false, depthTest: false }));
  blackout.name = 'End of game: fade to black'; blackout.renderOrder = 1000; blackout.frustumCulled = false; blackout.visible = false; root.add(blackout);

  /**
   * Cut a body along the line through (x, y) in its own space, heading (dx, dy). `push` is how the
   * blade was moving, m/s. False if the line misses it.
   */
  function slice(body: Body, x: number, y: number, dx: number, dy: number, push: Vector3, strength: number): boolean {
    // (the logo's chip moves the line before it is cut: below; so the halves are cut there)
    // (the bar and the line take a few hits too, like the logo: 2026-11-12)
    const logoShow = shows.find(x => (x.kind === 'logo' || x.kind === 'bar' || x.kind === 'line') && x.body === body), isLogo = !!logoShow;
    let halves = cut(body.soup.data, x, y, 0, -dy, dx, 0);
    const missed = (h: Float32Array[]) => h[0].length < STRIDE * 3 || h[1].length < STRIDE * 3;
    if (missed(halves) && !isLogo) return false;
    const sheet = body.sheet, mesh = body.mesh;
    mesh.updateMatrixWorld(true);
    const along = v1.set(dx, dy, 0).applyQuaternion(mesh.quaternion), across = v2.set(-dy, dx, 0).applyQuaternion(mesh.quaternion);
    const shownOn = docked(body), outward = new Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);
    // Each half, broken again by a hard swing: lines through it at random, near where the blade went in.
    // The end's logo takes a few hits (2026-11-12: "harder to break apart ... you really gotta whack a few
    // times"): each of the first LOGO_HITS - 1 chips a piece off the side that was hit (about 30% across when it took 4; smaller now it takes more: chipFor), and the
    // rest stays where it is, shaking; the last (or once little is left) breaks it into lots of pieces.
    let final = false;
    // (a swing goes through it over several frames: each would count as a hit, and it broke in one swing. So
    // after a hit it shrugs off more for a moment: one swing, one hit.)
    if (logoShow && clock - (logoShow.hitAt ?? -9) < LOGO_RECOVER) return true;
    if (logoShow) {
      const hits = (logoShow.hits ?? 0) + 1, needed = logoShow.kind === 'logo' ? LOGO_HITS : STRIP_HITS, chip = chipFor(needed); logoShow.area0 ??= body.soup.area;
      final = hits >= needed || body.soup.area < logoShow.area0 * 0.2;
      if (!final) {
        // move the line along its normal, to 30% in from the edge on the side that was struck
        const nx = -dy, ny = dx, d = body.soup.data; let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < d.length; i += STRIDE) { const proj = d[i] * nx + d[i + 1] * ny; lo = Math.min(lo, proj); hi = Math.max(hi, proj); }
        const at = x * nx + y * ny, want = at > (lo + hi) / 2 ? hi - chip * (hi - lo) : lo + chip * (hi - lo);
        x += (want - at) * nx; y += (want - at) * ny;
        halves = cut(body.soup.data, x, y, 0, -dy, dx, 0);
      } else if (missed(halves)) {
        // the last hit, on a line that misses what is left: through its middle instead
        const c = measure(body.soup.data).centre; x = c[0]; y = c[1];
        halves = cut(body.soup.data, x, y, 0, -dy, dx, 0);
      }
      // (still no clean cut: it shrugs it off, never disappears whole. The hit only counts once it cuts.)
      if (missed(halves)) return true;
      logoShow.hits = hits; logoShow.hitAt = clock;
    }
    const breaks = isLogo ? (final ? 3 : 0) : loose.length >= shatter.most ? 0 : strength > shatter.twice ? 2 : strength > shatter.once ? 1 : 0;
    const struck = new Vector3(x, y, 0); mesh.localToWorld(struck);
    const pieces: [Float32Array, number][] = [];
    halves.forEach((data, i) => {
      let parts = [data];
      for (let k = 0; k < breaks; k++) {
        const next: Float32Array[] = [];
        for (const part of parts) {
          const m = measure(part);
          if (m.area < shatter.smallest) { next.push(part); continue; }
          const turn = Math.atan2(dy, dx) + Math.PI / 2 + rand(0.9);       // roughly across the first cut, never quite
          const [p, q] = cut(part, m.centre[0] + rand(0.025), m.centre[1] + rand(0.025), 0, Math.cos(turn), Math.sin(turn), 0);
          if (p.length >= STRIDE * 3 && q.length >= STRIDE * 3) next.push(p, q); else next.push(part);
        }
        parts = next;
      }
      for (const part of parts) pieces.push([part, i === 0 ? 1 : -1]);
    });
    const kick = 1 + 0.9 * strength;               // hard cuts throw harder
    // the logo keeps its biggest piece (all but the last hit)
    const keepAt = isLogo && !final ? pieces.reduce((best, p, i, all) => (measure(p[0]).area > measure(all[best][0]).area ? i : best), 0) : -1;
    let index = -1;
    for (const [data, side] of pieces) {
      index++;
      const soup = measure(data);
      const middle = v3.set(soup.centre[0], soup.centre[1], soup.centre[2]);
      const offset: [number, number] = [body.offset[0] + middle.x, body.offset[1] + middle.y];
      mesh.localToWorld(middle);
      const piece = add(sheet, recentre(soup), false);
      piece.offset = offset;
      piece.mesh.position.copy(middle); piece.mesh.quaternion.copy(mesh.quaternion); piece.mesh.scale.copy(mesh.scale);
      // apart, along with the blade, and up a little; each half turning away from the cut
      piece.vel.copy(body.vel).addScaledVector(across, side * (0.34 + 0.42 * strength) * kick).addScaledVector(push, 0.09 * kick);
      piece.vel.y += 0.3 + 0.25 * Math.random();
      // the pieces of a broken half also fly out from where the blade went in
      if (breaks > 0) { const out = new Vector3().subVectors(middle, struck); const reach = out.length(); if (reach > 1e-4) piece.vel.addScaledVector(out, shatter.burst * strength * (0.6 + 0.6 * Math.random()) / reach); }
      if (shownOn) piece.vel.addScaledVector(outward, shownOn.out * (0.8 + 0.4 * Math.random()));      // knocked out of the screen, towards the player
      piece.spin.copy(along).multiplyScalar(side * (1.5 + 2.6 * strength) * kick).add(v4.set(rand(1.6 * kick), rand(1.6 * kick), rand(1.6 * kick)));
      if (index === keepAt && logoShow) {
        // what is left of the logo: still the logo, in its place, with its glow, shaking from the hit
        piece.mode = 'show'; piece.age = body.age; piece.life = Infinity; piece.vel.set(0, 0, 0); loose.push(piece);
        logoShow.body = piece; logoShow.shiftX = offset[0]; logoShow.shiftY = offset[1]; logoShow.shake = 1;
        for (const child of [...mesh.children]) if ((child as Mesh).material === logoGlow) { piece.mesh.add(child); child.position.set(-offset[0], -offset[1], -0.04); }
        if (logoShow.kind !== 'logo') sounds.play('blip', 1.6 + 0.2 * (logoShow.hits ?? 0), 0.4, piece.mesh.position);      // (a chip off the bar or the line: a little ping, rising)
        piece.sheet.material.uniforms.flash.value = 0.55;
        continue;
      }
      release(piece, 'cut', 9);
    }
    // the cut itself, on the paper: glowing where it was made
    const k = sheet.cuts++ % 3, u = sheet.material.uniforms;
    (u.cuts.value as Vector4[])[k].set(x + body.offset[0], y + body.offset[1], dx, dy);
    (u.heat.value as Vector3).setComponent(k, 1);
    sheet.cutAt = isLogo && !final ? Infinity : clock;                    // it burns once the next letter is in place (see update); (a logo only chipped: not yet)
    // and in the air: a streak of light, sparks and petals along it, shreds of paper
    const at = v3.set(x, y, 0); mesh.localToWorld(at);
    const streak = streaks[nextStreak]; nextStreak = (nextStreak + 1) % STREAKS;
    streak.age = 0; streak.size = 1; streak.mesh.visible = true;
    streak.mesh.position.copy(at);
    streak.mesh.quaternion.copy(mesh.quaternion).multiply(q1.setFromAxisAngle(v4.set(0, 0, 1), Math.atan2(dy, dx)));
    const a = v4.copy(at).addScaledVector(along, -0.3), b = at.clone().addScaledVector(along, 0.3);
    const thrown = push.clone().multiplyScalar(0.3);
    fx.spray(a, b, thrown, 7 + Math.round(6 * strength), 34 + Math.round(30 * strength), false, 1);
    fx.spray(a, b, thrown, 9, 0, true, 0.8);
    if (breaks > 0) {
      // A hard cut throws out the level's own fragments as well: shreds of what the letter is made of (mint
      // pixel squares off an office pane, parchment off a dispatch, washi off Kyoto's paper), the level's
      // own bits (key caps, wood splinters, petals), and more of its light.
      const hard = v2.copy(thrown).multiplyScalar(1.6);
      fx.spray(a, b, hard, Math.round(6 + 12 * strength), 0, true, 1.5);
      fx.spray(at, at, hard, Math.round(3 + 7 * strength), Math.round(16 + 30 * strength), false, 1.3);
    }
    // (Kyoto has five takes of its own cut; the other levels two)
    sounds.play(`slash${1 + Math.floor(Math.random() * (theme.id === 'kyoto' ? 5 : 2))}`, 0.94 + Math.random() * 0.14, 0.75 + 0.25 * strength, at);
    sounds.note?.(at);            // and the level's note, if it has one: the cuts play a tune
    hitStop = 0.05 + 0.06 * strength * Math.min(1, breaks);       // the hit lands: a moment longer for a hard one
    remove(body);
    counts.pieces += pieces.length;
    return true;
  }

  // ---------------------------------------------------------------- hands

  const hand = { valid: false, pressed: false, matrix: new Matrix4(), pos: new Vector3(), last: new Vector3(), vel: new Vector3(), tracked: false,
    /** Seconds since the grip closed, and whether that closing has already taken a letter. */
    pressAge: 9, used: false,
    /** The far end of the hand's reach line, where along it the letter is nearest, and whether it is on a letter now. */
    far: new Vector3(), pointed: new Vector3(), pointing: false, aim: new Vector3(), onLetter: false,
    /** The fastest the hand has been going lately: a throw is let go of a moment after its peak. */
    best: new Vector3(), bestAge: 1 };
  function readHand(dt: number, frame: XRFrame | undefined, head: Vector3) {
    hand.valid = false;
    const session = world.renderer.xr.getSession(), space = world.renderer.xr.getReferenceSpace();
    if (!world.renderer.xr.isPresenting || !frame || !session || !space) { hand.tracked = false; hand.pressed = false; return; }
    for (const source of session.inputSources) {
      if (source.handedness !== 'left' || !source.gripSpace) continue;
      const pose = frame.getPose(source.gripSpace, space);
      if (!pose) break;
      hand.matrix.fromArray(pose.transform.matrix).premultiply(world.player.matrixWorld);
      hand.pos.setFromMatrixPosition(hand.matrix);
      const buttons = source.gamepad?.buttons;
      const squeeze = Math.max(buttons?.[0]?.value ?? 0, buttons?.[1]?.value ?? 0);
      const closed = hand.pressed ? squeeze > 0.25 : squeeze > 0.55;       // easy to close, easy to keep closed
      hand.pressAge = closed && !hand.pressed ? 0 : hand.pressAge + dt;
      if (!closed) hand.used = false;
      hand.pressed = closed;
      // the reach line: from the hand on outwards, along the line from the shoulder through it
      const out = v2.set(head.x + tune.shoulder[0], head.y + tune.shoulder[1], head.z + tune.shoulder[2]).subVectors(hand.pos, v2);
      const arm = out.length();
      hand.far.copy(hand.pos);
      if (arm > 0.1) hand.far.addScaledVector(out, tune.reachLine / arm);
      // and the other line: where the controller itself points
      const ray = source.targetRaySpace ? frame.getPose(source.targetRaySpace, space) : null;
      hand.pointing = !!ray;
      if (ray) {
        m1.fromArray(ray.transform.matrix).premultiply(world.player.matrixWorld);
        hand.pointed.copy(hand.pos).addScaledVector(v2.set(-m1.elements[8], -m1.elements[9], -m1.elements[10]).normalize(), tune.reachLine);
      }
      if (hand.tracked && dt > 0.001) hand.vel.lerp(v1.copy(hand.pos).sub(hand.last).divideScalar(dt), 0.45);
      else hand.vel.set(0, 0, 0);
      hand.bestAge += dt;
      if (hand.bestAge > 0.12 || hand.vel.lengthSq() >= hand.best.lengthSq()) { hand.best.copy(hand.vel); hand.bestAge = 0; }
      hand.last.copy(hand.pos); hand.tracked = true; hand.valid = true;
      break;
    }
    if (!hand.valid) { hand.tracked = false; hand.pressed = false; }
  }
  /**
   * How close the hand's reach line passes to the sheet, less what the line has widened by at that
   * point (so: at most tune.reachRadius means the reach has it); hand.aim is set to where.
   */
  function lineTo(body: Body) {
    m1.copy(body.mesh.matrixWorld).invert();
    const a = v1.copy(hand.pos).applyMatrix4(m1);
    let best = Infinity;
    for (const end of hand.pointing ? [hand.far, hand.pointed] : [hand.far]) {
      const b = v2.copy(end).applyMatrix4(m1), reaching = end === hand.far;
      const widen = reaching ? tune.reachWiden : tune.pointWiden, slack = reaching ? 0 : tune.reachRadius - tune.pointRadius;
      for (let i = 0; i <= 30; i++) {
        const t = i / 30, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
        const gap = Math.hypot(Math.max(0, Math.abs(x) - W / 2), Math.max(0, Math.abs(y) - H / 2), z) - widen * tune.reachLine * t + slack;
        if (gap < best) { best = gap; hand.aim.lerpVectors(hand.pos, end, t); }
      }
    }
    return best;
  }
  function buzz(side: 'left' | 'right', strength: number, ms: number) {
    const session = world.renderer.xr.getSession();
    if (!session) return;
    for (const source of session.inputSources) {
      if (source.handedness !== side) continue;
      const pad = source.gamepad as (Gamepad & { hapticActuators?: { pulse?(value: number, duration: number): Promise<boolean> }[] }) | undefined;
      try { void pad?.hapticActuators?.[0]?.pulse?.(strength, ms)?.catch(() => undefined); } catch { /* no rumble on this controller */ }
    }
  }
  /**
   * How far a hand is from being able to take the sheet: 0 or less means it can. The hand need not
   * touch it: reaching towards it from in front is enough, and the letter comes to the hand.
   */
  function reachTo(body: Body, point: Vector3) {
    m1.copy(body.mesh.matrixWorld).invert();
    const p = v1.copy(point).applyMatrix4(m1);
    const off = Math.hypot(Math.max(0, Math.abs(p.x) - W / 2), Math.max(0, Math.abs(p.y) - H / 2));
    const depth = p.z > 0 ? p.z / tune.grabDepth : -p.z / 0.12;       // in front of it, or just through it
    return Math.max(off - tune.grabReach, (depth - 1) * tune.grabReach);
  }

  // ---------------------------------------------------------------- the blade

  const lastTip = new Vector3(), lastBase = new Vector3();
  let bladeSeen = false, armed = true;
  const local = new Vector3(), was = new Vector3(), now = new Vector3(), bladeVel = new Vector3(), keptScale = new Vector3();
  /**
   * Does the blade's sweep since last frame pass through this body? If so, cut it. With `reach`
   * the blade counts on past its tip as a line (tune.swordReach), its hit box widening as it goes.
   */
  function tryBlade(body: Body, blade: BladeTracker, dt: number, reach: boolean, dock?: LetterTheme['dock'], crowded = false, far = false): boolean {
    const mesh = body.mesh;
    mesh.updateMatrixWorld(true);
    m1.copy(mesh.matrixWorld).invert();
    // (a piece in the air is moving too, and may be small: it is given a little more room than a letter)
    const depth = body.whole ? tune.hitDepth : tune.hitDepth * 1.15;
    // (shown on something: the whole of that thing can be hit, behind the letter and round it)
    const back = dock ? dock.behind / body.size : depth, margin = tune.hitMargin + (dock ? dock.margin / body.size : 0);
    const length = blade.tip.distanceTo(blade.base);
    // (far: the end's logo, bar and line, hit from a long way off: END_REACH)
    const span = reach && length > 0.05 && blade.speed >= (far ? END_REACH.speed : tune.swordReachSpeed) ? 1 + (far ? END_REACH.metres : tune.swordReach) / length : 1;
    for (let s = Math.ceil(8 * span); s >= 1; s--) {
      // f runs along the blade: 1 is its tip, more than 1 is out on the line past it
      const f = s / 8, wide = (far ? END_REACH.widen : tune.swordWiden) * Math.max(0, f - 1) * length;
      was.lerpVectors(lastBase, lastTip, f); now.lerpVectors(blade.base, blade.tip, f);
      bladeVel.copy(now).sub(was).divideScalar(dt);
      if (bladeVel.length() < tune.cutSpeed) continue;
      for (const step of [1, 0.5]) {
        local.lerpVectors(was, now, step).applyMatrix4(m1);
        if (local.z > depth + wide || local.z < -back - wide) continue;
        const off = Math.hypot(local.x, local.y);
        const inside = body.whole
          ? Math.abs(local.x) < W / 2 + margin + wide && Math.abs(local.y) < H / 2 + margin + wide
          : off < body.soup.radius + wide + 0.03 && (covers(body.soup.data, local.x, local.y) || off < body.soup.radius * 0.75 + wide + 0.025);
        if (!inside) continue;
        // out on the line the far end moves much faster than the hand: the cut is no harder than the swing was
        if (bladeVel.length() > blade.speed + 1) bladeVel.setLength(blade.speed + 1);
        // which way across the paper is the blade going? (straight through it: along the blade instead)
        q1.copy(mesh.quaternion).invert();
        const way = v1.copy(bladeVel).applyQuaternion(q1);
        if (Math.hypot(way.x, way.y) < 0.3 * way.length()) way.copy(blade.tip).sub(blade.base).applyQuaternion(q1);
        let dx = way.x, dy = way.y; const size = Math.hypot(dx, dy);
        if (size < 1e-4) { const angle = Math.random() * Math.PI; dx = Math.cos(angle); dy = Math.sin(angle); } else { dx /= size; dy /= size; }
        const keep = 1 - tune.cutToMiddle;
        const x = Math.max(-W / 2 + 0.01, Math.min(W / 2 - 0.01, local.x)) * keep, y = Math.max(-H / 2 + 0.01, Math.min(H / 2 - 0.01, local.y)) * keep;
        // a piece met by the line's widened end: bring the cut onto the piece itself
        let px = local.x, py = local.y;
        for (let k = 0; k < 5 && !body.whole && !covers(body.soup.data, px, py); k++) { px *= 0.5; py *= 0.5; }
        // A piece too small to cut again, or one hit while the air is already full of pieces, bursts
        // instead; so does one the cut's line happens to miss. Every hit on a piece does something.
        if (!body.whole && (crowded || body.soup.area < 0.003) && !shows.some(x => x.kind === 'logo' && x.body === body)) { burst(body, bladeVel); return true; }
        if (slice(body, body.whole ? x : px, body.whole ? y : py, dx, dy, bladeVel, clamp01((bladeVel.length() - tune.cutSpeed) / 7))) return true;
        // (never the end's logo: what is left of it would vanish in one hit)
        if (!body.whole && !shows.some(x => x.kind === 'logo' && x.body === body)) { burst(body, bladeVel); return true; }
        return false;
      }
    }
    return false;
  }

  /** A piece hit that is not split again: it bursts into its level's fragments and light, and is gone. */
  function burst(body: Body, push: Vector3) {
    const at = body.mesh.position.clone(), thrown = v4.copy(push).multiplyScalar(0.25);
    fx.spray(at, at, thrown, 7, 0, true, 1.1);
    fx.spray(at, at, thrown, 3, 18, false, 0.9);
    sounds.play(Math.random() < 0.5 ? 'slash1' : 'slash2', 1.12 + Math.random() * 0.16, 0.6, at);
    sounds.note?.(at);
    hitStop = Math.max(hitStop, 0.03);
    remove(body);
  }
  function wasCut(letter: Current) {
    settle(letter.body, 'cut');
    counts.cut++; current = null; nextIn = tune.nextAfterCut;
    buzz('right', 0.9, 60);
    events.on?.('cut', letter.body.mesh.position);
  }

  // ---------------------------------------------------------------- the punch

  /**
   * Knockout: nothing is cut. The right hand wears a glove (to the BladeTracker its tip is the front
   * of the knuckles and its base the wrist), and what it lands on is hit:
   *  - a lighter punch dents the letter and knocks it across the ring, tumbling. It is dealt with (as
   *    a cut letter is), but it is still there to be hit again: off the ropes, off the canvas, out of
   *    the air;
   *  - a hard one (or the one after a few light ones) breaks it up from where it was hit, the pieces
   *    thrown down the ring; pieces can be hit again too;
   *  - anything sent over the top rope is in the crowd.
   * The crowd answers (`hype`: the level's painting and its cheering follow it). The numbers are the
   * level's own (theme.punch, levels/knockout.ts).
   */
  let hype = 0, impact = 0, lastPunch = -9, lastThud = -9, lastRopes = -9, lastOut = -9, lastOoh = -9, lastWord = -1;
  const gloveWay = new Vector3(), punchAt = new Vector3(), punchDir = new Vector3(), punchOff = new Vector3(), punchFace = new Quaternion();
  const dentCount = new WeakMap<Sheet, number>();
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;

  /**
   * Does the glove's move since last frame land on this body? Only a punch counts: fast enough, and
   * heading for the thing, so a hand drawn back through a letter does nothing. With `reach` a fast
   * punch carries on past the glove, its hit box widening as it goes: a seated player's arm is
   * short, and a letter waits a metre and a half away.
   */
  function tryPunch(body: Body, blade: BladeTracker, reach: boolean): boolean {
    const feel = theme.punch!, speed = blade.velocity.length();
    if (speed < feel.speed) return false;
    const mesh = body.mesh;
    gloveWay.copy(blade.velocity).divideScalar(speed);
    const gap = v1.copy(mesh.position).sub(blade.tip).length();
    if (gap > 0.12 && v1.dot(gloveWay) / gap < feel.into) return false;
    mesh.updateMatrixWorld(true);
    m1.copy(mesh.matrixWorld).invert();
    const k = 1 / Math.max(0.05, mesh.scale.x);        // metres to the letter's own units
    const far = reach && speed >= feel.reachSpeed ? feel.reach : 0, steps = far > 0 ? 15 : 3;
    for (let i = 0; i <= steps; i++) {
      // the first four are the glove's own path this frame; the rest are out along its way
      const out = i <= 3 ? 0 : far * (i - 3) / (steps - 3);
      if (i <= 3) local.lerpVectors(lastTip, blade.tip, i / 3); else local.copy(blade.tip).addScaledVector(gloveWay, out);
      local.applyMatrix4(m1);
      const wide = (feel.glove + feel.widen * out) * k;
      if (Math.abs(local.z) > wide + 0.03 * k) continue;
      const off = Math.hypot(local.x, local.y);
      if (body.whole ? Math.abs(local.x) > W / 2 + wide || Math.abs(local.y) > H / 2 + wide : off > body.soup.radius + wide) continue;
      // where on it: on the thing itself, however wide the box was
      let x = local.x, y = local.y;
      if (body.whole) { x = Math.max(-W / 2 + 0.03, Math.min(W / 2 - 0.03, x)); y = Math.max(-H / 2 + 0.03, Math.min(H / 2 - 0.03, y)); }
      else { const most = body.soup.radius * 0.6; if (off > most) { x *= most / off; y *= most / off; } }
      return landPunch(body, x, y, clamp01((speed - feel.speed) / (feel.full - feel.speed)), gloveWay, blade.tip, out);
    }
    return false;
  }

  /** A star of light where a punch landed, in the letter's own plane: `rays` streaks crossing. */
  function impactStar(at: Vector3, facing: Quaternion, size: number, rays: number) {
    const turn = Math.random() * Math.PI;
    for (let i = 0; i < rays; i++) {
      const streak = streaks[nextStreak]; nextStreak = (nextStreak + 1) % STREAKS;
      streak.age = 0; streak.size = size; streak.mesh.visible = true; streak.mesh.position.copy(at);
      streak.mesh.quaternion.copy(facing).multiply(q1.setFromAxisAngle(v4.set(0, 0, 1), turn + i * Math.PI / rays));
    }
  }

  /**
   * A punch has landed on a body at (x, y) on its face, this hard (0 to 1), going `way` (a unit
   * vector), from a glove at `glove`; `carried` is how far past the glove it was (0: the glove itself).
   */
  function landPunch(body: Body, x: number, y: number, strength: number, way: Vector3, glove: Vector3, carried: number): boolean {
    const feel = theme.punch!, mesh = body.mesh, sheet = body.sheet, u = sheet.material.uniforms;
    // The menu's cards and the end's logo, bar and line break as a blade breaks them, a hit at a time.
    if (shows.some(show => show.body === body)) {
      const turn = Math.random() * Math.PI;
      if (!slice(body, x, y, Math.cos(turn), Math.sin(turn), v1.copy(way).multiplyScalar(2 + 6 * strength), Math.max(0.5, strength))) return false;
      lastPunch = clock; impact = Math.max(impact, 0.4 + 0.6 * strength); buzz('right', 0.7, 50);
      return true;
    }
    // A scrap too small to knock about: it bursts.
    if (!body.whole && body.soup.area < 0.006) {
      burst(body, v1.copy(way).multiplyScalar(3 + 5 * strength));
      lastPunch = clock; impact = Math.max(impact, 0.3 + 0.5 * strength); buzz('right', 0.5, 40);
      return true;
    }
    const letter = current && current.body === body ? current : null;
    mesh.updateMatrixWorld(true);
    punchAt.set(x, y, 0); mesh.localToWorld(punchAt);
    punchFace.copy(mesh.quaternion);
    const hits = body.knock + 1, ko = strength >= feel.hard || hits > feel.hits;
    // It is dealt with, as a cut letter is; one thrown to be kept and then punched was never kept.
    if (letter) { settle(body, 'cut'); counts.cut++; current = null; nextIn = tune.nextAfterCut + 0.2; u.hover.value = 0; events.on?.('cut', mesh.position); }
    else if (body.mode === 'kept') { if (!stillSaved(body)) { settle(body, 'cut'); counts.cut++; } else counts.kept++; u.mark.value = 0; u.gold.value = 0; body.going = -1; }
    // The dent, on the sheet itself, so every piece of it keeps it; and it goes when the next letter is in place.
    const slot = (dentCount.get(sheet) ?? 0) % 3; dentCount.set(sheet, slot + 1);
    (u.dents.value as Vector4[])[slot].set(x + body.offset[0], y + body.offset[1], feel.dentRadius * (0.8 + 0.5 * strength), mix(feel.dent[0], feel.dent[1], strength));
    u.flash.value = Math.max(u.flash.value, 0.3 + 0.45 * strength);
    sheet.cutAt = clock;
    // Which way it goes: mostly the punch's own, but always some of straight down the ring, so a hook still sends it off.
    punchDir.copy(mesh.position).sub(seat).setY(0);
    if (punchDir.lengthSq() < 1e-4) punchDir.set(0, 0, -1);
    punchDir.normalize().multiplyScalar(1 - feel.carry).addScaledVector(way, feel.carry).normalize();
    const speed = mix(feel.launch[0], feel.launch[1], strength);
    if (ko) smash(body, x, y, speed, strength, hits);
    else {
      body.vel.copy(punchDir).multiplyScalar(speed); body.vel.y += mix(feel.lift[0], feel.lift[1], strength);
      // hit off its middle it spins about its middle; and it always goes over backwards a little
      punchOff.set(x, y, 0).applyQuaternion(mesh.quaternion);
      body.spin.crossVectors(punchOff, punchDir).multiplyScalar(feel.spin * (0.5 + strength) / 0.25)
        .add(v2.set(punchDir.z, 0, -punchDir.x).multiplyScalar(2 + 5 * strength)).add(v4.set(rand(1.2), rand(1.2), rand(1.2)));
      body.knock = hits;
      if (letter) release(body, 'cut', 9); else { body.mode = 'cut'; body.age = 0; body.life = 9; }
    }
    // What it throws out: a star of light, stars and sparks, and for a knockout the paper's own shreds and a word.
    impactStar(punchAt, punchFace, ko ? 0.75 + 0.4 * strength : 0.38 + 0.3 * strength, ko ? 3 : 2);
    const push = v1.copy(punchDir).multiplyScalar(1.2 + 2.5 * strength);
    fx.spray(punchAt, punchAt, push, ko ? Math.round(8 + 8 * strength) : Math.round(2 + 4 * strength), ko ? Math.round(46 + 40 * strength) : Math.round(14 + 20 * strength), false, ko ? 1.6 : 1);
    if (ko) fx.spray(punchAt, punchAt, push, Math.round(10 + 8 * strength), 0, true, 1.5);
    if (carried > 0.25) fx.spray(glove, punchAt, push, 0, 10, false, 0.2);        // (the punch carrying through the air to it)
    if (ko) {
      sounds.play('ko', 0.94 + Math.random() * 0.12, 0.85 + 0.15 * strength, punchAt);
      sounds.play(Math.random() < 0.5 ? 'slash1' : 'slash2', 0.8 + Math.random() * 0.1, 0.7, punchAt);       // (the punch's body under the knockout's ring)
      crowdGasps(0.16);
      // (round two says LATER where a letter was dealt with: the two would talk over each other)
      if (game.round !== 2 && feel.words.length > 1) {
        let word = lastWord; while (word === lastWord) word = Math.floor(Math.random() * feel.words.length);
        lastWord = word;
        ui.say(feel.words[word], feel.wordColours[word % feel.wordColours.length], v2.copy(punchAt).setY(punchAt.y + 0.17), 0.5 + 0.25 * strength);
      }
    } else sounds.play(Math.random() < 0.5 ? 'slash1' : 'slash2', 1.14 - 0.22 * strength + Math.random() * 0.1, 0.7 + 0.3 * strength, punchAt);
    hype = Math.min(1, hype + (ko ? feel.hype.ko : feel.hype.jab) * (0.6 + 0.4 * strength));
    impact = Math.max(impact, 0.35 + 0.65 * strength);
    hitStop = Math.max(hitStop, mix(feel.hitStop[0], feel.hitStop[1], ko ? 0.5 + 0.5 * strength : strength * 0.5));
    buzz('right', 0.55 + 0.45 * strength, ko ? 110 : 55);
    lastPunch = clock;
    events.on?.(ko ? 'ko' : 'punch', punchAt);
    return true;
  }

  /** The crowd's "ohh!", a moment after what caused it, from up in the stands; never twice in a row. */
  function crowdGasps(delay: number, volume = 0.7) {
    if (clock - lastOoh < 2.2) return;
    lastOoh = clock;
    const at = new Vector3(seat.x + rand(4), seat.y + 1.5, seat.z - 9);
    window.setTimeout(() => sounds.play('ooh', 0.95 + Math.random() * 0.1, volume, at), delay * 1000);
  }

  /**
   * A knockout: the body breaks up from where it was hit, like a pane starred by a stone: lines
   * through that point, then each wedge broken across. The pieces go down the ring with the punch
   * and out from where it landed, and keep the letter's count of hits.
   */
  function smash(body: Body, x: number, y: number, speed: number, strength: number, hits: number) {
    const feel = theme.punch!, mesh = body.mesh, sheet = body.sheet;
    const room = Math.max(0, shatter.most - loose.length), lines = room < 6 ? 2 : strength > 0.75 ? 4 : 3;
    let parts: Float32Array[] = [body.soup.data];
    const start = Math.random() * Math.PI;
    for (let i = 0; i < lines; i++) {
      const a = start + (i + rand(0.22)) * Math.PI / lines, nx = -Math.sin(a), ny = Math.cos(a), next: Float32Array[] = [];
      for (const part of parts) { const [p, q] = cut(part, x, y, 0, nx, ny, 0); if (p.length >= STRIDE * 3 && q.length >= STRIDE * 3) next.push(p, q); else next.push(part); }
      parts = next;
    }
    if (room >= 12) {
      const next: Float32Array[] = [];
      for (const part of parts) {
        const m = measure(part), dx = m.centre[0] - x, dy = m.centre[1] - y, d = Math.hypot(dx, dy);
        if (m.area < 0.012 || d < 0.03) { next.push(part); continue; }
        const [p, q] = cut(part, m.centre[0] + rand(0.02), m.centre[1] + rand(0.02), 0, dx / d, dy / d, 0);
        if (p.length >= STRIDE * 3 && q.length >= STRIDE * 3) next.push(p, q); else next.push(part);
      }
      parts = next;
    }
    for (const data of parts) {
      const soup = measure(data);
      const middle = v3.set(soup.centre[0], soup.centre[1], soup.centre[2]);
      const offset: [number, number] = [body.offset[0] + middle.x, body.offset[1] + middle.y];
      const outward = v2.set(middle.x - x, middle.y - y, 0), away = outward.length();
      outward.applyQuaternion(mesh.quaternion);
      mesh.localToWorld(middle);
      const piece = add(sheet, recentre(soup), false);
      piece.offset = offset; piece.knock = hits;
      piece.mesh.position.copy(middle); piece.mesh.quaternion.copy(mesh.quaternion); piece.mesh.scale.copy(mesh.scale);
      // (slower than a whole letter would go: the pieces are for watching, and for hitting again off the ropes)
      piece.vel.copy(punchDir).multiplyScalar(speed * (0.28 + 0.5 * Math.random()));
      if (away > 1e-4) piece.vel.addScaledVector(outward, (1.3 + 3.2 * strength) * (0.6 + 0.7 * Math.random()) / away);
      piece.vel.y += mix(feel.lift[0], feel.lift[1], strength) * (0.5 + Math.random());
      piece.spin.set(rand(1), rand(1), rand(1)).normalize().multiplyScalar(4 + 5 * Math.random() + 8 * strength * Math.random());
      release(piece, 'cut', 9);
    }
    remove(body);
    counts.pieces += parts.length;
  }

  /**
   * Something punched, in the air: it flies as a thing thrown does, not as paper adrift. It comes off
   * the canvas, and off the ropes (the ring is round here, as it is painted: see levels/knockout.ts);
   * over the top rope and far enough out, it is in the crowd, and gone. True if it has gone.
   */
  function ringFly(body: Body, dt: number): boolean {
    const feel = theme.punch!, mesh = body.mesh, floor = seat.y - feel.floor.drop;
    body.vel.multiplyScalar(Math.exp(-feel.drag * dt)); body.vel.y -= feel.gravity * dt;
    mesh.position.addScaledVector(body.vel, dt);
    const turn = body.spin.length() * dt;
    if (turn > 1e-5) mesh.quaternion.premultiply(q1.setFromAxisAngle(v2.copy(body.spin).normalize(), turn));
    body.spin.multiplyScalar(Math.exp(-0.35 * dt));
    const size = Math.min(0.16, body.soup.radius * mesh.scale.x * 0.5);
    // the canvas
    if (mesh.position.y < floor + 0.02 + size * 0.3 && body.vel.y < 0) {
      const down = -body.vel.y;
      mesh.position.y = floor + 0.02 + size * 0.3;
      body.vel.y = down > 0.7 ? down * feel.floor.bounce : 0; body.vel.x *= feel.floor.grip; body.vel.z *= feel.floor.grip; body.spin.multiplyScalar(0.45);
      if (down > 1.2 && clock - lastThud > 0.09) {
        lastThud = clock; sounds.play('thud', 0.9 + Math.random() * 0.25, Math.min(1, 0.22 + down * 0.11), mesh.position);
        if (down > 2.5) fx.spray(mesh.position, mesh.position, v1.set(0, 0.7, 0), 0, 6, false, 0.5);
      }
    }
    // the ropes, and past them the crowd (nothing is roped off behind the seat: what goes that way just goes)
    const dx = mesh.position.x - seat.x, dz = mesh.position.z - seat.z, out = Math.hypot(dx, dz);
    if (out > feel.ropes.radius - size && dz < 0.6) {
      const nx = dx / out, nz = dz / out, away = body.vel.x * nx + body.vel.z * nz;
      if (mesh.position.y - floor < feel.ropes.top && out < feel.ropes.radius + 0.5) {
        if (away > 0) {
          body.vel.x -= (1 + feel.ropes.bounce) * away * nx; body.vel.z -= (1 + feel.ropes.bounce) * away * nz; body.vel.y += 0.35 + 0.1 * away;
          mesh.position.x = seat.x + nx * (feel.ropes.radius - size); mesh.position.z = seat.z + nz * (feel.ropes.radius - size);
          body.spin.multiplyScalar(-0.6);
          if (away > 0.8 && clock - lastRopes > 0.12) {
            lastRopes = clock;
            sounds.play('ropes', 0.92 + Math.random() * 0.2, Math.min(1, 0.3 + away * 0.1), mesh.position);
            fx.spray(mesh.position, mesh.position, v1.set(-nx, 0.3, -nz), 0, 8, false, 0.5);
            hype = Math.min(1, hype + feel.hype.ropes * Math.min(1, away / 4));
            events.on?.('ropes', mesh.position);
          }
        }
      } else if (out > feel.out) {
        // into the crowd: flashbulbs where it went, and they love it
        fx.spray(mesh.position, mesh.position, v1.set(0, 1, 0), 0, 14, false, 1.2);
        // (a whole letter sent out is the thing; a scrap of one, much less)
        if (clock - lastOut > 1) { lastOut = clock; hype = Math.min(1, hype + feel.hype.out * (body.whole ? 1 : 0.3)); if (body.whole) crowdGasps(0.05, 0.85); events.on?.('out', mesh.position); }
        remove(body);
        return true;
      }
    }
    return false;
  }

  /** Every frame in a punch level: the glove against the letter of the moment, then against everything in the air. One punch, one hit. */
  function punches(blade: BladeTracker) {
    if (clock - lastPunch < 0.12) return;
    const whole = current;
    // (its long reach counts only once the letter is in its place, as the sword's does)
    if (whole && (whole.state !== 'arriving' || whole.t > 0.35) && tryPunch(whole.body, blade, whole.state !== 'arriving')) return;
    for (let i = loose.length - 1; i >= 0; i--) {
      const body = loose[i];
      if (body.age < 0.1 || body.mode === 'sent' || body.melting || body.sheet.burn > 0.93 || noCut.has(body)) continue;
      if (tryPunch(body, blade, true)) break;
    }
  }

  // ---------------------------------------------------------------- the spray

  let sprayBuzz = 0, lastArm = 0, lastKeep = 0;
  /**
   * The mist has touched a body at (x, y) on its face. That is all it takes: like a cut, the letter is
   * dealt with at once. The froth starts where it landed and spreads over the sheet by itself
   * (`spread`, every frame), and when it is covered it melts and runs.
   */
  function soak(body: Body, x: number, y: number) {
    if (body.melting) return;
    body.melting = true; body.spreading = true; body.dose = 0.08;
    const sheet = body.sheet, u = sheet.material.uniforms, mesh = body.mesh;
    const splats = u.splats.value as Vector3[];
    splats[0].set(x, y, 1); splats[1].set(x + rand(0.05), y + rand(0.04), 0.6); splats[2].set(x + rand(0.08), y + rand(0.05), 0.35);
    u.wet.value = body.dose; u.mark.value = 0; u.gold.value = 0; u.flash.value = 0; u.hover.value = 0;
    // a splash where it landed, and the sizzle that runs on into the melt
    mesh.updateMatrixWorld(true);
    const at = v3.set(x, y, 0.015); mesh.localToWorld(at);
    fx.spray(at, at, v4.set(0, 0.35, 0).addScaledVector(v1.set(0, 0, 1).applyQuaternion(mesh.quaternion), 0.6), body.hazard ? 10 : 6, body.hazard ? 34 : 22, false, 0.6);
    sounds.play(Math.random() < 0.5 ? 'melt1' : 'melt2', 0.94 + Math.random() * 0.14, body.hazard ? 1 : 0.85, mesh.position);
    buzz('right', body.hazard ? 0.9 : 0.7, body.hazard ? 90 : 60); hitStop = 0.035;
    counts.cut++;
    const letter = current;
    if (body.mark >= 0 && !stillSaved(body)) settle(body, 'cut');          // (thrown, then sprayed out of the air: in round two it was never put off; saved in round one, it stays saved)
    if (letter && letter.body === body) {
      settle(body, 'cut');
      current = null; nextIn = tune.nextAfterCut + 0.25;
      body.vel.set(0, 0.02, 0); body.spin.set(rand(0.2), rand(0.2), rand(0.2));
      release(body, 'cut', 9);
    } else { body.mode = 'cut'; body.age = 0; body.life = 9; }
    events.on?.('cut', mesh.position);
  }
  /** Every frame for a body the mist has touched: the froth spreads; covered, it melts. */
  function spread(body: Body, dt: number) {
    const sheet = body.sheet, u = sheet.material.uniforms, mesh = body.mesh;
    body.dose = Math.min(1, body.dose + dt / (body.hazard ? spray.hazardSpread : spray.spread));
    const e = body.dose * body.dose * (3 - 2 * body.dose);
    u.wet.value = e;
    for (const splat of u.splats.value as Vector3[]) splat.z = Math.min(1, splat.z + dt * 3);
    if (Math.random() < dt * 30) {
      // froth spitting off it as it spreads
      const at = v3.set(rand(W / 2 * e), rand(H / 2 * e), 0.012); mesh.localToWorld(at);
      fx.spray(at, at, v4.set(rand(0.25), 0.3, rand(0.25)), Math.random() < 0.4 ? 1 : 0, 1, false, 0.4);
    }
    if (body.dose < 1) return;
    // covered: now it melts and runs
    body.spreading = false;
    sheet.burnAt = clock - 1e-3;
    mesh.updateMatrixWorld(true);
    const a = new Vector3(-W / 2, -H / 2, 0), b = v4.set(W / 2, -H / 2, 0); mesh.localToWorld(a); mesh.localToWorld(b);
    fx.spray(a, b, v3.set(0, -0.5, 0), body.hazard ? 22 : 14, body.hazard ? 60 : 34, false, 0.7);
    buzz('right', 0.35, 40);
    events.on?.('melt', mesh.position);
  }
  /** Is the mist reaching this body? If so, soak it where the nozzle's line passes. */
  function mist(body: Body, tool: SprayTool): boolean {
    if (body.melting) return false;
    const mesh = body.mesh;
    const to = v1.copy(mesh.position).sub(tool.origin), along = to.dot(tool.direction);
    if (along <= 0.05 || along > spray.range) return false;
    const off = Math.sqrt(Math.max(0, to.lengthSq() - along * along));
    const reach = 0.24 * body.size + Math.tan(spray.cone) * along;
    if (off > reach) return false;
    mesh.updateMatrixWorld(true);
    const at = v2.copy(tool.origin).addScaledVector(tool.direction, along).applyMatrix4(m1.copy(mesh.matrixWorld).invert());
    // (the end's logo takes its hits from the spray too, like a blade's: one at a time, LOGO_HITS to break it)
    // (the bar and the line too, so a sprayer can beat them all: 2026-11-12)
    if (shows.some(x => (x.kind === 'logo' || x.kind === 'bar' || x.kind === 'line') && x.body === body)) { const turn = Math.random() * Math.PI; slice(body, at.x, at.y, Math.cos(turn), Math.sin(turn), v1.copy(tool.direction).multiplyScalar(3), 0.6); return true; }
    soak(body, Math.max(-W / 2 + 0.03, Math.min(W / 2 - 0.03, at.x)), Math.max(-H / 2 + 0.03, Math.min(H / 2 - 0.03, at.y)));
    return true;
  }

  // ---------------------------------------------------------------- flight

  /** Paper in the air: it falls slowly, slides edge-on, is stopped face-on, and tumbles. */
  function fly(body: Body, dt: number, gravity: number, faceDrag: number, drag: number) {
    const n = v1.set(0, 0, 1).applyQuaternion(body.mesh.quaternion);
    const into = body.vel.dot(n);
    body.vel.addScaledVector(n, -into * (1 - Math.exp(-faceDrag * dt)));
    body.vel.multiplyScalar(Math.exp(-drag * dt));
    body.vel.y -= gravity * dt;
    body.vel.x += Math.sin(body.age * 4.3 + body.seed) * 0.5 * dt; body.vel.z += Math.cos(body.age * 3.7 + body.seed * 1.9) * 0.4 * dt;
    // the air turns it over as it falls
    body.spin.addScaledVector(v2.crossVectors(n, body.vel), 1.4 * dt).multiplyScalar(Math.exp(-0.8 * dt));
    const mesh = body.mesh;
    mesh.position.addScaledVector(body.vel, dt);
    const turn = body.spin.length() * dt;
    if (turn > 1e-5) mesh.quaternion.premultiply(q1.setFromAxisAngle(v2.copy(body.spin).normalize(), turn));
    if (mesh.position.y < 0.012) { mesh.position.y = 0.012; body.vel.set(0, 0, 0); body.spin.multiplyScalar(Math.exp(-9 * dt)); }
  }

  /** On a monitor: cut the letter in front of you as a swing would. */
  function keyCut() {
    const letter = current;
    // at the end of a game: the logo, cut (or in the lab, sprayed) across somewhere near its middle
    const next = !letter && ['logo', 'line', 'bar', 'mail', 'bonus', 'start'].map(kind => shows.find(x => x.kind === kind && x.gone < 0 && x.body.mode === 'show' && loose.includes(x.body) && x.body.age > 0.3)).find(Boolean);
    if (next) {
      if (theme.mechanic === 'spray' && next.kind !== 'logo') { soak(next.body, rand(0.2), rand(0.02)); return; }
      const angle = rand(0.5);
      slice(next.body, rand(next.kind === 'logo' ? 0.25 : 0.15), rand(0.02), Math.cos(angle), Math.sin(angle), v1.set(Math.cos(angle) * 6, Math.sin(angle) * 6, -1), 0.9);
      return;
    }
    if (!letter) return;
    if (theme.mechanic === 'punch') {
      // (a punch from where a right hand would be: sometimes a tap, sometimes everything)
      if (letter.state === 'arriving' && letter.t < 0.35) return;
      landPunch(letter.body, rand(0.16), rand(0.09), 0.12 + Math.random() * 0.88, new Vector3(rand(0.3), 0.05 + rand(0.15), -1).normalize(), new Vector3(seat.x + 0.2, seat.y - 0.3, seat.z - 0.5), 0);
      return;
    }
    if (theme.mechanic === 'spray') { if (letter.state !== 'arriving' || letter.t > 0.5) letter.forced = true; return; }
    if (docked(letter.body)) { if (letter.state !== 'waiting') return; letter.body.mesh.scale.setScalar(letter.body.size); }
    const angle = (Math.random() < 0.5 ? 0.5 : -0.5) + rand(0.5);
    const push = new Vector3(Math.cos(angle) * 6, Math.sin(angle) * 6, -1).applyQuaternion(letter.body.mesh.quaternion);
    if (slice(letter.body, rand(0.12), rand(0.06), Math.cos(angle), Math.sin(angle), push, 0.6)) { sounds.swing(0.6, letter.home); wasCut(letter); }
  }
  /** On a monitor: throw it, as the left hand would. */
  function keyKeep() {
    const letter = current;
    if (!letter || letter.state === 'arriving' && letter.t < 0.6) return;
    letter.body.vel.set(rand(2.4), 1.2 + Math.random() * 1.2, -1.5 - Math.random() * 2);
    letGo(letter);
  }
  /** On a monitor, round two: hold it at the left reply or KEEP (1), the right reply or REDO (2), or the mic (M). Again to stop. */
  function keySend(which: number) {
    const letter = current;
    if (!letter || !letter.email || game.round !== 2 || game.phase !== 'play') return;
    game.keyAim = game.keyAim === which ? -1 : which;
  }
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).matches?.('input,select,button,summary,textarea') || e.repeat) return;
    if (e.key.toLowerCase() === 'x') keyCut();
    if (e.key.toLowerCase() === 'c') keyKeep();
    if (e.key === '1') keySend(0); if (e.key === '2') keySend(1); if (e.key.toLowerCase() === 'm') keySend(2);
  };
  window.addEventListener('keydown', onKey);

  const GRAB_SETTLE = 0.45;      // seconds a taken letter takes to come to its held size
  const smooth01 = (t: number) => { const x = clamp01(t); return x * x * (3 - 2 * x); };
  /** The left hand takes hold of it (or takes it back, falling away). */
  function take(letter: Current, head: Vector3) {
    const body = letter.body, mesh = body.mesh;
    hand.used = true;
    letter.state = 'held'; letter.heldFor = 0; letter.flick = -1; letter.grabbedAt.copy(hand.pos);
    letter.seen = body.size / Math.max(0.3, head.distanceTo(mesh.position)); letter.holdSize = body.size;
    letter.grip.copy(hand.matrix).invert().multiply(m1.compose(mesh.position, mesh.quaternion, v1.set(1, 1, 1)));      // (where it is and how it is turned, not its size)
    letter.free.copy(mesh.position); letter.docked = 0; letter.dockedAt = -1;
    sounds.play('blip', 1.25, 0.45, hand.pos); buzz('left', 0.4, 25);
  }
  /**
   * Round two: a letter thrown away (or let go of away from the targets) is not left for tomorrow
   * until it has gone: while it is still falling away, uncut, the hand can take it back.
   */
  let away: Current | null = null;
  function goneAway() {
    const letter = away;
    if (!letter) return;
    away = null;
    settle(letter.body, 'tomorrow');
    game.stage = 'pick'; game.recording = false; game.aim = -1; game.keyAim = -1; ui.replies(null, null);
    nextIn = tune.nextAfterKeep;
  }
  /** Every frame in round two: has the one falling away gone (or been cut), or has the hand taken it back? */
  function watchAway(dt: number, head: Vector3) {
    const letter = away;
    if (!letter) return;
    const body = letter.body, u = body.sheet.material.uniforms;
    if (body.mode !== 'kept' || !loose.includes(body) || game.phase !== 'play') { goneAway(); return; }
    let can = false;
    if (hand.valid && body.going < 0.5) { body.mesh.updateMatrixWorld(true); can = lineTo(body) <= tune.reachRadius || reachTo(body, hand.pos) <= 0; }
    u.hover.value += ((can ? 1 : 0) - u.hover.value) * Math.min(1, dt * 10);
    if (can && hand.pressed && !hand.used && hand.pressAge < 0.6) {
      // taken back: out of the air and in the hand again, as it was
      loose.splice(loose.indexOf(body), 1);
      body.mode = 'held'; body.going = -1; u.gold.value = 0; u.flash.value = 0; u.mark.value = 0;
      body.mesh.scale.setScalar(body.size);
      away = null; current = letter;
      take(letter, head);
      ui.say('BACK!', MARKS.reply, body.mesh.position, 0.5);
    }
  }

  /** The letter leaves the hand (or the key was pressed): it is kept. */
  function letGo(letter: Current) {
    const body = letter.body, speed = body.vel.length();
    if (letter.state === 'held') body.size = body.mesh.scale.x;          // (as it looks now: smaller, if it was at a target)
    if (letter.email && game.phase === 'play' && game.round === 2) {
      // Round two: a reply is sent by holding the letter at it, not by throwing. Let go of gently at a
      // target, or while dictating, it floats back to wait (and what was said is kept); thrown, or let go
      // of anywhere else, it is left for tomorrow.
      game.aim = -1; ui.aim(-1, 0);
      if (speed < 1.1 && (game.stage !== 'pick' || nearTarget(body.mesh.position) >= 0)) { backToWait(letter); return; }
    }
    if (speed < 0.7) {
      // just let go of: it lifts away from whoever held it rather than dropping in their lap
      body.vel.add(v1.set(0, 0.55, -0.75));
    }
    const n = v1.set(0, 0, 1).applyQuaternion(body.mesh.quaternion);
    body.spin.crossVectors(n, body.vel).multiplyScalar(0.8).add(v2.set(rand(1.2), rand(1.2), rand(2.5)));
    body.from.copy(body.mesh.position); body.going = -1;
    release(body, 'kept', tune.throwLife);
    // It is marked as one that matters (a flash, a ring of sparks), but not kept yet: that is when it gets away.
    body.sheet.material.uniforms.flash.value = 1; body.sheet.material.uniforms.hover.value = 0;
    fx.spray(body.mesh.position, body.mesh.position, v1.copy(body.vel).multiplyScalar(0.4), 0, 16, false, 1.4);
    // (Kyoto: a little koto-and-taiko flourish instead, one of three, never the same twice running)
    // A video-game swoosh as it goes, in every level, one of three and never the same twice running
    // (asked for on 2026-11-11, in place of Kyoto's coin chimes and the old chime elsewhere)
    // the user's own throw sound (2026-11-11), a touch higher or lower each time so it never quite repeats
    sounds.play('throw', 0.95 + Math.random() * 0.1, 0.5, body.mesh.position);      // (quieter than the other effects: asked for on 2026-11-11)
    sounds.swing(clamp01(speed / 6), body.mesh.position);
    buzz('left', 0.55, 40);
    // a word floats up from where it was thrown: SAVED, or in round two LATER (asked for on 2026-11-11)
    const playing = !!letter.email && game.phase === 'play';
    if (playing && game.round === 2) {
      ui.say('LATER', LATER, body.mesh.position, 0.55);
      away = letter; nextIn = Infinity;              // (settled once it has gone: until then it can be taken back)
    } else {
      if (playing) ui.say('SAVED', MARKS.kept, body.mesh.position, 0.55);
      settle(body, 'kept'); nextIn = tune.nextAfterKeep;
    }
    counts.thrown++; current = null;
    events.on?.('thrown', body.mesh.position);
  }

  // ---------------------------------------------------------------- every frame

  function update(dt: number, frame: XRFrame | undefined, blade: BladeTracker, head: Vector3, night: number, tool?: SprayTool) {
    if (!active) return;
    clock += dt;
    readHand(dt, frame, head);
    if (away) watchAway(dt, head);
    for (const sheet of sheets) { sheet.material.uniforms.night.value = night; sheet.material.uniforms.time.value = clock; }
    aura.uniforms.time.value = clock; aura.uniforms.level.value = 1;
    sparkle.uniforms.time.value = clock; sparkle.uniforms.pixelRatio.value = world.renderer.getPixelRatio();

    // ---- the letter in front of you
    const letter = current;
    if (letter) {
      const body = letter.body, mesh = body.mesh;
      // (in round two it does not run out of time while it is being answered: held at a target, or dictated to)
      body.age += game.round === 2 && (game.aim >= 0 || game.stage !== 'pick') ? 0 : dt;
      const dock = letter.state === 'held' ? undefined : theme.dock;
      if (dock) {
        // Shown on something (the monitor): it switches on like a picture tube, a bright line that
        // opens; it stays there; and left alone too long it closes to a line again and is gone.
        body.size = dock.place(mesh.position, mesh.quaternion);
        let wide = 1, tall = 1;
        if (letter.state === 'arriving') {
          letter.t = Math.min(1, letter.t + dt / letter.arriveSeconds);
          wide = clamp01(letter.t / 0.4); wide *= 2 - wide; tall = clamp01((letter.t - 0.3) / 0.7); tall *= tall * (3 - 2 * tall);
          if (letter.t >= 1) {
            letter.state = 'waiting'; body.age = 0; prepare();
            for (const sheet of sheets) if (sheet !== body.sheet && sheet.cutAt < Infinity && sheet.burnAt === Infinity) sheet.burnAt = clock;
          }
        } else if (letter.state === 'waiting') {
          if (body.age > (game.round === 2 ? tune.workSeconds : dock.wait ?? tune.waitSeconds)) { letter.state = 'passing'; letter.t = 0; sounds.swing(0.25, mesh.position); }
        } else {
          letter.t = Math.min(1, letter.t + dt / 0.3);
          tall = 1 - clamp01(letter.t / 0.55); tall *= tall; wide = 1 - clamp01((letter.t - 0.45) / 0.55);
          if (letter.t >= 1) { events.on?.('missed', mesh.position); settle(body, game.round === 2 ? 'tomorrow' : 'missed'); remove(body); counts.missed++; current = null; nextIn = 0.25; }
        }
        mesh.scale.set(body.size * (0.03 + 0.97 * wide), body.size * (0.03 + 0.97 * tall), body.size);
      } else if (letter.state === 'arriving') {
        letter.t = Math.min(1, letter.t + dt / letter.arriveSeconds);
        const e = 1 - Math.pow(1 - letter.t, letter.arriveEase), back = 1 - e;
        // out of the garden along a curve, turning to face you as it slows
        mesh.position.copy(letter.from).multiplyScalar(back * back).addScaledVector(letter.via, 2 * back * e).addScaledVector(letter.home, e * e);
        mesh.quaternion.slerpQuaternions(letter.start, letter.face, e);
        mesh.scale.setScalar(letter.startScale + (1 - letter.startScale) * e);
        if (letter.sway > 0) {
          // a haunted thing does not come straight: it drifts from side to side and rocks, less and less
          mesh.position.x += Math.sin(letter.t * 8.5 + body.seed) * 4 * letter.sway * back;
          mesh.position.y += Math.sin(letter.t * 13 + body.seed * 2) * 1.2 * letter.sway * back;
          mesh.quaternion.multiply(q1.setFromAxisAngle(v1.set(0, 0, 1), Math.sin(letter.t * 15 + body.seed) * letter.sway * (0.25 + back)));
        }
        if (theme.look.spell?.trail && Math.random() < dt * 70) fx.spray(mesh.position, mesh.position, v2.set(rand(0.2), 0.15, 0.5), 0, 1, false, 0.35);       // lights left behind it
        if (letter.t >= 1) {
          // It is in focus. What is left of the one before has had its time: now it burns.
          letter.state = 'waiting'; body.age = 0; prepare();
          for (const sheet of sheets) if (sheet !== body.sheet && sheet.cutAt < Infinity && sheet.burnAt === Infinity) sheet.burnAt = clock;
        }
      } else if (letter.state === 'waiting') {
        // It keeps coming, slowly: bigger as it comes, down towards the hands, never quite still.
        const work = game.round === 2;
        const t = body.age + body.seed, come = Math.min(1, body.age / (work ? tune.workSeconds : tune.waitSeconds));
        mesh.position.lerpVectors(letter.home, letter.near, work ? come * 0.3 : come);
        mesh.position.x += Math.sin(t * 0.7) * 0.008; mesh.position.y += Math.sin(t * 1.25) * 0.011; mesh.position.z += Math.sin(t * 0.9) * 0.006;
        look.position.copy(mesh.position); look.lookAt(head.x, head.y - 0.04, head.z);
        mesh.quaternion.copy(look.quaternion).multiply(q1.setFromAxisAngle(v1.set(Math.sin(t * 0.8) * 0.6, Math.cos(t * 0.6), Math.sin(t * 1.1) * 0.7).normalize(), 0.045));
        if (come >= 1) {
          // nobody dealt with it: past the shoulder it goes
          letter.state = 'passing'; letter.t = 0;
          letter.from.copy(mesh.position); letter.start.copy(mesh.quaternion);
          sounds.swing(0.25, mesh.position);
        }
      } else if (letter.state === 'passing') {
        letter.t = Math.min(1, letter.t + dt / tune.passSeconds);
        const e = letter.t * letter.t;
        mesh.position.lerpVectors(letter.from, letter.past, e);
        mesh.position.y += Math.sin(letter.t * Math.PI) * 0.06;
        mesh.quaternion.copy(letter.start).multiply(q1.setFromAxisAngle(v1.set(0.3, letter.past.x < head.x ? 1 : -1, 0.2).normalize(), e * 1.3));
        if (letter.t >= 1) { events.on?.('missed', mesh.position); settle(body, game.round === 2 ? 'tomorrow' : 'missed'); remove(body); counts.missed++; current = null; nextIn = 0.25; }
      }
      if (current === letter && (letter.state === 'waiting' || letter.state === 'held')) read(body.sheet, dt);
      if (current === letter && letter.state !== 'held') {
        mesh.updateMatrixWorld(true);
        // The hand can take it by being at it, or by reaching towards it: its reach line passing close enough.
        const can = hand.valid && (letter.state !== 'arriving' || letter.t > 0.6)
          && (lineTo(body) <= tune.reachRadius || reachTo(body, hand.pos) <= 0);
        const u = body.sheet.material.uniforms;
        u.hover.value += ((can ? 1 : 0) - u.hover.value) * Math.min(1, dt * 10);
        if (can && !hand.onLetter) buzz('left', 0.12, 12);        // a tick as the reach finds it
        hand.onLetter = can;
        // (the grip has to close for this letter: one still closed from the last throw does not take the next)
        if (can && hand.pressed && !hand.used && hand.pressAge < 0.6) {
          take(letter, head);
        }
      }
      if (current === letter && letter.state === 'held') {
        letter.heldFor += dt;
        if (!hand.valid) { body.vel.set(0, 0, 0); letGo(letter); }
        else {
          // Taken from a distance, it comes in to the hand; then it follows a breath behind, as a sheet of paper would.
          v2.setFromMatrixPosition(letter.grip);
          const out = v2.length();
          if (game.round === 2 && game.phase === 'play') {
            // round two: held further out than in round one, out where the replies are (nearer or further, it eases there)
            if (out < 1e-3) v2.set(0, 0, -1);
            const want = tune.workHold, to = out + (want - out) * (1 - Math.exp(-dt * 7));
            letter.grip.setPosition(v2.setLength(to));
          } else if (out > tune.holdDistance) letter.grip.setPosition(v2.multiplyScalar(Math.max(tune.holdDistance / out, Math.exp(-dt * 9))));
          m1.copy(hand.matrix).multiply(letter.grip);
          v1.setFromMatrixPosition(m1); q1.setFromRotationMatrix(m1);
          letter.free.copy(v1);
          if (game.round === 2 && game.phase === 'play') {
            // Near a reply (or KEEP, REDO, the mic) it gets a little smaller so the reply still shows; it is
            // not pulled anywhere: it stays where the hand has it (asked for on 2026-11-11, after a version
            // that drew it into the target's plane).
            const at = targetNear(v1, letter.dockedAt, true);
            if (at >= 0) letter.dockedAt = at;
            letter.docked += ((at >= 0 ? 1 : 0) - letter.docked) * (1 - Math.exp(-dt * 10));
            if (letter.docked < 0.01 && at < 0) letter.dockedAt = -1;
          }
          const ease = 1 - Math.exp(-dt * 28);
          mesh.position.lerp(v1, ease); mesh.quaternion.slerp(q1, ease);
          // It keeps the size it had to the eye where it was taken, and just a bit more: so nearer the
          // head it is made smaller by as much as it has come closer. Settled once it has come in.
          // (2026-11-12: "it zooms up then back down when grabbing": the extra size was there from the first frame,
          // while it was still far off, and the size lagged behind it coming in. Now the extra comes in with it, and
          // the size follows the distance exactly until it has settled, so it only ever grows, smoothly.)
          if (letter.heldFor < GRAB_SETTLE) {
            const grow = 1 + (tune.holdGrow - 1) * smooth01(letter.heldFor / GRAB_SETTLE);
            letter.holdSize = Math.max(0.25, Math.min(1.6, letter.seen * grow * head.distanceTo(mesh.position)));      // (up to 1.6 times its own size: the 1 it was capped at would hide a bigger holdGrow)
            body.size = letter.holdSize;
          } else body.size += (letter.holdSize - body.size) * (1 - Math.exp(-dt * 12));
          mesh.scale.setScalar(body.size * (1 - tune.dockShrink * letter.docked));      // (smaller at a target, so the reply still shows)
          body.sheet.material.uniforms.hover.value = 1;
          body.vel.copy(hand.best).multiplyScalar(tune.throwBoost);
          // Swept fast enough, it leaves the hand by itself: once the sweep has passed its fastest, so none of the throw is lost.
          const speed = hand.vel.length();
          if (letter.flick < 0 && letter.heldFor > 0.15 && speed > tune.flickSpeed && hand.pos.distanceTo(letter.grabbedAt) > 0.12) letter.flick = 0;
          if (letter.flick >= 0) letter.flick += dt;
          const thrown = letter.flick >= 0 && (speed < hand.best.length() * 0.9 || letter.flick > 0.16);
          if (!hand.pressed || thrown) letGo(letter);
        }
      }
    }

    // ---- the thread from the hand: to the letter the reach has found, or the one coming in to the hand
    {
      const now = current;
      let to: Vector3 | null = null, want = 0;
      if (now && hand.valid) {
        if (now.state === 'held') { to = now.body.mesh.position; want = clamp01((to.distanceTo(hand.pos) - 0.12) * 4) * 0.6; }
        else if (hand.onLetter) { to = now.body.mesh.position; want = 0.75; }      // to the letter itself: the reach is generous, the thread says what it has found
      }
      // the end of a game: the same thread to what the left hand has, or would take (the logo, the bar, the line, an
      // email), as the emails have it (2026-11-12: "make the line for grabbing show on end scene like when grabbing email")
      if (END_GRAB && !to && hand.valid && game.phase === 'summary') {
        const held = shows.find(x => x.held);
        if (held) { to = threadAt.copy(held.body.mesh.position); want = clamp01((to.distanceTo(hand.pos) - 0.12) * 4) * 0.6; }
        else {
          let best: Show | null = null, bestGap = 0;
          for (const show of shows) {
            if (show.gone >= 0 || show.body.mode !== 'show' || !loose.includes(show.body) || show.body.age < 0.5) continue;
            const gap = reachShow(show); if (gap <= bestGap) { bestGap = gap; best = show; }
          }
          if (best) { to = threadAt.copy(best.body.mesh.position); want = 0.75; }
        }
      }
      threadFade += ((to ? want : 0) - threadFade) * Math.min(1, dt * 14);
      if (to && threadFade > 0.01) {
        const span = v1.subVectors(to, hand.pos), length = span.length();
        if (length > 0.02) {
          thread.position.copy(hand.pos);
          thread.quaternion.setFromUnitVectors(up, span.divideScalar(length));
          thread.scale.set(0.0028, length, 0.0028);
        }
      }
      thread.visible = threadFade > 0.01;
      threadMaterial.uniforms.fade.value = threadFade;
    }

    // ---- the blade against everything made of paper. With a controller it cuts only while the
    // trigger is held (tune.triggerToCut), so it can be waved about; on a monitor it always cuts.
    const spraying = theme.mechanic === 'spray', punching = theme.mechanic === 'punch';      // (a glove needs no trigger: a fist is a fist)
    let trigger = 1;
    const session = world.renderer.xr.isPresenting ? world.renderer.xr.getSession() : null;
    if (spraying) trigger = tool && tool.valid ? tool.on : 0;         // a sprayer sprays only while its trigger is held, always
    else if (session && tune.triggerToCut && !punching) {
      trigger = 0;
      for (const source of session.inputSources) if (source.handedness === 'right') trigger = source.gamepad?.buttons?.[0]?.value ?? 0;
    }
    const live = trigger > 0.25;
    if (live && !armed && !punching && (spraying || (session && tune.triggerToCut))) {
      // made ready: a tick in the hand and the sound of a blade drawn (the glow and the hum are liveblade.ts and ambience.ts)
      buzz('right', 0.3, 18);
      // (Kyoto has four takes of its own, one picked each time, never the same twice running, so the sword is not the same each time it is made ready)
      if (theme.id === 'kyoto') { let take = lastArm; while (take === lastArm) take = 1 + Math.floor(Math.random() * 4); lastArm = take; sounds.play(`arm${take}`, 0.95 + Math.random() * 0.1, 0.55, blade.tip); }
      else sounds.play('arm', 0.97 + Math.random() * 0.08, 0.5, spraying && tool ? tool.origin : blade.tip);
    }
    armed = live;
    if (spraying) {
      // The lab: nothing is cut. Whatever the mist reaches soaks, froths, and at a full dose melts.
      let reached = false;
      if (armed && tool) {
        const now = current;
        if (now && (now.state !== 'arriving' || now.t > 0.6)) reached = mist(now.body, tool);
        for (let i = loose.length - 1; i >= 0; i--) if ((loose[i].mode === 'kept' || loose[i].mode === 'show') && !noCut.has(loose[i])) reached = mist(loose[i], tool) || reached;
      }
      const forced = current;
      if (forced?.forced) { soak(forced.body, rand(0.12), rand(0.07)); reached = true; }
      sprayBuzz = reached ? sprayBuzz + dt : 0;
      if (sprayBuzz > 0.07) { sprayBuzz = 0; buzz('right', 0.2, 30); }
    } else if (punching) {
      // Knockout: nothing is cut. Whatever the glove lands on is knocked across the ring, or broken up.
      if (blade.moving && bladeSeen && dt > 0.001) punches(blade);
    } else if (armed && blade.moving && bladeSeen && dt > 0.001) {
      const whole = current, dock = whole ? docked(whole.body) : undefined;
      // (one shown on something can be hit once its picture has opened; it is measured at its full size)
      const ready = !!whole && (!dock || whole.state === 'waiting' || (whole.state === 'arriving' && whole.t > 0.45));
      if (whole && dock && ready) { keptScale.copy(whole.body.mesh.scale); whole.body.mesh.scale.setScalar(whole.body.size); }
      // (the sword's long reach counts only once the letter is in its place, not on its way in)
      if (whole && ready && tryBlade(whole.body, blade, dt, !!dock || whole.state !== 'arriving', dock)) wasCut(whole);
      else {
        if (whole && dock && ready) whole.body.mesh.scale.copy(keptScale);
        for (let i = loose.length - 1; i >= 0; i--) {
          const body = loose[i];
          // Pieces can be hit for as long as they are in the air, burning or not (asked for on 2026-11-11:
          // "the email shards should be able to be cut until they are off screen"); once there are a lot
          // of them a hit bursts the piece rather than splitting it (tryBlade).
          if (body.age < 0.06 || body.mode === 'sent' || body.melting || body.sheet.burn > 0.93 || noCut.has(body)) continue;
          const kept = body.mode === 'kept';
          const endPiece = game.phase === 'summary' && shows.some(x => x.body === body && (x.kind === 'logo' || x.kind === 'bar' || x.kind === 'line'));
          if (!tryBlade(body, blade, dt, true, undefined, loose.length >= MAX_LOOSE, endPiece)) continue;
          if (kept) {
            // cut out of the air: what falls is only paper. Saved in round one, it stays saved (2026-11-12: "when an
            // email is thrown and its marked as saved, make it so you can still cut it, but its still saved");
            // in round two, thrown for later, a cut still makes it later
            if (!stillSaved(body)) { settle(body, 'cut'); counts.cut++; } else counts.kept++;
            const u = body.sheet.material.uniforms; u.mark.value = 0; u.gold.value = 0; u.flash.value = 0;
          }
          buzz('right', 0.6, 40);
          break;
        }
      }
    }
    bladeSeen = blade.moving;
    if (blade.moving) { lastTip.copy(blade.tip); lastBase.copy(blade.base); }

    // ---- paper in the air. A cut holds everything still for a moment: that is the hit landing.
    hitStop = Math.max(0, hitStop - dt);
    hype = Math.max(0, hype - (theme.punch?.hype.fade ?? 1) * dt);
    const flightDt = hitStop > 0 ? dt * 0.08 : dt;
    for (let i = loose.length - 1; i >= 0; i--) {
      const body = loose[i];
      body.age += flightDt;
      if (body.spreading) spread(body, flightDt);
      if (body.mode === 'show') { const show = shows.find(x => x.body === body); if (show) floatShow(show, flightDt); continue; }
      if (body.mode === 'sent') {
        // On its way to a reply or the mic: in an arc, shrinking, and there it is taken.
        const t = Math.min(1, body.age / body.life), e = t * t * (3 - 2 * t), to = ui.targets[body.target];
        body.mesh.position.lerpVectors(body.from, to, e); body.mesh.position.y += Math.sin(t * Math.PI) * 0.07;
        body.mesh.scale.setScalar(body.size * (1 - 0.72 * e));
        if (t >= 1) {
          fx.spray(to, to, v1.set(0, 0.6, 0), 6, 30, false, 0.9);
          ui.sent(body.target); buzz('left', 0.5, 40);
          sounds.play('blip', 1.6, 0.6, to); sounds.play('blip', 2.1, 0.4, to);
          remove(body);
        }
        continue;
      }
      if (body.mode === 'kept') {
        // Thrown, it is simply paper in the air, at the speed it was thrown. It can be cut all the
        // way; once it has had its flight, landed, or gone far off, it turns to light: kept.
        fly(body, flightDt, tune.throwGravity, 0.5, tune.throwDrag);
        if (body.going < 0 && (body.age > body.life || body.mesh.position.y <= 0.013 || body.mesh.position.distanceTo(body.from) > 8)) body.going = 0;
        if (body.going >= 0) body.going += flightDt / 0.45;
        const gone = clamp01(body.going);
        const u = body.sheet.material.uniforms;
        u.gold.value = gone * gone;
        u.flash.value *= Math.exp(-flightDt * 9);
        u.mark.value = (0.6 + 0.4 * Math.sin(body.age * 17)) * (1 - gone * 0.5);
        body.mesh.scale.setScalar(body.size * (1 - Math.pow(gone, 2) * 0.85));
        if (Math.random() < flightDt * 40) fx.spray(body.mesh.position, body.mesh.position, v1.copy(body.vel).multiplyScalar(0.15), 0, 1, false, 0.25);
        if (gone >= 1) {
          // It got away: now it is kept. Gone, in a breath of light and blossom.
          counts.kept++; events.on?.('kept', body.mesh.position);
          fx.spray(body.mesh.position, body.mesh.position, v1.copy(body.vel).multiplyScalar(0.25), 6, 26, false, 0.9);
          sounds.play('blip', 1.9, 0.22, body.mesh.position);
          remove(body);
        }
      } else {
        // pieces hang and turn in the air rather than drop: they can be cut again until the next letter is in place
        if (body.knock > 0 && theme.punch) { if (ringFly(body, flightDt)) continue; }      // (punched: it flies about the ring, and may leave it)
        else fly(body, flightDt, 0.9, 3.6, 1.5);
        if (body.mode === 'cut' && body.sheet.burn > 0.05 && Math.random() < flightDt * 14)
          fx.spray(body.mesh.position, body.mesh.position, v1.set(0, 0.3, 0), 1, 1, Math.random() < 0.5, 0.35);
        if (body.age > body.life) remove(body);
      }
    }
    for (const sheet of shows.length || endSheets.length || oldSheets.length ? [...sheets, ...new Set([...shows.map(x => x.sheet), ...endSheets, ...oldSheets])] : sheets) {
      const u = sheet.material.uniforms;
      (u.heat.value as Vector3).multiplyScalar(Math.exp(-flightDt * 2.6));
      if (theme.mechanic === 'punch') u.flash.value *= Math.exp(-flightDt * 9);      // (a punch's flash)
      // (and if no next letter ever comes into focus, it still goes in the end)
      if (sheet.burnAt === Infinity && clock - sheet.cutAt > 8) sheet.burnAt = clock;
      if (clock > sheet.burnAt) {
        sheet.burn = Math.min(1, sheet.burn + flightDt / (theme.look.burnStyle >= 2 ? spray.meltSeconds : 1.0));
        u.burn.value = sheet.burn;
        if (sheet.burn >= 1) { for (let i = loose.length - 1; i >= 0; i--) if (loose[i].sheet === sheet) remove(loose[i]); sheet.burnAt = Infinity; sheet.cutAt = Infinity; }
      }
    }
    for (const streak of streaks) {
      if (!streak.mesh.visible) continue;
      streak.age += dt / 0.2;
      if (streak.age >= 1) { streak.mesh.visible = false; continue; }
      streak.material.uniforms.fade.value = (1 - streak.age) * (1 - streak.age);
      streak.mesh.scale.set((0.7 + streak.age * 0.9) * streak.size, 0.07 * (1 - streak.age * 0.6) * streak.size, 1);
    }

    // ---- the next one
    seat.copy(head);
    if (game.phase === 'ready') {
      // A game starts straight on its countdown (there was a title letter to cut first; taken out on
      // 2026-11-11). A moment first, for the headset to say where the player's head is.
      if ((game.timer += dt) > 0.8) beginIntro(1);
    } else if (game.phase === 'intro') {
      // The round's name and how much there is, which come in and then stay still; under them a ring
      // that fills over the ready seconds, a tick each second; then GO, and the first letter.
      // (Asked for on 2026-11-11: "Round 1 and subtitle should be static, nice animation in", "a circle
      // around the 5 second ready that fills before playing".)
      game.timer += dt;
      const lead = 1.0, t = game.timer - lead, ready = tune.readySeconds;
      if (game.beat < 0) {
        game.beat = 0; game.left = 0;
        const n = game.total;
        ui.intro(`Round ${game.round}`, game.round === 1 ? `${n} Unread Email${n === 1 ? '' : 's'}` : `${n} to Answer`);
      }
      if (t >= 0 && t < ready) {
        const left = Math.ceil(ready - t);
        ui.ready(t / ready, left);
        game.beat = 1 + Math.min(3, Math.floor(t / ready * 4));       // 1 to 4 as it fills (the office monitor's boot bars follow it)
        if (left !== game.left) {
          // the user's countdown, a tick on each second, from the first (2026-11-12: it replaced a blip per second)
          if (game.left !== left && left === Math.ceil(ready)) sounds.play('count5', 1, 1);
          game.left = left; buzz('left', 0.15, 15); buzz('right', 0.15, 15);
        }
      } else if (t >= ready && game.left !== 0) {
        // FIGHT! to start round one, REPLY! to start round two: the word and the user's voice saying it (2026-11-12)
        game.left = 0; game.beat = 4; ui.go(game.round === 2 ? 'REPLY!' : 'FIGHT!');
        sounds.play(game.round === 2 ? 'reply' : 'fight', 1, 1);
        buzz('left', 0.5, 50); buzz('right', 0.5, 50);
      }
      if (t >= ready + 0.5) { game.phase = 'play'; ui.hideIntro(); nextIn = 0; }
    } else if (game.phase === 'summary') {
      game.timer += dt;
      // the end comes in once the line under the title has settled
      if (!logo.started && game.timer > 0.9) { logo.started = true; if (END_PARTS) handBar(['bar']); else ui.dismissBar(); void showLogo(); }
      // The line under it (CLEARED 10 EMAILS) only once the logo is in (2026-11-12: "load in the logo first and then after
      // thats in, load the subtitle badge after"): it pops in as a title's line does, then becomes something to cut.
      if (endLine.introAt >= 0 && clock >= endLine.introAt) { endLine.introAt = -1; ui.intro('', endLine.text); endLine.handAt = clock + 0.75; }
      if (endLine.handAt >= 0 && clock >= endLine.handAt) { endLine.handAt = -1; handBar(['line']); }
      // two and a half seconds after the logo comes (or if it is cut first), everything bursts out of it
      const logoShow = shows.find(x => x.kind === 'logo');
      // (the burst of the day's emails and pixel things out of it was too much: 2026-11-12. explode() is kept, unused.)
      void logoShow;
      // the air thickens as it all goes dark: the level's petals and sparks drifting through the view
      if (logo.outro < 0 && (logo.air -= dt) <= 0) {
        logo.air = 0.09;
        const a = rand(0.75), r = 1.2 + Math.random() * 1.6, at = v3.set(seat.x + Math.sin(a) * r, seat.y + rand(0.7), seat.z - Math.cos(a) * r);
        fx.spray(at, at, v1.set(rand(0.25), 0.15 + Math.random() * 0.25, rand(0.2)), Math.random() < 0.6 ? 1 : 0, 2, false, 0.4);
      }
      // the left hand takes hold of the logo, the bar or the line, and throws them (back on 2026-11-12, as asked)
      if (END_GRAB) grabShows(dt, head);
      // one of them is cut (or melted): a burst (the logo's the biggest), and its pieces burn away a few seconds later
      for (const show of shows) {
        if (show.gone >= 0 || (show.body.mode === 'show' && loose.includes(show.body))) continue;      // (cut: gone from the air; sprayed: melting)
        show.gone = game.timer;
        // (its pieces hang about to be cut up some more, seven seconds, then burn away)
        if (show.sheet.burnAt === Infinity && show.sheet.cutAt < Infinity) show.sheet.burnAt = clock + (show.kind === 'logo' ? 7 : 3);
        show.held = false;
      const at = show.body.mesh.position, big = show.kind === 'logo';
        fx.spray(at, at, v1.set(0, 1.2, 0.4), big ? 16 : 8, big ? 60 : 30, true, big ? 2 : 1.2);
        sounds.play('blip', big ? 2 : 1.7, 0.6, at); if (big) sounds.play('blip', 2.52, 0.5, at);
        if (big) { logo.cutAt = game.timer; logoGlow.uniforms.strength.value = 0; }
        buzz('right', big ? 0.9 : 0.6, big ? 90 : 50); buzz('left', 0.5, 60);
      }
      // The game is over a moment after all of it is cut (or ten seconds after the logo, if the rest is left;
      // or half a minute if nothing is touched; soon if the end never came). Then the level dims further,
      // fades to black, and it is back to the home screen (asked for on 2026-11-11; a new day began here before).
      const left = shows.filter(x => x.gone < 0).length, last = Math.max(-1, ...shows.map(x => x.gone));
      // (since 2026-11-11 it is over only once everything is cut, the day's emails too; a minute and a half at most)
      // (2026-11-12: cut up, the logo's pieces all burnt away, and the end song done if one is playing; not cut,
      // when the song ends, or twenty seconds on where there is no song; a minute at most)
      void last;
      const logoNow = shows.find(x => x.kind === 'logo'), piecesLeft = !!logoNow && loose.some(b => b.sheet === logoNow.sheet);
      const cutUp = !!logoNow && logoNow.gone >= 0 && !piecesLeft;
      // (2026-11-12: "fade out and go to home screen after a few seconds of the end logo being all destroyed";
      // left alone, it ends as before)
      const smashed = !!logoNow && logoNow.gone >= 0 && game.timer - logoNow.gone > SMASHED_TO_HOME;
      // (2026-11-12, later: "go to menu when end song is done, not just when everything is smashed or cut": with an
      // end song it is over when the song is, cut up or not, and not before; with none, as above)
      const over = game.timer > 60 || (endSongHeard ? !endSong : smashed || (!shows.length ? game.timer > 9 : !left ? cutUp : game.timer > 20));
      if (over && logo.outro < 0) logo.outro = 0;
      if (logo.outro >= 0) {
        logo.outro += dt;
        if (logo.outro > 3.1 && !logo.homed) { logo.homed = true; endLogo(); events.on?.('home', head); }
      }
    } else if (game.phase === 'play' && !current && game.dealt >= game.total && game.marks.length >= game.total) {
      // the round is done once its last letter has been dealt with
      // (a level that shows its letters on something gives that thing its moment first: the monitor switching off;
      // what is left of the last letter does not hang about through it)
      if (theme.dock && game.timer > 0.7) for (const sheet of sheets) if (sheet.cutAt < Infinity && sheet.burnAt === Infinity) sheet.burnAt = clock;
      if ((game.timer += dt) > (theme.dock?.pause ?? theme.pause ?? 1.1)) {
        // (nothing kept, demo or real mail: nothing to answer, so straight to the ending: 2026-11-12)
        if (game.round === 1 && game.kept.length) beginIntro(2);
        else { if (game.round === 1) game.cutInRoundOne = 0; beginSummary(); }      // (round one's own marks are what the summary counts then)
      }
    }
    if (game.phase === 'play' && game.round === 2) answer(dt);
    stepBeat(dt);
    {
      if (game.phase === 'menu') updateMenu(dt, head);
      // the end of a game: the level darkens steadily over the twenty seconds from its start, nearly black by then
      // (2026-11-12, for every level; it went straight to 0.62 before), and the outro takes it the rest of the way
      const darkening = 0.35 + 0.57 * clamp01(game.timer / END_DARKEN_SECONDS);
      const m = dimmer.material as MeshBasicMaterial, want = game.phase === 'summary' ? Math.max(darkening, logo.outro >= 0 ? 0.9 : 0) : game.phase === 'menu' ? 0.55 : 0;
      m.opacity += (want - m.opacity) * (1 - Math.exp(-dt * (want > m.opacity ? 1.4 : 2.5)));
      dimmer.visible = m.opacity > 0.005; dimmer.position.copy(head);
      // black: from a second into the outro, over a second and a half, and it holds
      const b = blackout.material as MeshBasicMaterial;
      b.opacity = game.phase === 'summary' && logo.outro >= 0 ? clamp01((logo.outro - 1) / 1.5) : menuBlack();
      blackout.visible = b.opacity > 0.005; blackout.position.copy(head);
    }
    ui.update(dt);
    if (!current && (more() || (prepared && game.phase === 'play'))) {
      nextIn -= dt;
      if (nextIn <= 0 && !spawn(head)) nextIn = 0.15;
    }
  }

  // ---------------------------------------------------------------- the rounds

  /** What became of an email: its band on the progress bar (and if it was thrown and then cut, that changes). */
  /** Thrown in round one and marked SAVED: cut, punched or sprayed out of the air after that, it stays saved. */
  function stillSaved(body: Body) { return game.phase === 'play' && game.round === 1 && body.mark >= 0 && game.marks[body.mark] === 'kept'; }
  function settle(body: Body, what: string) {
    if (!body.email || game.phase !== 'play') return;
    // (round two: cut, thrown, or left, it is all tomorrow, and the word comes up under the bar)
    if (game.round === 2 && what !== 'reply' && what !== 'mic') {
      // (cut in round two: LATER floats up from it too; one thrown away already said so)
      if (what === 'cut' && body.mark < 0 && !(away && away.body === body)) ui.say('LATER', LATER, body.mesh.position, 0.55);
      what = 'tomorrow';
    }
    if (what === 'tomorrow' && current && current.body === body) { game.stage = 'pick'; game.recording = false; game.aim = -1; game.keyAim = -1; ui.replies(null, null); }
    if (body.mark < 0) { body.mark = game.marks.length; game.marks.push(what); } else game.marks[body.mark] = what;
    if (game.round === 1) {
      mail.settled(body.email, what);
      const at = game.kept.indexOf(body.email);
      if (what === 'kept' && at < 0) game.kept.push(body.email);
      if (what !== 'kept' && at >= 0) game.kept.splice(at, 1);
    }
    ui.progress(game.marks, game.total);
    game.timer = 0;
  }
  /** A round begins: its letters, its bar, its intro. */
  function beginIntro(round: number) {
    if (round === 2) game.cutInRoundOne = game.marks.filter(m => m === 'cut').length;
    if (round === 1) {
      // (real mail when Gmail is chosen and in, in inbox order; otherwise the demo, shuffled: src/mail/source.ts)
      // (the demo: a different number every game, 6 to 18, asked for on 2026-11-12; real mail: the count chosen in Setup)
      const n = mail.state.count || tune.roundEmails, [few, many] = tune.demoEmails;
      game.deck = mail.deck(n) ?? shuffled().slice(0, few + Math.floor(Math.random() * (many - few + 1))); game.kept = []; game.dayTotal = game.deck.length; game.dayDeck = [...game.deck];
    } else {
      // The ones that were kept come back to be answered: those and only those, in the demo as with real mail
      // (the demo topped them up to a few with others until 2026-11-12: "make the saved emails from round 1 be
      // the real emails used in round 2"). With nothing kept there is no round two: see the end of round one.
      game.deck = [...game.kept];
      for (const sheet of sheets) if (sheet.cutAt < Infinity && sheet.burnAt === Infinity) sheet.burnAt = clock;     // what is left of round one goes
    }
    game.round = round; game.total = game.deck.length; game.dealt = 0; game.marks = [];
    game.phase = 'intro'; game.timer = 0; game.beat = -1;
    if (prepared) { prepared.reserved = false; prepared = null; preparedEmail = null; }
    ui.setAccent(theme.accent ?? '#f6b3cc', theme.bar); ui.place(seat, theme.dock?.intro ?? theme.intro); ui.replies(null, null);
    ui.progress(game.marks, game.total);
  }
  /** The day is done: what was done with it all, for a few seconds, and then the title letter again. */
  function beginSummary() {
    const count = (what: string) => game.marks.filter(m => m === what).length;
    game.tally.replied = count('reply') + count('mic'); game.tally.tomorrow = count('tomorrow'); game.tally.cut = game.cutInRoundOne + count('cut');
    game.phase = 'summary'; game.timer = 0;
    ui.replies(null, null);
    void mail.finish();      // real mail: cut ones archived, sent ones saved as drafts (src/mail/source.ts)
    // under where the logo comes in, how many were cleared today; the bar full, with nothing either side of it
    // (the logo itself says Inbox Zero; the tally of cut, sent and later was here before, 2026-11-11)
    // (the line under the title, how many were cleared, is back on 2026-11-12: the "subtitle" to cut and grab at the end)
    endLine.text = `Cleared ${game.dayTotal || game.total} Email${(game.dayTotal || game.total) === 1 ? '' : 's'}`; endLine.introAt = -1; endLine.handAt = -1;
    ui.complete(game.total);      // (the line comes after the logo: endLine)
    logo.started = false; endSongHeard = false;
  }
  /** The end of a game is over: the logo goes if it is still there. */
  function endLogo() {
    logo.wanted = false; logo.started = false; endLine.introAt = -1; endLine.handAt = -1;
    for (const show of shows) if (loose.includes(show.body) && show.body.mode === 'show') remove(show.body);
    shows.length = 0;
    logo.cutAt = -1; logo.chime = -1;
  }
  /** Round two: which target a letter is at (carried there), or -1. */
  function nearTarget(at: Vector3) { return targetNear(at, -1, false); }
  /**
   * Round two: which target is near (-1: none), of those showing. The one it is already at holds it
   * from a little further. `recording`: the mic counts while it records (for the letter resting on it).
   */
  function targetNear(at: Vector3, already: number, recording: boolean) {
    // As soon as the letter's outline touches the target's (2026-11-11: the ring started late, when its middle
    // came near); once at one, it holds from a little further, so the ring does not stutter at the edge.
    const scale = current?.body.mesh.scale.x ?? 1, halfW = W / 2 * scale, halfH = H / 2 * scale;
    const touches = (i: number) => ui.touching(i, at, halfW, halfH, i === already ? 0.06 : 0);
    if (game.stage === 'recording') return recording && touches(2) ? 2 : -1;
    for (let i = 0; i < (game.stage === 'choose' ? 2 : 3); i++) if (touches(i)) return i;
    return -1;
  }
  /**
   * Round two, every frame: the letter held at a target (or a key holding it there) runs that target's
   * ring round; full, the target happens. A reply sends it. The mic records (a mock: the words of a
   * reply typed out as if heard, the music down), and then KEEP sends it and REDO starts over.
   */
  function answer(dt: number) {
    const letter = current;
    ui.demo(!dictate.possible || (game.stage === 'recording' && dictate.engine === 'mock'));      // (no approved mic, nothing to write the words, or the mic would not open: the mock, with DEMO under the mic)
    if (!letter || !letter.email) { if (game.aim >= 0) { game.aim = -1; ui.aim(-1, 0); } return; }
    if (game.stage === 'recording') {
      // The mic for real (dictate.ts, 2026-11-12): the words as they are said, until a pause ends the take.
      // Without a mic or a speech service it is the mock, as before: the made-up words typed out.
      if (dictate.engine !== 'mock') {
        ui.live(dictate.text, dictate.level);
        if (dictate.phase !== 'done') return;
        const said = dictate.text.trim();
        game.recording = false; ui.live(said, -1);
        if (said) { game.heard = said; game.stage = 'choose'; ui.choose(); sounds.play('blip', 1.2, 0.45, ui.targets[2]); buzz('left', 0.3, 25); }
        else { game.stage = 'pick'; ui.replies(letter.email.replies[0], letter.email.replies[1]); ui.say('TRY AGAIN', MARKS.mic, ui.targets[2]); sounds.play('blip', 0.8, 0.45, ui.targets[2]); buzz('left', 0.3, 25); }
        return;
      }
      if (game.heardFor === 0) ui.record(game.heard);
      game.heardFor += dt;
      const words = game.heard.split(' ').length, said = Math.min(words, Math.floor(game.heardFor / tune.wordSeconds) + 1);
      ui.heard(said);
      if (game.heardFor > words * tune.wordSeconds + 0.7) { game.stage = 'choose'; game.recording = false; ui.choose(); sounds.play('blip', 1.2, 0.45, ui.targets[2]); buzz('left', 0.3, 25); }
      return;
    }
    let at = letter.state === 'held' ? targetNear(letter.free, game.aim, false) : letter.state === 'waiting' ? game.keyAim : -1;
    if (game.stage === 'choose' && at === 2) at = -1;
    if (at >= 0 && at < 2 && game.stage === 'pick' && !mail.repliesReady(letter.email)) at = -1;      // (still WRITING: real mail's replies not in yet)
    if (at !== game.aim) {
      game.aim = at; game.aimFor = 0;
      if (at >= 0) { sounds.play('blip', 1.4, 0.3, ui.targets[at]); buzz('left', 0.2, 15); }
      if (at === 2 && game.stage === 'pick') dictate.warm();       // (the mic opens as its ring starts, so it is live when the ring fills)
    }
    if (at < 0) { ui.aim(-1, 0); return; }
    const reply = game.stage === 'pick';      // (a reply or the mic: steady, then snapping shut)
    const half = at === 2 ? tune.micHalf : tune.replyHalf, rest = at === 2 ? tune.micRest : tune.replyRest;
    const need = game.stage === 'choose' ? tune.chooseHold : half + rest;
    game.aimFor += dt;
    const u = Math.min(1, game.aimFor / need);
    // Round from the moment it touches, at a steady pace, then faster (2026-11-11: the slow start read as a
    // delay). A reply: steadily to half way, then the other half much faster, quickening as it goes. The mic
    // and KEEP / REDO: steadily for four sevenths of their time, then faster.
    let ring: number;
    if (reply) {
      const split = 0.75, t = game.aimFor, rate = split / half;
      if (t < half) ring = rate * t;
      else { const w = Math.min(1, (t - half) / rest), start = rate * rest / (1 - split); ring = split + (1 - split) * (start * w + (1 - start) * w * w); }
    } else {
      const split = 2 / 3.5;
      ring = u < split ? 0.4 * u / split : 0.4 + 0.6 * (0.5 * (u - split) / (1 - split) + 0.5 * ((u - split) / (1 - split)) ** 2);
    }
    ui.aim(at, ring);
    // a tick in the hand that comes quicker as the ring goes round
    if (Math.floor((game.aimFor - dt) * (3 + 9 * u)) !== Math.floor(game.aimFor * (3 + 9 * u))) buzz('left', 0.08 + 0.25 * u, 10);
    if (u < 1) return;
    game.aim = -1; game.keyAim = -1; ui.aim(-1, 0);
    if (game.stage === 'pick' && at === 2) {
      game.stage = 'recording'; game.recording = true; game.heardFor = 0; game.heard = mail.mockWords(letter.email);      // (the made-up words, if it comes to the mock)
      dictate.start(); ui.record(''); sounds.play('blip', 1.5, 0.5, ui.targets[2]); buzz('left', 0.5, 40);
    } else if (game.stage === 'choose' && at === 1) {
      // REDO: back to the two replies and the mic
      game.stage = 'pick'; ui.replies(letter.email.replies[0], letter.email.replies[1]); sounds.play('blip', 0.9, 0.45, ui.targets[1]); buzz('left', 0.4, 30);
    } else sendTo(letter, at, game.stage === 'choose' ? 'mic' : 'reply');
  }
  /** Into a reply (or KEEP): the letter goes into it, and both go, SENT. */
  function sendTo(letter: Current, to: number, what: 'reply' | 'mic') {
    const body = letter.body;
    body.target = to; body.from.copy(body.mesh.position); body.sheet.material.uniforms.hover.value = 0;
    if (letter.state === 'held') body.size = body.mesh.scale.x;
    settle(body, what);
    if (body.email) mail.sent(body.email, what === 'reply' ? { reply: to } : { said: game.heard });
    game.stage = 'pick'; game.recording = false;
    release(body, 'sent', 0.42);
    sounds.swing(0.5, body.mesh.position); buzz('left', 0.6, 45);
    { let take = lastKeep; while (take === lastKeep) take = 1 + Math.floor(Math.random() * 3); lastKeep = take; sounds.play(`swoosh${take}`, 1.05 + Math.random() * 0.1, 0.6, body.mesh.position); }
    counts.thrown++; current = null; nextIn = 1.3;
    events.on?.('thrown', body.mesh.position);
  }
  /** Let go of without being answered (and not thrown away): it floats back to where it waits. */
  function backToWait(letter: Current) {
    const body = letter.body, mesh = body.mesh;
    letter.state = 'arriving'; letter.t = 0; letter.flick = -1;
    letter.from.copy(mesh.position); letter.via.lerpVectors(mesh.position, letter.home, 0.5); letter.via.y += 0.05;
    letter.start.copy(mesh.quaternion); letter.startScale = body.size; body.size = 1;
    letter.arriveSeconds = 0.55; letter.arriveEase = 2.5; letter.sway = 0;
    body.sheet.material.uniforms.hover.value = 0;
    sounds.play('blip', 1.0, 0.3, mesh.position);
  }

  /** Everything in the air goes, and the level starts again from its title letter. */
  function clear() {
    mail.abandon();      // (a game left before its end: nothing is done to Gmail)
    for (let i = loose.length - 1; i >= 0; i--) remove(loose[i]);
    if (current) { remove(current.body); current = null; }
    away = null; logo.wanted = false; logo.started = false; shows.length = 0; logo.cutAt = -1; logo.outro = -1; logo.homed = false;
    menuTicket++; for (const mesh of menu.planes) { root.remove(mesh); mesh.geometry.dispose(); const m = mesh.material as MeshBasicMaterial; m.map?.dispose(); m.dispose(); } menu.planes = []; menu.pending = null; noCut.clear(); menu.on = null;
    prepared = null; preparedEmail = null;
    for (const set of [sheetSets.ink, sheetSets.paint]) for (const s of set ?? []) { s.users = 0; s.reserved = false; s.cutAt = Infinity; s.burnAt = Infinity; s.burn = 0; }
    for (const streak of streaks) streak.mesh.visible = false;
    thread.visible = false; threadFade = 0; nextIn = 0.8; order = []; hitStop = 0; bladeSeen = false; armed = false; hype = 0; impact = 0;
    game.phase = 'ready'; game.round = 1; game.timer = 0; game.beat = -1; game.total = 0; game.dealt = 0; game.deck = []; game.kept = []; game.marks = []; game.stage = 'pick'; game.recording = false; game.aim = -1; game.keyAim = -1;
    ui.clear();
  }
  /** Change level: its letters' look, shape, where they come from and what is done to them. */
  function setTheme(next: LetterTheme) {
    clear();
    theme = next;
    if (next.face === 'paint' && !sheetSets.paint) sheetSets.paint = makeSheets(true);
    sheets = next.face === 'paint' ? sheetSets.paint! : sheetSets.ink;
    const key = next.shape ? next.id : 'paper';
    if (!shapes.has(key)) { const soup = measure(next.shape!()); shapes.set(key, { soup, geometry: geometryOf(soup) }); }
    wholeSoup = shapes.get(key)!.soup; wholeGeometry = shapes.get(key)!.geometry;
    const look = next.look;
    for (const sheet of sheets) {
      const u = sheet.material.uniforms;
      u.sheet.value.set(look.sheet); u.inkColor.value.set(look.ink); u.backColor.value.set(look.back); u.nightTint.value.set(look.night);
      u.hoverColor.value.set(look.hover); u.cutWide.value.set(look.cutWide); u.cutHot.value.set(look.cutHot); u.markColor.value.set(look.mark);
      u.flashColor.value.set(look.flash); u.goldColor.value.set(look.gold); u.burnColor.value.set(look.burn);
      u.selfLit.value = look.selfLit; u.burnStyle.value = look.burnStyle;
    }
    for (const streak of streaks) { streak.material.uniforms.wide.value.set(look.streak[0]); streak.material.uniforms.hot.value.set(look.streak[1]); }
    threadMaterial.uniforms.near.value.set(look.thread[0]); threadMaterial.uniforms.far.value.set(look.thread[1]);
    if (look.aura) { aura.uniforms.a.value.set(look.aura[0]); aura.uniforms.b.value.set(look.aura[1]); sparkle.uniforms.a.value.set(look.aura[0]); sparkle.uniforms.b.value.set(look.aura[1]); }
    aura.uniforms.wisps.value = look.spell?.wisps ?? 0.5; aura.uniforms.strength.value = look.spell?.glow ?? 1;
    sparkleGeometry.setDrawRange(0, Math.min(SPARKLES, look.spell?.sparkles ?? 0));
  }
  setTheme(KYOTO_LETTERS);
  /** Off while the home screen is up: nothing in the air, nothing arriving. On: the title letter comes. */
  function setActive(on: boolean) { if (on === active) return; active = on; root.visible = on; clear(); }

  return {
    update, tune, spray, setTheme, setActive, events, showMenu, leaveMenu,
    /** The music's beat now, 0 to 1 (-1: none to go by), for the end to move to. */
    setBeat(v: number) { beatIn = v; },
    /** Is the end song (a level's anthem) playing? The end waits for it. */
    setEndSong(on: boolean) { endSong = on; if (on) endSongHeard = true; },
    /** How much dangerous mail is in front of the player just now: 0 none, 1 a radioactive letter not yet melted. */
    hazard: () => (theme.mechanic === 'punch' ? Math.min(1, hype) : current && current.body.hazard && !current.body.melting ? 1 : 0),      // (Knockout: how worked up the crowd is)
    /** Knockout: how hard the glove has just landed (0 to 1), once; then 0 until it lands again. For the glove's own squash. */
    impact: () => { const s = impact; impact = 0; return s; },
    theme: () => theme,
    /** Where the rounds have got to, for a level that shows it (the second office's monitor). Read only. */
    progress: game as { readonly phase: 'ready' | 'intro' | 'play' | 'summary' | 'menu'; readonly round: number; readonly total: number; readonly beat: number; readonly marks: readonly string[]; readonly recording: boolean },
    /** Is the blade cutting just now? (Always, unless the trigger has to be held and is not.) */
    armed: () => armed,
    /** 1 while the trigger is making the blade live, for its glow and hum; 0 otherwise (and always 0 where no trigger is needed). */
    live: () => ((theme.mechanic === 'punch' ? false : theme.mechanic === 'spray' ? armed : tune.triggerToCut && world.renderer.xr.isPresenting && armed) ? 1 : 0),
    diagnostics: () => ({ started: game.phase !== 'ready', phase: game.phase, round: game.round, dealt: game.dealt, total: game.total, marks: game.marks.join(','), keptForRoundTwo: game.kept.length, ui: ui.diagnostics(), state: current?.state ?? 'none', subject: current?.email?.subject ?? '', ...counts,
      inTheAir: loose.length, sheetsInUse: sheets.filter(s => s.users > 0 || s.reserved).length, handValid: hand.valid, handPressed: hand.pressed,
      reachOnLetter: hand.onLetter, triggerToCut: tune.triggerToCut, armed,
      /** The end (and the menu): what is out to be cut, * held, ~ thrown and flying free, x gone. */
      end: shows.map(x => x.kind + (x.held ? '*' : '') + (x.free ? '~' : '') + (x.gone >= 0 ? 'x' : '')).join(' ') }),
    /** For checks and the console: act on the letter in front of you without a controller. */
    debug: { cut: keyCut, keep: keyKeep, hold: keySend, round: (n: number) => beginIntro(n), end: () => { game.phase = 'play'; beginSummary(); },
      /** Write another email on the letter in front of you (a long one, to see it scroll). */
      show: (email: Email) => { if (current) drawEmail(current.body.sheet, email); },
      /** Cut a menu card, as a sword would: 'start', 'exit', or a level's id. */
      /** Choose a menu card as the left hand would. */
      pickCard: (id: string) => { const show = shows.find(x => x.gone < 0 && (x.kind === id || x.id === id)); if (show && !menu.pending) { show.hover = 2; menu.pending = { kind: show.kind === 'exit' ? 'exit' : 'pick', id: show.id, at: menu.age }; } },
      cutCard: (id: string) => { const show = shows.find(x => x.gone < 0 && (x.kind === id || x.id === id)); if (show) slice(show.body, rand(0.05), rand(0.02), 1, rand(0.3), v1.set(6, 0, -1), 0.8); }, current: () => current, loose },
    dispose: () => { ui.dispose(); window.removeEventListener('keydown', onKey); threadGeometry.dispose(); threadMaterial.dispose(); for (const set of [sheetSets.ink, sheetSets.paint]) for (const s of set ?? []) { s.material.dispose(); s.surface.texture?.dispose(); } for (const shape of shapes.values()) shape.geometry.dispose(); streakGeometry.dispose(); aura.dispose(); auraGeometry.dispose(); sparkle.dispose(); sparkleGeometry.dispose(); },
  };
}
