import { AdditiveBlending, BufferGeometry, Color, CylinderGeometry, DoubleSide, FrontSide, InterleavedBuffer, InterleavedBufferAttribute, Matrix4, Mesh, Object3D, PlaneGeometry, Points, Quaternion, ShaderMaterial, SRGBColorSpace, TextureLoader, Vector3, Vector4, type Texture, type World } from '@iwsdk/core';
import type { BladeTracker } from './blade';
import { covers, cut, measure, recentre, STRIDE, type Soup } from './cut';
import { emailCard, scrollContent, scrolls, ScrollHeight, ScrollWindow } from './mail/cardArt';
import { dictation, Emails, type Email } from './mail/emails';
import { makeSurface, Painter, type Surface } from './mail/painter';
import { createRoundUi } from './roundui';

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
  workHold: 0.6,        // round two: it is held out this far (further than in round one), out where the replies are
  replyHold: 4,         // round two: seconds held at a reply before it is sent (the ring goes round slow, then fast)
  micHold: 2,           // and at the mic before it starts recording
  chooseHold: 1.5,      // and at KEEP or REDO, after dictating
  wordSeconds: 0.24,    // the mock dictation: a word every this long
  holdGrow: 1.15,       // held, it looks this much bigger than it did where it was taken from: its size as seen, and just a bit
  // The rounds. One is so many emails; round two brings back the ones that were kept.
  // Round one's emails. 10 for demos for now (asked for on 2026-11-11); it will vary from day to day later, never more than 20.
  roundEmails: 10,
  workSeconds: 16,      // round two: how long a letter waits to be answered before it is left for tomorrow
  workLeast: 4,
  readySeconds: 5,      // the ring under the round's title fills over this long before the first letter comes         // round two always has at least this many letters, kept or not (it is an example for now)
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
  /** The edge of what is left as it goes, and how it goes: 0 burns away like paper, 1 breaks up into blocks, 2 melts and runs. */
  burn: string; burnStyle: 0 | 1 | 2;
  streak: [string, string]; thread: [string, string];
  /** A glow round a whole letter (two colours it moves between), or none. */
  aura: [string, string] | null;
  /**
   * How that glow behaves: `wisps` 0 a still bloom to 1 cold fire licking off it, `sparkles` so many
   * motes of light going round its edge, `trail` leaving lights behind it as it arrives.
   */
  spell?: { wisps: number; sparkles: number; trail: boolean; glow?: number };
}
/** What a level makes of the letters: how they look, where they come from, what is done to them. */
export interface LetterTheme {
  id: string;
  /** 'ink': the Unity game's card as ink on washi (Kyoto). 'paint': painted in full colour by `paint` (levels/cards.ts). */
  face: 'ink' | 'paint';
  paint?: (g: CanvasRenderingContext2D, email: Email | null, hazard: boolean) => void;
  /** Its own shape (levels/shapes.ts); the curled paper sheet if none. */
  shape?: () => Float32Array;
  look: LetterLook;
  /** 'cut': the right hand's weapon cuts them. 'spray': the right hand's nozzle wets them until they melt. */
  mechanic: 'cut' | 'spray';
  /** The level's name on Kyoto's title letter, and its colour on the progress bar and the round's intro. */
  title: string;
  accent?: string;
  /** The progress bar's two colours, left to right: vivid, the level's own. From `accent` if not given. */
  bar?: [string, string];
  /**
   * Where a letter comes from: sets `from` and `via` (world space; `home` is where it will arrive)
   * and says how big it starts (1 is full size) and how it is turned: tumbling in, already facing
   * the player, or lying flat.
   */
  origin?(head: Vector3, home: Vector3, from: Vector3, via: Vector3): { scale: number; pose: 'tumble' | 'face' | 'flat';
    /** How long it takes to arrive (tune.arriveSeconds if not given), how gently it slows (3 quick then slow, 2 a steady glide), and how much it rocks on the way (radians). */
    seconds?: number; ease?: number; sway?: number };
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
}
/** Something made of paper that is in the air: a whole letter, or a piece of one. */
interface Body {
  mesh: Mesh; sheet: Sheet; soup: Soup; whole: boolean;
  /** Where this piece's middle was on the whole letter (x, y in metres from its centre). */
  offset: [number, number];
  vel: Vector3; spin: Vector3; age: number; seed: number;
  mode: 'held' | 'cut' | 'kept' | 'sent'; life: number;
  /** The email it is (null: the title letter), which band of the progress bar is its, and in round two where it has been sent (0, 1 the replies, 2 the mic). */
  email: Email | null; mark: number; target: number;
  /** Its size (a held letter is smaller), and for a thrown one, how far it has gone towards being kept: -1 not yet, then 0 to 1. */
  size: number; going: number; from: Vector3;
  /** Sprayed: how much of what it takes it has had (1 and it melts), whether it is a radioactive one, and whether it is melting. */
  dose: number; hazard: boolean; melting: boolean;
  /** Hit by the mist: the froth is spreading over it by itself (dose climbs to 1, then it melts). */
  spreading: boolean;
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
      cuts: { value: [new Vector4(), new Vector4(), new Vector4()] }, heat: { value: new Vector3() },
    },
    vertexShader: /* glsl */ `
      uniform float burn,burnStyle,wet;
      varying vec2 vUv; varying vec3 vNormalW; varying vec3 vWorld; varying float vFront;
      void main(){
        vUv=uv;
        vFront=smoothstep(0.,.5,normal.z);          // the sheet's own front: the back is blank paper
        vec3 p=position;
        // soaked, it sags; melting, it runs: the lower it is on the sheet the further it drips
        float run=burnStyle>1.5?burn:0.;
        float drip=.5+.5*sin(position.x*57.+3.*sin(position.x*23.));
        p.y-=((.012*wet)+run*run*(.05+.2*drip))*(1.-uv.y);
        p.z-=run*.03*sin(position.x*31.)*(1.-uv.y);
        vec4 world=modelMatrix*vec4(p,1.);
        vWorld=world.xyz; vNormalW=mat3(modelMatrix)*normal;
        gl_Position=projectionMatrix*viewMatrix*world;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D face,paperMap; uniform vec3 sheet,inkColor,backColor,nightTint,hoverColor,cutWide,cutHot,markColor,flashColor,goldColor,burnColor,heat;
      uniform float paint,selfLit,burnStyle,time,night,hover,burn,gold,mark,flash,wet,hazard; uniform vec4 cuts[3]; uniform vec3 splats[3];
      varying vec2 vUv; varying vec3 vNormalW; varying vec3 vWorld; varying float vFront;
      float grain(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
        float a=fract(sin(dot(i,vec2(12.9898,78.233)))*43758.5453), b=fract(sin(dot(i+vec2(1.,0.),vec2(12.9898,78.233)))*43758.5453);
        float c=fract(sin(dot(i+vec2(0.,1.),vec2(12.9898,78.233)))*43758.5453), d=fract(sin(dot(i+vec2(1.,1.),vec2(12.9898,78.233)))*43758.5453);
        return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
      void main(){
        vec3 t=texture2D(face,vUv).rgb;
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
          c*=1.+selfLit*front*(.025*sin(time*40.)+.05*sin(vUv.y*9.-time*2.3));
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
        vec2 at=(vUv-.5)*vec2(${W},${H});
        // Sprayed: froth gathers where the mist lands and spreads as the sheet soaks.
        if(wet>0.){
          float foam=0.;
          for(int i=0;i<3;i++){ vec2 rel=at-splats[i].xy; foam+=splats[i].z*exp(-dot(rel,rel)/(.003+.035*wet)); }
          float bubbles=grain(vUv*vec2(64.,40.)+vec2(0.,time*.5))*.6+grain(vUv*vec2(150.,94.)-vec2(0.,time*.8))*.4;
          float cover=smoothstep(.3,.8,min(1.,foam)*(.55+.6*wet)+wet*.75-bubbles*.6);
          vec3 froth=mix(vec3(.45,.95,.55),vec3(.92,1.,.94),smoothstep(.35,.75,bubbles));
          c=mix(c,froth,cover*.9);
        }
        // Radioactive: it glows from its edges, beating.
        c+=(vec3(.45,1.,.15)*(1.-smoothstep(0.,.2,edge))*(.55+.45*sin(time*5.))*.9+vec3(.16,.4,.04)*.2)*hazard*(1.-wet*.6);
        // A hand close enough to take it warms its edge.
        c+=hoverColor*(1.-smoothstep(0.,.08,edge))*hover*.45;
        // Where the blade went through, it glows and cools.
        for(int i=0;i<3;i++){
          vec2 rel=at-cuts[i].xy; float off=abs(rel.x*cuts[i].w-rel.y*cuts[i].z);
          c+=(cutWide*exp(-off*off/.00007)+cutHot*exp(-off*off/.000006))*heat[i]*1.5;
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
          else left=clamp((1.-vUv.y)*.5+grain(vUv*vec2(24.,2.5))*.38+grain(vUv*vec2(70.,44.))*.12,0.,.999);
          if(left<burn) discard;
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
  const events: { on: ((kind: 'arrive' | 'cut' | 'melt' | 'thrown' | 'kept' | 'missed', at: Vector3) => void) | null } = { on: null };

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
  const preview = makeSurface(ScrollWindow.width, ScrollHeight, { scale: 1.5, ink: true, texture: false });

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
    return { mesh, material, age: 1 };
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
  const game = { phase: 'ready' as 'ready' | 'intro' | 'play' | 'summary', round: 1, timer: 0, beat: -1, total: 0, dealt: 0,
    deck: [] as Email[], kept: [] as Email[], marks: [] as string[], cutInRoundOne: 0, left: 0, tally: { cut: 0, replied: 0, tomorrow: 0 },
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
    u.wet.value = 0; u.hazard.value = 0; for (const splat of u.splats.value as Vector3[]) splat.set(0, 0, 0);
    sheet.splats = 0; sheet.cuts = 0; sheet.cutAt = Infinity; sheet.burnAt = Infinity; sheet.burn = 0;
    return sheet;
  }
  /** A painted level's face (levels/cards.ts), straight onto the sheet's canvas. */
  function paintFace(sheet: Sheet, email: Email | null, hazard: boolean) {
    const s = sheet.surface, g = s.g;
    g.setTransform(s.scale, 0, 0, s.scale, 0, 0); g.globalAlpha = 1; g.clearRect(0, 0, s.width, s.height);
    theme.paint!(g, email, hazard);
    g.setTransform(1, 0, 0, 1, 0, 0);
    s.texture!.needsUpdate = true;
  }
  function drawEmail(sheet: Sheet, email: Email) {
    if (theme.paint) { paintFace(sheet, email, !!theme.hazard?.(email)); return; }
    emailCard(painter, sheet.surface, email);
    if (scrolls(email)) {
      // A newsletter's window: the top of the mock email that scrolls through it in the Unity game.
      scrollContent(painter, preview, email);
      const g = sheet.surface.g, k = sheet.surface.scale;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(preview.canvas, 0, 0, ScrollWindow.width * k, ScrollWindow.height * k, ScrollWindow.x * k, ScrollWindow.y * k, ScrollWindow.width * k, ScrollWindow.height * k);
      sheet.surface.texture!.needsUpdate = true;
    }
  }
  function shuffled(): Email[] {
    order = [...Emails];
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
    return { mesh, sheet, soup, whole: wholeLetter, offset: [0, 0], vel: new Vector3(), spin: new Vector3(), age: 0, seed: Math.random() * 6.283, mode: 'held', life: 0, size: 1, going: -1, from: new Vector3(), dose: 0, hazard: false, melting: false, spreading: false, email: null, mark: -1, target: -1 };
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
    // Waiting, it faces whoever is reading it.
    look.position.copy(home); look.up.set(0, 1, 0); look.lookAt(head.x, head.y - 0.04, head.z);
    const face = look.quaternion.clone();
    // (a level may have its letters come from somewhere of its own: out of a screen, off a table)
    const begin = theme.origin ? theme.origin(head, home, from, via) : { scale: 1, pose: 'tumble' as const };
    const start = begin.pose === 'tumble' ? face.clone().multiply(q1.setFromAxisAngle(v1.set(rand(1), rand(1), rand(1)).normalize(), 0.9 + Math.random() * 0.8))
      : begin.pose === 'flat' ? face.clone().multiply(q1.setFromAxisAngle(v1.set(1, 0, 0), -1.25)).multiply(new Quaternion().setFromAxisAngle(v2.set(0, 0, 1), rand(0.5)))
      : face.clone().multiply(q1.setFromAxisAngle(v1.set(rand(0.3), 1, rand(0.3)).normalize(), rand(0.45)));
    const dock = theme.dock;
    if (dock) { body.size = dock.place(home, face); from.copy(home); via.copy(home); near.copy(home); start.copy(face); }
    body.mesh.position.copy(from); body.mesh.quaternion.copy(start); body.mesh.scale.setScalar(dock ? 0.001 : begin.scale);
    body.hazard = !!(email && theme.hazard?.(email)); sheet.material.uniforms.hazard.value = body.hazard ? 1 : 0;
    body.email = email;
    if (email && game.round === 2) { game.stage = 'pick'; game.recording = false; game.aim = -1; game.keyAim = -1; ui.replies(email.replies[0], email.replies[1]); }
    if (theme.look.aura && (!theme.hazard || body.hazard)) {
      const glow = new Mesh(auraGeometry, aura); glow.name = 'aura'; glow.frustumCulled = false; glow.renderOrder = 2; body.mesh.add(glow);
      if (theme.look.spell && theme.look.spell.sparkles > 0) { const motes = new Points(sparkleGeometry, sparkle); motes.name = 'spell'; motes.frustumCulled = false; motes.renderOrder = 3; body.mesh.add(motes); }
    }
    current = { body, email, state: 'arriving', t: 0, from, via, home, near, past, face, start, grip: new Matrix4(), grabbedAt: new Vector3(), heldFor: 0, flick: -1, startScale: begin.scale, forced: false, seen: 1, holdSize: 1,
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

  /**
   * Cut a body along the line through (x, y) in its own space, heading (dx, dy). `push` is how the
   * blade was moving, m/s. False if the line misses it.
   */
  function slice(body: Body, x: number, y: number, dx: number, dy: number, push: Vector3, strength: number): boolean {
    const halves = cut(body.soup.data, x, y, 0, -dy, dx, 0);
    if (halves[0].length < STRIDE * 3 || halves[1].length < STRIDE * 3) return false;
    const sheet = body.sheet, mesh = body.mesh;
    mesh.updateMatrixWorld(true);
    const along = v1.set(dx, dy, 0).applyQuaternion(mesh.quaternion), across = v2.set(-dy, dx, 0).applyQuaternion(mesh.quaternion);
    const shownOn = docked(body), outward = new Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);
    // Each half, broken again by a hard swing: lines through it at random, near where the blade went in.
    const breaks = loose.length >= shatter.most ? 0 : strength > shatter.twice ? 2 : strength > shatter.once ? 1 : 0;
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
    for (const [data, side] of pieces) {
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
      release(piece, 'cut', 9);
    }
    // the cut itself, on the paper: glowing where it was made
    const k = sheet.cuts++ % 3, u = sheet.material.uniforms;
    (u.cuts.value as Vector4[])[k].set(x + body.offset[0], y + body.offset[1], dx, dy);
    (u.heat.value as Vector3).setComponent(k, 1);
    sheet.cutAt = clock;                    // it burns once the next letter is in place (see update)
    // and in the air: a streak of light, sparks and petals along it, shreds of paper
    const at = v3.set(x, y, 0); mesh.localToWorld(at);
    const streak = streaks[nextStreak]; nextStreak = (nextStreak + 1) % STREAKS;
    streak.age = 0; streak.mesh.visible = true;
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
  function tryBlade(body: Body, blade: BladeTracker, dt: number, reach: boolean, dock?: LetterTheme['dock'], crowded = false): boolean {
    const mesh = body.mesh;
    mesh.updateMatrixWorld(true);
    m1.copy(mesh.matrixWorld).invert();
    // (a piece in the air is moving too, and may be small: it is given a little more room than a letter)
    const depth = body.whole ? tune.hitDepth : tune.hitDepth * 1.15;
    // (shown on something: the whole of that thing can be hit, behind the letter and round it)
    const back = dock ? dock.behind / body.size : depth, margin = tune.hitMargin + (dock ? dock.margin / body.size : 0);
    const length = blade.tip.distanceTo(blade.base);
    const span = reach && length > 0.05 && blade.speed >= tune.swordReachSpeed ? 1 + tune.swordReach / length : 1;
    for (let s = Math.ceil(8 * span); s >= 1; s--) {
      // f runs along the blade: 1 is its tip, more than 1 is out on the line past it
      const f = s / 8, wide = tune.swordWiden * Math.max(0, f - 1) * length;
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
        if (!body.whole && (crowded || body.soup.area < 0.003)) { burst(body, bladeVel); return true; }
        if (slice(body, body.whole ? x : px, body.whole ? y : py, dx, dy, bladeVel, clamp01((bladeVel.length() - tune.cutSpeed) / 7))) return true;
        if (!body.whole) { burst(body, bladeVel); return true; }
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
    if (body.mark >= 0) settle(body, 'cut');          // (thrown, then sprayed out of the air: it was never kept)
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
    if (!letter) return;
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

  /** The letter leaves the hand (or the key was pressed): it is kept. */
  function letGo(letter: Current) {
    const body = letter.body, speed = body.vel.length();
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
    { let take = lastKeep; while (take === lastKeep) take = 1 + Math.floor(Math.random() * 3); lastKeep = take; sounds.play(`swoosh${take}`, 0.95 + Math.random() * 0.1, 0.75, body.mesh.position); }
    sounds.swing(clamp01(speed / 6), body.mesh.position);
    buzz('left', 0.55, 40);
    settle(body, game.round === 2 ? 'tomorrow' : 'kept');
    counts.thrown++; current = null; nextIn = tune.nextAfterKeep;
    events.on?.('thrown', body.mesh.position);
  }

  // ---------------------------------------------------------------- every frame

  function update(dt: number, frame: XRFrame | undefined, blade: BladeTracker, head: Vector3, night: number, tool?: SprayTool) {
    if (!active) return;
    clock += dt;
    readHand(dt, frame, head);
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
          // taken
          hand.used = true;
          letter.state = 'held'; letter.heldFor = 0; letter.grabbedAt.copy(hand.pos);
          letter.seen = body.size / Math.max(0.3, head.distanceTo(mesh.position)); letter.holdSize = body.size;
          letter.grip.copy(hand.matrix).invert().multiply(m1.compose(mesh.position, mesh.quaternion, v1.set(1, 1, 1)));      // (where it is and how it is turned, not its size)
          sounds.play('blip', 1.25, 0.45, hand.pos); buzz('left', 0.4, 25);
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
          const ease = 1 - Math.exp(-dt * 28);
          mesh.position.lerp(v1, ease); mesh.quaternion.slerp(q1, ease);
          // It keeps the size it had to the eye where it was taken, and just a bit more: so nearer the
          // head it is made smaller by as much as it has come closer. Settled once it has come in.
          if (letter.heldFor < 0.45) letter.holdSize = Math.max(0.25, Math.min(1, letter.seen * tune.holdGrow * head.distanceTo(mesh.position)));
          body.size += (letter.holdSize - body.size) * (1 - Math.exp(-dt * 12)); mesh.scale.setScalar(body.size);
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
    const spraying = theme.mechanic === 'spray';
    let trigger = 1;
    const session = world.renderer.xr.isPresenting ? world.renderer.xr.getSession() : null;
    if (spraying) trigger = tool && tool.valid ? tool.on : 0;         // a sprayer sprays only while its trigger is held, always
    else if (session && tune.triggerToCut) {
      trigger = 0;
      for (const source of session.inputSources) if (source.handedness === 'right') trigger = source.gamepad?.buttons?.[0]?.value ?? 0;
    }
    const live = trigger > 0.25;
    if (live && !armed && (spraying || (session && tune.triggerToCut))) {
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
        for (let i = loose.length - 1; i >= 0; i--) if (loose[i].mode === 'kept') reached = mist(loose[i], tool) || reached;
      }
      const forced = current;
      if (forced?.forced) { soak(forced.body, rand(0.12), rand(0.07)); reached = true; }
      sprayBuzz = reached ? sprayBuzz + dt : 0;
      if (sprayBuzz > 0.07) { sprayBuzz = 0; buzz('right', 0.2, 30); }
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
          if (body.age < 0.06 || body.mode === 'sent' || body.melting || body.sheet.burn > 0.93) continue;
          const kept = body.mode === 'kept';
          if (!tryBlade(body, blade, dt, true, undefined, loose.length >= MAX_LOOSE)) continue;
          if (kept) {
            // cut out of the air: it was never kept, and what falls is only paper
            settle(body, 'cut');
            counts.cut++;
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
    const flightDt = hitStop > 0 ? dt * 0.08 : dt;
    for (let i = loose.length - 1; i >= 0; i--) {
      const body = loose[i];
      body.age += flightDt;
      if (body.spreading) spread(body, flightDt);
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
        fly(body, flightDt, 0.9, 3.6, 1.5);
        if (body.mode === 'cut' && body.sheet.burn > 0.05 && Math.random() < flightDt * 14)
          fx.spray(body.mesh.position, body.mesh.position, v1.set(0, 0.3, 0), 1, 1, Math.random() < 0.5, 0.35);
        if (body.age > body.life) remove(body);
      }
    }
    for (const sheet of sheets) {
      const u = sheet.material.uniforms;
      (u.heat.value as Vector3).multiplyScalar(Math.exp(-flightDt * 2.6));
      // (and if no next letter ever comes into focus, it still goes in the end)
      if (sheet.burnAt === Infinity && clock - sheet.cutAt > 8) sheet.burnAt = clock;
      if (clock > sheet.burnAt) {
        sheet.burn = Math.min(1, sheet.burn + flightDt / (theme.look.burnStyle === 2 ? spray.meltSeconds : 1.0));
        u.burn.value = sheet.burn;
        if (sheet.burn >= 1) { for (let i = loose.length - 1; i >= 0; i--) if (loose[i].sheet === sheet) remove(loose[i]); sheet.burnAt = Infinity; sheet.cutAt = Infinity; }
      }
    }
    for (const streak of streaks) {
      if (!streak.mesh.visible) continue;
      streak.age += dt / 0.2;
      if (streak.age >= 1) { streak.mesh.visible = false; continue; }
      streak.material.uniforms.fade.value = (1 - streak.age) * (1 - streak.age);
      streak.mesh.scale.set(0.7 + streak.age * 0.9, 0.07 * (1 - streak.age * 0.6), 1);
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
        if (left !== game.left) { game.left = left; sounds.play('blip', 0.86 + (ready - left) * 0.07, 0.42); buzz('left', 0.15, 15); buzz('right', 0.15, 15); }
      } else if (t >= ready && game.left !== 0) {
        game.left = 0; game.beat = 4; ui.go();
        buzz('left', 0.5, 50); buzz('right', 0.5, 50);
      }
      if (t >= ready + 0.5) { game.phase = 'play'; ui.hideIntro(); nextIn = 0; }
    } else if (game.phase === 'summary') {
      game.timer += dt;
      if (game.timer > 7) { game.phase = 'ready'; game.round = 1; game.timer = 0; ui.clear(); }       // and another day begins
    } else if (game.phase === 'play' && !current && game.dealt >= game.total && game.marks.length >= game.total) {
      // the round is done once its last letter has been dealt with
      // (a level that shows its letters on something gives that thing its moment first: the monitor switching off;
      // what is left of the last letter does not hang about through it)
      if (theme.dock && game.timer > 0.7) for (const sheet of sheets) if (sheet.cutAt < Infinity && sheet.burnAt === Infinity) sheet.burnAt = clock;
      if ((game.timer += dt) > (theme.dock?.pause ?? 1.1)) { if (game.round === 1) beginIntro(2); else beginSummary(); }
    }
    if (game.phase === 'play' && game.round === 2) answer(dt);
    ui.update(dt);
    if (!current && (more() || (prepared && game.phase === 'play'))) {
      nextIn -= dt;
      if (nextIn <= 0 && !spawn(head)) nextIn = 0.15;
    }
  }

  // ---------------------------------------------------------------- the rounds

  /** What became of an email: its band on the progress bar (and if it was thrown and then cut, that changes). */
  function settle(body: Body, what: string) {
    if (!body.email || game.phase !== 'play') return;
    // (round two: cut, thrown, or left, it is all tomorrow, and the word comes up under the bar)
    if (game.round === 2 && what !== 'reply' && what !== 'mic') { what = 'tomorrow'; if (game.marks[body.mark] !== 'tomorrow') ui.later(); }
    if (what === 'tomorrow' && current && current.body === body) { game.stage = 'pick'; game.recording = false; game.aim = -1; game.keyAim = -1; ui.replies(null, null); }
    if (body.mark < 0) { body.mark = game.marks.length; game.marks.push(what); } else game.marks[body.mark] = what;
    if (game.round === 1) {
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
      game.deck = shuffled().slice(0, tune.roundEmails); game.kept = [];
    } else {
      // The ones that were kept come back to be answered. For now there are always a few, kept or not.
      const work = [...game.kept];
      for (const email of shuffled()) { if (work.length >= tune.workLeast) break; if (email.kind === 'Real' && !work.includes(email)) work.push(email); }
      game.deck = work;
      for (const sheet of sheets) if (sheet.cutAt < Infinity && sheet.burnAt === Infinity) sheet.burnAt = clock;     // what is left of round one goes
    }
    game.round = round; game.total = game.deck.length; game.dealt = 0; game.marks = [];
    game.phase = 'intro'; game.timer = 0; game.beat = -1;
    if (prepared) { prepared.reserved = false; prepared = null; preparedEmail = null; }
    ui.setAccent(theme.accent ?? '#f6b3cc', theme.bar); ui.place(seat, theme.dock?.intro); ui.replies(null, null);
    ui.progress(game.marks, game.total);
  }
  /** The day is done: what was done with it all, for a few seconds, and then the title letter again. */
  function beginSummary() {
    const count = (what: string) => game.marks.filter(m => m === what).length;
    game.tally.replied = count('reply') + count('mic'); game.tally.tomorrow = count('tomorrow'); game.tally.cut = game.cutInRoundOne + count('cut');
    game.phase = 'summary'; game.timer = 0;
    ui.replies(null, null);
    ui.intro('Inbox zero!', `${game.tally.cut} Cut  ${game.tally.replied} Sent  ${game.tally.tomorrow} Later`);
  }
  /** Round two: which target a letter is at (carried there), or -1. */
  function nearTarget(at: Vector3) {
    if (game.stage === 'recording') return -1;
    for (let i = 0; i < (game.stage === 'choose' ? 2 : 3); i++) if (at.distanceTo(ui.targets[i]) < ui.radius[i] + 0.08) return i;
    return -1;
  }
  /**
   * Round two, every frame: the letter held at a target (or a key holding it there) runs that target's
   * ring round; full, the target happens. A reply sends it. The mic records (a mock: the words of a
   * reply typed out as if heard, the music down), and then KEEP sends it and REDO starts over.
   */
  function answer(dt: number) {
    const letter = current;
    if (!letter || !letter.email) { if (game.aim >= 0) { game.aim = -1; ui.aim(-1, 0); } return; }
    if (game.stage === 'recording') {
      game.heardFor += dt;
      const words = game.heard.split(' ').length, said = Math.min(words, Math.floor(game.heardFor / tune.wordSeconds) + 1);
      ui.heard(said);
      if (game.heardFor > words * tune.wordSeconds + 0.7) { game.stage = 'choose'; game.recording = false; ui.choose(); sounds.play('blip', 1.2, 0.45, ui.targets[2]); buzz('left', 0.3, 25); }
      return;
    }
    let at = letter.state === 'held' ? nearTarget(letter.body.mesh.position) : letter.state === 'waiting' ? game.keyAim : -1;
    if (game.stage === 'choose' && at === 2) at = -1;
    if (at !== game.aim) {
      game.aim = at; game.aimFor = 0;
      if (at >= 0) { sounds.play('blip', 1.4, 0.3, ui.targets[at]); buzz('left', 0.2, 15); }
    }
    if (at < 0) { ui.aim(-1, 0); return; }
    const need = game.stage === 'choose' ? tune.chooseHold : at === 2 ? tune.micHold : tune.replyHold;
    game.aimFor += dt;
    const u = Math.min(1, game.aimFor / need);
    ui.aim(at, Math.pow(u, 2.3));          // slow at first, then fast to finish
    // a tick in the hand that comes quicker as the ring goes round
    if (Math.floor((game.aimFor - dt) * (3 + 9 * u)) !== Math.floor(game.aimFor * (3 + 9 * u))) buzz('left', 0.08 + 0.25 * u, 10);
    if (u < 1) return;
    game.aim = -1; game.keyAim = -1; ui.aim(-1, 0);
    if (game.stage === 'pick' && at === 2) {
      game.stage = 'recording'; game.recording = true; game.heardFor = 0; game.heard = dictation(letter.email);
      ui.record(game.heard); sounds.play('blip', 1.5, 0.5, ui.targets[2]); buzz('left', 0.5, 40);
    } else if (game.stage === 'choose' && at === 1) {
      // REDO: back to the two replies and the mic
      game.stage = 'pick'; ui.replies(letter.email.replies[0], letter.email.replies[1]); sounds.play('blip', 0.9, 0.45, ui.targets[1]); buzz('left', 0.4, 30);
    } else sendTo(letter, at, game.stage === 'choose' ? 'mic' : 'reply');
  }
  /** Into a reply (or KEEP): the letter goes into it, and both go, SENT. */
  function sendTo(letter: Current, to: number, what: 'reply' | 'mic') {
    const body = letter.body;
    body.target = to; body.from.copy(body.mesh.position); body.sheet.material.uniforms.hover.value = 0;
    if (letter.state === 'held') body.size = letter.holdSize;
    settle(body, what);
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
    for (let i = loose.length - 1; i >= 0; i--) remove(loose[i]);
    if (current) { remove(current.body); current = null; }
    prepared = null; preparedEmail = null;
    for (const set of [sheetSets.ink, sheetSets.paint]) for (const s of set ?? []) { s.users = 0; s.reserved = false; s.cutAt = Infinity; s.burnAt = Infinity; s.burn = 0; }
    for (const streak of streaks) streak.mesh.visible = false;
    thread.visible = false; threadFade = 0; nextIn = 0.8; order = []; hitStop = 0; bladeSeen = false; armed = false;
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
    update, tune, spray, setTheme, setActive, events,
    /** How much dangerous mail is in front of the player just now: 0 none, 1 a radioactive letter not yet melted. */
    hazard: () => (current && current.body.hazard && !current.body.melting ? 1 : 0),
    theme: () => theme,
    /** Where the rounds have got to, for a level that shows it (the second office's monitor). Read only. */
    progress: game as { readonly phase: 'ready' | 'intro' | 'play' | 'summary'; readonly round: number; readonly total: number; readonly beat: number; readonly marks: readonly string[]; readonly recording: boolean },
    /** Is the blade cutting just now? (Always, unless the trigger has to be held and is not.) */
    armed: () => armed,
    /** 1 while the trigger is making the blade live, for its glow and hum; 0 otherwise (and always 0 where no trigger is needed). */
    live: () => ((theme.mechanic === 'spray' ? armed : tune.triggerToCut && world.renderer.xr.isPresenting && armed) ? 1 : 0),
    diagnostics: () => ({ started: game.phase !== 'ready', phase: game.phase, round: game.round, dealt: game.dealt, total: game.total, marks: game.marks.join(','), keptForRoundTwo: game.kept.length, ui: ui.diagnostics(), state: current?.state ?? 'none', subject: current?.email?.subject ?? '', ...counts,
      inTheAir: loose.length, sheetsInUse: sheets.filter(s => s.users > 0 || s.reserved).length, handValid: hand.valid, handPressed: hand.pressed,
      reachOnLetter: hand.onLetter, triggerToCut: tune.triggerToCut, armed }),
    /** For checks and the console: act on the letter in front of you without a controller. */
    debug: { cut: keyCut, keep: keyKeep, hold: keySend, round: (n: number) => beginIntro(n), current: () => current, loose },
    dispose: () => { ui.dispose(); window.removeEventListener('keydown', onKey); threadGeometry.dispose(); threadMaterial.dispose(); for (const set of [sheetSets.ink, sheetSets.paint]) for (const s of set ?? []) { s.material.dispose(); s.surface.texture?.dispose(); } for (const shape of shapes.values()) shape.geometry.dispose(); streakGeometry.dispose(); aura.dispose(); auraGeometry.dispose(); sparkle.dispose(); sparkleGeometry.dispose(); },
  };
}
