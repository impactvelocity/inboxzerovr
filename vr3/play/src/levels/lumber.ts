import type { Vector3 } from 'three';
import { Vector3 as V3 } from 'three';
import type { LetterTheme } from '../letters';
import { createLeaves } from '../props/leaves';
import { paintedDirection, type StageDef } from './backdrop';
import { BOARD, lumberCard } from './lumbercard';
import { W } from './cards';
import { frameSoup } from './shapes';
import type { FxStyle, LevelSound } from './types';

/**
 * LumberHack: an autumn timber yard seen from under a lumberyard porch. Two heavy posts frame the
 * open middle, low rails at the deck's edge, and across the yard, small and dead centre, a red barn
 * with a mail hatch in its doors and a lamp over it; pines and hills behind it, a maple either side.
 * The porch runs off left and right as long covered workshop wings (benches, tools, lanterns, logs,
 * hay). By the end it is night: indigo sky, the lanterns, the barn's lamp and its window the only
 * warm things. The mail is TIMBER POST, notices tacked to pine boards, flung out of the hatch; the
 * weapon is a lumberjack's axe (../weapons/axe.ts). Maple leaves come down through it (../props/leaves.ts).
 *
 * Positions are u, v in public/levels/lumber/start.webp (u 0 left to 1 right over 270 degrees,
 * v 0 bottom to 1 top over 90, the eye line at .48), measured from the painting: the user's
 * repaint in Kyoto's composition and one-point focus (design/lumberjack-kyoto-perspective-v1,
 * light and dark, 2026-11-13). The first paintings, a yard with a chopping bench in front of the
 * seat, are tools/level-src/lumber/start-farm-v1.webp and end-farm-v1.webp.
 */

/** The hatch in the barn doors, where the mail comes from: its direction, and how far off the barn is by the depth model. */
const HATCH = { u: 0.5005, v: 0.436, metres: 9 };
const hatchWay = new V3();

export const lumberStage: StageDef = {
  id: 'lumber', name: 'LumberHack',
  art: ['levels/lumber/start.webp', 'levels/lumber/end.webp'],
  // (the colours of the painting's two edges, so the porch carries on behind)
  rear: ['#6d3118', '#281214'],
  props: createLeaves,
  glsl: /* glsl */ `
    // Laid out as Kyoto's veranda is (../garden.ts), and judged the same way: the deck and the yard one plane 1.2 m
    // under the eye, the porch roof 1.45 m over it, the two inner posts and the deck's rails at its edge about 3.7 m
    // off, the bigger outer posts a little nearer; across the yard the barn at 9 m, the log shed, the hay and the
    // wagon and the two maples nearer towards the sides (about 7 m); the pine wood behind at 22, and the sky not
    // there at all. The wings run off to a vanishing point either side (u .15 and .85), the near benches at the
    // painting's two edges about 2.2 m off. Everything here has soft edges: nothing is cut out as a block (the lab's
    // lesson, 2026-11-13: hard-edged props slide against what is behind them as the head moves).
    float beamAt(float u){ return .69-1.2*(u-.5)*(u-.5); }       // the underside of the front beam, over the opening
    // Open sky, 0 to 1, from the day painting itself (the night one is the same picture relit): sky and cloud are the
    // only things in it with real blue in them (the hills come close, so they are kept out by height).
    float skyAt(vec2 uv){
      float beam=beamAt(uv.x);
      float open=smoothstep(.215,.235,uv.x)*(1.-smoothstep(.765,.785,uv.x))*(1.-smoothstep(beam-.012,beam+.004,uv.y));
      return smoothstep(.40,.55,textureLod(startMap,clamp(uv,0.,1.),1.).b)*smoothstep(.535,.565,uv.y)*open;
    }
    float inverseDepthAt(vec3 d, vec2 uv){
      float level=sqrt(max(0.,1.-d.y*d.y));
      float beam=beamAt(uv.x);
      float opening=band(uv.x,.245,.755)*(1.-smoothstep(beam-.012,beam+.004,uv.y));
      float inv=max(max(-d.y,0.)/1.2,max(d.y,0.)/1.45*(1.-opening));
      // The yard, from the fence line up.
      float yard=opening*smoothstep(.37,.39,uv.y)*(1.-skyAt(uv));
      float low=1.-smoothstep(.45,.47,uv.y);                                                   // fences, hay, the wagon, woodpiles
      float barn=band(uv.x,.435,.567)*(1.-smoothstep(.565,.585,uv.y));
      float shed=1.-smoothstep(.355,.375,uv.x);                                                // the log shed on the left
      shed*=1.-smoothstep(.53,.55,uv.y);
      float maples=smoothstep(.2,.5,oval(uv,vec2(.35,.59),vec2(.10,.12))+oval(uv,vec2(.675,.585),vec2(.06,.10)))
                  +(band(uv.x,.344,.364)+band(uv.x,.666,.684))*(1.-smoothstep(.49,.52,uv.y));   // (and their trunks)
      float near=clamp(max(max(low,barn),max(shed,maples)),0.,1.);
      float standing=mix(1./9.,1./6.8,smoothstep(.06,.18,abs(uv.x-.5)));
      inv=max(inv,yard*level*mix(1./22.,standing,near));
      // The posts and the rails at the deck's edge.
      float upright=smoothstep(.27,.285,uv.y)*(1.-smoothstep(beam,beam+.03,uv.y));
      float posts=band(uv.x,.289,.309)+band(uv.x,.691,.711);
      float bigPosts=band(uv.x,.222,.245)+band(uv.x,.755,.778);
      inv=max(inv,upright*level*max(posts/3.7,bigPosts/3.5));
      float rails=(band(uv.x,.243,.36)+band(uv.x,.642,.759))*band(uv.y,.28,.39);
      inv=max(inv,rails*level/3.7);
      // The wings, nearer the further they are from their vanishing points.
      float wings=1.-smoothstep(.215,.24,uv.x)+smoothstep(.76,.785,uv.x);
      float off=clamp(abs(uv.x-(uv.x<.5?.15:.85))/.15,0.,1.);
      return max(inv,wings*level*mix(1./14.,1./2.2,pow(off,1.3)));
    }
    // Wind in the trees: the two maples' leaves and the pine tops stir, more with the Breeze, in slow gusts.
    // (Kept off the barn's roof, the trunks and the woodpile.)
    vec2 warp(vec2 uv){
      float maples=(oval(uv,vec2(.35,.60),vec2(.085,.09))+oval(uv,vec2(.675,.585),vec2(.05,.075)))*smoothstep(.47,.52,uv.y);
      float pines=band(uv.x,.40,.78)*smoothstep(.47,.51,uv.y)*(1.-smoothstep(.56,.59,uv.y))*(1.-box(uv,vec2(.501,.48),vec2(.068,.097),.012));
      float gust=.5+.5*sin(time*.5+uv.x*5.)*sin(time*.23+1.3);
      vec2 w=vec2(sin(uv.y*46.+time*1.7+uv.x*21.)+.6*sin(uv.x*83.-time*2.3),cos(uv.x*52.+time*1.3+uv.y*17.));
      return uv+w*vec2(.0011,.0007)*(maples+.4*pines)*(.3+breeze*1.5)*(.5+.7*gust);
    }
    // An oil lantern's glow about 1: slow, never a flicker or a strobe (2026-11-13, the lab: "not strobe effects").
    float lantern(float seed){ return 1.+.06*sin(time*1.1+seed)+.04*sin(time*1.7+seed*2.3); }
    vec3 lumberStars(vec3 col, vec2 uv, float sky){
      // Kyoto's stars (../atmosphere.ts): how far the evening has gone decides how many; cloud hides them; now and then one falls.
      float dark=smoothstep(.40,1.,blend)*sky;
      if(dark<=.001) return col;
      float clear=1.-smoothstep(.20,.42,dot(col,vec3(.3,.5,.2)));
      vec2 grid=uv*vec2(560.,187.), cell=floor(grid), within=fract(grid);
      float pick=hash(cell);
      vec2 at=vec2(hash(cell+7.1),hash(cell+13.7))*.6+.2;
      float star=step(.93,pick)*smoothstep(.16,.02,length(within-at));
      float twinkle=.55+.45*sin(time*(1.3+pick*6.)+pick*90.);
      col+=vec3(.86,.90,1.)*star*twinkle*dark*clear*(.35+.65*hash(cell+3.3));
      float slot=floor(time/29.), since=(time-slot*29.)/.85;
      if(since<1.&&blend>.55){
        vec2 from=vec2(.38+.26*hash(vec2(slot,1.)),.625+.035*hash(vec2(slot,2.)));
        vec2 way=vec2((hash(vec2(slot,3.))<.5?-1.:1.)*.050,-.034);
        vec2 head=from+way*since, rel=(uv-head)*vec2(3.,1.), back=-way*vec2(3.,1.)*.45;
        float alongTail=clamp(dot(rel,back)/dot(back,back),0.,1.);
        float streak=exp(-dot(rel-back*alongTail,rel-back*alongTail)*9.0e5)*(1.-alongTail)*sin(since*3.14159);
        col+=vec3(1.,.95,.9)*streak*sky*clear*.9;
      }
      return col;
    }
    vec3 scene(vec3 col, vec2 uv){
      float day=1.-blend;
      float sky=skyAt(uv);
      vec3 amber=vec3(1.,.62,.22);
      // The clouds drift (as Kyoto's do): two copies of the sky slide along, half a turn apart, each fading out before
      // it has gone far. Only sky is taken from a slid copy, so no maple or pine is dragged out into it.
      if(sky>.004){
        float turn=fract(time*.0125);
        vec2 slide=vec2(.03,.002)*(.5+breeze);
        vec2 a=clamp(uv-slide*(turn-.5),0.,1.), b=clamp(uv-slide*(fract(turn+.5)-.5),0.,1.);
        vec3 sa=textureLod(startMap,a,0.).rgb, sb=textureLod(startMap,b,0.).rgb;
        vec3 ca=mix(col,mix(sa,textureLod(endMap,a,0.).rgb,blend),smoothstep(.40,.55,sa.b));
        vec3 cb=mix(col,mix(sb,textureLod(endMap,b,0.).rgb,blend),smoothstep(.40,.55,sb.b));
        col=mix(col,mix(ca,cb,abs(1.-2.*turn)),sky);
      }
      col=lumberStars(col,uv,sky);
      // Thin veils crossing the sky over the painted clouds, and the last light along the ridge breathing a little.
      vec3 haze=mix(vec3(.80,.80,.90),vec3(.15,.14,.32),blend);
      float veil=smoothstep(.30,.78,softNoise(uv*vec2(49.,92.)+vec2(-time*.16,0.))*.72+softNoise(uv*vec2(83.,155.)+vec2(-time*.065,1.7))*.28);
      col=mix(col,haze*1.2,sky*veil*mix(.10,.22,blend));
      col*=1.+sky*(1.-smoothstep(.55,.62,uv.y))*.06*sin(time*.21+uv.x*9.)*(1.-blend*.5);
      // Distance: the pine wood and the hills sit back in a little air, so the barn and the mail stand in front of them.
      float far=band(uv.x,.25,.75)*smoothstep(.45,.49,uv.y)*(1.-smoothstep(.56,.60,uv.y))*(1.-sky)*(1.-box(uv,vec2(.501,.48),vec2(.068,.097),.012));
      col=mix(col,haze,far*mix(.10,.16,blend));
      // By day: cloud shadows crossing the yard, slowly, and the low sun through the maples dappling the ground under them.
      float yardFloor=band(uv.x,.245,.755)*smoothstep(.27,.29,uv.y)*(1.-smoothstep(.37,.395,uv.y));
      float cloud=softNoise(vec2(uv.x*9.+time*.035,uv.y*14.-time*.012))*softNoise(vec2(uv.x*4.-time*.02,uv.y*6.+3.));
      col*=1.-yardFloor*day*.13*smoothstep(.20,.46,cloud);
      float dapple=smoothstep(.62,.9,softNoise(vec2(uv.x*140.+sin(time*.4)*.6,uv.y*260.+time*.15)));
      float shade=oval(uv,vec2(.37,.36),vec2(.07,.03))+oval(uv,vec2(.675,.37),vec2(.045,.025));
      col+=vec3(1.,.82,.5)*dapple*shade*day*.08;
      // Shafts of low sun slanting in from the left through the opening, slowly turning; gone by evening.
      float s=(uv.x-.25)+(uv.y-.3)*.55;
      float shafts=smoothstep(.56,.86,softNoise(vec2(s*38.,time*.06)))*band(uv.x,.25,.75)*smoothstep(.3,.42,uv.y)*(1.-smoothstep(beamAt(uv.x)-.06,beamAt(uv.x),uv.y));
      col+=vec3(1.,.86,.6)*shafts*(1.-sky)*(1.-.6*smoothstep(.4,.6,uv.x))*day*day*.06;
      // Kyoto's mist: a low band over the near yard and a thinner one along the barn's foot. Dust in the sun by day,
      // blue and thicker by night.
      float garden=smoothstep(.30,.35,uv.x)*(1.-smoothstep(.65,.70,uv.x));
      float drift=softNoise(uv*vec2(65.,115.)+vec2(-time*.025,time*.006));
      float driftFar=softNoise(uv*vec2(85.,130.)+vec2(time*.011,0.));
      float mist=garden*(oval(uv,vec2(.5,.33),vec2(.16,.036))*(.10+.16*drift)+oval(uv,vec2(.5,.395),vec2(.12,.022))*(.08+.14*driftFar));
      col=mix(col,mix(vec3(1.,.88,.72),vec3(.30,.32,.58),blend),mist*(.75+.3*blend));
      // The lanterns: the two big ones on the wing walls, the strings of them down each wing, the barn's lamp. What each
      // lights warm breathes with it, far more once it is the only light; each has a soft halo.
      float warm=smoothstep(.05,.28,col.r-col.b)*smoothstep(.20,.55,col.r);
      float wingL=oval(uv,vec2(.08,.59),vec2(.07,.16))*(lantern(.6)-1.)+oval(uv,vec2(.17,.52),vec2(.05,.07))*(lantern(2.4)-1.);
      float wingR=oval(uv,vec2(.92,.594),vec2(.07,.16))*(lantern(4.3)-1.)+oval(uv,vec2(.83,.52),vec2(.05,.07))*(lantern(7.1)-1.);
      float barnLit=(oval(uv,vec2(.5,.46),vec2(.03,.06))+.7*oval(uv,vec2(.5,.385),vec2(.10,.02)))*(lantern(1.7)-1.);
      float boards=(1.-smoothstep(.25,.28,uv.y))*((lantern(.6)+lantern(4.3))*.5-1.);        // their gleam on the deck
      col*=1.+clamp(warm*(wingL+wingR+barnLit*1.6+boards)*mix(1.5,3.2,blend),-.3,.3);
      float halos=oval(uv,vec2(.08,.59),vec2(.012,.03))*lantern(.6)+oval(uv,vec2(.92,.594),vec2(.012,.03))*lantern(4.3)
                 +(oval(uv,vec2(.13,.52),vec2(.005,.012))+oval(uv,vec2(.188,.536),vec2(.006,.014))+oval(uv,vec2(.1795,.516),vec2(.004,.01))+oval(uv,vec2(.172,.502),vec2(.003,.008)))*lantern(2.4)
                 +(oval(uv,vec2(.87,.52),vec2(.005,.012))+oval(uv,vec2(.81,.536),vec2(.006,.014))+oval(uv,vec2(.82,.518),vec2(.004,.01))+oval(uv,vec2(.829,.502),vec2(.003,.008)))*lantern(7.1);
      col+=amber*halos*(.05+.12*blend);
      col+=amber*(oval(uv,vec2(.08,.59),vec2(.05,.12))+oval(uv,vec2(.92,.594),vec2(.05,.12)))*lantern(1.)*.04*blend;
      // The barn lamp over the hatch, and its glow on the doors.
      col+=amber*oval(uv,vec2(.5,.476),vec2(.004,.008))*lantern(1.7)*(.15+.35*blend);
      col+=amber*oval(uv,vec2(.5,.465),vec2(.03,.05))*lantern(1.7)*(.02+.08*blend);
      // The window over it: someone has a fire in, and it shows once it is dark.
      float hearth=1.+.10*sin(time*.9)+.06*sin(time*2.3+1.);
      col*=1.+box(uv,vec2(.5,.527),vec2(.0065,.017),.004)*warm*(hearth-1.)*blend*2.2;
      col+=amber*oval(uv,vec2(.5,.527),vec2(.016,.035))*hearth*.08*blend;
      // The hatch: it glows a little always, and flares as a letter is flung out of it.
      col+=amber*box(uv,vec2(.5005,.436),vec2(.010,.019),.004)*(.03+.08*blend+.5*pulse);
      col+=amber*oval(uv,vec2(.5005,.436),vec2(.03,.05))*(.02*blend+.22*pulse);
      col+=vec3(1.,.9,.7)*oval(uv,vec2(.5005,.43),vec2(.008,.012))*pulse*.4;
      return col;
    }`,
  motes: [
    { name: 'Dust and pollen in the low sun', count: 130, box: [11, 2.6, 7], centre: [0, 1.5, -7.2], size: 13, colour: ['#ffe9b0', '#9fb4ff'], opacity: [0.34, 0.08], rise: 0.01, sway: 0.3, twinkle: 0.5, additive: true },
    // (under the roof: sawdust off the benches, lantern-lit by night)
    { name: 'Sawdust in the porch air', count: 60, box: [7, 2.2, 3.2], centre: [0, 1.35, -1.7], size: 10, colour: ['#ffdcae', '#ffc27a'], opacity: [0.22, 0.2], rise: -0.004, sway: 0.2, twinkle: 0.4, additive: true },
    // Kyoto's warm drifting light motes, out over the yard.
    { name: 'Warm light motes', count: 22, box: [12, 2.4, 7], centre: [0, 1.3, -6.8], size: 34, colour: ['#ffd08a', '#ffae4a'], opacity: [0.1, 0.32], rise: 0.008, sway: 0.5, twinkle: 0.6, additive: true },
    // (they are there all day and cannot be seen: they light as it gets dark)
    { name: 'Fireflies', count: 44, box: [11, 1.5, 6.5], centre: [0, 0.9, -7.2], size: 30, colour: ['#ffe27a', '#e6ff6a'], opacity: [0, 0.85], rise: 0.012, sway: 0.75, twinkle: 1, additive: true },
  ],
  // Real ground mist over the yard beyond the deck: hardly there by day, low and blue by night.
  fog: { cards: 5, from: 4.6, to: 11, width: 10, height: 1.2, colour: ['#ffe6bf', '#8fa6e0'], opacity: [0.03, 0.16] },
  // (the fill is the porch lanterns: steady, with a slow life in it; no fast flutter)
  flicker: time => 1 + 0.05 * Math.sin(time * 1.3 + 0.6) + 0.03 * Math.sin(time * 2.1 + 1.9),
};

export const lumberLetters: LetterTheme = {
  // (special: a golden one, sap gold and maple red)
  special: { colours: ['#ffd23f', '#ff6a2b'], label: 'GOLDEN' },
  id: 'lumber', face: 'paint', paint: lumberCard, shape: () => frameSoup(BOARD / W * 0.5), mechanic: 'cut', title: 'LumberHack', accent: '#ffc440', bar: ['#e8452f', '#ffc440'],
  look: { sheet: '#f7ead0', ink: '#3a2414', back: '#b97a35', selfLit: 0.3, night: '#f0dcc0',
    hover: '#fff0c4', cutWide: '#ffb347', cutHot: '#fff6dc', mark: '#ffe08a', flash: '#fff3cf', gold: '#ffe29a',
    burn: '#ff9a3c', burnStyle: 0, streak: ['#ffc56b', '#ffffff'], thread: ['#ffd98a', '#fffaf0'], aura: ['#ffb347', '#ff7a3a'],
    // (no spell on it: a still warm bloom, so that it stands off the barn, and a few motes of sawdust round its edge)
    spell: { wisps: 0, sparkles: 4, trail: true, glow: 0.16 } },
  // Flung out of the hatch: a speck in the barn doors that is lobbed across the yard, turning over,
  // and settles in front of the player.
  origin(head: Vector3, home: Vector3, from: Vector3, via: Vector3) {
    // (where the backdrop shows the hatch: backdrop.ts; the arc stays under the porch roof, 1.45 m over the eye)
    from.copy(head).addScaledVector(paintedDirection(HATCH.u, HATCH.v, hatchWay), HATCH.metres);
    via.lerpVectors(from, home, 0.5); via.y += 1.0;
    return { scale: 1, pose: 'tumble' as const, seconds: 1.15, ease: 2.6, sway: 0.1 };
  },
};

// What a chop throws out: splinters of pine, which fall as wood does, and sawdust bright in the sun.
export const lumberFx: FxStyle = { bit: 'shard', bits: ['#d9933f', '#8a5a3a'], paper: ['#f7ead0', '#b9b1c8'], sparks: ['#ffd98a', '#ffc27a'], shedBits: 0, shedSparks: 0.6, gravity: 3.2, drag: 1.0, flutter: 0.3, size: 1.1 };

export const lumberSound: LevelSound = {
  id: 'lumber',
  // round two begins with the user's own sting (2026-11-13; tools/level-src/lumber/lumber-stinger-wold.mp3, set to -3 dBFS)
  // No round-two stinger: the owl below is that moment (2026-11-13: "round 2 stinger for lumber, add back the owl sound instead of what I
  // have"). The stingers tried are in tools/level-src/lumber (lumber-stinger-wold.mp3, lumber-stinger-loon.mp3); public/audio/lumber/stinger2.wav
  // is the wold one, faded in, if it comes back: roundStinger: { name: 'stinger2', volume: 0.9 }.
  layers: [
    // the air of the yard: a breeze in the pines, all round
    // (down by about a third on 2026-11-13, "reduce the wind a bit": it was 0.5 + 0.3)
    { name: 'yard', at: null, level: c => 0.34 + 0.2 * c.drift(c.t * 0.25, 1.9) },
    // the maple across the yard to the left: its leaves answer the wind
    { name: 'leaves', at: [-5.2, 2.6, -6], level: c => 0.2 + 0.45 * c.drift(c.t * 0.4, 5.3) },
    // birds beyond the barn by day, gone by dark; crickets come in as they go
    { name: 'birds', at: [3.5, 2.2, -9], level: c => 0.55 * Math.max(0, 1 - c.blend * 1.6) * (0.5 + 0.5 * c.drift(c.t * 0.15, 8.1)) },
    { name: 'crickets', at: null, level: c => 0.5 * Math.max(0, (c.blend - 0.25) / 0.75) },
  ],
  occasional: [
    { name: 'crow', every: [34, 80], volume: 0.4, region: [-14, 14, 4, 9, -30, -14] },
    { name: 'woodpecker', every: [40, 95], volume: 0.4, region: [4, 12, 2, 6, -22, -12] },
    { name: 'creak', every: [45, 100], volume: 0.4, region: [-1, 1, 0.3, 1.8, -9.5, -8.5] },      // (the barn's doors, 9 m off)
    { name: 'chop', every: [50, 110], volume: 0.45, region: [-9, -5, 0, 1, -8, -4] },
  ],
  // (an axe does not hum)
  hum: null,
  // The first round over, and night coming on: an owl, in the pines to the left.
  afterRound: [{ round: 1, sounds: [{ name: 'owl', delay: 1.4, volume: 0.8, at: [-5, 3.5, -13] }] }],
};
