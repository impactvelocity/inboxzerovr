import type { Vector3 } from 'three';
import type { LetterTheme } from '../letters';
import { createLeaves } from '../props/leaves';
import type { StageDef } from './backdrop';
import { BOARD, lumberCard } from './lumbercard';
import { W } from './cards';
import { frameSoup } from './shapes';
import type { FxStyle, LevelSound } from './types';

/**
 * LumberHack: a timber yard on an autumn afternoon. A red barn straight ahead with a mail hatch in
 * its doors and a lamp over it, a log shed and a big maple on the left, pines and hills behind, a
 * hay wagon and another maple on the right, and a heavy chopping bench in front of the seat. By
 * the end it is late twilight: blue dark, the lamp and the barn's window the only warm things.
 * The mail is TIMBER POST, notices tacked to pine boards, flung out of the hatch; the weapon is a
 * lumberjack's axe (../weapons/axe.ts). Maple leaves come down through all of it (../props/leaves.ts).
 *
 * Positions are u, v in public/levels/lumber/start.webp (u 0 left to 1 right over 270 degrees,
 * v 0 bottom to 1 top over 90, the eye line at .48), measured from the painting
 * (design/lumberjack-farm-v1: light and dark, the user's art, 2026-11-12).
 */

/** The hatch in the barn doors, where the mail comes from: its direction, and how far off the barn is by the depth model. */
const HATCH = { u: 0.511, v: 0.605, metres: 12 };

export const lumberStage: StageDef = {
  id: 'lumber', name: 'LumberHack',
  art: ['levels/lumber/start.webp', 'levels/lumber/end.webp'],
  // (the colours of the painting's two edges, so the yard carries on behind)
  rear: ['#6e4a2a', '#131627'],
  props: createLeaves,
  glsl: /* glsl */ `
    // A yard: packed earth 1.2 m under the eye, and what stands on it. Judged from the painting,
    // which is a picture in perspective wrapped round the player: the barn a dozen metres off down
    // the middle, the pines and hills far behind it, the log shed and the big maple on the left and
    // the wagon and the other maple on the right the nearest standing things. The ground is never
    // further than what stands on it. In front, the chopping bench: its top rising away from a
    // metre and a half off, its apron and legs at that metre and a half.
    float inverseDepthAt(vec3 d, vec2 uv){
      float level=sqrt(max(0.,1.-d.y*d.y));
      float barn=smoothstep(.31,.35,uv.x)*(1.-smoothstep(.69,.73,uv.x));
      float standing=mix(1./22.,1./12.,barn);
      standing=mix(standing,1./5.5,smoothstep(.32,.05,uv.x));
      standing=mix(standing,1./7.,smoothstep(.83,.97,uv.x));
      // open sky over the pines, right of the barn; and the maple's boughs overhead on the left
      standing*=1.-.85*smoothstep(.80,.93,uv.y)*smoothstep(.61,.66,uv.x)*(1.-smoothstep(.82,.87,uv.x));
      standing=max(standing,smoothstep(.42,.28,uv.x)*smoothstep(.70,.84,uv.y)/6.5);
      float inv=max(max(-d.y,0.)/1.2,standing*level);
      float top=band(uv.x,.19,.80)*band(uv.y,.235,.392);
      float legs=(band(uv.x,.205,.345)+band(uv.x,.645,.79))*(1.-smoothstep(.233,.239,uv.y));
      return max(inv,(top+legs)*mix(.42,.66,smoothstep(.392,.295,uv.y)));
    }
    // Wind in the trees: the two maples' leaves and the pine tops stir, more with the Breeze, in
    // slow gusts. (By where they are in the painting, kept clear of the barn's roof.)
    vec2 warp(vec2 uv){
      float maples=oval(uv,vec2(.27,.93),vec2(.17,.11))+oval(uv,vec2(.07,.975),vec2(.10,.05))+oval(uv,vec2(.96,.84),vec2(.085,.22));
      float pines=smoothstep(.635,.66,uv.x)*(1.-smoothstep(.84,.87,uv.x))*smoothstep(.66,.74,uv.y)*(1.-smoothstep(.93,.99,uv.y))
                 +smoothstep(.235,.255,uv.x)*(1.-smoothstep(.315,.33,uv.x))*smoothstep(.60,.68,uv.y)*(1.-smoothstep(.80,.86,uv.y));
      float gust=.5+.5*sin(time*.5+uv.x*5.)*sin(time*.23+1.3);
      vec2 w=vec2(sin(uv.y*46.+time*1.7+uv.x*21.)+.6*sin(uv.x*83.-time*2.3),cos(uv.x*52.+time*1.3+uv.y*17.));
      return uv+w*vec2(.0011,.0007)*(maples+.45*pines)*(.3+breeze*1.5)*(.5+.7*gust);
    }
    vec3 scene(vec3 col, vec2 uv){
      vec3 amber=vec3(1.,.62,.22);
      float day=1.-blend;
      // (before anything is added to it: where the painting is open night sky)
      float sky=smoothstep(.26,.36,col.b-max(col.r,col.g))*smoothstep(.70,.80,uv.y);
      // By day: cloud shadows crossing the yard, slowly, and the low sun coming and going through the big maple.
      float yard=1.-smoothstep(.44,.50,uv.y);
      float cloud=softNoise(vec2(uv.x*9.+time*.035,uv.y*14.-time*.012))*softNoise(vec2(uv.x*4.-time*.02,uv.y*6.+3.));
      col*=1.-yard*day*.15*smoothstep(.20,.46,cloud);
      float ray=softNoise(vec2((uv.x+uv.y*.5)*34.+time*.05,time*.08));
      float under=smoothstep(.02,.16,uv.x)*(1.-smoothstep(.34,.46,uv.x))*smoothstep(.28,.5,uv.y)*(1.-smoothstep(.72,.9,uv.y));
      col+=vec3(1.,.82,.5)*smoothstep(.5,.95,ray)*under*day*.07;
      // The barn lamp: an oil lamp, steadier than a candle. Whatever it lights warm (the doors, the
      // hatch, its pool on the yard, the bench top) breathes with it, far more once it is the only light.
      float f=1.+(flame(1.7)-1.)*.55;
      float warm=smoothstep(.06,.30,col.r-col.b)*smoothstep(.25,.6,col.r);
      float lit=oval(uv,vec2(.5097,.69),vec2(.075,.20))+.8*oval(uv,vec2(.51,.43),vec2(.16,.07))+.5*oval(uv,vec2(.5,.345),vec2(.2,.05));
      col*=1.+clamp(warm*lit*(f-1.)*mix(1.2,2.8,blend),-.4,.4);
      col+=amber*oval(uv,vec2(.5097,.745),vec2(.016,.045))*f*(.10+.30*blend);
      col+=amber*oval(uv,vec2(.5097,.72),vec2(.06,.16))*f*.10*blend;
      // The window over it: someone has a fire in, and it shows once it is dark.
      float hearth=1.+.10*sin(time*.9)+.06*sin(time*2.3+1.);
      col*=1.+box(uv,vec2(.512,.88),vec2(.018,.045),.01)*warm*(hearth-1.)*blend*2.2;
      col+=amber*oval(uv,vec2(.512,.88),vec2(.035,.09))*hearth*.09*blend;
      // The hatch: it glows a little always, and flares as a letter is flung out of it.
      col+=amber*oval(uv,vec2(.511,.61),vec2(.034,.075))*(.03+.09*blend+.6*pulse);
      col+=vec3(1.,.9,.7)*oval(uv,vec2(.511,.60),vec2(.012,.03))*pulse*.5;
      // Stars, once the sky is dark: small, few, each winking at its own pace.
      vec2 grid=uv*vec2(540.,180.); float h=hash(floor(grid)); vec2 q=fract(grid)-.5;
      col+=vec3(.85,.9,1.)*step(.982,h)*exp(-dot(q,q)*16.)*(.55+.45*sin(time*(.8+3.*h)+h*40.))*sky*blend*.9;
      return col;
    }`,
  motes: [
    { name: 'Dust and pollen in the low sun', count: 150, box: [10, 3, 10], centre: [0, 1.6, -4.5], size: 13, colour: ['#ffe9b0', '#9fb4ff'], opacity: [0.34, 0.1], rise: 0.01, sway: 0.3, twinkle: 0.5, additive: true },
    { name: 'Sawdust over the bench', count: 40, box: [3, 1.2, 2.4], centre: [0, 1.1, -1.5], size: 9, colour: ['#ffd9a0', '#c9b9ff'], opacity: [0.3, 0.1], rise: -0.02, sway: 0.2, twinkle: 0.4, additive: true },
    // (they are there all day and cannot be seen: they light as it gets dark)
    { name: 'Fireflies', count: 44, box: [11, 1.7, 9], centre: [0, 1.0, -5.2], size: 30, colour: ['#ffe27a', '#e6ff6a'], opacity: [0, 0.85], rise: 0.012, sway: 0.75, twinkle: 1, additive: true },
  ],
  // Ground mist over the yard as the evening comes on: hardly there by day, low and blue by night.
  fog: { cards: 5, from: 4.2, to: 11, width: 9, height: 1.3, colour: ['#ffe6bf', '#8fa6e0'], opacity: [0.03, 0.17] },
  // (the fill is the barn lamp: steady, with a little life in it)
  flicker: time => 1 + 0.05 * Math.sin(time * 1.3 + 0.6) + 0.03 * Math.sin(time * 11 + 1.9) * Math.sin(time * 7.3),
};

export const lumberLetters: LetterTheme = {
  id: 'lumber', face: 'paint', paint: lumberCard, shape: () => frameSoup(BOARD / W * 0.5), mechanic: 'cut', title: 'LumberHack', accent: '#ffc440', bar: ['#e8452f', '#ffc440'],
  look: { sheet: '#f7ead0', ink: '#3a2414', back: '#b97a35', selfLit: 0.3, night: '#f0dcc0',
    hover: '#fff0c4', cutWide: '#ffb347', cutHot: '#fff6dc', mark: '#ffe08a', flash: '#fff3cf', gold: '#ffe29a',
    burn: '#ff9a3c', burnStyle: 0, streak: ['#ffc56b', '#ffffff'], thread: ['#ffd98a', '#fffaf0'], aura: ['#ffb347', '#ff7a3a'],
    // (no spell on it: a still warm bloom, so that it stands off the barn, and a few motes of sawdust round its edge)
    spell: { wisps: 0, sparkles: 4, trail: true, glow: 0.16 } },
  // Flung out of the hatch: a speck in the barn doors that is lobbed across the yard, turning over,
  // and settles in front of the player.
  origin(head: Vector3, home: Vector3, from: Vector3, via: Vector3) {
    const across = (HATCH.u - 0.5) * 4.71238898, up = (HATCH.v - 0.48) * 1.57079633;
    from.set(head.x + Math.sin(across) * Math.cos(up) * HATCH.metres, head.y + Math.sin(up) * HATCH.metres, head.z - Math.cos(across) * Math.cos(up) * HATCH.metres);
    via.lerpVectors(from, home, 0.5); via.y += 1.1;
    return { scale: 1, pose: 'tumble' as const, seconds: 1.5, ease: 2.6, sway: 0.1 };
  },
};

// What a chop throws out: splinters of pine, which fall as wood does, and sawdust bright in the sun.
export const lumberFx: FxStyle = { bit: 'shard', bits: ['#d9933f', '#8a5a3a'], paper: ['#f7ead0', '#b9b1c8'], sparks: ['#ffd98a', '#ffc27a'], shedBits: 0, shedSparks: 0.6, gravity: 3.2, drag: 1.0, flutter: 0.3, size: 1.1 };

export const lumberSound: LevelSound = {
  id: 'lumber',
  layers: [
    // the air of the yard: a breeze in the pines, all round
    { name: 'yard', at: null, level: c => 0.5 + 0.3 * c.drift(c.t * 0.25, 1.9) },
    // the big maple, up and to the left: its leaves answer the wind
    { name: 'leaves', at: [-3.4, 2.4, -2.6], level: c => 0.2 + 0.45 * c.drift(c.t * 0.4, 5.3) },
    // birds beyond the barn by day, gone by dark; crickets come in as they go
    { name: 'birds', at: [3.5, 2.2, -9], level: c => 0.55 * Math.max(0, 1 - c.blend * 1.6) * (0.5 + 0.5 * c.drift(c.t * 0.15, 8.1)) },
    { name: 'crickets', at: null, level: c => 0.5 * Math.max(0, (c.blend - 0.25) / 0.75) },
  ],
  occasional: [
    { name: 'crow', every: [34, 80], volume: 0.4, region: [-14, 14, 4, 9, -30, -14] },
    { name: 'woodpecker', every: [40, 95], volume: 0.4, region: [4, 12, 2, 6, -22, -12] },
    { name: 'creak', every: [45, 100], volume: 0.4, region: [-1, 1.5, 0.5, 2.5, -12, -11] },
    { name: 'chop', every: [50, 110], volume: 0.45, region: [-9, -5, 0, 1, -8, -4] },
  ],
  // (an axe does not hum)
  hum: null,
  // The first round over, and night coming on: an owl, in the pines to the left.
  afterRound: [{ round: 1, sounds: [{ name: 'owl', delay: 1.4, volume: 0.8, at: [-4.5, 3.5, -9] }] }],
};
