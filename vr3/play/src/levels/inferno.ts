import { Vector3 as V3, type Vector3 } from 'three';
import type { LetterTheme } from '../letters';
import { paintedDirection, type StageDef } from './backdrop';
import { infernoCard } from './infernocard';
import type { FxStyle, LevelSound } from './types';

/**
 * Inferno: the mail room's incinerator hall, seen from a riveted iron deck between two brick pillars. Straight
 * ahead, far off down the clear middle lane, the great furnace: its round mouth open on a roaring fire, a hopper
 * heaped with mail over it, fed from a chute in the roof. Down the side bays, rows of smaller furnaces with their
 * doors shut and fire showing round the seams, sorting tables, conveyors, carts and sacks, all softening into smoke.
 * Nothing is cut: the tool is a flame thrower (../weapons/flamethrower.ts, ../flame.ts). One touch of the jet and a
 * letter catches, the fire spreads over it by itself, and it burns away.
 *
 * Positions are u, v in public/levels/inferno/start.webp (u 0 left to 1 right over 270 degrees, v 0 bottom to 1
 * top over 90, the eye line at .48), measured from the painting: the hall, 2026-11-13 (design/inferno-hall-v1,
 * the user's art, painted to Kyoto's one-point perspective so the mail stands out against a far, calm middle).
 * The room before it, with a furnace either side and the bench in front, is tools/level-src/inferno/start-before-2026-11-13.webp
 * and end-before-2026-11-13.webp (design/incinerator-v2).
 */

/** The fire in the great furnace's mouth, where letters come from (2026-11-13: "make the emails come from the fire"; they lifted
 * off the heap on its hopper, u .5 v .632, before): its direction, and how far it is by the depth model. */
const FIRE = { u: 0.5, v: 0.418, metres: 6.0 };
const fireWay = new V3();

export const infernoStage: StageDef = {
  id: 'inferno', name: 'Inferno',
  art: ['levels/inferno/start.webp', 'levels/inferno/end.webp'],
  rear: ['#4a2c26', '#0d0a14'],
  glsl: /* glsl */ `
    // The hall: the floor 1.2 m under the eye and the beams 1.8 m over it; the far wall about 16 m off down the
    // middle lane and the side bays nearer and nearer towards the painting's edges; the great furnace, its hopper
    // and chute standing out in the middle at about 6 m (its foot is where the floor says 6.1); the two pillars and
    // the deck's low rails 3 m out. The workbenches, carts and bins at the far edges just come nearer, smoothly:
    // cut out as hard-edged blocks they slide against what is behind them (the lab found that, 2026-11-13).
    float inverseDepthAt(vec3 d, vec2 uv){
      float level=sqrt(max(0.,1.-d.y*d.y));
      float side=clamp(abs(uv.x-.5)*2.,0.,1.);
      float wall=mix(1./16.,1./2.4,pow(side,1.8))*level;
      float inv=max(max(max(-d.y,0.)/1.2,max(d.y,0.)/1.8),wall);
      float furnace=band(uv.x,.44,.561)*band(uv.y,.35,.56)+band(uv.x,.462,.538)*band(uv.y,.56,.66)+band(uv.x,.483,.517)*step(.66,uv.y);
      inv=max(inv,min(1.,furnace)*level/6.1);
      float pillars=(band(uv.x,.21,.262)+band(uv.x,.738,.79))*step(.22,uv.y);
      float rails=(band(uv.x,.2525,.3825)+band(uv.x,.6175,.7475))*band(uv.y,.22,.318);
      inv=max(inv,min(1.,pillars+rails)*level/3.);
      float nearSides=smoothstep(.76,.92,side)*(1.-smoothstep(.36,.52,uv.y));
      return max(inv,nearSides*level/1.9);
    }
    // 0 to 1, slowly: a furnace drawing breath.
    float surge(float seed){ return .5+.5*sin(time*.7+seed)*sin(time*.31+seed*2.3); }
    // A caged lamp, about 1: it breathes, slowly. Nothing in this hall flickers or strobes (the lab's lesson,
    // 2026-11-13: "not strobe effects"); the old room's lamps used flame(), which gutters at 23 Hz.
    float breathe(float seed){ return 1.+.06*sin(time*.9+seed)+.04*sin(time*1.7+seed*2.1); }
    // A fire's flicker, about 1 (2026-11-13: "make the lighting around the level flicker nicer / glow"): smooth noise at three or
    // four a second on top of the breath, never a hard on-off, so it lives without strobing.
    float flick(float seed){ return breathe(seed)+.16*(softNoise(vec2(time*3.2+seed*13.,seed*5.))-.5)+.08*(softNoise(vec2(time*5.1+seed*3.,seed*9.))-.5); }
    vec2 warp(vec2 uv){
      // The fire in the great furnace's mouth climbs: the painting is read from a little lower and to one side
      // in waves that travel upwards, so the flames lick and roll. The bed of coals at the bottom stays put.
      float mouth=box(uv,vec2(.5,.428),vec2(.027,.045),.006);
      float up=clamp((uv.y-.381)/.095,0.,1.);
      // (about half as much, and slower, since 2026-11-13: "make the main fire center a bit less wavey")
      float roll=sin(uv.y*420.-time*4.2+sin(uv.x*300.+time*.9)*1.2)+.6*sin(uv.y*230.-time*2.9+uv.x*170.);
      uv.y-=mouth*(.0019+.0012*roll)*up;
      uv.x+=mouth*sin(uv.y*380.-time*3.6+uv.x*90.)*.0007*up;
      // Heat: the air shivers over the furnace and the heap on its hopper, over the grate in front of it, and
      // faintly over the side furnaces' doors; more as the lights go down, while you burn, and as a letter goes.
      float heat=oval(uv,vec2(.5,.53),vec2(.05,.08))+oval(uv,vec2(.5,.33),vec2(.02,.05))*.6
                +(oval(uv,vec2(.096,.47),vec2(.025,.07))+oval(uv,vec2(.9025,.47),vec2(.025,.07))+oval(uv,vec2(.287,.48),vec2(.015,.05))+oval(uv,vec2(.7125,.48),vec2(.015,.05)))*.5;
      heat*=(1.-mouth)*(.6+.4*blend+.7*hot+.6*pulse);
      uv.x+=(sin(uv.y*210.-time*5.1)+sin(uv.y*97.-time*3.3+uv.x*40.))*.0006*heat;
      uv.y+=sin(uv.x*260.+time*4.)*.0005*heat;
      return uv;
    }
    vec3 scene(vec3 col, vec2 uv){
      vec3 fire=vec3(1.,.45,.10), amber=vec3(1.,.66,.28), ember=vec3(1.,.30,.06);
      float lum=dot(col,vec3(.3,.5,.2));
      float glowing=smoothstep(.22,.5,col.r-col.b)*smoothstep(.5,.85,col.r);
      // Bloom: the painting itself, blurred (its own small copies), where it is bright and warm, laid back over it.
      vec3 soft=mix(textureLod(startMap,uv,3.).rgb,textureLod(endMap,uv,3.).rgb,blend);
      vec3 wide=mix(textureLod(startMap,uv,5.2).rgb,textureLod(endMap,uv,5.2).rgb,blend);
      float bright=smoothstep(.55,.95,max(soft.r,soft.g))*smoothstep(.12,.4,soft.r-soft.b);
      float spill=smoothstep(.38,.8,wide.r)*smoothstep(.1,.32,wide.r-wide.b);
      col+=soft*bright*(.16+.22*blend);
      col+=wide*vec3(1.,.62,.32)*spill*(.06+.12*blend);
      // The great furnace breathes; it roars as a letter lifts off the heap or burns (pulse) and while you burn (hot).
      float roar=.78+.22*surge(.4)+.85*pulse+.3*hot+.12*(softNoise(vec2(time*2.8,.7))-.5);
      float mouth=box(uv,vec2(.5,.428),vec2(.029,.047),.008);
      col*=1.+glowing*mouth*(roar-.85)*1.1;
      col+=fire*mouth*glowing*.06*roar*(.5+.5*blend);
      col+=vec3(1.,.85,.55)*oval(uv,vec2(.5,.405),vec2(.016,.02))*.10*roar;      // white heat at its heart
      // its light on the air in front of it, on its own iron, and up into the smoke over it
      col+=fire*oval(uv,vec2(.5,.43),vec2(.075,.10))*(.025+.05*blend)*roar;
      col+=fire*oval(uv,vec2(.5,.56),vec2(.10,.14))*(.012+.03*blend)*roar;
      // The firebars under the mouth, and the grated channel from them to the deck: fire under the grate,
      // drawing towards you in slow waves.
      float bars=box(uv,vec2(.5,.3635),vec2(.021,.006),.004);
      col*=1.+bars*glowing*(roar-.8)*1.4;
      float along=clamp((uv.y-.233)/.137,0.,1.), wide_=mix(.016,.0085,along);
      float channel=(1.-smoothstep(wide_-.002,wide_+.003,abs(uv.x-.5)))*band(uv.y,.233,.37);
      float slots=1.-smoothstep(.08,.26,lum);
      col+=ember*channel*slots*(.06+.10*blend)*roar*(.65+.35*sin(uv.y*70.+time*1.5));
      // and the furnace's light lies along the floor in a long streak to the deck and past it, breathing with it
      float floorAll=smoothstep(.37,.33,uv.y);
      col+=fire*floorAll*(oval(uv,vec2(.5,.30),vec2(.045,.07))+oval(uv,vec2(.5,.13),vec2(.035,.12))*.7)*(.02+.04*blend)*(roar-.5);
      // A letter coming out of the fire: the mouth flares as it comes.
      col+=amber*oval(uv,vec2(.5,.43),vec2(.05,.06))*.26*pulse;
      // The furnaces down the side bays: their door seams glow and breathe, each in its own time, and throw their
      // light on the air and the floor in front of them; they answer the great one when it roars.
      float bays=band(uv.y,.38,.58)*(1.-box(uv,vec2(.5,.46),vec2(.07,.12),.02));
      float sideBreath=.75+.25*sin(time*.55+uv.x*31.)*sin(time*.23+uv.x*13.)+.14*(softNoise(vec2(time*3.+uv.x*41.,uv.x*17.))-.5);
      col*=1.+glowing*bays*((sideBreath-.75)*1.2+.3*pulse+.25*hot);
      float doors=oval(uv,vec2(.096,.45),vec2(.035,.08))+oval(uv,vec2(.9025,.45),vec2(.035,.08))+(oval(uv,vec2(.287,.47),vec2(.02,.05))+oval(uv,vec2(.7125,.47),vec2(.02,.05)))*.8;
      col+=fire*doors*(.03+.06*blend)*sideBreath;      // (.015 + .045 before 2026-11-13's "glow")
      // The caged lamps: steady, breathing slowly, a halo round each, dimmer as the lights go down; under the
      // hanging ones a cone of lit dust drifting.
      float day=1.-.55*blend;
      float halos=oval(uv,vec2(.229,.615),vec2(.016,.04))+oval(uv,vec2(.7715,.615),vec2(.016,.04))
                 +oval(uv,vec2(.181,.82),vec2(.022,.05))+oval(uv,vec2(.819,.82),vec2(.022,.05))
                 +(oval(uv,vec2(.324,.685),vec2(.012,.03))+oval(uv,vec2(.675,.685),vec2(.012,.03))+oval(uv,vec2(.1565,.64),vec2(.012,.03))+oval(uv,vec2(.8425,.64),vec2(.012,.03)))*.8
                 +(oval(uv,vec2(.3665,.603),vec2(.008,.02))+oval(uv,vec2(.6325,.603),vec2(.008,.02))+oval(uv,vec2(.07,.535),vec2(.01,.025))+oval(uv,vec2(.93,.535),vec2(.01,.025)))*.7
                 +(oval(uv,vec2(.2925,.255),vec2(.014,.012))+oval(uv,vec2(.345,.255),vec2(.014,.012))+oval(uv,vec2(.655,.255),vec2(.014,.012))+oval(uv,vec2(.7125,.255),vec2(.014,.012)))*.8;
      col+=amber*halos*(.11*day+.05)*flick(1.3);
      // and a wider soft glow round each, flickering with it
      float glowAround=oval(uv,vec2(.229,.615),vec2(.04,.09))+oval(uv,vec2(.7715,.615),vec2(.04,.09))+oval(uv,vec2(.181,.82),vec2(.05,.11))+oval(uv,vec2(.819,.82),vec2(.05,.11))
                      +(oval(uv,vec2(.324,.685),vec2(.03,.07))+oval(uv,vec2(.675,.685),vec2(.03,.07))+oval(uv,vec2(.1565,.64),vec2(.03,.07))+oval(uv,vec2(.8425,.64),vec2(.03,.07)))*.7;
      col+=amber*glowAround*(.035+.03*blend)*flick(4.7);
      float dust=softNoise(vec2(uv.x*46.+time*.21,uv.y*34.-time*.16))*softNoise(vec2(uv.x*17.-time*.08,uv.y*23.+time*.05));
      float cones=oval(uv,vec2(.181,.66),vec2(.05,.16))+oval(uv,vec2(.819,.66),vec2(.05,.16))+(oval(uv,vec2(.324,.58),vec2(.03,.1))+oval(uv,vec2(.675,.58),vec2(.03,.1)))*.7;
      col+=amber*cones*dust*.10*day*flick(2.2);
      // Depth: smoke hangs down the far hall and the side corridors' far ends, drifting, so that what is near
      // stands clear of it and the furnace holds the eye.
      float far=oval(uv,vec2(.5,.47),vec2(.20,.07))*(1.-box(uv,vec2(.5,.45),vec2(.062,.105),.015))
               +(oval(uv,vec2(.155,.47),vec2(.05,.05))+oval(uv,vec2(.845,.47),vec2(.05,.05)))*.6;
      float drift=softNoise(vec2(uv.x*22.+time*.05,uv.y*14.-time*.015));
      col=mix(col,mix(vec3(.62,.42,.30),vec3(.20,.09,.08),blend),far*drift*.22);
      // Smoke lying under the beams, drifting.
      float haze=softNoise(vec2(uv.x*14.+time*.05,uv.y*9.-time*.02));
      col=mix(col,mix(vec3(.20,.13,.11),vec3(.06,.05,.09),blend),smoothstep(.70,1.,uv.y)*haze*.30);
      // The floor: what light lies on it shivers a little, as over hot iron (not on the rails or the benches).
      float rails=(band(uv.x,.2525,.3825)+band(uv.x,.6175,.7475))*band(uv.y,.22,.318);
      float benches=(band(uv.x,-.01,.13)+band(uv.x,.87,1.01))*step(.1,uv.y);
      float floor_=smoothstep(.36,.31,uv.y)*(1.-rails)*(1.-benches);
      float shimmer=sin(uv.x*900.+uv.y*60.-time*1.2)*.6+sin(uv.x*520.-uv.y*90.-time*.7)*.4;
      col*=1.+floor_*smoothstep(.25,.6,lum)*shimmer*.045;
      // Your own fire: while the jet is lit it lights the deck in front of you, the rails and the pillars' faces;
      // and when a letter goes up the whole room takes a breath of it.
      float pillars=(band(uv.x,.21,.262)+band(uv.x,.738,.79))*step(.22,uv.y)*smoothstep(.75,.4,uv.y);
      float deck=smoothstep(.235,.215,uv.y);
      float sway=.88+.12*sin(time*2.3)*sin(time*1.1+.5);
      col+=fire*hot*sway*(deck*oval(uv,vec2(.5,.08),vec2(.3,.18))*.09+(rails+pillars*.6)*.05+.015);
      col+=fire*pulse*.03;
      // The grade: shadows towards plum and highlights towards amber, a little more contrast, and the far sides,
      // the beams and the floor at your feet falling away so that the middle, where the mail is, holds the eye.
      float l=dot(col,vec3(.3,.5,.2));
      col=mix(col,col*vec3(.90,.90,1.14),(1.-smoothstep(0.,.42,l))*(.3+.3*blend));
      col=mix(col,col*vec3(1.08,1.,.9),smoothstep(.45,1.,l)*.5);
      vec3 c=clamp(col,0.,1.); col=mix(col,c*c*(3.-2.*c),.2);
      col*=mix(.68,1.,smoothstep(0.,.12,uv.x)*smoothstep(1.,.88,uv.x))*mix(.8,1.,smoothstep(1.,.76,uv.y))*mix(.86,1.,smoothstep(0.,.12,uv.y));
      return col;
    }`,
  motes: [
    { name: 'Sparks up out of the furnace', count: 46, box: [1.3, 2.8, 1.1], centre: [0, 1.95, -5.7], size: 13, colour: ['#ffd27a', '#ff9a3a'], opacity: [0.45, 0.95], rise: 0.55, sway: 0.18, twinkle: 0.8, additive: true },
    { name: 'Embers on the draught', count: 110, box: [10, 3, 11], centre: [0, 1.5, -5], size: 15, colour: ['#ffb24a', '#ff7a1e'], opacity: [0.45, 0.9], rise: 0.16, sway: 0.3, twinkle: 0.7, additive: true },
    { name: 'Embers close by', count: 18, box: [3.2, 2.2, 2], centre: [0, 1.3, -1.6], size: 17, colour: ['#ffc566', '#ff8a2a'], opacity: [0.35, 0.75], rise: 0.12, sway: 0.22, twinkle: 0.75, additive: true },
    { name: 'Sparks off the left bay furnace', count: 16, box: [1.2, 2, 1.2], centre: [-5.9, 1.1, -3.8], size: 12, colour: ['#ffd27a', '#ff9a3a'], opacity: [0.35, 0.85], rise: 0.4, sway: 0.2, twinkle: 0.85, additive: true },
    { name: 'Sparks off the right bay furnace', count: 16, box: [1.2, 2, 1.2], centre: [5.9, 1.1, -3.8], size: 12, colour: ['#ffd27a', '#ff9a3a'], opacity: [0.35, 0.85], rise: 0.4, sway: 0.2, twinkle: 0.85, additive: true },
    { name: 'Ash', count: 90, box: [10, 3, 10], centre: [0, 1.6, -4.5], size: 11, colour: ['#eadccb', '#8d8499'], opacity: [0.22, 0.2], rise: -0.035, sway: 0.3, twinkle: 0.2, additive: false },
    { name: 'Heat in the mouth of the furnace', count: 14, box: [1.3, 0.9, 0.7], centre: [0, 0.8, -5.6], size: 80, colour: ['#ffb060', '#ff7a20'], opacity: [0.025, 0.05], rise: 0.1, sway: 0.2, twinkle: 0.2, additive: true },
  ],
  // Smoke lying low across the hall, lit from the fires as the lights go; thin, so the furnace still holds the eye.
  fog: { cards: 4, from: 4.4, to: 13, width: 10, height: 1.1, colour: ['#dba27a', '#a8401f'], opacity: [0.035, 0.08] },
  // the letters lift off the heap: the hopper's glow swells rather than flashes (as the lab's hatch, 2026-11-13)
  pulseRise: 0.3,
  // the furnace's light on what is in the hand: it breathes, slowly (it fluttered at 5 to 9 Hz in the old room)
  // (and a soft fire's flicker on top since 2026-11-13: smooth, three or four a second, no strobe)
  flicker: (time, blend) => 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(time * 0.7 + 0.4) * Math.sin(time * 0.31 + 0.9)) * (0.5 + 0.5 * blend) + 0.05 * Math.sin(time * 1.3)
    + 0.035 * Math.sin(time * 19.3 * 0.17 + Math.sin(time * 2.3)) + 0.025 * Math.sin(time * 4.1 + 1.7),
};

export const infernoLetters: LetterTheme = {
  id: 'inferno', face: 'paint', paint: infernoCard, mechanic: 'spray', title: 'Inferno', accent: '#ff8a3d', bar: ['#ff3d2e', '#ffc23d'],
  look: { sheet: '#f3e6cc', ink: '#1c130f', back: '#e4d3b4', selfLit: 0.1, night: '#d9bcae',
    hover: '#ffe2b8', cutWide: '#ff9a3a', cutHot: '#fff3d6', mark: '#ffe27a', flash: '#fff1d0', gold: '#fff0a8',
    burn: '#ffb347', burnStyle: 3, streak: ['#ffb070', '#ffffff'], thread: ['#ffb070', '#fff3e0'], aura: ['#ff5a14', '#ffc24a'], spell: { wisps: 1, sparkles: 8, trail: false, glow: 0.34 } },      // (glow 0.6 and 14 sparkles until the user asked for less, 2026-11-13)
  // Out of the fire in the furnace's mouth, on the draught: small and far, up out of the flames, then over the deck towards you.
  origin(head: Vector3, home: Vector3, from: Vector3, via: Vector3) {
    from.copy(head).addScaledVector(paintedDirection(FIRE.u, FIRE.v, fireWay), FIRE.metres);
    via.lerpVectors(from, home, 0.45); via.y += 0.35;
    return { scale: 0.5, pose: 'face' as const, seconds: 1.3, ease: 2, sway: 0.06 };
  },
  // The junk that shouts arrives already smouldering (as the lab's is radioactive): it takes the fire a little longer.
  hazard: email => email.kind === 'Junk' && (email.category === 'Spam' || email.category === 'Promo' || email.category === 'Alert'),
};

// What comes off a burning letter: scraps of paper alight, carried up by the heat.
export const infernoFx: FxStyle = { bit: 'petal', bits: ['#ff8a3a', '#ff5a1e'], paper: ['#f1dfc0', '#5a4038'], sparks: ['#ffd27a', '#ff8a3a'], shedBits: 0, shedSparks: 0, gravity: -0.45, drag: 1.5, flutter: 0.9, size: 0.6 };

export const infernoSound: LevelSound = {
  id: 'inferno',
  // round two begins with the user's own sting, played twice through (2026-11-13: "play 2 times to make it feel better";
  // tools/level-src/inferno/fire-stringer.mp3, its silent tail cut so the second follows straight on, set to -3 dBFS)
  roundStinger: { name: 'stinger2', volume: 0.9 },
  layers: [
    // the furnaces behind their doors, all round
    { name: 'furnace', at: null, level: c => 0.7 + 0.15 * c.drift(c.t * 0.12, 1.3) },
    // the great furnace's open fire, straight ahead down the hall; louder while something is alight in front of you
    // (it was close by on the left, where the old room's furnace stood)
    { name: 'crackle', at: [0, -0.5, -5.8], level: c => 0.5 + 0.24 * c.drift(c.t * 0.25, 2.9) + 0.2 * c.hot },
    // the copper pipes up on the right
    { name: 'pipes', at: [3.4, 1.4, -2.4], level: c => 0.3 + 0.2 * c.drift(c.t * 0.2, 5.1) },
  ],
  occasional: [
    { name: 'clank', every: [28, 70], volume: 0.4, region: [-5, 5, 0.3, 1.5, -15, -8] },
    { name: 'steam', every: [22, 55], volume: 0.35, region: [2.5, 4, 1, 2.2, -3, -1.5] },
    // a furnace door down one side bay or the other flaring
    { name: 'flare', every: [30, 70], volume: 0.4, region: [-6.6, -5.2, -0.2, 0.4, -4.6, -3] },
    { name: 'flare', every: [30, 70], volume: 0.4, region: [5.2, 6.6, -0.2, 0.4, -4.6, -3] },
  ],
  // the roar of the jet, for as long as the trigger is held
  // (options for it, 2026-11-13: tools/flameoptions.py and public/flame.html; it swells as it is swept about)
  hum: { level: 0.5, swing: false, fadeIn: 0.06, fadeOut: 0.22, sweep: 1 },
};
