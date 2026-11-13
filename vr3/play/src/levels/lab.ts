import type { Vector3 } from 'three';
import type { LetterTheme } from '../letters';
import type { StageDef } from './backdrop';
import { labCard } from './cards';
import type { FxStyle, LevelSound } from './types';

/**
 * The lab: a tiled room under teal beams, glowing green growing things in tanks along the walls,
 * a table to either side, and in the middle a containment machine: a glass dome full of mail, a
 * warning beacon on top, and a hatch the contaminated letters come out of. Some of it is
 * radioactive, and nothing is cut: the tool is a disinfectant sprayer. One touch of the mist and
 * the froth spreads over the letter by itself and melts it.
 *
 * Positions are u, v in public/levels/lab/start.webp (u 0 left to 1 right over 270 degrees, v 0
 * bottom to 1 top over 90, the eye line at .48), measured from the painting (third paintings,
 * 2026-11-11; the earlier two are in design/theme-tests-v2/chemical and chemical-hall).
 */

/** The machine's hatch, where letters come out: its direction, and how far it is by the depth model. */
const HATCH = { u: 0.4998, v: 0.3928, metres: 4.3 };

export const labStage: StageDef = {
  id: 'lab', name: 'The lab',
  art: ['levels/lab/start.webp', 'levels/lab/end.webp'],
  rear: ['#b9c9cc', '#06161a'],
  glsl: /* glsl */ `
    // A room: tiles 1.2 m under the eye and the beams 2.2 m over it; the back wall about six metres
    // off down the middle, and (the painting being wrapped round the player) nearer and nearer
    // towards its two edges; the machine standing out in front of the wall; and the two tables
    // close by on either side.
    float inverseDepthAt(vec3 d, vec2 uv){
      float level=sqrt(max(0.,1.-d.y*d.y));
      float side=clamp(abs(uv.x-.5)*2.,0.,1.);
      float wall=mix(1./6.,1./2.3,side*side)*level;
      float inv=max(max(max(-d.y,0.)/1.2,max(d.y,0.)/2.2),wall);
      float machine=band(uv.x,.418,.6165)*band(uv.y,.30,.76);
      inv=max(inv,machine*level/4.3);
      float tables=(band(uv.x,.03,.26)+band(uv.x,.735,.97))*band(uv.y,.04,.345);
      return max(inv,tables*level/2.3);
    }
    // The liquid moves: the mail in the dome turns over slowly, the tanks' contents drift and wobble.
    vec2 warp(vec2 uv){
      float dome=oval(uv,vec2(.4995,.566),vec2(.040,.042));
      uv+=vec2(sin(time*.9+uv.y*90.)*.0016,sin(time*1.3+uv.x*70.)*.0028)*dome;
      float tanks=oval(uv,vec2(.2245,.488),vec2(.016,.05))+oval(uv,vec2(.2685,.488),vec2(.016,.05))+oval(uv,vec2(.0393,.4933),vec2(.016,.032));
      uv+=vec2(sin(time*1.7+uv.y*160.)*.0007,sin(time*1.1+uv.x*120.)*.0012)*tanks;
      return uv;
    }
    vec3 scene(vec3 col, vec2 uv){
      float lum=dot(col,vec3(.3,.5,.2));
      // The ceiling lights: the mains in them, and a dip now and then as the machine draws power.
      float lights=smoothstep(.72,.92,lum)*step(.72,uv.y);
      float dip=smoothstep(.72,1.,sin(time*.43)*sin(time*.17+2.))*(.5+.5*sin(time*31.));
      col*=1.-.05*dip*(1.-.5*blend);
      col*=1.+lights*(.03*sin(time*47.)-.25*dip);
      // The wall lamps breathe; they beat when something radioactive is in front of you.
      vec3 amber=vec3(1.,.55,.14);
      float beat=pow(.5+.5*sin(time*3.4),2.);
      float lamps=oval(uv,vec2(.131,.583),vec2(.012,.034))*flame(.6)+oval(uv,vec2(.3885,.572),vec2(.010,.028))*flame(2.4)
                 +oval(uv,vec2(.6108,.5727),vec2(.010,.028))*flame(4.3)+oval(uv,vec2(.8715,.5825),vec2(.012,.034))*flame(7.3)
                 +oval(uv,vec2(.2667,.344),vec2(.008,.012))+oval(uv,vec2(.7125,.4955),vec2(.03,.012))*.6;
      col+=amber*lamps*(.10+.10*blend+.45*hot*beat);
      float warm=smoothstep(.05,.25,col.r-col.b)*smoothstep(.25,.6,col.r);
      col*=1.+warm*(.05*sin(time*1.7)+.22*hot*beat)*(.4+.6*blend);
      // The beacon on the machine turns: a slow sweep, faster and brighter while anything hot is out.
      vec2 beacon=vec2(.4993,.7166);
      float spin=time*(1.6+3.*hot);
      float facing=pow(.5+.5*cos(spin),6.);
      col+=amber*oval(uv,beacon,vec2(.008,.016))*(.3+.9*facing)*(.5+.5*max(blend,hot));
      col+=amber*oval(uv,beacon+vec2(.05*sin(spin),0.),vec2(.07,.12))*facing*(.06+.10*max(blend,hot));
      float sweep=exp(-pow(fract((uv.x-beacon.x)*1.2-spin/6.2832)-.5,2.)*60.)*smoothstep(.40,.55,uv.y)*smoothstep(.98,.75,uv.y);
      col+=amber*sweep*(.02+.05*max(blend,hot));
      // The green breathes and bubbles: tanks, the dome, the jars; more in the dark, more near anything hot.
      float stir=.55+.9*blend+1.2*hot;
      float bubble=.5+.5*sin(time*2.3+uv.y*140.)*sin(time*1.4+uv.x*170.);
      float green=smoothstep(.10,.35,col.g-max(col.r,col.b))*smoothstep(.35,.7,col.g);
      col*=1.+green*(.10*sin(time*1.1)+.12*bubble)*stir;
      float glows=oval(uv,vec2(.2455,.4865),vec2(.045,.07))+oval(uv,vec2(.4995,.5637),vec2(.05,.05))*1.3+oval(uv,vec2(.0393,.4933),vec2(.02,.04))
                 +oval(uv,vec2(.2152,.3133),vec2(.012,.02))+oval(uv,vec2(.902,.307),vec2(.014,.03))+oval(uv,vec2(.4235,.395),vec2(.012,.03))+oval(uv,vec2(.5923,.401),vec2(.015,.02));
      col+=vec3(.25,1.,.35)*glows*(.04+.04*sin(time*1.1+uv.x*9.))*stir;
      // the crystals answer it, slowly
      col+=vec3(.55,.3,1.)*(oval(uv,vec2(.3282,.5465),vec2(.018,.02))+oval(uv,vec2(.878,.3133),vec2(.008,.025)))*(.05+.05*sin(time*.8+2.))*stir;
      // The hatch: a green glow deep inside it, which flares as a letter comes out; the dome flares with it.
      vec2 hatch=vec2(.4998,.3928);
      float inside=box(uv,hatch,vec2(.024,.028),.006);
      vec3 seal=mix(vec3(.45,1.,.6),vec3(.30,1.,.45),blend);
      col+=seal*inside*(.05+.04*sin(time*1.3)+.9*pulse);
      col+=seal*oval(uv,hatch,vec2(.07,.06))*.35*pulse;
      col+=seal*oval(uv,vec2(.4995,.5637),vec2(.06,.06))*.25*pulse;
      // the hatch's side lights and the panel blink
      col+=amber*(oval(uv,vec2(.4652,.386),vec2(.004,.02))+oval(uv,vec2(.5315,.386),vec2(.004,.02)))*(.15+.15*step(.5,fract(time*.8)));
      col+=vec3(.3,1.,.4)*oval(uv,vec2(.5525,.43),vec2(.005,.008))*(.25*step(.5,fract(time*1.7+.3)));
      // Reflections on the floor shiver; the green from the machine comes and goes in them.
      float floor_=smoothstep(.36,.30,uv.y)*(1.-(band(uv.x,.03,.26)+band(uv.x,.735,.97))*step(.22,uv.y));
      float shimmer=sin(uv.x*900.+uv.y*60.-time*1.2)*.6+sin(uv.x*520.-uv.y*90.-time*.7)*.4;
      col*=1.+floor_*smoothstep(.25,.6,lum)*shimmer*.05;
      col+=vec3(.2,1.,.4)*floor_*oval(uv,vec2(.5,.25),vec2(.07,.12))*(.03+.05*blend+.25*pulse)*stir;
      // a wash of green through the room when something melts
      col+=vec3(.18,1.,.45)*pulse*.03;
      return col;
    }`,
  motes: [
    { name: 'Spores', count: 80, box: [8, 2.4, 7], centre: [0, 1.4, -3.8], size: 18, colour: ['#d2ffe2', '#6dff7a'], opacity: [0.28, 0.6], rise: 0.05, sway: 0.2, twinkle: 0.55, additive: true },
    { name: 'Dust under the lights', count: 140, box: [9, 2.6, 8], centre: [0, 1.6, -4], size: 13, colour: ['#ffffff', '#9fe8dc'], opacity: [0.2, 0.22], rise: -0.008, sway: 0.25, twinkle: 0.3, additive: false },
    { name: 'Vapour off the machine', count: 26, box: [1.6, 1.6, 1.2], centre: [0, 1.9, -4.2], size: 70, colour: ['#b6ffcc', '#5dff8a'], opacity: [0.05, 0.16], rise: 0.12, sway: 0.25, twinkle: 0.2, additive: true },
  ],
  // A thin chemical haze lying low across the room, greener as the lights go.
  fog: { cards: 5, from: 2.6, to: 7.5, width: 8, height: 1, colour: ['#c4ece4', '#2fd88c'], opacity: [0.08, 0.22] },
  flicker: (time, blend) => 0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.sin(time * 1.7), 2) * (0.4 + 0.6 * blend),
};

export const labLetters: LetterTheme = {
  id: 'lab', face: 'paint', paint: labCard, mechanic: 'spray', title: 'Toxic Danger', accent: '#8dff6a', bar: ['#b6ff2e', '#21ffa0'],
  look: { sheet: '#f0e7d0', ink: '#15140f', back: '#e6dcc2', selfLit: 0.08, night: '#a9d2cc',
    hover: '#d6ffe0', cutWide: '#8dff9a', cutHot: '#f2fff2', mark: '#ffe27a', flash: '#f6ffd9', gold: '#fff0a8',
    burn: '#9dff5a', burnStyle: 2, streak: ['#9dffb0', '#ffffff'], thread: ['#9dffb0', '#f2fff2'], aura: ['#6dff2a', '#eaff5a'], spell: { wisps: 0.8, sparkles: 16, trail: false } },
  // Out of the machine's hatch: small in the dark of it, then out across the room, turning a little as it comes.
  origin(head: Vector3, home: Vector3, from: Vector3, via: Vector3) {
    const across = (HATCH.u - 0.5) * 4.71238898, down = (HATCH.v - 0.48) * 1.57079633;
    from.set(head.x + Math.sin(across) * Math.cos(down) * HATCH.metres, head.y + Math.sin(down) * HATCH.metres, head.z - Math.cos(across) * Math.cos(down) * HATCH.metres);
    via.lerpVectors(from, home, 0.55); via.y += 0.18;
    return { scale: 0.55, pose: 'face' as const, seconds: 1.9, ease: 2, sway: 0.05 };
  },
  // The junk that shouts is the junk that glows.
  hazard: email => email.kind === 'Junk' && (email.category === 'Spam' || email.category === 'Promo' || email.category === 'Alert'),
};

export const labFx: FxStyle = { bit: 'drop', bits: ['#8dff6a', '#5dff9a'], paper: ['#eaffea', '#bfffd0'], sparks: ['#dcffd2', '#7dff9a'], shedBits: 0, shedSparks: 0, gravity: 2.6, drag: 1.1, flutter: 0.1, size: 0.7 };

export const labSound: LevelSound = {
  id: 'lab',
  layers: [
    { name: 'vent', at: null, level: () => 0.8 },
    { name: 'bubbles', at: [-2.8, 0, -1.1], level: c => 0.4 + 0.25 * c.drift(c.t * 0.25, 2.9) },
    // the counter is heard only when something hot is in front of you
    { name: 'geiger', at: [0, -0.2, -1.4], level: c => Math.min(1, c.hot * 0.95 + c.blend * 0.06) },
  ],
  occasional: [{ name: 'alarm', every: [34, 80], volume: 0.4, region: [-6, 6, 0.5, 1.5, -12, -7] }],
  // the hiss of the spray, for as long as the trigger is held
  hum: { level: 0.42, swing: false },
};
