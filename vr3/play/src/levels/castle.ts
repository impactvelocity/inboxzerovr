import type { Vector3 } from 'three';
import type { LetterTheme } from '../letters';
import { paintedDirection, type StageDef } from './backdrop';
import { Vector3 as V3 } from 'three';
import { castleCard, FRAME, W } from './cards';
import { frameSoup } from './shapes';
import type { FxStyle, LevelSound } from './types';

/**
 * The castle: a vaulted gallery at dusk, looking out over a grand hall to a small carved door far off in the
 * middle, which turns haunted as the night comes on. The mail is royal dispatches in carved frames, which come
 * out of that door and up the carpet wreathed in cold fire; the weapon is a knight's sword.
 *
 * Positions are u, v in public/levels/castle/start.webp (u 0 left to 1 right over 270 degrees, v 0 bottom to 1
 * top over 90, the eye line at .48), measured from the painting: the gallery, 2026-11-13, painted to Kyoto's
 * one-point perspective (design/castle-kyoto-perspective-v1) so the mail stands out against a far, calm middle.
 * The long hall before it is tools/level-src/castle/start|end-before-2026-11-13.webp.
 */

/** The far door, where frames come from: its direction, and how far it is by the depth model. */
const DOOR = { u: 0.5015, v: 0.45, metres: 9.5 };
const doorWay = new V3();

export const castleStage: StageDef = {
  id: 'castle', name: 'The haunted hall',
  art: ['levels/castle/start.webp', 'levels/castle/end.webp'],
  rear: ['#2b1d3d', '#110b22'],
  glsl: /* glsl */ `
    float soft(float x, float from, float to, float w){ return smoothstep(from-w,from+w,x)*(1.-smoothstep(to-w,to+w,x)); }
    // A candle's breathing about 1. Slow only: nothing in this hall flutters or strobes (the shared flame() has
    // 7 to 23 Hz terms in it; see the lab's note, 2026-11-13, "not strobe effects").
    float candle(float seed){
      return 1.+.10*sin(time*1.3+seed)+.06*sin(time*2.3+seed*1.7)-.14*smoothstep(.7,1.,sin(time*.47+seed*5.)*sin(time*.29+seed*2.));
    }
    // The gallery: flags 1.2 m under the eye, the vault three over it. The back wall of the far hall about 11 m off
    // down the middle (the door in it at 9.5), the side aisles' walls nearer and nearer towards the painting's edges.
    // The two big pillars and the balustrades at the gallery's edge about 4.4 m out, a little soft at their edges;
    // the desks, cases and armour along the sides only as a smooth nearer band (hard-edged blocks for furniture
    // slide against the wall behind them as the head moves: the lab's lesson).
    float inverseDepthAt(vec3 d, vec2 uv){
      float level=sqrt(max(0.,1.-d.y*d.y));
      float side=clamp(abs(uv.x-.5)*2.,0.,1.);
      float wall=mix(1./11.,1./2.6,pow(side,1.5))*level;
      float inv=max(max(max(-d.y,0.)/1.2,max(d.y,0.)/3.),wall);
      float pillars=(soft(uv.x,.222,.306,.005)+soft(uv.x,.694,.778,.005))*smoothstep(.295,.315,uv.y);
      float rails=(soft(uv.x,.198,.41,.005)+soft(uv.x,.59,.802,.005))*soft(uv.y,.30,.445,.006);
      inv=max(inv,max(pillars*level/4.4,rails*level/4.3));
      float nearSides=smoothstep(.62,.9,side)*(1.-smoothstep(.36,.5,uv.y));
      return max(inv,nearSides*level/2.4);
    }
    // The banners stir in the draught: the hem most, the rod not at all.
    vec2 warp(vec2 uv){
      float near=(box(uv,vec2(.2575,.524),vec2(.013,.098),.005)+box(uv,vec2(.7455,.524),vec2(.013,.098),.005))*smoothstep(.625,.43,uv.y);
      float far=(box(uv,vec2(.3665,.62),vec2(.006,.075),.003)+box(uv,vec2(.44,.61),vec2(.006,.065),.003)
                +box(uv,vec2(.56,.61),vec2(.006,.065),.003)+box(uv,vec2(.635,.62),vec2(.006,.075),.003))*smoothstep(.70,.545,uv.y);
      float wave=sin(time*.9+uv.y*40.)*.6+sin(time*.55+uv.y*23.+1.)*.4;
      uv.x+=wave*(near*.0014+far*.0006)*(.6+breeze);
      return uv;
    }
    vec3 scene(vec3 col, vec2 uv){
      float lum=dot(col,vec3(.3,.5,.2));
      vec3 amber=vec3(1.,.52,.18);
      // Candles: warm stone near a flame breathes with it.
      float warm=smoothstep(.05,.28,col.r-col.b)*smoothstep(.2,.55,col.r);
      float f=oval(uv,vec2(.2535,.70),vec2(.07,.2))*(candle(.6)-1.)
             +oval(uv,vec2(.747,.70),vec2(.07,.2))*(candle(2.4)-1.)
             +oval(uv,vec2(.10,.64),vec2(.05,.14))*(candle(4.3)-1.)
             +oval(uv,vec2(.8985,.652),vec2(.05,.14))*(candle(7.3)-1.)
             +oval(uv,vec2(.17,.58),vec2(.04,.10))*(candle(9.1)-1.)
             +oval(uv,vec2(.828,.58),vec2(.04,.10))*(candle(1.8)-1.)
             +oval(uv,vec2(.01,.43),vec2(.04,.12))*(candle(5.5)-1.)
             +oval(uv,vec2(.99,.44),vec2(.04,.12))*(candle(8.2)-1.)
             +(oval(uv,vec2(.35,.43),vec2(.04,.05))+oval(uv,vec2(.65,.43),vec2(.04,.05)))*(candle(3.3)-1.)
             +(oval(uv,vec2(.463,.49),vec2(.02,.05))+oval(uv,vec2(.538,.49),vec2(.02,.05)))*(candle(6.1)-1.);
      col*=1.+clamp(warm*f*2.4,-.4,.4);
      float halo=oval(uv,vec2(.2535,.715),vec2(.016,.04))*candle(.6)+oval(uv,vec2(.747,.715),vec2(.016,.04))*candle(2.4)
                +(oval(uv,vec2(.10,.64),vec2(.008,.02))*candle(4.3)+oval(uv,vec2(.8985,.652),vec2(.008,.02))*candle(7.3)
                 +oval(uv,vec2(.155,.598),vec2(.006,.016))*candle(9.1)+oval(uv,vec2(.845,.598),vec2(.006,.016))*candle(1.8)
                 +oval(uv,vec2(.01,.453),vec2(.006,.02))*candle(5.5)+oval(uv,vec2(.991,.463),vec2(.006,.02))*candle(8.2))*.8
                +(oval(uv,vec2(.463,.49),vec2(.006,.014))+oval(uv,vec2(.538,.49),vec2(.006,.014))
                 +oval(uv,vec2(.441,.427),vec2(.006,.01))+oval(uv,vec2(.5595,.427),vec2(.006,.01)))*candle(6.1)*.6;
      col+=amber*halo*(.07+.07*blend);
      // The moon through the windows, and cloud crossing it: its light on stone and armour comes and goes.
      float cloud=.8+.2*softNoise(vec2(time*.11,uv.x*5.));
      vec3 moon=mix(vec3(.78,.66,1.),vec3(.58,.52,1.),blend);
      float glass=oval(uv,vec2(.3275,.618),vec2(.012,.06))+oval(uv,vec2(.395,.618),vec2(.012,.06))+oval(uv,vec2(.605,.618),vec2(.012,.06))+oval(uv,vec2(.6725,.618),vec2(.012,.06))
                 +oval(uv,vec2(.065,.715),vec2(.02,.09))+oval(uv,vec2(.12,.60),vec2(.015,.08))+oval(uv,vec2(.88,.61),vec2(.015,.08))+oval(uv,vec2(.83,.565),vec2(.012,.07));
      col+=moon*glass*(.025+.05*blend)*cloud;
      col+=moon*(oval(uv,vec2(.1525,.475),vec2(.012,.07))+oval(uv,vec2(.8485,.475),vec2(.012,.07)))*(.015+.05*blend)*cloud;      // the armour
      float cool=smoothstep(.04,.2,col.b-col.r);
      col*=1.+cool*(cloud-.9)*.5*(.4+.6*blend);
      // The haunted frames: a slow sheen across the gold, and the pictures in them stir violet as the night comes.
      float frames=box(uv,vec2(.029,.632),vec2(.022,.11),.008)+box(uv,vec2(.97,.627),vec2(.022,.11),.008);
      float sheen=exp(-pow(fract(uv.y*2.+uv.x*3.-time*.07)-.5,2.)*90.);
      col+=vec3(1.,.86,.55)*frames*sheen*.14*smoothstep(.3,.6,col.r);
      col+=vec3(.6,.45,1.)*frames*(.015+.06*blend)*(.5+.5*sin(time*.6+uv.x*20.));
      // Kyoto's focus: the far hall sits back in its own air, softer and lower in contrast, with one band of mist low
      // at the gallery's edge and another lying in the far hall, both drifting, so the mail coming out of it stands clear.
      vec3 haze=mix(vec3(.52,.46,.80),vec3(.30,.18,.62),blend);
      float hall=box(uv,vec2(.5,.47),vec2(.075,.10),.06);
      col=mix(col,haze*(.8+.4*lum),hall*.07);
      float drift=softNoise(uv*vec2(60.,110.)+vec2(-time*.025,time*.006));
      float driftFar=softNoise(uv*vec2(80.,130.)+vec2(time*.012,0.));
      float mist=oval(uv,vec2(.5,.315),vec2(.13,.028))*(.05+.10*drift)+oval(uv,vec2(.5,.405),vec2(.10,.022))*(.10+.16*driftFar);
      col=mix(col,haze,mist*(1.-.25*blend));      // (no thicker at night: 2026-11-12, "on night / round 2 reduce the fog even more")
      // The door: lavender light through the gap between its leaves, brightest in the dark, flaring as a frame
      // comes out; it hangs in the air round the door and spills down the carpet at its foot.
      vec3 spirit=mix(vec3(.82,.72,1.),vec3(.72,.46,1.),blend);
      float breath=.5+.5*sin(time*.5);
      float gap=box(uv,vec2(.5015,.465),vec2(.003,.062),.004);
      float carpet=(1.-smoothstep(-.006,.006,abs(uv.x-.5)-(.16-.38*uv.y)))*step(uv.y,.40);
      col+=spirit*gap*(.06+.22*blend+.6*pulse)*(.8+.2*breath);
      col+=spirit*oval(uv,vec2(.5015,.46),vec2(.03,.08))*(.02+.05*blend+.4*pulse);
      col+=spirit*oval(uv,vec2(.5,.395),vec2(.04,.012))*(.03+.09*blend+.3*pulse);
      col+=spirit*carpet*smoothstep(.12,.40,uv.y)*(.015+.035*blend+.1*pulse)*(.7+.3*breath);
      // the seal over the door answers the frames
      col+=vec3(1.,.38,.32)*oval(uv,vec2(.5,.573),vec2(.005,.009))*(.06+.06*breath+.7*pulse);
      col+=vec3(1.,.85,.5)*box(uv,vec2(.5,.573),vec2(.011,.02),.012)*(.02+.22*pulse);
      // Candle and moonlight shiver in the polished flags (not on the carpet).
      float flags=smoothstep(.31,.25,uv.y)*(1.-carpet);
      float shimmer=sin(uv.x*700.+uv.y*50.-time*.9)*.6+sin(uv.x*430.-uv.y*80.-time*.6)*.4;
      col*=1.+flags*smoothstep(.2,.55,lum)*shimmer*.04;
      // a breath of the door's light through the whole hall as a frame comes
      col+=spirit*pulse*.02;
      return col;
    }`,
  motes: [
    { name: 'Embers off the left pillar candles', count: 18, box: [0.5, 1.4, 0.5], centre: [-3.85, 3.4, -1.7], size: 20, colour: ['#ffc070', '#ffa860'], opacity: [0.7, 0.6], rise: 0.16, sway: 0.12, twinkle: 0.85, additive: true },
    { name: 'Embers off the right pillar candles', count: 18, box: [0.5, 1.4, 0.5], centre: [3.85, 3.4, -1.7], size: 20, colour: ['#ffc070', '#ffa860'], opacity: [0.7, 0.6], rise: 0.16, sway: 0.12, twinkle: 0.85, additive: true },
    { name: 'Embers in the air', count: 40, box: [9, 2.6, 9], centre: [0, 2.1, -4.5], size: 20, colour: ['#ffb060', '#d9a0ff'], opacity: [0.45, 0.4], rise: 0.09, sway: 0.25, twinkle: 0.85, additive: true },
    { name: 'Dust in the candlelight', count: 170, box: [10, 3.2, 12], centre: [-0.3, 1.7, -5], size: 13, colour: ['#f0d8ff', '#b8a4ff'], opacity: [0.2, 0.28], rise: -0.01, sway: 0.3, twinkle: 0.4, additive: true },
    { name: 'Lavender motes from the door', count: 30, box: [2.4, 1.4, 3], centre: [0, 1.0, -8.2], size: 32, colour: ['#d6c8ff', '#b07cff'], opacity: [0.12, 0.5], rise: 0.06, sway: 0.3, twinkle: 0.6, additive: true },
    { name: 'Things that are not candles', count: 9, box: [7, 1.8, 9], centre: [0, 1.7, -7], size: 46, colour: ['#9a8cff', '#c27dff'], opacity: [0.04, 0.2], rise: 0.02, sway: 0.8, twinkle: 0.7, additive: true },
  ],
  // Real mist, lying low in the far hall only (the gallery's floor stays clear), frames come out of it.
  // (faint, as asked on 2026-11-12: "tone down some of the fog / smoke ... so more of the background", and no thicker at night)
  fog: { cards: 5, from: 5.5, to: 13, width: 6.5, height: 1.8, colour: ['#7a6ad0', '#7444d8'], opacity: [0.06, 0.04] },
  // the fill light from the candles breathes; slowly (it had an 11 Hz flutter in it until 2026-11-13)
  flicker: time => 1 + 0.12 * Math.sin(time * 1.3 + 0.6) + 0.06 * Math.sin(time * 2.3 + 1.9),
};

export const castleLetters: LetterTheme = {
  id: 'castle', face: 'paint', paint: castleCard, shape: () => frameSoup(FRAME / W * 0.5), mechanic: 'cut', title: 'The Haunted Hall', accent: '#b79cff', bar: ['#8a4dff', '#2dffc8'],
  look: { sheet: '#f1dfb8', ink: '#34190f', back: '#3d2113', selfLit: 0.22, night: '#cdbfe8',
    hover: '#c9ffe9', cutWide: '#a98bff', cutHot: '#f4f0ff', mark: '#ffd978', flash: '#fff3cf', gold: '#ffe29a',
    burn: '#7dffc8', burnStyle: 0, streak: ['#b79cff', '#ffffff'], thread: ['#9dffd6', '#f2fff9'], aura: ['#35ff96', '#9a5cff'],
    spell: { wisps: 0.2, sparkles: 3, trail: false, glow: 0.1 } },      // (softer since 2026-11-12, "reduce the glow / magic effect on the edges": it was wisps 0.35, 6 sparkles, glow 0.22)
  // Out of the far door: it starts as a speck in the lavender gap between its leaves and glides up the carpet at its
  // real size, rocking and drifting a little. (Until 2026-11-13 it came from the vanishing point of the long hall, 15 m.)
  origin(head: Vector3, home: Vector3, from: Vector3, via: Vector3) {
    from.copy(head).addScaledVector(paintedDirection(DOOR.u, DOOR.v, doorWay), DOOR.metres);
    via.lerpVectors(from, home, 0.6); via.y += 0.22;
    return { scale: 1, pose: 'face' as const, seconds: 1.15, ease: 3, sway: 0.16 };      // (as Kyoto's: 1.15 s, quick then slowing, since 2026-11-12, "make it feel the same"; it was 2.6 s, then 1.8, both a steady glide)
  },
};

export const castleFx: FxStyle = { bit: 'shard', bits: ['#7a4a2c', '#4a6a66'], paper: ['#f1dfb8', '#b8d6c6'], sparks: ['#cdb6ff', '#7dffd0'], shedBits: 0, shedSparks: 1, gravity: 2.2, drag: 1.0, flutter: 0.3, size: 1 };

export const castleSound: LevelSound = {
  id: 'castle',
  layers: [
    { name: 'hall', at: null, level: c => 0.55 + 0.35 * c.drift(c.t * 0.3, 1.7) },
    { name: 'torches', at: [3.6, 1.5, -1.7], level: c => 0.4 + 0.2 * c.drift(c.t * 0.5, 3.1) },
    // (quieter since the level has music: whispers under it, not a second choir over it)
    { name: 'ghosts', at: null, level: c => (0.12 + 0.43 * c.blend) * (0.35 + 0.65 * c.drift(c.t * 0.18, 6.4)) },
  ],
  occasional: [{ name: 'creak', every: [26, 60], volume: 0.5, region: [-2.5, 2.5, 0, 1, -11, -8] }],
  // The user's power-up sound, while the trigger is held: in from nothing to full quickly, held, and out (asked for on 2026-11-11).
  hum: { level: 0.45, swing: false, fadeIn: 0.15, fadeOut: 0.25 },        // (was 1: the user asked for it subtler)
  // (The user's organ note played on every cut for a while, wandering a minor scale; taken out at their asking the same day.
  // To bring it back: cutNote: { name: 'organ', scale: [-2, 0, 2, 3, 5, 7, 8, 10, 12, 14, 15], volume: 0.8 }.)
  // The first round over: witches laugh (the user's sounds, asked for on 2026-11-11). A door slammed far down the
  // hall first until 2026-11-12, "remove the door sound": { name: 'doorslam', delay: 0, volume: 1, at: [0.6, 0.2, -11] }.
  afterRound: [{ round: 1, sounds: [
    { name: 'witches', delay: 0, volume: 0.9, at: [-2.4, 1.3, -5] },
  ] }],
};
