import * as THREE from 'three';
import type { Vector3 } from 'three';
import type { LetterTheme } from '../letters';
import { createCrt, type Crt } from '../props/crt';
import type { StageContext, StageDef, StageProps } from './backdrop';
import { officeCard } from './cards';
import { officeFx, officeLetters, officeSound } from './office';
import { paneSoup } from './shapes';
import type { FxStyle, LevelSound } from './types';

/**
 * Keyboard Smash: the office, second version (asked for on 2026-11-11). What stands on the desk is real: a CRT
 * monitor (../props; the stapler and paper went on 2026-11-13: "remove the paper and stapler models from desk"). Each email comes out of the monitor's screen and floats like the other
 * levels' (2026-11-12: "make the emails fly out of the monitor so they float like others but make it feel right").
 * Hitting the monitor itself still cracks and dents it, and when the last email of a round is gone it switches off.
 *
 * Repainted 2026-11-13 ("background image for keyboard smash - use same kyoto and the perspective and try and place
 * the monitor and desk stuff to fit, atmosphere, etc"): design/office-kyoto-perspective-v2, in Kyoto's composition.
 * The player is on a raised reception deck over a deep 1990s office hall: two ivory columns with teal feet frame the
 * middle, low rails at the deck's edge, rows of workstations either side of a clear lane, and dead ahead, about ten
 * metres off, a small warm mailroom doorway with its pigeonholes. The empty desk the monitor stands on is out in
 * front of the seat, low. By night the strip lights are off and the lamps, the column sconces and the mailroom glow.
 * The first paintings (the endless floor, the desk right in front) are tools/level-src/office2/*-before-2026-11-13.webp.
 *
 * Positions in the painting are u (0 left to 1 right over 270 degrees) and v (0 bottom to 1 top over 90, the eye
 * line at .48), measured off public/levels/office2/start.webp: the desk's top runs from v .21 (its front edge, u .374
 * to .626) to .273 (its back, u .40 to .60); its front, with its two drawer pedestals, down to v .085, its legs to .06.
 */

/**
 * The desk's top is this far under the seated eye, its front this far out, its back that far, and the monitor's
 * foot this far in front of the seat along it. (Worked out from the painting: the front edge of the top, v .21, and
 * the foot of the legs, v .06, are the same distance off, with the carpet 1.2 m under the eye: 1.55 m out, the top
 * .70 m under the eye; the back edge, v .273, is then 2.07 m out. The desk is about 2 m wide.)
 */
export const office2Tune = {
  deskDrop: 0.7, deskFront: 1.55, deskBack: 2.07, monitorAhead: 1.8,
  // An email out of the screen: where it settles (just over and well in front of the monitor), how high it arcs on
  // the way, how long that takes.
  settle: { ahead: 0.98, drop: 0.08 }, arc: 0.3, seconds: 0.9, ease: 2.4,
};

/** The monitor, once the stage has made it: the letters come out of it (see `origin` below). */
let crt: Crt | null = null;

/**
 * Papers knocked loose (2026-11-13: "add a few papers sometimes randomly when hitting email too"): now and then a cut
 * email throws a few sheets of paper, which flutter down, turning over, and are gone in a few seconds.
 */
function createLoosePapers() {
  const geometry = new THREE.BufferGeometry();      // (a sheet with a little bend in it, as the far ones are: backdrop.ts)
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.105,-.148,0, .105,-.148,.012, 0,0,.03,  .105,-.148,.012, .105,.148,0, 0,0,.03,  .105,.148,0, -.105,.148,.012, 0,0,.03,  -.105,.148,.012, -.105,-.148,0, 0,0,.03], 3));
  const material = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, transparent: true });
  const day = new THREE.Color('#ffffff'), night = new THREE.Color('#9fb4d8');
  const papers = Array.from({ length: 12 }, () => {
    const mesh = new THREE.Mesh(geometry, material); mesh.visible = false; mesh.name = 'Loose paper';
    return { mesh, speed: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, seed: Math.random() * 6.283, size: 1 };
  });
  const group = new THREE.Group(); group.name = 'Papers knocked loose'; for (const p of papers) group.add(p.mesh);
  const rand = (spread: number) => (Math.random() - 0.5) * 2 * spread;
  let next = 0;
  return {
    group,
    /** A cut there: sometimes (about half the time) two to four sheets burst out of it. */
    burst(at: THREE.Vector3) {
      if (Math.random() > 0.5) return;
      for (let i = 0, n = 2 + Math.floor(Math.random() * 3); i < n; i++) {
        const p = papers[next++ % papers.length];
        p.mesh.visible = true; p.life = 2.6 + Math.random() * 1.6; p.size = 0.55 + Math.random() * 0.3;
        p.mesh.position.copy(at).add(new THREE.Vector3(rand(0.12), rand(0.08), rand(0.05)));
        p.mesh.rotation.set(rand(3), rand(3), rand(3));
        p.speed.set(rand(1.6), 0.6 + Math.random() * 1.3, rand(0.8) - 0.3);
        p.spin.set(rand(5), rand(5), rand(5));
      }
    },
    update(dt: number, time: number, blend: number) {
      material.color.copy(day).lerp(night, blend);
      for (const p of papers) {
        if (!p.mesh.visible) continue;
        p.life -= dt;
        // paper: the air holds it up, it drifts and rocks as it falls, and slows its turning
        p.speed.y -= 2.6 * dt; p.speed.multiplyScalar(Math.exp(-1.6 * dt));
        p.mesh.position.addScaledVector(p.speed, dt);
        p.mesh.position.x += Math.sin(time * 3 + p.seed) * 0.25 * dt;
        p.spin.multiplyScalar(Math.exp(-0.5 * dt));
        p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt; p.mesh.rotation.z += (p.spin.z + Math.sin(time * 4 + p.seed) * 0.8) * dt;
        p.mesh.scale.setScalar(p.size * Math.min(1, p.life / 0.6));
        if (p.life <= 0) p.mesh.visible = false;
      }
    },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}

function office2Props(context: StageContext): StageProps {
  const group = new THREE.Group(); group.name = 'The office desk: monitor';
  const monitor = createCrt(context);
  crt = monitor;
  if (import.meta.env.DEV) Object.assign(window, { __crt: monitor });      // (for checks in the console)
  // on a monitor, the weapon key (X or Space) hits it too, when it is up behind the logo at the end
  const onKey = (e: KeyboardEvent) => { if (!e.repeat && (e.key.toLowerCase() === 'x' || e.key === ' ') && !(e.target as HTMLElement).matches?.('input,select,button,summary,textarea')) monitor.hitByKey(); };
  window.addEventListener('keydown', onKey);
  const papers = createLoosePapers();
  group.add(monitor.group, papers.group);
  const origin = new THREE.Vector3();
  let step = 1 / 72;
  // every email dealt with breaks the monitor a little more (crt.wear): how many of this round's it has counted
  let worn = 0, wornRound = 0;
  return {
    group,
    update(dt, c) {
      step = dt;
      // everything stands on the painted desk, which is measured from where the player sat down
      origin.set(c.seat.x, c.seat.y - office2Tune.deskDrop, c.seat.z);
      monitor.root.position.set(origin.x, origin.y, origin.z - office2Tune.monitorAhead);
      monitor.update(dt, c);
      // the keyboard brought down on the monitor itself (up behind the logo at the end, it is hit from far off: crt.ts)
      if (!monitor.flying() && monitor.contact(c.blade)) monitor.strike();
      context.lamp.value = monitor.glow();
      papers.update(dt, c.time, c.blend);
    },
    onLetter(kind, at) { if (kind === 'arrive') monitor.launch(); else if (kind === 'cut') papers.burst(at); },
    game(progress) {
      monitor.game(progress, step);
      if (progress.round !== wornRound || progress.marks.length < worn) { wornRound = progress.round; worn = 0; }
      if (progress.phase === 'play') while (worn < progress.marks.length) { worn++; monitor.wear(); }
      else worn = progress.marks.length;
    },
    dispose() { window.removeEventListener('keydown', onKey); monitor.dispose(); papers.dispose(); crt = null; },
  };
}

const T = office2Tune;
export const office2Stage: StageDef = {
  id: 'office2', name: 'The office, with a real monitor',
  art: ['levels/office2/start.webp', 'levels/office2/end.webp'],
  // (the colours of the painting's two edges, so the side wings carry on behind)
  rear: ['#867777', '#1c1a37'],
  props: office2Props,
  glsl: /* glsl */ `
    // Laid out as Kyoto's veranda is (../garden.ts): the carpet 1.2 m under the eye and the beams 2.1 m over it; the
    // mailroom's wall about 11 m off down the middle and the side wings nearer and nearer towards the painting's
    // edges; the two rows of workstations about 6.5 m out; the rails at the deck's edge 3.4 m, the columns 4 m.
    // Soft edges everywhere (the lab's lesson, 2026-11-13: hard-edged blocks slide against what is behind them).
    float inverseDepthAt(vec3 d, vec2 uv){
      float level=sqrt(max(0.,1.-d.y*d.y));
      float side=clamp(abs(uv.x-.5)*2.,0.,1.);
      float wall=mix(1./11.,1./2.3,pow(side,1.7))*level;
      float inv=max(max(max(-d.y,0.)/1.2,max(d.y,0.)/2.1),wall);
      float stations=(band(uv.x,.255,.462)+band(uv.x,.538,.745))*band(uv.y,.36,.47);
      inv=max(inv,stations*level/6.5);
      float columns=(band(uv.x,.215,.256)+band(uv.x,.7435,.784))*smoothstep(.285,.30,uv.y)*(1.-smoothstep(.78,.80,uv.y));
      float rails=(band(uv.x,.25,.37)+band(uv.x,.63,.75))*band(uv.y,.262,.355);
      inv=max(inv,max(columns*level/4.,rails*level/3.4));
      float nearSides=smoothstep(.76,.93,side)*(1.-smoothstep(.40,.62,uv.y));
      inv=max(inv,nearSides*level/2.1);
      // The desk: its top a plane ${T.deskDrop.toFixed(3)} m under the eye, its front a wall ${T.deskFront.toFixed(2)} m out. Real things
      // stand on it, so it must be exactly as far away as they are: the Depth setting, which flattens the rest of
      // the painting, is undone for it. (The knee space between its pedestals shows the carpet behind.)
      float edge=mix(.374,.40,clamp((uv.y-.21)/.063,0.,1.));
      float top=band(uv.x,edge,1.-edge)*smoothstep(.204,.212,uv.y)*(1.-smoothstep(.27,.277,uv.y));
      float knee=band(uv.x,.44,.56)*(1.-smoothstep(.134,.146,uv.y));
      float front=band(uv.x,.381,.619)*smoothstep(.055,.065,uv.y)*(1.-smoothstep(.204,.212,uv.y))*(1.-knee);
      float topInv=max(-d.y,0.)/${T.deskDrop.toFixed(3)}, frontInv=level*cos((uv.x-.5)*4.7124)/${T.deskFront.toFixed(3)};
      inv=mix(inv,topInv/max(depthScale,.25),top);
      return mix(inv,frontInv/max(depthScale,.25),front);
    }
    // A lamp's glow about 1: electric, so steady, with only a slow life in it (no strobe: the lab's lesson).
    float glowOf(float seed){ return 1.+.05*sin(time*.8+seed)+.03*sin(time*1.9+seed*2.3); }
    vec3 scene(vec3 col, vec2 uv){
      float lum=dot(col,vec3(.3,.5,.2)), day=1.-blend;
      vec3 amber=vec3(1.,.66,.30), tubeC=vec3(.86,.95,1.);
      // The strip lights (by day): each a soft glow round it, and one up on the left on its way out, now and then
      // dimming and catching again (slowly: a bad starter, not a strobe).
      float tube=smoothstep(.78,.95,lum)*smoothstep(.5,.56,uv.y)*smoothstep(.06,.0,abs(col.b-col.g)-.02);
      vec3 soft=mix(textureLod(startMap,uv,3.5).rgb,textureLod(endMap,uv,3.5).rgb,blend);
      float bloom=smoothstep(.62,.95,dot(soft,vec3(.3,.5,.2)))*smoothstep(.5,.56,uv.y);
      col+=tubeC*bloom*.10*day;
      float bout=smoothstep(.6,.9,sin(time*.27)+.5*sin(time*.11+2.));
      float dip=bout*(.5+.5*sin(time*2.1+sin(time*.7)*2.));
      float failing=oval(uv,vec2(.175,.843),vec2(.06,.025));
      col*=1.-failing*tube*dip*.55*day;
      col*=1.-oval(uv,vec2(.175,.80),vec2(.10,.10))*dip*.06*day;
      // The warm lights: the sconces on the columns, the desk lamps down the hall, the little lights under the
      // rails. Each a halo, brighter as the strip lights go off; and the warm parts of the painting lift with them.
      float warm=smoothstep(.15,.4,col.r-col.b)*smoothstep(.55,.9,col.r);
      float sconces=oval(uv,vec2(.228,.613),vec2(.012,.03))+oval(uv,vec2(.7715,.613),vec2(.012,.03));
      float sconceAir=oval(uv,vec2(.228,.61),vec2(.035,.09))+oval(uv,vec2(.7715,.61),vec2(.035,.09));
      col+=amber*(sconces*.10+sconceAir*.05)*(.5+.9*blend)*glowOf(1.3);
      float lamps=(band(uv.x,.255,.46)+band(uv.x,.54,.745))*band(uv.y,.425,.47);
      col*=1.+warm*lamps*(.10+.25*blend)*glowOf(uv.x*40.);
      float underRails=(band(uv.x,.27,.35)+band(uv.x,.65,.73))*band(uv.y,.285,.315);
      col+=amber*warm*underRails*(.10+.20*blend);
      // The mailroom ahead: the eye's resting place. It glows warm, breathing, and as a letter goes out (pulse) it
      // brightens; its light lies down the lane towards the deck.
      float door=box(uv,vec2(.5,.455),vec2(.032,.05),.01);
      col*=1.+door*warm*(.12+.2*blend+.4*pulse)*glowOf(5.1);
      col+=amber*oval(uv,vec2(.5,.45),vec2(.06,.07))*(.03+.06*blend+.12*pulse);
      float lane=band(uv.x,.46,.54)*smoothstep(.41,.37,uv.y)*smoothstep(.27,.33,uv.y);
      col+=amber*lane*(.015+.05*blend)*glowOf(5.1);
      // Through the windows: the sky's own colour, a slow drift of light across it, and at night a few stars.
      float windows=box(uv,vec2(.0225,.54),vec2(.0225,.115),.006)+box(uv,vec2(.111,.495),vec2(.013,.07),.004)
                   +box(uv,vec2(.9775,.54),vec2(.0225,.115),.006)+box(uv,vec2(.889,.495),vec2(.013,.07),.004);
      float drift=softNoise(vec2(uv.y*30.+time*.05,uv.x*12.));
      col*=1.+windows*(drift-.5)*.12*day;
      float star=step(.965,hash(floor(uv*vec2(700.,233.))))*(.5+.5*sin(time*(1.+hash(floor(uv*vec2(700.,233.)))*5.)));
      col+=vec3(.8,.85,1.)*windows*star*smoothstep(.5,1.,blend)*.5*smoothstep(.12,.35,col.b);
      // The real monitor's screen on the painted desk round it: more as the room goes dark.
      vec3 mint=vec3(.30,1.,.72);
      float deskTop=band(uv.x,.374,.626)*band(uv.y,.205,.275);
      col+=mint*deskTop*oval(uv,vec2(.5,.245),vec2(.09,.035))*lamp*(.05+.22*blend);
      // Kyoto's focus: the far hall sits back in its own air, softer and lower in contrast, a band of haze lying along
      // its floor and drifting, so the mail coming out over the desk stands clear of it. (Not over the mailroom.)
      vec3 haze=mix(vec3(.66,.66,.82),vec3(.14,.14,.30),blend);
      float hall=band(uv.x,.27,.73)*smoothstep(.36,.40,uv.y)*(1.-smoothstep(.52,.58,uv.y))*(1.-box(uv,vec2(.5,.455),vec2(.04,.06),.02));
      float mist=softNoise(vec2(uv.x*18.+time*.04,uv.y*30.-time*.01));
      col=mix(col,haze,hall*(.10+.08*mist)*(.8+.4*blend));
      float low=band(uv.x,.24,.76)*smoothstep(.33,.37,uv.y)*(1.-smoothstep(.39,.43,uv.y));
      col=mix(col,haze*1.1,low*mist*.12);
      // The grade: the far sides, the ceiling's edges and the carpet at your feet fall away a little, so the middle,
      // where the mail is, holds the eye.
      col*=mix(.74,1.,smoothstep(0.,.13,uv.x)*smoothstep(1.,.87,uv.x))*mix(.85,1.,smoothstep(1.,.8,uv.y))*mix(.86,1.,smoothstep(0.,.1,uv.y));
      return col;
    }`,
  motes: [
    { name: 'Dust in the strip lights', count: 200, box: [14, 2.6, 11], centre: [0, 1.7, -6], size: 13, colour: ['#ffffff', '#c8c2ff'], opacity: [0.2, 0.16], rise: -0.008, sway: 0.3, twinkle: 0.35, additive: false },
    // Kyoto's warm drifting light motes, down the lane towards the mailroom, more by night
    { name: 'Warm motes down the lane', count: 26, box: [3, 1.6, 8], centre: [0, 1.0, -6.5], size: 30, colour: ['#ffd8a0', '#ffb257'], opacity: [0.08, 0.3], rise: 0.01, sway: 0.4, twinkle: 0.6, additive: true },
    { name: 'Phosphor motes by the screen', count: 26, box: [1.4, 0.8, 0.8], centre: [0, 0.95, -1.75], size: 20, colour: ['#b6ffe6', '#6dffc4'], opacity: [0.05, 0.35], rise: 0.05, sway: 0.2, twinkle: 0.8, additive: true },
  ],
  // Haze lying over the hall's floor beyond the rails: hardly there by day, low and blue by night.
  fog: { cards: 5, from: 4.2, to: 11, width: 10, height: 1.0, colour: ['#e6e2f2', '#6f7fc8'], opacity: [0.03, 0.12] },
  // (more of them, on more of a wind, since 2026-11-13: "add a bit more flying paper and increase wind a bit"; it was 10 on the Breeze alone)
  sheets: { count: 16, colour: ['#ffffff', '#9fb4d8'], wind: 0.3 },
  // the real lights' fill is the monitor's screen: it follows what the screen is doing
  flicker: () => (crt ? crt.glow() : 0),
};

const launchTurn = new THREE.Quaternion(), outward = new THREE.Vector3();
export const office2Letters: LetterTheme = {
  ...officeLetters, id: 'office2', paint: officeCard, shape: paneSoup, title: 'Keyboard Smash',
  // (special: urgent, its badge alarm red to amber; its glow the green every email had until 2026-11-13,
  //  "make normals no glow, and only green glow ( like normal glow now ) on special emails")
  special: { colours: ['#ff3b30', '#ffb020'], label: 'URGENT', aura: ['#27c98e', '#a8ffe0'], wisps: 0.12, glow: 0.8 },
  look: { ...officeLetters.look, aura: null, spell: undefined },
  // smaller: they come out of the monitor, only a metre or so away (2026-11-13: "make emails smaller here since they are coming from a closer distance")
  size: 0.72,
  // Out of the screen: it starts as the picture on the glass (the screen's size, turned as the screen is),
  // springs up out of it in an arc and settles just over the monitor, growing to full size as it comes.
  origin(head: Vector3, home: Vector3, from: Vector3, via: Vector3) {
    home.set(head.x * 0.7, head.y - office2Tune.settle.drop, head.z - office2Tune.settle.ahead);
    if (!crt) return { scale: 1, pose: 'face' as const };
    const size = crt.pose(from, launchTurn);
    from.addScaledVector(outward.set(0, 0, 1).applyQuaternion(launchTurn), 0.015);      // (just off the glass)
    via.lerpVectors(from, home, 0.45); via.y += office2Tune.arc;
    return { scale: size, pose: 'face' as const, turn: launchTurn, seconds: office2Tune.seconds, ease: office2Tune.ease };
  },
  // after round one's last email: INBOX ZERO on the screen for a moment before round two
  pause: 3.4,
  // after the game's last: the end at once, so the logo comes as the monitor jumps up (2026-11-13: "make the logo show at the same time as the monitor jump")
  endPause: 0, logoAfter: 0,
  // the round's intro card would be inside the monitor: it floats just in front of and over it instead, smaller
  // (as wide to the eye as it is in the other levels, and clear of the progress bar above)
  intro: { up: 0.2, nearer: 0.65, size: 0.5 },
};

export const office2Fx: FxStyle = officeFx;
/** The first office's sound, with the monitor's own (crton, crtoff, glass, zap: tools/crtsounds.py) in the same folder. */
export const office2Sound: LevelSound = officeSound;
