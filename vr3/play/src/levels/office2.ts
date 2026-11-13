import * as THREE from 'three';
import type { LetterTheme } from '../letters';
import { createCrt, CRT_BOX, type Crt } from '../props/crt';
import { createDeskThings } from '../props/desk';
import type { StageContext, StageDef, StageProps } from './backdrop';
import { officeCard } from './cards';
import { officeFx, officeLetters, officeSound } from './office';
import { paneSoup } from './shapes';
import type { FxStyle, LevelSound } from './types';

/**
 * The office, second version (asked for on 2026-11-11): the same endless floor, but the desk in
 * the painting is empty, and what stands on it is real: a CRT monitor, a stapler, paper
 * (../props). The emails do not fly out: each is shown on the monitor's screen, and the keyboard
 * is brought down on the monitor to delete it. The monitor takes the damage, and when the last
 * email of a round is gone it switches itself off.
 *
 * Positions in the painting are u (0 left to 1 right over 270 degrees) and v (0 bottom to 1 top
 * over 90, the eye line at .48), measured off public/levels/office2/start.webp: the desk's top
 * runs from v .04 (its front edge) to .235 (its back), u .2325 to .765 at the front.
 */

/** The desk's top is this far under the seated eye, and the monitor's foot this far in front of the seat along it. */
export const office2Tune = { deskDrop: 0.6, monitorAhead: 1.24 };

/** The monitor, once the stage has made it: the letters are shown on it (see `dock` below). */
let crt: Crt | null = null;

function office2Props(context: StageContext): StageProps {
  const group = new THREE.Group(); group.name = 'The office desk: monitor, stapler, paper';
  const monitor = createCrt(context), desk = createDeskThings(context);
  crt = monitor;
  group.add(monitor.group, desk.group);
  const origin = new THREE.Vector3();
  let step = 1 / 72;
  return {
    group,
    update(dt, c) {
      step = dt;
      // everything stands on the painted desk, which is measured from where the player sat down
      origin.set(c.seat.x, c.seat.y - office2Tune.deskDrop, c.seat.z);
      monitor.root.position.set(origin.x, origin.y, origin.z - office2Tune.monitorAhead);
      monitor.update(dt, c);
      desk.update(dt, origin, c.blend, c.blade);
      context.lamp.value = monitor.glow();
    },
    onLetter(kind) { if (kind === 'cut') desk.hop(monitor.strike()); },
    game(progress) { monitor.game(progress, step); },
    dispose() { monitor.dispose(); desk.dispose(); crt = null; },
  };
}

export const office2Stage: StageDef = {
  id: 'office2', name: 'The office, with a real monitor',
  art: ['levels/office2/start.webp', 'levels/office2/end.webp'],
  rear: ['#8d9bb8', '#1a2a47'],
  props: office2Props,
  glsl: /* glsl */ `
    float inverseDepthAt(vec3 d, vec2 uv){
      float level=sqrt(max(0.,1.-d.y*d.y));
      // carpet 1.2 m under the eye and a ceiling 1.6 m over it, both going on for ever
      float inv=max(max(-d.y,0.)/1.2,max(d.y,0.)/1.6);
      // The desk: its top a plane ${office2Tune.deskDrop} m under the eye, its front a wall where that top ends. Real things
      // stand on it, so it must be exactly as far away as they are: the Depth setting, which
      // flattens the rest of the painting, is undone for it.
      float edge=mix(.2325,.305,clamp((uv.y-.04)/.195,0.,1.));
      float desk=band(uv.x,edge,1.-edge)*(1.-smoothstep(.233,.239,uv.y));
      float top=max(-d.y,0.)/${office2Tune.deskDrop.toFixed(3)}, front=level/.725;
      inv=mix(inv,min(top,front)/max(depthScale,.25),desk);
      // the two nearest columns
      float columns=(band(uv.x,.1265,.159)+band(uv.x,.8485,.881))*band(uv.y,.393,.85);
      return max(inv,columns*level/8.5);
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
      // The real monitor's screen on the painted desk in front of it: more as the room goes dark.
      float edge=mix(.2325,.305,clamp((uv.y-.04)/.195,0.,1.));
      float desk=band(uv.x,edge,1.-edge)*band(uv.y,.04,.235);
      vec3 mint=vec3(.30,1.,.72);
      col+=mint*desk*oval(uv,vec2(.5,.135),vec2(.12,.085))*lamp*(.05+.22*blend)*(1.+.05*sin(time*38.));
      return col;
    }`,
  motes: [
    { name: 'Dust in the strip lights', count: 240, box: [15, 3, 14], centre: [0, 1.6, -5.5], size: 15, colour: ['#ffffff', '#a8ffe2'], opacity: [0.2, 0.26], rise: -0.008, sway: 0.3, twinkle: 0.35, additive: false },
    { name: 'Phosphor motes by the screen', count: 30, box: [1.6, 0.9, 0.8], centre: [0, 1.3, -1.0], size: 22, colour: ['#b6ffe6', '#6dffc4'], opacity: [0.06, 0.4], rise: 0.05, sway: 0.2, twinkle: 0.8, additive: true },
  ],
  sheets: { count: 14, colour: ['#ffffff', '#9fb4d8'] },
  // the real lights' fill is the monitor's screen: it follows what the screen is doing
  flicker: () => (crt ? crt.glow() : 0),
};

export const office2Letters: LetterTheme = {
  ...officeLetters, id: 'office2', paint: officeCard, shape: paneSoup, title: 'Keyboard Smash v2',
  origin: undefined,
  // (no glow round the letter: it is a picture on a screen here, and the glow would stand round the whole monitor)
  look: { ...officeLetters.look, aura: null },
  // Shown on the monitor's screen. A blow anywhere on the monitor deletes it; left alone it closes after `wait` seconds.
  dock: {
    place: (position, quaternion) => (crt ? crt.pose(position, quaternion) : 0.72),
    behind: CRT_BOX.behind, margin: CRT_BOX.margin, out: 1.7, wait: 9,
    // after a round's last email: INBOX ZERO, the screen closing, and a moment of it dark
    pause: 3.4,
    // the round's intro card would be inside the monitor: it floats just in front of and over it instead, smaller
    // (as wide to the eye as it is in the other levels, and clear of the progress bar above)
    intro: { up: 0.2, nearer: 0.65, size: 0.5 },
  },
};

export const office2Fx: FxStyle = officeFx;
/** The first office's sound, with the monitor's own (crton, crtoff, glass, zap: tools/crtsounds.py) in the same folder. */
export const office2Sound: LevelSound = officeSound;
