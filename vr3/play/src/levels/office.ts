import type { Vector3 } from 'three';
import type { LetterTheme } from '../letters';
import type { StageDef } from './backdrop';
import { officeCard } from './cards';
import { paneSoup } from './shapes';
import type { FxStyle, LevelSound } from './types';

/**
 * The office: a floor of carpet and strip lights going on for ever, one desk, one beige CRT. The
 * mail comes out of its screen, and the weapon is the keyboard.
 *
 * Positions in the painting are u (0 left to 1 right over 270 degrees) and v (0 bottom to 1 top
 * over 90, the eye line at .48), measured off public/levels/office/start.webp.
 */

/**
 * The screen, as a direction from the eye and a distance: where letters come out of. (Second
 * paintings, 2026-11-11: the desk lower and nearer, the screen bigger, about ten degrees under the
 * eye line, just behind where a letter waits.)
 */
const SCREEN = { u: 0.4998, v: 0.3711, metres: 1.75 };

export const officeStage: StageDef = {
  id: 'office', name: 'The office',
  // The view a foot further back than the painting was made from: the monitor was too close (asked for on 2026-11-11).
  dolly: 0.3,
  art: ['levels/office/start.webp', 'levels/office/end.webp'],
  rear: ['#8d9bb8', '#1a2a47'],
  glsl: /* glsl */ `
    const vec2 SCREEN=vec2(.4998,.3711), SCREEN_HALF=vec2(.0478,.0937);
    float inverseDepthAt(vec3 d, vec2 uv){
      float level=sqrt(max(0.,1.-d.y*d.y));
      // carpet 1.2 m under the eye and a ceiling 1.6 m over it, both going on for ever
      float inv=max(max(-d.y,0.)/1.2,max(d.y,0.)/1.6);
      // the desk's top, a plane 0.6 m under the eye: its front edge comes to within arm's reach, its
      // back is under the monitor; and the monitor and tower standing on it, about 1.75 m off
      float desk=band(uv.x,.233,.7655)*band(uv.y,.03,.40);
      inv=max(inv,desk*max(-d.y,0.)/.6);
      float machine=band(uv.x,.431,.627)*band(uv.y,.19,.535);
      inv=max(inv,machine*level/1.75);
      // the two nearest columns
      float columns=(band(uv.x,.1265,.159)+band(uv.x,.8485,.881))*band(uv.y,.393,.85);
      return max(inv,columns*level/8.5);
    }
    // The same, made smooth, for stepping the view back (StageDef.dolly): the desk's top blends into the
    // carpet over a wide margin and the machine is a soft hill rather than a cut-out, so the picture
    // shrinks back without folding over at their edges.
    float dollyDepthAt(vec3 d, vec2 uv){
      float level=sqrt(max(0.,1.-d.y*d.y));
      float inv=max(max(-d.y,0.)/1.2,max(d.y,0.)/1.6);
      float deskTop=smoothstep(.15,.27,uv.x)*(1.-smoothstep(.73,.85,uv.x))*smoothstep(-.10,.10,uv.y)*(1.-smoothstep(.36,.48,uv.y));
      inv=mix(inv,max(inv,max(-d.y,0.)/.6),deskTop);
      vec2 p=(uv-vec2(.53,.37))/vec2(.14,.21);
      return max(inv,exp(-dot(p,p)*1.4)*level/1.75);
    }
    vec3 scene(vec3 col, vec2 uv){
      float lum=dot(col,vec3(.3,.5,.2));
      // The strip lights: the mains in all of them, and one that is on its way out.
      float tube=smoothstep(.62,.9,lum)*step(.6,uv.y);
      float failing=oval(uv,vec2(.2486,.8812),vec2(.075,.022));
      float bout=smoothstep(.55,.8,sin(time*.31)+.6*sin(time*.113+2.));
      float stutter=step(.55,hash(vec2(floor(time*17.),7.)))*bout;
      col*=1.+tube*(.025*sin(time*52.)*(1.-blend*.5)-failing*stutter*.6);
      col*=1.-oval(uv,vec2(.2486,.8812),vec2(.13,.07))*stutter*.10;
      // The screen: an inbox on it (a title bar and rows of mail), scan lines, a bar of refresh rolling down.
      vec2 s=(uv-SCREEN)/SCREEN_HALF;
      float glass=box(uv,SCREEN,SCREEN_HALF*vec2(.93,.92),.006);
      float line=(1.-s.y)*3.5-.08, row=floor(line);
      float width=row<.5?.9:.35+.5*hash(vec2(row,3.+floor(time*.07)));
      float bar=step(.28,fract(line))*step(fract(line),.72)*step(-.88,s.x)*step(s.x,-.88+1.76*width);
      float scan=.5+.5*sin(uv.y*2600.);
      float roll=exp(-pow(fract(s.y*.5+.5-time*.21)-.5,2.)*90.);
      vec3 lit=col*(1.+.05*sin(time*38.)+.10*roll-.05*scan);
      lit=mix(lit,lit*vec3(.42,.62,.56),bar*(.55+.25*pulse));
      lit+=vec3(.55,1.,.85)*pulse*.55;
      col=mix(col,lit,glass);
      // Its glow on the case and the desk: more as the room goes dark, and a flash as mail leaves it.
      vec3 mint=vec3(.30,1.,.72);
      col+=mint*oval(uv,SCREEN,vec2(.10,.19))*(1.-glass)*(.03+.10*blend+.30*pulse)*(1.+.06*sin(time*38.));
      col+=mint*oval(uv,vec2(.4998,.215),vec2(.17,.07))*(.02+.07*blend+.20*pulse);
      return col;
    }`,
  motes: [
    { name: 'Dust in the strip lights', count: 240, box: [15, 3, 14], centre: [0, 1.6, -5.5], size: 15, colour: ['#ffffff', '#a8ffe2'], opacity: [0.2, 0.26], rise: -0.008, sway: 0.3, twinkle: 0.35, additive: false },
    { name: 'Phosphor motes by the screen', count: 40, box: [2.2, 1.1, 1.3], centre: [0, 1.35, -1.75], size: 26, colour: ['#b6ffe6', '#6dffc4'], opacity: [0.1, 0.5], rise: 0.05, sway: 0.2, twinkle: 0.8, additive: true },
  ],
  sheets: { count: 14, colour: ['#ffffff', '#9fb4d8'] },
  flicker: (time, blend) => 1 + blend * 0.06 * Math.sin(time * 38),
};

export const officeLetters: LetterTheme = {
  special: { colours: ['#ff3b30', '#ffb020'], label: 'URGENT' },
  id: 'office', face: 'paint', paint: officeCard, shape: paneSoup, mechanic: 'cut', title: 'Keyboard Smash', accent: '#7dffc9', bar: ['#2bffb0', '#2fb8ff'],
  look: { sheet: '#a9f9d8', ink: '#0a3a2b', back: '#4fbf98', selfLit: 1, night: '#ffffff',
    hover: '#e4fff4', cutWide: '#7dffc9', cutHot: '#f4fffa', mark: '#ffe9a0', flash: '#f6fff0', gold: '#fff3b8',
    burn: '#6dffb8', burnStyle: 1, streak: ['#8dffd0', '#ffffff'], thread: ['#8dffd0', '#f0fff8'], aura: ['#27c98e', '#a8ffe0'], spell: { wisps: 0.12, sparkles: 0, trail: false, glow: 0.8 } },
  // Out of the screen: a dot of light on the glass, growing as it comes.
  origin(head: Vector3, home: Vector3, from: Vector3, via: Vector3) {
    const across = (SCREEN.u - 0.5) * 4.71238898, up = (SCREEN.v - 0.48) * 1.57079633;
    from.set(head.x + Math.sin(across) * Math.cos(up) * SCREEN.metres, head.y + Math.sin(up) * SCREEN.metres, head.z - Math.cos(across) * Math.cos(up) * SCREEN.metres - officeStage.dolly!);
    via.lerpVectors(from, home, 0.5); via.y += 0.16;
    return { scale: 0.07, pose: 'face' as const };
  },
};

export const officeFx: FxStyle = { bit: 'cap', bits: ['#dccbaa', '#93a9a2'], paper: ['#a9f9d8', '#7eedc2'], sparks: ['#c2ffe6', '#7dffc9'], shedBits: 0.45, shedSparks: 0.5, gravity: 3.4, drag: 0.7, flutter: 0.12, size: 0.6 };

export const officeSound: LevelSound = {
  id: 'office',
  // Keyboard Smash's round two begins with the user's own sting (2026-11-13; tools/level-src/office/keyboard-r2-sting.mp3, set to -3 dBFS)
  roundStinger: { name: 'stinger2', volume: 0.9 },
  layers: [
    { name: 'room', at: null, level: () => 0.85 },
    // the people thin out as the day goes
    { name: 'typing', at: [-5, -0.2, -6], level: c => (1 - 0.8 * c.blend) * (0.35 + 0.65 * c.drift(c.t * 0.2, 2.2)) },
    { name: 'voices', at: [7, 0, -9], level: c => (1 - 0.88 * c.blend) * (0.4 + 0.6 * c.drift(c.t * 0.15, 5.1)) },
  ],
  occasional: [
    { name: 'fax', every: [24, 50], volume: 0.5, region: [-10, -5, -0.3, 0.3, -11, -5] },
    { name: 'printer', every: [16, 36], volume: 0.5, region: [5, 10, -0.3, 0.3, -9, -4] },
    { name: 'phone', every: [30, 70], volume: 0.45, region: [-8, 8, -0.2, 0.2, -15, -9] },
  ],
  hum: null,
};
