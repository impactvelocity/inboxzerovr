import { Vector3 as V3, type Vector3 } from 'three';
import type { LetterTheme } from '../letters';
import { createWarp } from '../props/warp';
import { paintedDirection, type StageDef } from './backdrop';
import { paneSoup } from './shapes';
import { spaceCard } from './spacecard';
import type { FxStyle, LevelSound } from './types';

/**
 * Super Space: a flight through pixel-art space. The painting (design/space-assets-v3) is the far
 * sky, which stands still: small square stars and faint dithered nebula bands, a muted violet that
 * goes near black with the bands alight in magenta. Everything that moves is real and in front of
 * it (../props/warp.ts): stars, lanes of pixel dust, streaks and comets going by as the seat
 * travels. The mail is incoming transmissions, which drop out of the distance dead ahead; the
 * weapon is the space saber (../weapons/saber.ts).
 *
 * The painting was made with nothing in its middle third, and nothing here puts anything there
 * but a faint glow where it is all coming from.
 *
 * Since 2026-11-13 all of that is seen from a ship: an observation deck painted to Kyoto's one-point
 * perspective (design/space-kyoto-perspective-v1, the user's) is laid over it, its windows keyed out of
 * green (tools/deckkey.py), so space and its flight go by outside the glass. The user: "keep as it is
 * now, but this is placed on top, layered, and green scene keyed out". The deck has its own depth and
 * writes it (StageDef.cover in backdrop.ts), so the window frames slide over space as the head moves and
 * the flight's stars are hidden by the walls and ceiling and seen only through the glass. The mail now
 * comes out of the slot in the mail post at the foot of the big window.
 *
 * Deck positions are u, v in public/levels/space/deck-start.webp (2000 by 667; u 0 left to 1 right over
 * 270 degrees, v 0 bottom to 1 top over 90, the eye line at .48), measured from the painting.
 */

/** The mail post's slot, where letters come out: its direction, and how far (just in front of the post, which is 4.7 m off by the depth model). */
const SLOT = { u: 0.5, v: 0.394, metres: 4.4 };
const slotWay = new V3();

export const spaceStage: StageDef = {
  id: 'space', name: 'Super Space',
  art: ['levels/space/start.webp', 'levels/space/end.webp'],
  // (the colours of the painting's two edges, so the sky carries on behind)
  rear: ['#261c46', '#040313'],
  cover: { art: ['levels/space/deck-start.webp', 'levels/space/deck-end.webp'], windows: 'levels/space/windows.webp', rear: ['#403a5a', '#0c0a1b'] },
  props: createWarp,
  glsl: /* glsl */ `
    // The sky is a very long way off: it does not move as the player leans. What gives this level
    // its depth is the real things going by in front of it.
    float inverseDepthAt(vec3 d, vec2 uv){ return .006; }
    vec3 scene(vec3 col, vec2 uv){
      float bright=max(col.r,max(col.g,col.b)), pale=min(col.r,min(col.g,col.b));
      // Its stars twinkle, each at its own pace (they are the only pale things in it).
      float star=smoothstep(.34,.6,pale);
      float h=hash(floor(uv*vec2(724.,241.)));
      col*=1.+star*(.5*sin(time*(.7+2.8*h)+h*60.)-.08);
      // Its nebula bands (whatever is more coloured than the sky about it) breathe slowly, flare as a
      // letter is cut, and blaze for a moment at the jump.
      float band=smoothstep(mix(.25,.10,blend),mix(.42,.40,blend),bright-pale)*(1.-star);
      float breath=softNoise(vec2(uv.x*11.+time*.11,uv.y*7.-time*.06));
      col+=col*band*(.30*breath+1.1*pulse+1.4*lamp);
      // Where it is all coming from: a faint light dead ahead, which swells as mail drops out of it.
      float ahead=oval(uv,vec2(.5,.50),vec2(.034,.102));
      vec3 glow=mix(vec3(.50,.44,1.),vec3(.80,.30,1.),blend);
      col+=glow*ahead*(.05+.04*blend+.26*pulse+.55*lamp);
      // and the whole sky lifts a little at the jump
      col*=1.+.25*lamp;
      return col;
    }

    // ---------------------------------------------------------------- the deck, in front (StageDef.cover)
    // The floor 1.2 m under the eye and the ceiling 2.2 m over it. The big window is a wall curved round the seat
    // 5 m off (its foot is painted level from pillar to pillar, so it is that far all the way along), the two pillars
    // stand 3.4 m off, and the mail post just in front of the glass at 4.7 m. Past the pillars the side aisles run
    // off to their far doors (about 16 m, where their lines meet at x .675) and their walls come nearer towards the
    // painting's edges (about 2.9 m there). The consoles and cases low down at the sides are not cut out as blocks
    // of their own (the lab's lesson: hard-edged, they slide against the wall behind); the lower sides just come
    // nearer, smoothly.
    float coverDepthAt(vec3 d, vec2 uv){
      float level=sqrt(max(0.,1.-d.y*d.y));
      float x=abs(uv.x-.5)*2.;
      float inv=max(max(-d.y,0.)/1.2,max(d.y,0.)/2.2);
      float aisle=max(1./16.,sin(abs(x-.675)*2.35619449)/2.);
      inv=max(inv,mix(1./5.,aisle,smoothstep(.5,.6,x))*level);
      float pillars=band(x,.478,.597)*step(.25,uv.y);
      inv=max(inv,pillars*level/3.4);
      float post=band(uv.x,.479,.521)*band(uv.y,.32,.462);
      inv=max(inv,post*level/4.7);
      float nearSides=smoothstep(.72,.92,x)*(1.-smoothstep(.3,.47,uv.y));
      return max(inv,nearSides*level/2.4);
    }
    vec3 coverScene(vec3 col, vec2 uv, float glass){
      float x=abs(uv.x-.5)*2.;
      // Its lights, the cyan strips and screens and the magenta status lamps, breathe: slowly, each its own way, and
      // more as the lights go down. (Nothing on this deck flickers or strobes.)
      float cyan=smoothstep(.45,.8,min(col.g,col.b))*smoothstep(.1,.3,col.b-col.r);
      float magenta=smoothstep(.4,.75,min(col.r,col.b))*smoothstep(.12,.3,min(col.r,col.b)-col.g);
      float breath=.5+.5*sin(time*.9+uv.x*7.+uv.y*3.);
      col+=col*cyan*(.08+.10*breath+.25*blend);
      col+=col*magenta*(.10+.10*sin(time*.7+uv.x*13.)+.15*blend);
      // and they bloom: the deck's own blurred copy, the bright of it (stronger in the dark, where they are the light)
      vec3 halo=max(coverAt(uv,4.)-vec3(.3),0.)+.5*max(coverAt(uv,6.)-vec3(.22),0.);
      col+=halo*mix(.35,1.,blend)*(.85+.3*breath);
      // Space's light through the glass: the floor and things near the windows pick up its violet, flare with it at
      // the jump (lamp), and a little at each letter.
      float near=windowAt(uv,5.)*.6+windowAt(uv,3.)*.4;
      vec3 spill=mix(vec3(.62,.56,1.),vec3(.50,.36,1.),blend);
      col+=spill*near*(1.-glass)*(.03+.04*blend+.45*lamp+.06*pulse);
      // The floor is polished: under the big window space is mirrored in it, softly and shivering, the more so the
      // nearer the window's foot (v .33); its frames and rails cut into the reflection where they stand.
      float shine=smoothstep(.34,.31,uv.y)*smoothstep(.06,.30,uv.y)*(1.-smoothstep(.52,.62,x));
      vec2 m=vec2(uv.x+.0016*sin(uv.y*380.+time*1.1)+.0008*sin(uv.y*900.-time*.7),.66-uv.y);
      col+=skyAt(m)*windowAt(m,1.2)*shine*mix(.30,.45,blend)*(1.+.8*lamp);
      float lum=dot(col,vec3(.3,.5,.2));
      float ripple=sin(uv.x*900.+uv.y*60.-time*1.2)*.6+sin(uv.x*520.-uv.y*90.-time*.7)*.4;
      col*=1.+smoothstep(.36,.3,uv.y)*smoothstep(.25,.6,lum)*ripple*.04;
      // The mail post: its envelope screen breathes, and lights up as a letter goes out through its slot (it swells
      // up, spaceStage.pulseRise, rather than flashing); its light falls on the floor in front of it.
      vec3 signal=mix(vec3(.45,.95,1.),vec3(.30,.92,1.),blend);
      col+=signal*box(uv,vec2(.5,.427),vec2(.0075,.012),.003)*(.06+.05*sin(time*1.6)+.7*pulse);
      col+=signal*oval(uv,vec2(.5,.427),vec2(.028,.045))*(.03+.04*blend+.30*pulse);
      col+=signal*box(uv,vec2(.5,.394),vec2(.0085,.003),.003)*(.08+1.*pulse);
      col+=signal*oval(uv,vec2(.5,.31),vec2(.045,.028))*(.02+.03*blend+.25*pulse);
      // Down the aisles: a violet air, thicker towards their far doors, which glow.
      float far=oval(uv,vec2(.1625,.47),vec2(.035,.07))+oval(uv,vec2(.8375,.47),vec2(.035,.07));
      col=mix(col,mix(vec3(.62,.58,.85),vec3(.16,.12,.34),blend),far*.22);
      col+=vec3(.30,.85,1.)*far*(.03+.04*breath)*(.4+.6*blend);
      // and the whole deck lifts a little with the light at the jump
      col*=1.+.10*lamp;
      return col;
    }
    // The glass: a faint sheen across it, the deck's cyan caught along its frames, and the jump's light.
    vec3 coverGlass(vec3 sky, vec2 uv, float glass){
      float rim=1.-windowAt(uv,3.5);
      sky+=vec3(.35,.85,1.)*rim*(.05+.07*blend);
      float sheen=smoothstep(.0,.6,sin((uv.x*2.4+uv.y*1.1)*6.2832+time*.05))*.5+smoothstep(.7,1.,sin((uv.x*5.1-uv.y*.8)*6.2832-time*.03))*.5;
      sky+=mix(vec3(.85,.85,1.),vec3(.45,.5,.9),blend)*sheen*.022;
      return sky*(1.+.15*lamp);
    }`,
  motes: [
    // In the deck's air (all of it inside the glass, which is 5 m off): dust hanging in its light, and a few soft
    // glints of the strips' cyan and the lamps' magenta up under the ceiling.
    { name: 'Dust in the deck lights', count: 110, box: [9, 2.8, 4.2], centre: [0, 1.5, -2.6], size: 12, colour: ['#ffffff', '#c4baff'], opacity: [0.2, 0.22], rise: -0.006, sway: 0.22, twinkle: 0.3, additive: false },
    { name: 'Glints by the lights', count: 34, box: [9, 1.4, 4], centre: [0, 2.4, -2.6], size: 18, colour: ['#9ff6ff', '#ff8ae6'], opacity: [0.12, 0.3], rise: 0.004, sway: 0.3, twinkle: 0.9, additive: true },
  ],
  // a thin haze lying low on the deck, short of the glass
  fog: { cards: 3, from: 2.6, to: 4.5, width: 9, height: 0.8, colour: ['#d6d0ff', '#5a40d4'], opacity: [0.03, 0.07] },
  pulseRise: 0.3,       // the mail post's light as a letter goes out swells up, it does not flash
  flicker: time => 1 + 0.08 * Math.sin(time * 0.9) + 0.04 * Math.sin(time * 5.3),
};

export const spaceLetters: LetterTheme = {
  id: 'space', face: 'paint', paint: spaceCard, shape: paneSoup, mechanic: 'cut', title: 'Super Space', accent: '#35e8ff', bar: ['#ff3fc8', '#35e8ff'],
  look: { sheet: '#f6f1ff', ink: '#1b1440', back: '#4a1c5e', selfLit: 1, night: '#f1ecff',
    hover: '#d9fbff', cutWide: '#35e8ff', cutHot: '#ffffff', mark: '#ffe9a0', flash: '#eaffff', gold: '#fff0b8',
    // it goes in blocks, as pixels would, with a magenta edge
    burn: '#ff4fd8', burnStyle: 1, streak: ['#7df3ff', '#ffffff'], thread: ['#ff9be9', '#fff5fd'], aura: ['#27d9ff', '#c04dff'],
    spell: { wisps: 0.16, sparkles: 5, trail: true, glow: 0.55 } },
  // Out of the mail post's slot at the foot of the big window: small in the dark of it, then it rushes up across
  // the deck and brakes hard in front of the player, leaving lights behind it. (Before the deck, 2026-11-13, it
  // dropped out of the distance dead ahead, from 26 m.)
  origin(head: Vector3, home: Vector3, from: Vector3, via: Vector3) {
    from.copy(head).addScaledVector(paintedDirection(SLOT.u, SLOT.v, slotWay), SLOT.metres);
    via.lerpVectors(from, home, 0.55); via.y += 0.15;
    return { scale: 0.45, pose: 'face' as const, seconds: 1.6, ease: 3, sway: 0.05 };
  },
};

// What a cut throws out: little cubes of light (pixels), which do not fall. There is no down out here.
export const spaceFx: FxStyle = { bit: 'cap', bits: ['#35e8ff', '#ff4fd8'], paper: ['#f6f1ff', '#d9d0ff'], sparks: ['#bff8ff', '#ff9df0'], shedBits: 0, shedSparks: 1, gravity: 0.12, drag: 0.9, flutter: 0.15, size: 0.42 };

export const spaceSound: LevelSound = {
  id: 'space',
  layers: [
    { name: 'void', at: null, level: c => 0.6 + 0.3 * c.drift(c.t * 0.2, 1.3) },
    // the rush of the flight: more of it in the dark, when it is going faster
    { name: 'rush', at: null, level: c => (0.3 + 0.3 * c.blend) * (0.7 + 0.3 * c.drift(c.t * 0.35, 4.2)) },
    { name: 'signals', at: [-2.5, 0.4, -3], level: c => 0.3 * (0.4 + 0.6 * c.drift(c.t * 0.12, 7.7)) },
  ],
  occasional: [{ name: 'ping', every: [28, 60], volume: 0.4, region: [-12, 12, 0, 6, -30, -14] }],
  // the saber's hum while its blade is out, rising as it is swung
  hum: { level: 0.5, swing: true, fadeIn: 0.1, fadeOut: 0.2 },
};
