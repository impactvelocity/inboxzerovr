import type { Vector3 } from 'three';
import type { LetterTheme } from '../letters';
import { createWarp } from '../props/warp';
import type { StageDef } from './backdrop';
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
 */

/** Where the flight is headed, and so where the mail comes from: the middle of the painting, this far off. */
const AHEAD = { v: 0.5, metres: 26 };

export const spaceStage: StageDef = {
  id: 'space', name: 'Super Space',
  art: ['levels/space/start.webp', 'levels/space/end.webp'],
  // (the colours of the painting's two edges, so the sky carries on behind)
  rear: ['#261c46', '#040313'],
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
    }`,
  motes: [
    // soft lights hanging close by, hardly moving: the only round things in it, and the nearest
    { name: 'Stardust by the seat', count: 46, box: [11, 5, 9], centre: [0, 1.7, -3.5], size: 20, colour: ['#b9a8ff', '#ff8ae6'], opacity: [0.16, 0.3], rise: 0.004, sway: 0.35, twinkle: 0.9, additive: true },
  ],
  flicker: time => 1 + 0.08 * Math.sin(time * 0.9) + 0.04 * Math.sin(time * 5.3),
};

export const spaceLetters: LetterTheme = {
  id: 'space', face: 'paint', paint: spaceCard, shape: paneSoup, mechanic: 'cut', title: 'Super Space', accent: '#35e8ff', bar: ['#ff3fc8', '#35e8ff'],
  look: { sheet: '#f6f1ff', ink: '#1b1440', back: '#4a1c5e', selfLit: 1, night: '#f1ecff',
    hover: '#d9fbff', cutWide: '#35e8ff', cutHot: '#ffffff', mark: '#ffe9a0', flash: '#eaffff', gold: '#fff0b8',
    // it goes in blocks, as pixels would, with a magenta edge
    burn: '#ff4fd8', burnStyle: 1, streak: ['#7df3ff', '#ffffff'], thread: ['#ff9be9', '#fff5fd'], aura: ['#27d9ff', '#c04dff'],
    spell: { wisps: 0.16, sparkles: 5, trail: true, glow: 0.55 } },
  // Out of the distance dead ahead: a speck where the flight is headed, which rushes up and brakes
  // hard in front of the player, leaving lights behind it.
  origin(head: Vector3, home: Vector3, from: Vector3, via: Vector3) {
    const up = (AHEAD.v - 0.48) * 1.57079633;
    from.set(head.x + (home.x - head.x) * 0.4, head.y + Math.sin(up) * AHEAD.metres, head.z - Math.cos(up) * AHEAD.metres);
    via.lerpVectors(from, home, 0.55);
    return { scale: 1, pose: 'face' as const, seconds: 1.5, ease: 3, sway: 0.06 };
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
