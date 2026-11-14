import type { Vector3 } from 'three';
import type { LetterTheme } from '../letters';
import { paintedDirection, type StageDef } from './backdrop';
import { Vector3 as V3 } from 'three';
import { labCard } from './cards';
import type { FxStyle, LevelSound } from './types';

/**
 * The lab: a long tiled containment hall under teal beams, seen from a deck between two pillars, glowing green
 * growing things in tanks down the side corridors, and far off in the middle a containment machine: a glass dome full of mail, a
 * warning beacon on top, and a hatch the contaminated letters come out of. Some of it is
 * radioactive, and nothing is cut: the tool is a disinfectant sprayer. One touch of the mist and
 * the froth spreads over the letter by itself and melts it.
 *
 * Positions are u, v in public/levels/lab/start.webp (u 0 left to 1 right over 270 degrees, v 0
 * bottom to 1 top over 90, the eye line at .48), measured from the painting (the hall, 2026-11-13, painted to Kyoto's
 * one-point perspective so the mail stands out against a far, calm middle; the room before it, with its tables and bench,
 * is tools/level-src/lab/start-table.webp and end-table.webp, and older ones are in design/theme-tests-v2/chemical and chemical-hall).
 */

/** The machine's hatch, where letters come out: its direction, and how far it is by the depth model. */
const HATCH = { u: 0.5, v: 0.39, metres: 5.85 };      // (the hall, 2026-11-13; in the room before it, u .4998, v .3928, 4.3 m)
const hatchWay = new V3();

export const labStage: StageDef = {
  id: 'lab', name: 'The lab',
  art: ['levels/lab/start.webp', 'levels/lab/end.webp'],
  rear: ['#b9c9cc', '#06161a'],
  glsl: /* glsl */ `
    // The hall (paintings since 2026-11-13, drawn to Kyoto's one-point perspective): the floor 1.2 m under the eye and the
    // ceiling 1.7 m over it; the back wall about 12 m off down the middle, the side corridors' walls nearer and nearer
    // towards the painting's edges; the machine standing out in the middle at about 5.8 m; the two pillars and the
    // deck's railings about 3.9 m out. Nothing near in front: the mail has the open air to itself. (Furnished since later
    // that day: bench rows by the machine, and a desk and a trolley either side of the seat. Those are not cut out as
    // blocks of their own: hard-edged, they slid against the wall behind them as the head moved, and the side tables
    // looked "weird and cut off" (2026-11-13). The lower sides just come nearer, smoothly, to about 2.2 m.)
    float inverseDepthAt(vec3 d, vec2 uv){
      float level=sqrt(max(0.,1.-d.y*d.y));
      float side=clamp(abs(uv.x-.5)*2.,0.,1.);
      float wall=mix(1./11.8,1./2.6,pow(side,1.6))*level;
      float inv=max(max(max(-d.y,0.)/1.2,max(d.y,0.)/1.7),wall);
      float machine=band(uv.x,.455,.545)*band(uv.y,.35,.55);
      inv=max(inv,machine*level/5.8);
      float pillars=(band(uv.x,.215,.257)+band(uv.x,.743,.785))*step(.29,uv.y);
      float rails=(band(uv.x,.258,.367)+band(uv.x,.632,.743))*band(uv.y,.29,.386);
      inv=max(inv,min(1.,pillars+rails)*level/3.9);
      float nearSides=smoothstep(.7,.92,side)*(1.-smoothstep(.3,.46,uv.y));
      return max(inv,nearSides*level/2.2);
    }
    // The liquid moves: the mail in the dome turns over slowly, the tanks' contents drift and wobble.
    vec2 warp(vec2 uv){
      float dome=oval(uv,vec2(.5,.46),vec2(.0185,.0375));
      uv+=vec2(sin(time*.9+uv.y*90.)*.0012,sin(time*1.3+uv.x*70.)*.0022)*dome;
      float tanks=oval(uv,vec2(.015,.505),vec2(.011,.06))+oval(uv,vec2(.0375,.505),vec2(.011,.06))+oval(uv,vec2(.97,.505),vec2(.011,.06))+oval(uv,vec2(.9925,.505),vec2(.011,.06))
                 +oval(uv,vec2(.209,.483),vec2(.007,.035))+oval(uv,vec2(.7915,.475),vec2(.007,.035))+oval(uv,vec2(.8825,.49),vec2(.007,.035));
      uv+=vec2(sin(time*1.7+uv.y*160.)*.0007,sin(time*1.1+uv.x*120.)*.0012)*tanks;
      return uv;
    }
    vec3 scene(vec3 col, vec2 uv){
      float lum=dot(col,vec3(.3,.5,.2));
      // The ceiling lights: a slow, soft dip now and then as the machine draws power. Nothing in this room flickers or
      // strobes (2026-11-13: "there is a point where it flashes alot, strobes, and that is hard on eyes, so not strobe
      // effects"): the dip had a 5 Hz flutter in it and the lights a 7 Hz mains hum; both gone.
      float lights=smoothstep(.72,.92,lum)*step(.53,uv.y);
      float dip=smoothstep(.72,1.,sin(time*.43)*sin(time*.17+2.));
      col*=1.-.04*dip*(1.-.5*blend);
      col*=1.-lights*.15*dip;
      // The wall lamps are steady (electric: no candle flicker here), and swell slowly when something radioactive is in front of you.
      vec3 amber=vec3(1.,.55,.14);
      float beat=.5+.5*sin(time*2.);      // (a slow swell, about every three seconds)
      float lamps=oval(uv,vec2(.2285,.603),vec2(.007,.024))+oval(uv,vec2(.771,.605),vec2(.007,.024))
                 +oval(uv,vec2(.069,.531),vec2(.005,.016))+oval(uv,vec2(.934,.535),vec2(.005,.016))
                 +(oval(uv,vec2(.1385,.51),vec2(.003,.01))+oval(uv,vec2(.1935,.505),vec2(.003,.01))+oval(uv,vec2(.8625,.51),vec2(.003,.01)))
                 +(oval(uv,vec2(.3775,.46),vec2(.003,.008))+oval(uv,vec2(.4435,.46),vec2(.003,.008))+oval(uv,vec2(.5565,.46),vec2(.003,.008))+oval(uv,vec2(.6225,.46),vec2(.003,.008)))*.6;
      col+=amber*lamps*(.10+.10*blend+.45*hot*beat);
      float warm=smoothstep(.05,.25,col.r-col.b)*smoothstep(.25,.6,col.r);
      col*=1.+warm*(.05*sin(time*1.7)+.22*hot*beat)*(.4+.6*blend);
      // The beacon on the machine turns: one slow, steady sweep, a little brighter while anything hot is out. (It turned
      // faster with hot: as that eased in and out, time*(rate) raced through dozens of turns in a moment and the light
      // strobed. Its speed is fixed now, and its flash is a soft swell, not a sharp one.)
      vec2 beacon=vec2(.5,.532);
      float spin=time*1.1;
      float facing=pow(.5+.5*cos(spin),2.);
      col+=amber*oval(uv,beacon,vec2(.006,.014))*(.45+.45*facing)*(.5+.5*max(blend,hot));
      col+=amber*oval(uv,beacon+vec2(.04*sin(spin),0.),vec2(.06,.10))*facing*(.04+.07*max(blend,hot));
      float sweep=exp(-pow(fract((uv.x-beacon.x)*1.2-spin/6.2832)-.5,2.)*60.)*smoothstep(.40,.55,uv.y)*smoothstep(.98,.75,uv.y);
      col+=amber*sweep*(.015+.035*max(blend,hot));
      // The green breathes and bubbles: tanks, the dome; more in the dark, more near anything hot.
      float stir=.55+.9*blend+1.2*hot;
      float bubble=.5+.5*sin(time*2.3+uv.y*140.)*sin(time*1.4+uv.x*170.);
      float green=smoothstep(.10,.35,col.g-max(col.r,col.b))*smoothstep(.35,.7,col.g);
      col*=1.+green*(.10*sin(time*1.1)+.12*bubble)*stir;
      float glows=oval(uv,vec2(.5,.46),vec2(.04,.05))*1.3+oval(uv,vec2(.026,.505),vec2(.03,.07))+oval(uv,vec2(.981,.505),vec2(.03,.07))
                 +oval(uv,vec2(.209,.483),vec2(.012,.04))+oval(uv,vec2(.7915,.475),vec2(.012,.04))+oval(uv,vec2(.8825,.49),vec2(.012,.04))
                 +oval(uv,vec2(.1425,.475),vec2(.008,.03))+oval(uv,vec2(.859,.475),vec2(.008,.03))
                 +oval(uv,vec2(.4685,.393),vec2(.008,.012))+oval(uv,vec2(.535,.396),vec2(.008,.012));
      col+=vec3(.25,1.,.35)*glows*(.04+.04*sin(time*1.1+uv.x*9.))*stir;
      // the crystals in the jars answer it, slowly
      col+=vec3(.55,.3,1.)*(oval(uv,vec2(.12,.505),vec2(.012,.02))+oval(uv,vec2(.91,.543),vec2(.012,.02)))*(.05+.05*sin(time*.8+2.))*stir;
      // The hatch: a green glow deep inside it, which flares as a letter comes out; the dome flares with it.
      vec2 hatch=vec2(.5,.39);
      float inside=box(uv,hatch,vec2(.011,.019),.004);
      vec3 seal=mix(vec3(.45,1.,.6),vec3(.30,1.,.45),blend);
      // (subtler, and it swells rather than flashes: labStage.pulseRise; 2026-11-13, "a bit more subtle, that can be a bit jarring")
      col+=seal*inside*(.05+.04*sin(time*1.3)+.8*pulse);
      col+=seal*oval(uv,hatch,vec2(.05,.05))*.3*pulse;
      col+=seal*oval(uv,vec2(.5,.46),vec2(.05,.05))*.2*pulse;
      // the hatch's side lights and the panel blink
      // (they breathe slowly; they blinked hard on and off before)
      col+=amber*(oval(uv,vec2(.4875,.39),vec2(.003,.012))+oval(uv,vec2(.5135,.39),vec2(.003,.012)))*(.15+.12*sin(time*1.3));
      col+=vec3(.3,1.,.4)*oval(uv,vec2(.521,.407),vec2(.004,.006))*(.15+.1*sin(time*1.7+.3));
      // Reflections on the floor shiver; the green from the machine comes and goes in them.
      float floor_=smoothstep(.40,.34,uv.y)*(1.-(band(uv.x,-.01,.14)+band(uv.x,.875,1.01))*step(.12,uv.y));      // (not on the desks and trolleys)
      float shimmer=sin(uv.x*900.+uv.y*60.-time*1.2)*.6+sin(uv.x*520.-uv.y*90.-time*.7)*.4;
      col*=1.+floor_*smoothstep(.25,.6,lum)*shimmer*.05;
      col+=vec3(.2,1.,.4)*floor_*oval(uv,vec2(.5,.29),vec2(.035,.10))*(.03+.05*blend+.2*pulse)*stir;
      // a wash of green through the room when something melts
      col+=vec3(.18,1.,.45)*pulse*.025;
      return col;
    }`,
  motes: [
    { name: 'Spores', count: 80, box: [8, 2.4, 9], centre: [0, 1.4, -4.8], size: 18, colour: ['#d2ffe2', '#6dff7a'], opacity: [0.28, 0.6], rise: 0.05, sway: 0.2, twinkle: 0.55, additive: true },
    { name: 'Dust under the lights', count: 140, box: [9, 2.6, 10], centre: [0, 1.6, -5], size: 13, colour: ['#ffffff', '#9fe8dc'], opacity: [0.2, 0.22], rise: -0.008, sway: 0.25, twinkle: 0.3, additive: false },
    { name: 'Vapour off the machine', count: 16, box: [1.6, 1.4, 1.2], centre: [0, 1.6, -5.8], size: 70, colour: ['#b6ffcc', '#5dff8a'], opacity: [0.025, 0.07], rise: 0.12, sway: 0.25, twinkle: 0.2, additive: true },
  ],
  // A thin chemical haze lying low across the room, greener as the lights go.
  // (fainter since 2026-11-12, "less fog / atmosphere, the dust and lights are good": it was 5 sheets at 0.08 to 0.22)
  fog: { cards: 4, from: 4.2, to: 11, width: 10, height: 1, colour: ['#c4ece4', '#2fd88c'], opacity: [0.035, 0.09] },
  pulseRise: 0.35,      // the hatch's glow as a letter comes out swells up over a third of a second, not a flash
  flicker: (time, blend) => 0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.sin(time * 1.7), 2) * (0.4 + 0.6 * blend),
};

export const labLetters: LetterTheme = {
  id: 'lab', face: 'paint', paint: labCard, mechanic: 'spray', title: 'Toxic Danger', accent: '#8dff6a', bar: ['#b6ff2e', '#21ffa0'],
  look: { sheet: '#f0e7d0', ink: '#15140f', back: '#e6dcc2', selfLit: 0.08, night: '#a9d2cc',
    hover: '#d6ffe0', cutWide: '#8dff9a', cutHot: '#f2fff2', mark: '#ffe27a', flash: '#f6ffd9', gold: '#fff0a8',
    burn: '#9dff5a', burnStyle: 2, streak: ['#9dffb0', '#ffffff'], thread: ['#9dffb0', '#f2fff2'], aura: ['#6dff2a', '#eaff5a'], spell: { wisps: 0.6, sparkles: 8, trail: false, glow: 0.28 } },      // (subtler, 2026-11-13: "make the radio active emails the glow effect more subtle"; it was full glow, wisps .8, 16 sparkles)
  // Out of the machine's hatch: small in the dark of it, then out across the room, turning a little as it comes.
  origin(head: Vector3, home: Vector3, from: Vector3, via: Vector3) {
    // (where the backdrop shows the hatch: backdrop.ts)
    from.copy(head).addScaledVector(paintedDirection(HATCH.u, HATCH.v, hatchWay), HATCH.metres);
    via.lerpVectors(from, home, 0.55); via.y += 0.18;
    return { scale: 0.55, pose: 'face' as const, seconds: 1.3, ease: 2, sway: 0.05 };
  },
  // The junk that shouts is the junk that glows.
  hazard: email => email.kind === 'Junk' && (email.category === 'Spam' || email.category === 'Promo' || email.category === 'Alert'),
};

export const labFx: FxStyle = { bit: 'drop', bits: ['#8dff6a', '#5dff9a'], mix: ['#b4ff8c', '#fff38a', '#8cffc4', '#d8ff8a', '#9effa0', '#e8ff9e'], bitOpacity: 0.4 /* (softer and see-through: "less opacity, so more subtle like before", 2026-11-13) */, paper: ['#eaffea', '#bfffd0'], sparks: ['#dcffd2', '#7dff9a'], shedBits: 0, shedSparks: 0, gravity: 2.6, drag: 1.1, flutter: 0.1, size: 0.7 };

export const labSound: LevelSound = {
  id: 'lab',
  // round two begins with the user's own sting (2026-11-13; tools/level-src/lab/lab-stinger.mp3, set to -3 dBFS)
  roundStinger: { name: 'stinger2', volume: 0.9 },
  layers: [
    { name: 'vent', at: null, level: () => 0.8 },
    { name: 'bubbles', at: [-2.8, 0, -1.1], level: c => 0.4 + 0.25 * c.drift(c.t * 0.25, 2.9) },
    // the counter is heard only when something hot is in front of you
    { name: 'geiger', at: [0, -0.2, -1.4], level: c => Math.min(1, c.hot * 0.95 + c.blend * 0.06) },
  ],
  occasional: [{ name: 'alarm', every: [34, 80], volume: 0.4, region: [-6, 6, 0.5, 1.5, -12, -7] }],
  // the hiss of the spray, for as long as the trigger is held
  hum: { level: 1, swing: false },      // (full: it was 0.42; 2026-11-13, "make louder in game for spray sound")
};
