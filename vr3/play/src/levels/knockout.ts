import * as THREE from 'three';
import type { LetterTheme, PunchFeel } from '../letters';
import type { StageContext, StageDef, StageProps } from './backdrop';
import { knockoutCard } from './knockoutcard';
import type { FxStyle, LevelSound } from './types';

/**
 * Knockout: the main event, from inside the ring. The mail is the evening paper flung in over the
 * ropes; the weapon is a boxing glove, and nothing is cut: it is punched. A jab dents it and sends
 * it flying across the ring, off the ropes and the canvas; a real punch breaks it up; one sent over
 * the top rope goes into the crowd. The crowd answers all of it (camera flashes, cheering).
 *
 * Positions are u, v in public/levels/knockout/start.webp (see office.ts). The painting has the
 * ropes at a constant height all the way round, so wrapped round the player they are a round ring:
 * three metres from the seat, with the canvas 1.2 m under the eye. The punch's numbers (`punch`,
 * below) use the same ring, so what flies bounces off the ropes that are painted.
 */

/** Everything about how a punch feels, in one place. */
export const knockoutPunch: PunchFeel = {
  speed: 1.1,             // m/s the glove must be moving for a hit to count (a hand just lifted does nothing)
  full: 5.5,              // and the speed of a punch at full strength
  into: 0.2,              // how squarely it must be heading for the thing (1: dead on; 0: any way but backwards)
  glove: 0.09,            // the glove's size as a hit box: metres round the front of the knuckles
  reach: 1.15,            // a fast punch carries this far past the glove (a seated arm is short, and letters wait 1.5 m off)
  reachSpeed: 1.7,        // m/s for that to count
  widen: 0.2,             // the hit box grows this much for every metre out
  hard: 0.4,              // strength (0 to 1) at which a punch is a knockout: the letter breaks up (about 2.9 m/s)
  hits: 3,                // a letter that has taken this many lighter hits breaks on the next whatever its strength
  launch: [2.6, 8.5],     // m/s it leaves at: the lightest jab, a full punch
  lift: [1.0, 1.7],       // and how much of that is upwards, m/s (so it hangs long enough to be hit again)
  carry: 0.7,             // how much of its way is the punch's own (the rest is straight down the ring, away from the seat)
  spin: 10,               // rad/s of tumble from a hit at the letter's edge
  gravity: 5.2,           // m/s2: a little floaty
  drag: 0.3,
  ropes: { radius: 3.0, top: 1.45, bounce: 0.62 },      // the ring: metres from the seat, the top rope's height over the canvas, how much speed a bounce keeps
  floor: { drop: 1.2, bounce: 0.38, grip: 0.55 },       // the canvas: metres under the eye, and what a bounce off it keeps (up, along)
  out: 4.4,               // further than this from the seat, it is in the crowd
  dent: [0.028, 0.06],    // metres deep: a jab's, a full punch's
  dentRadius: 0.085,
  hitStop: [0.035, 0.11], // seconds everything holds still as it lands
  // What each does to the crowd (0 to 1), and how fast they calm down, per second. One knockout has them about half way up;
  // it takes a run of them, or a letter sent whole over the ropes, to bring the house down.
  hype: { jab: 0.12, ko: 0.34, ropes: 0.04, out: 0.45, fade: 0.16 },
  words: ['POW!', 'BAM!', 'WHAM!', 'K.O.!'],
  wordColours: ['#ffd24a', '#ff5a5a', '#7db4ff'],
};

/** The four banks of floodlights: u, v, and where each one's light comes down on the canvas (metres from the seat's feet). */
const BANKS: { u: number; v: number; lands: [number, number]; power: number }[] = [
  { u: 0.3035, v: 0.907, lands: [-1.7, -2.3], power: 0.7 },
  { u: 0.430, v: 0.843, lands: [-0.55, -2.5], power: 1 },
  { u: 0.566, v: 0.843, lands: [0.55, -2.5], power: 1 },
  { u: 0.696, v: 0.907, lands: [1.7, -2.3], power: 0.7 },
];

/**
 * The level's real things: the floodlights' shafts standing in the ring's haze (four soft additive
 * sheets from the lamps down to the canvas, so that they move against the painting as the head
 * does), and the painting's answers to what the game does: `spot` where a rope has been hit, `lamp`
 * for a storm of flashbulbs after a knockout.
 */
function knockoutProps(context: StageContext): StageProps {
  const group = new THREE.Group(); group.name = 'Knockout: floodlight shafts';
  const eye = new THREE.Vector3(0, 1.2, 0), position: number[] = [], uv: number[] = [], power: number[] = [], index: number[] = [];
  BANKS.forEach((bank, i) => {
    // the lamp, seven metres off along its painted direction, and where its light lands
    const bearing = (bank.u - 0.5) * 4.71238898, up = (bank.v - 0.48) * 1.57079633, away = 7;
    const lamp = new THREE.Vector3(Math.sin(bearing) * away, 1.2 + Math.tan(up) * away, -Math.cos(bearing) * away), foot = new THREE.Vector3(bank.lands[0], 0.02, bank.lands[1]);
    const middle = lamp.clone().lerp(foot, 0.6), side = foot.clone().sub(lamp).cross(middle.sub(eye)).normalize();
    for (const [at, half, v] of [[lamp, 0.22, 0], [foot, 0.95, 1]] as const) for (const s of [-1, 1]) {
      position.push(at.x + side.x * half * s, at.y + side.y * half * s, at.z + side.z * half * s); uv.push(s * 0.5 + 0.5, v); power.push(bank.power);
    }
    index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('power', new THREE.Float32BufferAttribute(power, 1));
  geometry.setIndex(index);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, level: { value: 0 }, tint: { value: new THREE.Color() } },
    vertexShader: 'attribute float power; varying vec2 at; varying float strength; void main(){ at=uv; strength=power; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: /* glsl */ `
      uniform float time,level; uniform vec3 tint; varying vec2 at; varying float strength;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y); }
      void main(){
        float across=(at.x-.5)*2.;
        // soft at its edges, gone at the lamp and at the canvas, and dust drifting slowly down it
        float body=exp(-across*across*3.2)*(1.-across*across);
        float ends=smoothstep(0.,.16,at.y)*(1.-smoothstep(.72,1.,at.y));
        float dust=.55+.45*noise(vec2(at.x*5.+strength*7.,at.y*9.-time*.12))*noise(vec2(at.x*11.-time*.05,at.y*23.+time*.2))*2.;
        gl_FragColor=vec4(tint,max(0.,body)*ends*dust*level*strength);
        #include <colorspace_fragment>
      }`,
  });
  const shafts = new THREE.Mesh(geometry, material); shafts.name = 'Four shafts of floodlight'; shafts.frustumCulled = false; shafts.renderOrder = -4; group.add(shafts);
  const warm = new THREE.Color('#fff0d2'), cool = new THREE.Color('#a9c6ff'), to = new THREE.Vector3();
  let flash = 0, seatAt: THREE.Vector3 | null = null;
  return {
    group,
    update(dt, c) {
      // the shafts stand on the painted canvas, 1.2 m under where the player sat down
      group.position.set(c.seat.x, c.seat.y - 1.2, c.seat.z); seatAt = c.seat;
      flash *= Math.exp(-dt * 2.2); context.lamp.value = flash;
      context.spot.z *= Math.exp(-dt * 3.4);
      material.uniforms.time.value = c.time;
      material.uniforms.level.value = 0.05 + 0.13 * c.blend + 0.07 * flash;
      (material.uniforms.tint.value as THREE.Color).copy(warm).lerp(cool, c.blend);
    },
    onLetter(kind, at) {
      if (kind === 'ko') flash = Math.max(flash, 0.7);
      else if (kind === 'out') flash = 1;
      else if (kind === 'ropes' && seatAt) {
        // where on the painting that is: the same wrap the painting itself is drawn with
        to.copy(at).sub(seatAt).normalize();
        context.spot.set(0.5 + Math.atan2(to.x, -to.z) / 4.71238898, 0.48 + Math.asin(Math.max(-1, Math.min(1, to.y))) / 1.57079633, 1);
      }
    },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}

export const knockoutStage: StageDef = {
  id: 'knockout', name: 'Knockout',
  art: ['levels/knockout/start.webp', 'levels/knockout/end.webp'],
  rear: ['#3a3f86', '#0b0c2a'],
  props: knockoutProps,
  glsl: /* glsl */ `
    // The four banks of floodlights: u, v, and their half sizes.
    const vec4 BANK_A=vec4(.3035,.907,.036,.055), BANK_B=vec4(.430,.843,.042,.040), BANK_C=vec4(.566,.843,.042,.040), BANK_D=vec4(.696,.907,.036,.055);
    // The ropes (top, middle, bottom) between the two posts.
    const vec3 ROPES=vec3(.508,.426,.339);
    float inverseDepthAt(vec3 d, vec2 uv){
      float level=sqrt(max(0.,1.-d.y*d.y));
      // the canvas 1.2 m under the eye, the lighting trusses six and a half over it
      float inv=max(max(-d.y,0.)/1.2,max(d.y,0.)/6.5);
      // the hall: the front rows nine metres off, the back of the upper tier more than twenty
      inv=max(inv,level/mix(9.,22.,smoothstep(.30,.78,uv.y)));
      // the ropes and the two corner posts, three metres from the seat all the way round
      float between=band(uv.x,.159,.8415);
      float ropes=between*(band(uv.y,ROPES.x-.011,ROPES.x+.012)+band(uv.y,ROPES.y-.012,ROPES.y+.012)+band(uv.y,ROPES.z-.012,ROPES.z+.012));
      float posts=(band(uv.x,.1125,.159)+band(uv.x,.8415,.8875))*band(uv.y,.25,.63);
      return max(inv,min(1.,ropes+posts)*level/3.);
    }
    // The painting is read from a little off where it is looked at: the crowd is never quite still,
    // and a rope that has been hit sings.
    vec2 warp(vec2 uv){
      vec2 w=uv;
      float excited=clamp(hot+lamp,0.,1.);
      float stands=smoothstep(.535,.57,uv.y)*(1.-smoothstep(.74,.79,uv.y));
      float who=hash(vec2(floor(uv.x*520.),floor(uv.y*64.)));
      w.y+=stands*(.0005+.0022*excited)*sin(time*(3.+5.*who)+who*40.);
      float rope=exp(-pow((uv.y-ROPES.x)/.03,2.))+exp(-pow((uv.y-ROPES.y)/.03,2.))+exp(-pow((uv.y-ROPES.z)/.03,2.));
      float span=smoothstep(.16,.20,uv.x)*(1.-smoothstep(.80,.84,uv.x));
      float near=exp(-pow((uv.x-spot.x)/.15,2.));
      w.y+=rope*span*near*spot.z*.011*sin(time*44.)*cos((uv.x-spot.x)*26.);
      return w;
    }
    float shaft(vec2 uv, vec2 lamp_, float lean, float spread){
      float fall=lamp_.y-uv.y;
      float across=(uv.x-lamp_.x-lean*fall)/(.012+spread*max(fall,0.));
      return exp(-across*across)*smoothstep(.02,.14,fall)*(1.-smoothstep(.48,.70,fall));
    }
    vec3 scene(vec3 col, vec2 uv){
      float lum=dot(col,vec3(.3,.5,.2));
      float excited=clamp(hot+lamp,0.,1.);
      vec3 cool=vec3(.72,.84,1.);
      // The floodlights: on the mains, and flaring when the crowd is up or mail comes in.
      float bulbs=smoothstep(.72,.95,lum)*smoothstep(.76,.80,uv.y);
      col*=1.+bulbs*(.035*sin(time*47.)+.10*excited+.22*pulse);
      float halo=oval(uv,BANK_A.xy,BANK_A.zw*1.7)+oval(uv,BANK_B.xy,BANK_B.zw*1.7)+oval(uv,BANK_C.xy,BANK_C.zw*1.7)+oval(uv,BANK_D.xy,BANK_D.zw*1.7);
      col+=cool*halo*(.03+.05*blend+.10*excited)*(1.+.08*sin(time*3.1+uv.x*20.));
      // Their light coming down through the haze, dust drifting in it (the nearer shafts are real: the level's props).
      float dust=softNoise(uv*vec2(120.,52.)+vec2(time*.07,-time*.11))*softNoise(uv*vec2(46.,21.)-vec2(time*.04,time*.05));
      float shafts=shaft(uv,BANK_B.xy,.10,.085)+shaft(uv,BANK_C.xy,-.10,.085)+.7*(shaft(uv,BANK_A.xy,.32,.075)+shaft(uv,BANK_D.xy,-.32,.075));
      col+=cool*shafts*(.25+dust*1.5)*(.03+.07*blend+.06*excited);
      // The crowd: flashbulbs. A few all the time; a storm of them after a knockout.
      float stands=smoothstep(.535,.56,uv.y)*(1.-smoothstep(.75,.79,uv.y))*(1.-bulbs)*smoothstep(.10,.13,uv.x)*(1.-smoothstep(.87,.90,uv.x));
      vec2 grid=uv*vec2(260.,96.), cell=floor(grid), f=fract(grid)-.5;
      float slot=floor(time*8.), age=fract(time*8.);
      float lim=sqrt(.00008+.0012*hot+.006*lamp);
      float h1=fract(sin(dot(cell+slot*vec2(17.31,9.7),vec2(12.9898,78.233)))*437.5853);
      float h2=fract(sin(dot(cell.yx+slot*vec2(3.17,29.3),vec2(39.346,11.135)))*311.7137);
      float pop=step(1.-lim,h1)*step(1.-lim,h2)*stands;
      col+=vec3(1.,.97,.9)*pop*(exp(-dot(f,f)*14.)*(1.-age*age)*2.4+exp(-dot(f,f)*2.5)*(1.-age)*.5);
      // and all of the stands lift a little when they are on their feet
      col*=1.+stands*(.10*excited+.06*lamp);
      // The LED boards at the sides: light running along them.
      float boards=(1.-smoothstep(.10,.115,uv.x)+smoothstep(.885,.90,uv.x))*band(uv.y,.62,.86);
      col*=1.+boards*.14*sin(time*1.6+uv.x*60.+uv.y*20.);
      // The canvas: a pool of light in the middle that brightens as mail comes into the ring, and
      // the two corners' colours once the house lights are down.
      col+=cool*oval(uv,vec2(.5,.13),vec2(.20,.10))*(.03*blend+.13*pulse+.05*excited);
      col+=vec3(1.,.16,.22)*oval(uv,vec2(.16,.18),vec2(.10,.14))*blend*(.05+.04*sin(time*1.3));
      col+=vec3(.16,.35,1.)*oval(uv,vec2(.84,.18),vec2(.10,.14))*blend*(.05+.04*sin(time*1.3+2.));
      // A rope that has just been hit: a flash where it was.
      col+=vec3(1.,.93,.8)*oval(uv,spot.xy,vec2(.045,.06))*spot.z*.4;
      return col;
    }`,
  motes: [
    { name: 'Dust in the floodlights', count: 230, box: [9, 4.2, 8], centre: [0, 2.3, -3.6], size: 14, colour: ['#fff4dc', '#bcd0ff'], opacity: [0.2, 0.36], rise: -0.012, sway: 0.3, twinkle: 0.5, additive: true },
    { name: 'Chalk off the canvas', count: 60, box: [5, 0.9, 5], centre: [0, 0.5, -2.6], size: 18, colour: ['#e6ecff', '#8ea4ff'], opacity: [0.1, 0.22], rise: 0.03, sway: 0.25, twinkle: 0.4, additive: true },
    // (round two is the final round: gold starts to fall)
    { name: 'Gold falling for the final round', count: 70, box: [8, 4.2, 7], centre: [0, 2.4, -3.6], size: 15, colour: ['#ffd76a', '#ffcf5a'], opacity: [0, 0.5], rise: -0.16, sway: 0.5, twinkle: 0.9, additive: true },
  ],
  // The arena's haze, standing in the ring in sheets: thin under the broadcast lights, thick and blue once the house goes dark.
  fog: { cards: 5, from: 2.4, to: 7, width: 8, height: 2.6, colour: ['#fff0d6', '#6f7dff'], opacity: [0.045, 0.15] },
  flicker: (time, blend) => 1 + 0.05 * Math.sin(time * 2.1) + blend * 0.08 * Math.sin(time * 9) * Math.sin(time * 5.3),
};

/**
 * The evening paper, folded: a slab with a finely divided face, so that where it is punched it can
 * be seen to give (the dent is made by the letter's shader, by where on the sheet a corner is, so
 * it needs corners to move: 16 by 10 of them a side).
 */
function newspaperSoup(): Float32Array {
  const W = 0.5, H = 0.3125, columns = 16, rows = 10, thick = 0.011, out: number[] = [];
  type P = [number, number, number];
  const quad = (a: P, b: P, c: P, d: P) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const n = Math.hypot(nx, ny, nz) || 1; nx /= n; ny /= n; nz /= n;
    for (const p of [a, b, c, a, c, d]) out.push(p[0], p[1], p[2], nx, ny, nz, p[0] / W + 0.5, p[1] / H + 0.5);
  };
  // a sheet that has been folded and carried: bowed a little across, a soft crease along its middle
  const z = (x: number, y: number) => 0.007 * (1 - (2 * x / W) ** 2) - 0.004 * Math.exp(-((y / 0.02) ** 2)) + 0.0025 * Math.sin(x * 31 + y * 17);
  const at = (i: number, j: number, front: boolean): P => { const x = -W / 2 + W * i / columns, y = -H / 2 + H * j / rows; return [x, y, z(x, y) + (front ? thick / 2 : -thick / 2)]; };
  for (let i = 0; i < columns; i++) for (let j = 0; j < rows; j++) {
    quad(at(i, j, true), at(i + 1, j, true), at(i + 1, j + 1, true), at(i, j + 1, true));
    quad(at(i + 1, j, false), at(i, j, false), at(i, j + 1, false), at(i + 1, j + 1, false));
  }
  // its edges, divided as the faces are, so that a dent at the edge does not open it
  for (let i = 0; i < columns; i++) { quad(at(i, 0, false), at(i + 1, 0, false), at(i + 1, 0, true), at(i, 0, true)); quad(at(i + 1, rows, false), at(i, rows, false), at(i, rows, true), at(i + 1, rows, true)); }
  for (let j = 0; j < rows; j++) { quad(at(0, j + 1, false), at(0, j, false), at(0, j, true), at(0, j + 1, true)); quad(at(columns, j, false), at(columns, j + 1, false), at(columns, j + 1, true), at(columns, j, true)); }
  return new Float32Array(out);
}

export const knockoutLetters: LetterTheme = {
  special: { colours: ['#ffd23f', '#ff2d55'], label: 'TITLE BOUT' },
  id: 'knockout', face: 'paint', paint: knockoutCard, shape: newspaperSoup, mechanic: 'punch', punch: knockoutPunch, title: 'Knockout', accent: '#ffcf4a', bar: ['#ff3b3b', '#3b7bff'],
  // Newsprint that carries a little light of its own, so it reads once the house lights are down; gold where it is hit.
  look: { sheet: '#f6e8c8', ink: '#1d1712', back: '#e2cfa0', selfLit: 0.3, night: '#c9d2ff',
    hover: '#fff2c9', cutWide: '#ffd24a', cutHot: '#fffbe8', mark: '#ffe08a', flash: '#fff6d8', gold: '#ffe29a',
    burn: '#ffcf4a', burnStyle: 0, streak: ['#ffd24a', '#ffffff'], thread: ['#ffd98a', '#fffaf0'], aura: ['#ffcf4a', '#ff6a5a'],
    spell: { wisps: 0.1, sparkles: 0, trail: false, glow: 0.2 } },
};

export const knockoutFx: FxStyle = { bit: 'star', bits: ['#ffd24a', '#ffe9a8'], paper: ['#f6e8c8', '#c9cff0'], sparks: ['#fff1c4', '#9fc0ff'], shedBits: 0, shedSparks: 0.2, gravity: 2.4, drag: 0.9, flutter: 0.3, size: 0.75 };

export const knockoutSound: LevelSound = {
  id: 'knockout',
  layers: [
    // the house: always there, a little quieter once the lights are down and everyone is watching
    { name: 'crowd', at: null, level: c => (0.7 - 0.2 * c.blend) * (0.75 + 0.25 * c.drift(c.t * 0.2, 1.3)) },
    // and on their feet: `hot` here is how worked up the punches have got them (letters.ts' hype)
    { name: 'cheer', at: null, level: c => 0.03 + 0.95 * c.hot * c.hot },
  ],
  occasional: [
    { name: 'whistle', every: [14, 34], volume: 0.4, region: [-9, 9, 1, 3, -14, -8] },
    { name: 'shout', every: [18, 42], volume: 0.4, region: [-10, 10, 0.5, 3, -13, -7] },
    { name: 'cameras', every: [16, 38], volume: 0.35, region: [-4, 4, -0.8, -0.3, -5, -3.6] },
  ],
  hum: null,
  // The first round over: the bell.
  afterRound: [{ round: 1, sounds: [{ name: 'bell3', delay: 0.1, volume: 0.9, at: [1.8, -0.7, -3.3] }] }],
};
