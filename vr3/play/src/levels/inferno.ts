import type { Vector3 } from 'three';
import type { LetterTheme } from '../letters';
import type { StageDef } from './backdrop';
import { infernoCard } from './infernocard';
import type { FxStyle, LevelSound } from './types';

/**
 * Inferno: the mail room's furnace hall. Brick and iron under three caged lamps, a furnace either
 * side with its doors shut and fire showing round their edges, copper pipes, and in the middle a
 * hopper of mail over a chute the letters come down. A long iron bench stands in front of the
 * seat. Nothing is cut: the tool is a flame thrower (../weapons/flamethrower.ts, ../flame.ts). One
 * touch of the jet and a letter catches, the fire spreads over it by itself, and it burns away.
 *
 * Positions are u, v in public/levels/inferno/start.webp (u 0 left to 1 right over 270 degrees,
 * v 0 bottom to 1 top over 90, the eye line at .48), measured from the painting
 * (design/incinerator-v2: normal.png and dark.png, the user's art, 2026-11-12).
 */

/** The mouth of the chute, where letters come out: its direction, and how far it is by the depth model. */
const CHUTE = { u: 0.5, v: 0.453, metres: 4.5 };

export const infernoStage: StageDef = {
  id: 'inferno', name: 'Inferno',
  art: ['levels/inferno/start.webp', 'levels/inferno/end.webp'],
  rear: ['#4a2c26', '#0d0a14'],
  glsl: /* glsl */ `
    // A hall: the floor 1.2 m under the eye and the beams 2.3 m over it; the back wall about six
    // metres off down the middle and (the painting being wrapped round the player) nearer towards
    // its two edges, where the furnaces are; the chute and its hopper standing out from the wall;
    // and the bench in front of the seat, its top a level surface, its apron and legs a metre and a half off.
    float inverseDepthAt(vec3 d, vec2 uv){
      float level=sqrt(max(0.,1.-d.y*d.y));
      float side=clamp(abs(uv.x-.5)*2.,0.,1.);
      float wall=mix(1./5.9,1./3.2,side*side)*level;
      float inv=max(max(max(-d.y,0.)/1.2,max(d.y,0.)/2.3),wall);
      float chute=band(uv.x,.4075,.5925)*band(uv.y,.31,.80);
      inv=max(inv,chute*level/4.5);
      float top=band(uv.x,.225,.775)*band(uv.y,.18,.297);
      float legs=(band(uv.x,.225,.29)+band(uv.x,.71,.775))*band(uv.y,.03,.18);
      return max(inv,(top+legs)*min(max(-d.y,0.)/.63,level/1.5));
    }
    // 0 to 1, slowly: a furnace drawing breath.
    float surge(float seed){ return .5+.5*sin(time*.7+seed)*sin(time*.31+seed*2.3); }
    // Heat: the air shivers over the furnace doors and in the mouth of the chute, more as the
    // lights go down, and whenever something is alight in front of you.
    vec2 warp(vec2 uv){
      float doors=oval(uv,vec2(.219,.60),vec2(.085,.26))+oval(uv,vec2(.7885,.60),vec2(.085,.26));
      float mouth=oval(uv,vec2(.5,.47),vec2(.06,.12));
      float haze=(doors+mouth*.7)*(.5+.5*blend+.8*hot);
      uv.x+=(sin(uv.y*210.-time*5.1)+sin(uv.y*97.-time*3.3+uv.x*40.))*.0007*haze;
      uv.y+=sin(uv.x*260.+time*4.)*.0006*haze;
      return uv;
    }
    vec3 scene(vec3 col, vec2 uv){
      vec3 fire=vec3(1.,.42,.08), amber=vec3(1.,.66,.26);
      // Bloom: the painting itself, blurred (its own small copies), where it is bright and warm,
      // laid back over it. Tight round the lamps and the door seams, and a wider, fainter glow.
      vec3 soft=mix(textureLod(startMap,uv,3.).rgb,textureLod(endMap,uv,3.).rgb,blend);
      vec3 wide=mix(textureLod(startMap,uv,5.2).rgb,textureLod(endMap,uv,5.2).rgb,blend);
      float bright=smoothstep(.55,.95,max(soft.r,soft.g))*smoothstep(.12,.4,soft.r-soft.b);
      float spill=smoothstep(.38,.8,wide.r)*smoothstep(.1,.32,wide.r-wide.b);
      // The furnaces breathe, each in its own time; they surge when a letter catches (pulse) and
      // while anything is alight in front of you (hot).
      float heatL=.62+.38*surge(.3)+(flame(1.1)-1.)*1.3, heatR=.62+.38*surge(4.1)+(flame(5.7)-1.)*1.3;
      float doorL=box(uv,vec2(.219,.515),vec2(.078,.19),.02), doorR=box(uv,vec2(.7885,.515),vec2(.078,.19),.02);
      float stoked=doorL*heatL+doorR*heatR;
      float glowing=smoothstep(.22,.5,col.r-col.b)*smoothstep(.55,.85,col.r)*smoothstep(.2,.45,col.g);
      col*=1.+glowing*(doorL*(heatL-.7)+doorR*(heatR-.7))*1.3+glowing*(doorL+doorR)*(.45*hot+.5*pulse);
      col+=soft*bright*(.20+.24*blend)*(1.+.9*(stoked-.7)*(doorL+doorR));
      col+=wide*vec3(1.,.62,.32)*spill*(.07+.13*blend);
      // their light on the air in front of them, and leaking out along the floor
      col+=fire*(oval(uv,vec2(.219,.50),vec2(.10,.24))*heatL+oval(uv,vec2(.7885,.50),vec2(.10,.24))*heatR)*(.03+.06*blend+.07*hot+.05*pulse);
      col+=fire*(oval(uv,vec2(.219,.30),vec2(.10,.05))*heatL+oval(uv,vec2(.7885,.30),vec2(.10,.05))*heatR)*(.04+.10*blend);
      // The three caged lamps: each flame flutters, and now and then gutters; a halo round each,
      // and under each a cone of lit dust drifting.
      vec2 lampL=vec2(.1065,.873), lampC=vec2(.5,.895), lampR=vec2(.8935,.888);
      float fl=flame(.6), fc=flame(2.9), fr=flame(7.3), day=1.-.6*blend;
      float cages=oval(uv,lampL,vec2(.02,.055))*(fl-1.)+oval(uv,lampC,vec2(.02,.055))*(fc-1.)+oval(uv,lampR,vec2(.02,.055))*(fr-1.);
      col*=1.+cages*1.6;
      col+=amber*(oval(uv,lampL,vec2(.05,.13))*fl+oval(uv,lampC,vec2(.05,.13))*fc+oval(uv,lampR,vec2(.05,.13))*fr)*.075*day;
      float dust=softNoise(vec2(uv.x*46.+time*.21,uv.y*34.-time*.16))*softNoise(vec2(uv.x*17.-time*.08,uv.y*23.+time*.05));
      col+=amber*(oval(uv,lampL-vec2(0.,.24),vec2(.055,.2))*fl+oval(uv,lampC-vec2(0.,.2),vec2(.05,.16))*fc+oval(uv,lampR-vec2(0.,.24),vec2(.055,.2))*fr)*dust*.11*day;
      // The chute: a glow far up inside it that flares as a letter comes down; the hopper catches it.
      vec2 mouth=vec2(.5,.453);
      float inside=box(uv,mouth,vec2(.05,.09),.02);
      col+=fire*inside*(.012+.012*sin(time*1.3)+.55*pulse);
      col+=fire*oval(uv,mouth,vec2(.09,.17))*(.02+.3*pulse);
      col+=amber*oval(uv,vec2(.5,.72),vec2(.07,.06))*.22*pulse;
      // The floor: what light lies on it shivers a little, as over hot stone.
      float bench=band(uv.x,.225,.775)*band(uv.y,.18,.297);
      float floor_=smoothstep(.36,.30,uv.y)*(1.-bench);
      float lum=dot(col,vec3(.3,.5,.2));
      float shimmer=sin(uv.x*900.+uv.y*60.-time*1.2)*.6+sin(uv.x*520.-uv.y*90.-time*.7)*.4;
      col*=1.+floor_*smoothstep(.25,.6,lum)*shimmer*.045;
      // Your own fire: while the jet is lit it lights the bench in front of you and the floor
      // round it, fluttering; and when a letter goes up the whole room takes a breath of it.
      float flutter=.8+.2*sin(time*31.)*sin(time*19.7);
      float close_=oval(uv,vec2(.5,.2),vec2(.2,.2));
      col+=fire*hot*flutter*(bench*.13*close_+floor_*close_*.07+.018);
      col+=fire*pulse*.035;
      // Smoke lying under the beams, drifting.
      float haze=softNoise(vec2(uv.x*14.+time*.05,uv.y*9.-time*.02));
      col=mix(col,mix(vec3(.20,.13,.11),vec3(.06,.05,.09),blend),smoothstep(.70,1.,uv.y)*haze*.34);
      // The grade: shadows towards plum and highlights towards amber, a little more contrast,
      // and the far sides and the beams falling away so that the middle, where the mail is, holds the eye.
      float l=dot(col,vec3(.3,.5,.2));
      col=mix(col,col*vec3(.90,.90,1.14),(1.-smoothstep(0.,.42,l))*(.3+.3*blend));
      col=mix(col,col*vec3(1.08,1.,.9),smoothstep(.45,1.,l)*.5);
      vec3 c=clamp(col,0.,1.); col=mix(col,c*c*(3.-2.*c),.2);
      col*=mix(.7,1.,smoothstep(0.,.11,uv.x)*smoothstep(1.,.89,uv.x))*mix(.8,1.,smoothstep(1.,.76,uv.y));
      return col;
    }`,
  motes: [
    { name: 'Embers on the draught', count: 110, box: [9, 3, 8], centre: [0, 1.5, -3.6], size: 15, colour: ['#ffb24a', '#ff7a1e'], opacity: [0.5, 0.9], rise: 0.16, sway: 0.3, twinkle: 0.7, additive: true },
    { name: 'Embers close by', count: 20, box: [3.2, 2.2, 2], centre: [0, 1.3, -1.5], size: 17, colour: ['#ffc566', '#ff8a2a'], opacity: [0.4, 0.8], rise: 0.12, sway: 0.22, twinkle: 0.75, additive: true },
    { name: 'Sparks off the left furnace', count: 26, box: [1.3, 2.3, 1.7], centre: [-3.9, 1.2, -1.1], size: 12, colour: ['#ffd27a', '#ff9a3a'], opacity: [0.4, 0.9], rise: 0.42, sway: 0.2, twinkle: 0.85, additive: true },
    { name: 'Sparks off the right furnace', count: 26, box: [1.3, 2.3, 1.7], centre: [3.9, 1.2, -1.1], size: 12, colour: ['#ffd27a', '#ff9a3a'], opacity: [0.4, 0.9], rise: 0.42, sway: 0.2, twinkle: 0.85, additive: true },
    { name: 'Ash', count: 90, box: [9, 3, 8], centre: [0, 1.6, -3.5], size: 11, colour: ['#eadccb', '#8d8499'], opacity: [0.24, 0.2], rise: -0.035, sway: 0.3, twinkle: 0.2, additive: false },
    { name: 'Heat in the mouth of the chute', count: 16, box: [1.4, 1.3, 1], centre: [0, 1.0, -4.3], size: 80, colour: ['#ffb060', '#ff7a20'], opacity: [0.02, 0.045], rise: 0.1, sway: 0.2, twinkle: 0.2, additive: true },
  ],
  // Smoke lying across the hall, lit from the fires as the lights go.
  fog: { cards: 5, from: 2.8, to: 7.5, width: 8, height: 1.3, colour: ['#dba27a', '#a8401f'], opacity: [0.05, 0.09] },
  // the furnace's light on what is in the hand: it flutters, and gutters now and then
  flicker: (time, blend) => 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(time * 9.1) * Math.sin(time * 5.3)) * (0.5 + 0.5 * blend) + 0.1 * Math.sin(time * 0.7),
};

export const infernoLetters: LetterTheme = {
  id: 'inferno', face: 'paint', paint: infernoCard, mechanic: 'spray', title: 'Inferno', accent: '#ff8a3d', bar: ['#ff3d2e', '#ffc23d'],
  look: { sheet: '#f3e6cc', ink: '#1c130f', back: '#e4d3b4', selfLit: 0.1, night: '#d9bcae',
    hover: '#ffe2b8', cutWide: '#ff9a3a', cutHot: '#fff3d6', mark: '#ffe27a', flash: '#fff1d0', gold: '#fff0a8',
    burn: '#ffb347', burnStyle: 3, streak: ['#ffb070', '#ffffff'], thread: ['#ffb070', '#fff3e0'], aura: ['#ff5a14', '#ffc24a'], spell: { wisps: 1, sparkles: 14, trail: false, glow: 0.6 } },
  // Down the chute: small in the dark of its mouth, then out over the bench, turning a little as it comes.
  origin(head: Vector3, home: Vector3, from: Vector3, via: Vector3) {
    const across = (CHUTE.u - 0.5) * 4.71238898, down = (CHUTE.v - 0.48) * 1.57079633;
    from.set(head.x + Math.sin(across) * Math.cos(down) * CHUTE.metres, head.y + Math.sin(down) * CHUTE.metres, head.z - Math.cos(across) * Math.cos(down) * CHUTE.metres);
    via.lerpVectors(from, home, 0.55); via.y += 0.2;
    return { scale: 0.5, pose: 'face' as const, seconds: 1.9, ease: 2, sway: 0.06 };
  },
  // The junk that shouts arrives already smouldering (as the lab's is radioactive): it takes the fire a little longer.
  hazard: email => email.kind === 'Junk' && (email.category === 'Spam' || email.category === 'Promo' || email.category === 'Alert'),
};

// What comes off a burning letter: scraps of paper alight, carried up by the heat.
export const infernoFx: FxStyle = { bit: 'petal', bits: ['#ff8a3a', '#ff5a1e'], paper: ['#f1dfc0', '#5a4038'], sparks: ['#ffd27a', '#ff8a3a'], shedBits: 0, shedSparks: 0, gravity: -0.45, drag: 1.5, flutter: 0.9, size: 0.6 };

export const infernoSound: LevelSound = {
  id: 'inferno',
  layers: [
    // the furnaces behind their doors, all round
    { name: 'furnace', at: null, level: c => 0.7 + 0.15 * c.drift(c.t * 0.12, 1.3) },
    // fire close by on the left; louder while something is alight in front of you
    { name: 'crackle', at: [-3.6, -0.2, -1.2], level: c => 0.42 + 0.24 * c.drift(c.t * 0.25, 2.9) + 0.2 * c.hot },
    // the pipes over the right furnace
    { name: 'pipes', at: [2.8, 1.0, -3.0], level: c => 0.3 + 0.2 * c.drift(c.t * 0.2, 5.1) },
  ],
  occasional: [
    { name: 'clank', every: [28, 70], volume: 0.4, region: [-6, 6, 0.3, 1.5, -9, -4] },
    { name: 'steam', every: [22, 55], volume: 0.35, region: [1.5, 4.5, 0.8, 2.2, -4, -2] },
    { name: 'flare', every: [18, 46], volume: 0.4, region: [-4.4, -3.6, 0, 0.6, -1.5, -0.8] },
  ],
  // the roar of the jet, for as long as the trigger is held
  hum: { level: 0.5, swing: false, fadeIn: 0.08, fadeOut: 0.3 },
};
