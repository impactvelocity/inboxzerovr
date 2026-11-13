import type { Vector3 } from 'three';
import type { LetterTheme } from '../letters';
import type { StageDef } from './backdrop';
import { castleCard, FRAME, W } from './cards';
import { frameSoup } from './shapes';
import type { FxStyle, LevelSound } from './types';

/**
 * The castle: a candlelit Gothic hall at night that turns haunted. The mail is royal dispatches in
 * carved frames, which come off the walls and down the hall wreathed in cold fire; the weapon is a
 * knight's sword.
 *
 * Positions are u, v in public/levels/castle/start.webp (see office.ts).
 */

/** Where frames come from: far down the hall, at the point the whole painting runs away to. */
const FAR = { v: 0.515, metres: 15 };

export const castleStage: StageDef = {
  id: 'castle', name: 'The haunted hall',
  art: ['levels/castle/start.webp', 'levels/castle/end.webp'],
  rear: ['#2a1a33', '#0d1420'],
  glsl: /* glsl */ `
    // A hall: flags 1.2 m under the eye, the vault three over it, and the walls. The walls are judged
    // from the painting, not from the true direction: it is a picture of a hall drawn in perspective
    // and wrapped round the player, so its walls come steadily nearer towards its two edges (the big
    // window on the left and the door on the right are the nearest things in it), and are furthest
    // at the middle, down the hall.
    float inverseDepthAt(vec3 d, vec2 uv){
      float level=sqrt(max(0.,1.-d.y*d.y));
      float wall=sin(1.5708*clamp(abs(uv.x-.5)*2.,0.,1.));
      return max(max(-d.y/1.2,d.y/3.),wall*level/3.2);
    }
    vec3 scene(vec3 col, vec2 uv){
      // Candles: whatever is lit warm near a sconce breathes with its flames.
      float warm=smoothstep(.05,.28,col.r-col.b)*smoothstep(.22,.55,col.r);
      float f=oval(uv,vec2(.195,.74),vec2(.080,.25))*(flame(.6)-1.)
             +oval(uv,vec2(.792,.72),vec2(.080,.25))*(flame(2.4)-1.)
             +oval(uv,vec2(.3437,.66),vec2(.052,.17))*(flame(4.3)-1.)
             +oval(uv,vec2(.6512,.645),vec2(.052,.17))*(flame(7.3)-1.)
             +oval(uv,vec2(.4095,.60),vec2(.030,.11))*(flame(9.1)-1.)
             +oval(uv,vec2(.5905,.595),vec2(.030,.11))*(flame(1.8)-1.)
             +(oval(uv,vec2(.44,.57),vec2(.02,.07))+oval(uv,vec2(.56,.57),vec2(.02,.07)))*(flame(3.3)-1.);
      col*=1.+clamp(warm*f*2.6,-.5,.45);
      vec3 amber=vec3(1.,.50,.16);
      float halo=oval(uv,vec2(.195,.78),vec2(.020,.055))*flame(.6)+oval(uv,vec2(.792,.758),vec2(.022,.058))*flame(2.4)
                +oval(uv,vec2(.3437,.69),vec2(.013,.04))*flame(4.3)+oval(uv,vec2(.6512,.672),vec2(.013,.04))*flame(7.3);
      col+=amber*halo*(.08+.05*blend);
      // The moon, and cloud crossing it: its light on the flags comes and goes.
      float cloud=.8+.2*softNoise(vec2(time*.13,uv.x*7.));
      col+=vec3(.55,.66,1.)*oval(uv,vec2(.055,.772),vec2(.034,.095))*.11*cloud;
      float cool=smoothstep(.05,.22,col.b-col.r)*(1.-smoothstep(.40,.46,uv.y))*(1.-smoothstep(.40,.50,uv.x));
      col*=1.+cool*(cloud-.9)*.9;
      // Mist along the floor (the nearer mist is real: the stage's fog, below), and the glow at the far end,
      // which swells as a frame comes out of it.
      float low=smoothstep(.47,.33,uv.y)*smoothstep(.04,.24,uv.y)*smoothstep(.46,.16,abs(uv.x-.5));
      float roll=softNoise(uv*vec2(150.,62.)+vec2(time*.10,-time*.03))*softNoise(uv*vec2(64.,27.)-vec2(time*.06,0.));
      float far=oval(uv,vec2(.5,.505),vec2(.075,.085));
      vec3 mist=mix(vec3(.40,.34,.78),vec3(.16,.92,.76),blend);
      col=mix(col,mist,clamp(low*roll*(.07+.12*blend)+far*(.16+.10*sin(time*.4)+.35*pulse)*(.5+.6*blend),0.,.6));
      col+=mist*oval(uv,vec2(.5,.52),vec2(.03,.05))*pulse*.5;
      return col;
    }`,
  motes: [
    { name: 'Embers off the candles', count: 70, box: [9, 2.6, 9], centre: [0, 2.1, -4.5], size: 22, colour: ['#ffb060', '#7fffe0'], opacity: [0.6, 0.5], rise: 0.11, sway: 0.25, twinkle: 0.85, additive: true },
    { name: 'Dust in the moonlight', count: 170, box: [10, 3.2, 12], centre: [-0.5, 1.7, -5], size: 13, colour: ['#b8c4ff', '#8ff0e0'], opacity: [0.22, 0.3], rise: -0.01, sway: 0.3, twinkle: 0.4, additive: true },
    { name: 'Things that are not candles', count: 9, box: [7, 1.8, 9], centre: [0, 1.7, -7], size: 46, colour: ['#8f84ff', '#6dffd8'], opacity: [0.04, 0.22], rise: 0.02, sway: 0.8, twinkle: 0.7, additive: true },
  ],
  // Real mist, standing in the hall in sheets one behind another: frames come out of it, and it parts as you lean.
  fog: { cards: 7, from: 2.6, to: 13.5, width: 7.5, height: 2.1, colour: ['#6a5cc8', '#2bd6b4'], opacity: [0.12, 0.3] },
  flicker: time => 1 + 0.16 * Math.sin(time * 1.3 + 0.6) + 0.1 * Math.sin(time * 11 + 1.9) * Math.sin(time * 7.3),
};

export const castleLetters: LetterTheme = {
  id: 'castle', face: 'paint', paint: castleCard, shape: () => frameSoup(FRAME / W * 0.5), mechanic: 'cut', title: 'The Haunted Hall', accent: '#b79cff', bar: ['#8a4dff', '#2dffc8'],
  look: { sheet: '#f1dfb8', ink: '#34190f', back: '#3d2113', selfLit: 0.22, night: '#b4d8d2',
    hover: '#c9ffe9', cutWide: '#a98bff', cutHot: '#f4f0ff', mark: '#ffd978', flash: '#fff3cf', gold: '#ffe29a',
    burn: '#7dffc8', burnStyle: 0, streak: ['#b79cff', '#ffffff'], thread: ['#9dffd6', '#f2fff9'], aura: ['#35ff96', '#9a5cff'],
    spell: { wisps: 0.35, sparkles: 6, trail: false, glow: 0.22 } },
  // Down the hall: it starts as a speck where the hall runs away to, and glides in at its real size,
  // rocking and drifting a little, taking its time.
  origin(head: Vector3, home: Vector3, from: Vector3, via: Vector3) {
    const up = (FAR.v - 0.48) * 1.57079633;
    from.set(home.x, head.y + Math.sin(up) * FAR.metres, head.z - Math.cos(up) * FAR.metres);
    via.lerpVectors(from, home, 0.6); via.y += 0.22;
    return { scale: 1, pose: 'face' as const, seconds: 2.6, ease: 2, sway: 0.16 };
  },
};

export const castleFx: FxStyle = { bit: 'shard', bits: ['#7a4a2c', '#4a6a66'], paper: ['#f1dfb8', '#b8d6c6'], sparks: ['#cdb6ff', '#7dffd0'], shedBits: 0, shedSparks: 1, gravity: 2.2, drag: 1.0, flutter: 0.3, size: 1 };

export const castleSound: LevelSound = {
  id: 'castle',
  layers: [
    { name: 'hall', at: null, level: c => 0.55 + 0.35 * c.drift(c.t * 0.3, 1.7) },
    { name: 'torches', at: [3.2, 0.5, -1.4], level: c => 0.4 + 0.2 * c.drift(c.t * 0.5, 3.1) },
    // (quieter since the level has music: whispers under it, not a second choir over it)
    { name: 'ghosts', at: null, level: c => (0.12 + 0.43 * c.blend) * (0.35 + 0.65 * c.drift(c.t * 0.18, 6.4)) },
  ],
  occasional: [{ name: 'creak', every: [26, 60], volume: 0.5, region: [-3, 3, 0, 0.5, -16, -9] }],
  // The user's power-up sound, while the trigger is held: in from nothing to full quickly, held, and out (asked for on 2026-11-11).
  hum: { level: 0.45, swing: false, fadeIn: 0.15, fadeOut: 0.25 },        // (was 1: the user asked for it subtler)
  // (The user's organ note played on every cut for a while, wandering a minor scale; taken out at their asking the same day.
  // To bring it back: cutNote: { name: 'organ', scale: [-2, 0, 2, 3, 5, 7, 8, 10, 12, 14, 15], volume: 0.8 }.)
  // The first round over: a door slams far down the hall, and witches laugh (the user's sounds, asked for on 2026-11-11).
  afterRound: [{ round: 1, sounds: [
    { name: 'doorslam', delay: 0, volume: 1, at: [0.6, 0.2, -11] },
    { name: 'witches', delay: 0.55, volume: 0.9, at: [-2.4, 1.3, -5] },
  ] }],
};
