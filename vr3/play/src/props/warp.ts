import * as THREE from 'three';
import { settings } from '../garden';
import type { RoundProgress, StageContext, StageProps } from '../levels/backdrop';

/**
 * Super Space's flight: the seat is travelling, and space goes by. The painting behind is the far
 * sky and stands still; everything here is real, in the air round the player, and comes out of the
 * distance ahead, passes, and is gone behind:
 *
 *   dust      small square stars, white and lavender, at every distance
 *   lanes     the painting's dithered nebula bands made real: rivers of violet and magenta pixels
 *             that wind past on either side
 *   stars     a few big four-pointed pixel stars, far out, that take a long time to go by
 *   streaks   thin lines of light that zoom past, longer the faster the flight
 *   comets    now and then one crosses the sky ahead, a pink head and a broken trail
 *
 * How fast it all goes follows the game: slow while a round is counted in, a jump to speed as the
 * round begins, a steady cruise through it (quicker in round two), a nudge with every cut.
 *
 * Nothing comes down the middle: there is a clear corridor round the seat and straight ahead of
 * it, which is where the mail is. And since the deck (2026-11-13, levels/space.ts) nothing comes
 * through the ship: inside the deck's room (ROOM) it fades away, and outside it the deck's walls and
 * ceiling hide it (they write their depth), so it is seen only through the glass. Three draws, and a fourth while a comet is in the sky; all of the
 * flight is worked out in the shaders, from one number (how far the seat has travelled).
 * The Motion setting stops it.
 */
const FAR = 90, BEHIND = 14, RANGE = FAR + BEHIND;      // metres ahead it appears at, and behind the seat it is gone by
const CRUISE = 5.5;                                      // metres a second at speed 1
const CLEAR = 1.9;                                       // nothing passes nearer the line of flight than this
const DUST = 900, LANES = 6, PER_LANE = 440, STARS = 44, STREAKS = 300;
const COMETS = 3, TAIL = 11;
/** How fast, by what the game is doing (1 is the cruise). */
const PACE = { idle: 0.4, intro: 0.2, round1: 1, round2: 1.45, summary: 0.55 };
const JUMP = 4.5;                                        // what a jump adds at its height, and it dies away in about a second
/** The deck's room, metres from the seat's eye: the big window is 5 m ahead, the aisles run 15 m either side, floor 1.2 m down, ceiling 2.2 m up (with a little to spare). */
const ROOM = { ahead: 5.4, across: 15, down: 1.5, up: 2.6 };

export function createWarp(context: StageContext): StageProps {
  const group = new THREE.Group(); group.name = 'Warp: the flight through space';
  let seed = 51977;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };

  // ---------------------------------------------------------------- dust, lanes and stars: one cloud of square points
  const count = DUST + LANES * PER_LANE + STARS;
  const place = new Float32Array(count * 3), lane = new Float32Array(count * 3), seeds = new Float32Array(count), kinds = new Float32Array(count);
  let n = 0;
  const put = (x: number, y: number, kind: number, l: [number, number, number] = [0, 0, 0]) => {
    place.set([x, y, random()], n * 3); lane.set(l, n * 3); seeds[n] = random(); kinds[n] = kind; n++;
  };
  for (let i = 0; i < DUST; i++) { const r = CLEAR + 24 * random() ** 1.5, a = random() * 6.2832; put(Math.cos(a) * r, Math.sin(a) * r, 0); }
  for (let l = 0; l < LANES; l++) {
    // a lane: a line through the air that winds as it comes (its angle round the line of flight, how far out, where in its winding)
    const line: [number, number, number] = [l / LANES * 6.2832 + random() * 0.6, 5.5 + random() * 7, random() * 6.2832];
    for (let i = 0; i < PER_LANE; i++) {
      // thick in the middle, thin at the edges, and wider across than it is deep
      const spread = (random() + random() + random() - 1.5) * 1.25, depth = (random() + random() - 1) * 0.45;
      put(spread, depth, 1, line);
    }
  }
  for (let i = 0; i < STARS; i++) { const r = 11 + 34 * random(), a = random() * 6.2832; put(Math.cos(a) * r, Math.sin(a) * r * 0.75 + 3, 2); }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(place, 3));
  dustGeometry.setAttribute('lane', new THREE.Float32BufferAttribute(lane, 3));
  dustGeometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));
  dustGeometry.setAttribute('kind', new THREE.Float32BufferAttribute(kinds, 1));
  const shared = { travel: { value: 0 }, time: { value: 0 }, blend: { value: 0 }, warp: { value: PACE.idle }, viewHalf: { value: 400 }, flash: { value: 0 } };
  const flight = /* glsl */ `
    const float FAR=${FAR.toFixed(1)}, BEHIND=${BEHIND.toFixed(1)}, RANGE=${RANGE.toFixed(1)};
    uniform float travel,time,blend,warp,viewHalf,flash;
    // where along the flight something is: it comes from FAR ahead (-z), passes, and at BEHIND starts again
    float along(float phase, float pace){ return mod(phase*RANGE+travel*pace,RANGE)-FAR; }
    // (It is not there at all until it is 'from' metres off: seen from the seat, everything far ahead is in
    // one small patch of sky dead ahead, which is where the mail is, and that patch is to stay quiet.)
    float ends(float z, float from){ return smoothstep(-from,-from*.45,z)*(1.-smoothstep(BEHIND-5.,BEHIND,z)); }
    // 0 inside the deck (fading out over the last 2 m before the glass), 1 outside it
    float outside(vec3 p){
      float within=step(abs(p.x),${ROOM.across.toFixed(1)})*step(-${ROOM.down.toFixed(1)},p.y)*step(p.y,${ROOM.up.toFixed(1)});
      return 1.-within*smoothstep(-${(ROOM.ahead + 2).toFixed(1)},-${ROOM.ahead.toFixed(1)},p.z);
    }`;
  const dustMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: shared,
    vertexShader: /* glsl */ `
      attribute vec3 lane; attribute float seed,kind; varying vec3 tint; varying float alpha; varying float star;
      ${flight}
      void main(){
        float z=along(position.z,.8+.4*seed);
        vec3 p=vec3(position.xy,z);
        if(kind>.5&&kind<1.5){
          // a lane winds round the line of flight as it comes, and its dust is strewn about its middle
          float a=lane.x+.42*sin(z*.045+lane.z)+z*.005;
          vec2 out_=vec2(cos(a),sin(a));
          p.xy=out_*(lane.y+position.y)+vec2(-out_.y,out_.x)*position.x;
        }
        vec4 mv=modelViewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*mv;
        float metres=kind>1.5?.55+.6*seed:kind>.5?.05+.08*seed:.035+.05*seed;
        float most=kind>1.5?52.:9.;
        gl_PointSize=clamp(metres*projectionMatrix[1][1]*viewHalf/max(.1,gl_Position.w),1.5,most);
        float glint=.5+.5*sin(time*(.9+3.6*seed)+seed*90.);
        star=kind>1.5?1.:0.;
        if(kind>1.5){
          tint=mix(vec3(.90,.86,1.),vec3(.72,.94,1.),blend*step(.5,seed));
          alpha=(.55+.45*glint)*mix(.75,1.,blend);
        } else if(kind>.5){
          // violet at the start; in the dark it comes alive, magenta with a little cyan in it
          vec3 lit=seed>.86?vec3(.25,.92,1.):mix(vec3(1.,.22,.80),vec3(.62,.30,1.),fract(seed*7.));
          tint=mix(vec3(.50,.40,.92),lit,blend);
          alpha=mix(.34,.7,blend)*(.6+.4*glint)*(1.+1.5*flash);
        } else {
          tint=mix(vec3(1.),vec3(.72,.66,1.),fract(seed*5.));
          alpha=(.45+.4*glint)*mix(.8,1.,blend);
        }
        alpha*=ends(z,kind>1.5?FAR:kind>.5?46.:60.)*outside(p);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 tint; varying float alpha; varying float star;
      void main(){
        vec3 col=tint; float a=alpha;
        if(star>.5){
          // a four-pointed star, as pixel art: seven cells by seven, the middle lit, the arms dying away, a little light round the middle
          vec2 c=floor(gl_PointCoord*7.)-3.;
          float reach=max(abs(c.x),abs(c.y));
          float arm=(c.x==0.||c.y==0.)?1.-reach/3.7:0.;
          float round_=reach<1.5?.38:0.;
          a*=max(arm,round_);
          col=mix(tint,vec3(1.),step(reach,.5));
        }
        if(a<.012) discard;
        gl_FragColor=vec4(col,a);
        #include <colorspace_fragment>
      }`,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial); dust.name = `${count} stars, lane dust and far stars`; dust.frustumCulled = false; dust.renderOrder = -6;
  group.add(dust);

  // ---------------------------------------------------------------- streaks: thin lines that zoom past
  const streakGeometry = new THREE.InstancedBufferGeometry();
  // a strip from the tail (y 0) to the head (y 1), turned to face the eye in the shader
  streakGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
  const base = new Float32Array(STREAKS * 3), streakSeed = new Float32Array(STREAKS * 2);
  for (let i = 0; i < STREAKS; i++) {
    const r = CLEAR + 0.4 + 15 * random() ** 1.4, a = random() * 6.2832;
    base.set([Math.cos(a) * r, Math.sin(a) * r, random()], i * 3); streakSeed.set([random(), random()], i * 2);
  }
  streakGeometry.setAttribute('base', new THREE.InstancedBufferAttribute(base, 3));
  streakGeometry.setAttribute('seeds', new THREE.InstancedBufferAttribute(streakSeed, 2));
  streakGeometry.instanceCount = STREAKS;
  const streakMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: shared,
    vertexShader: /* glsl */ `
      attribute vec3 base; attribute vec2 seeds; varying float run; varying float alpha; varying vec3 tint;
      ${flight}
      void main(){
        float seed=seeds.x, pace=.85+.6*seed;
        float z=along(base.z,pace);
        // longer the faster the flight; hardly more than a dot when it is slow
        float len=(.25+2.1*seed)*max(.08,warp-.15)*pace;
        vec4 head=modelViewMatrix*vec4(base.xy,z,1.), tail=modelViewMatrix*vec4(base.xy,z-len,1.);
        vec4 mv=mix(tail,head,position.y);
        vec3 side=cross(head.xyz-tail.xyz,mv.xyz); side/=max(length(side),1e-5);
        // never thinner than a pixel or so, however far off
        mv.xyz+=side*position.x*max(.005+.008*seed,-mv.z*1.3/(projectionMatrix[1][1]*viewHalf));
        gl_Position=projectionMatrix*mv;
        run=position.y;
        // more of them the faster it goes
        float shown=step(seeds.y,clamp(.22+.5*(warp-.2),0.,1.));
        vec3 lit=seed>.7?vec3(.35,.95,1.):seed>.45?vec3(1.,.42,.88):vec3(.80,.74,1.);
        tint=mix(mix(vec3(.86,.82,1.),vec3(1.),step(.5,seed)),lit,.25+.6*blend);
        alpha=ends(z,70.)*shown*mix(.5,.85,blend)*(.75+.5*min(1.,warp*.5))*min(outside(vec3(base.xy,z)),outside(vec3(base.xy,z-len)));
      }`,
    fragmentShader: /* glsl */ `
      varying float run; varying float alpha; varying vec3 tint;
      void main(){
        // the tail dies away in steps, as a drawn one would
        float step_=floor(run*6.+.001)/5.;
        float a=alpha*step_*step_;
        if(a<.012) discard;
        gl_FragColor=vec4(mix(tint,vec3(1.),step(.99,step_)*.6),a);
        #include <colorspace_fragment>
      }`,
  });
  const streaks = new THREE.Mesh(streakGeometry, streakMaterial); streaks.name = `${STREAKS} warp streaks`; streaks.frustumCulled = false; streaks.renderOrder = -6;
  group.add(streaks);

  // ---------------------------------------------------------------- comets: a pink head and a broken trail, across the sky ahead
  const cometPosition = new Float32Array(COMETS * TAIL * 3), cometFade = new Float32Array(COMETS * TAIL), cometSize = new Float32Array(COMETS * TAIL);
  const cometGeometry = new THREE.BufferGeometry();
  cometGeometry.setAttribute('position', new THREE.BufferAttribute(cometPosition, 3).setUsage(THREE.DynamicDrawUsage));
  cometGeometry.setAttribute('fade', new THREE.BufferAttribute(cometFade, 1).setUsage(THREE.DynamicDrawUsage));
  cometGeometry.setAttribute('size', new THREE.BufferAttribute(cometSize, 1).setUsage(THREE.DynamicDrawUsage));
  const cometMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { viewHalf: shared.viewHalf, blend: shared.blend },
    vertexShader: /* glsl */ `
      attribute float fade,size; uniform float viewHalf; varying float alpha; varying float head;
      void main(){
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
        gl_PointSize=fade>0.?clamp(size*projectionMatrix[1][1]*viewHalf/max(.1,gl_Position.w),1.5,40.):0.;
        alpha=fade; head=step(.999,size);
      }`,
    fragmentShader: /* glsl */ `
      uniform float blend; varying float alpha; varying float head;
      void main(){
        if(alpha<.012) discard;
        vec3 pink=mix(vec3(1.,.55,.85),vec3(1.,.30,.86),blend);
        gl_FragColor=vec4(mix(mix(vec3(.62,.40,1.),pink,alpha),vec3(1.,.92,.98),head*.7),alpha);
        #include <colorspace_fragment>
      }`,
  });
  const comets = new THREE.Points(cometGeometry, cometMaterial); comets.name = 'Comets'; comets.frustumCulled = false; comets.renderOrder = -6; comets.visible = false;
  group.add(comets);
  const flying = Array.from({ length: COMETS }, () => ({ age: 9, life: 1, from: new THREE.Vector3(), way: new THREE.Vector3() }));
  let nextComet = 3.5;
  const heard = new THREE.Vector3();
  function launch(seat: THREE.Vector3) {
    const free = flying.find(c => c.age >= c.life); if (!free) return;
    const side = Math.random() < 0.5 ? -1 : 1;
    free.from.set(side * (16 + Math.random() * 26), 7 + Math.random() * 15, -34 - Math.random() * 30);
    free.way.set(-side * (0.75 + Math.random() * 0.5), -(0.3 + Math.random() * 0.35), 0.35 + Math.random() * 0.4).normalize().multiplyScalar(30 + Math.random() * 12);
    free.age = 0; free.life = 1.3 + Math.random() * 0.6;
    // heard from where it will be half way across (quietly: it is a long way off)
    heard.copy(free.from).addScaledVector(free.way, free.life * 0.5).add(seat);
    context.play('flyby', 0.92 + Math.random() * 0.22, 0.2, heard);
  }

  // ---------------------------------------------------------------- the flight, and what the game does to it
  let travel = 0, pace = PACE.idle, surge = 0, phase = 'ready', round = 1, flash = 0;
  const size = new THREE.Vector2();

  function update(dt: number, c: { time: number; blend: number; seat: THREE.Vector3; eye: THREE.Vector3; pixelRatio: number }) {
    group.position.copy(c.seat);
    const moving = settings.motion, low = settings.quality === 'low';
    // (round two's count-in is already at speed: it jumped as the transition began, 2026-11-13)
    const want = phase === 'intro' ? (round >= 2 ? PACE.round2 : PACE.intro) : phase === 'play' ? (round >= 2 ? PACE.round2 : PACE.round1) : phase === 'summary' ? PACE.summary : PACE.idle;
    pace += (want - pace) * (1 - Math.exp(-dt * 1.6));
    surge *= Math.exp(-dt * 1.5); flash *= Math.exp(-dt * 4);
    const speed = pace + surge * JUMP;
    if (moving) travel = (travel + dt * CRUISE * speed) % (RANGE * 4000);
    shared.travel.value = travel; shared.time.value = c.time; shared.blend.value = c.blend; shared.warp.value = moving ? speed : 0.1; shared.flash.value = flash;
    // half the height of what is being drawn into, in real pixels: one eye's view in a headset, the canvas otherwise (as props/puffs.ts)
    const eye = context.renderer.xr.isPresenting ? context.renderer.xr.getCamera().cameras[0]?.viewport : null;
    shared.viewHalf.value = (eye ? eye.w : context.renderer.getDrawingBufferSize(size).y) / 2;
    context.lamp.value = Math.min(1, surge);
    dustGeometry.setDrawRange(0, low ? DUST / 2 : count);          // (on Low: half the dust, no lanes or far stars)
    streakGeometry.instanceCount = low ? STREAKS / 2 : STREAKS;
    streaks.visible = moving;

    // comets
    if (moving && (nextComet -= dt) <= 0) { launch(c.seat); nextComet = (5 + Math.random() * 7) * (1 - 0.35 * c.blend); }
    let any = false;
    for (let i = 0; i < COMETS; i++) {
      const comet = flying[i]; if (moving) comet.age += dt;
      const alive = comet.age < comet.life, t = comet.age / comet.life, shown = alive ? Math.min(1, t * 6) * Math.min(1, (1 - t) * 3) : 0;
      any ||= alive;
      for (let k = 0; k < TAIL; k++) {
        const j = (i * TAIL + k), back = k * 0.6 + (k > 3 ? (k - 3) * 0.25 : 0);       // the trail thins out, and has gaps in it
        cometPosition[j * 3] = comet.from.x + comet.way.x * (comet.age - back / 34); cometPosition[j * 3 + 1] = comet.from.y + comet.way.y * (comet.age - back / 34); cometPosition[j * 3 + 2] = comet.from.z + comet.way.z * (comet.age - back / 34);
        cometFade[j] = k === 5 || k === 8 ? 0 : shown * (1 - k / TAIL) ** 1.4;
        cometSize[j] = k === 0 ? 1 : 0.62 - k * 0.04;
      }
    }
    comets.visible = any;
    if (any) { cometGeometry.attributes.position.needsUpdate = true; cometGeometry.attributes.fade.needsUpdate = true; cometGeometry.attributes.size.needsUpdate = true; }
  }

  return {
    group, update,
    onLetter(kind) {
      // a cut: the flight lurches on a little, and the lanes light up
      if (kind === 'cut') { surge = Math.min(0.6, surge + 0.09); flash = 1; }
    },
    game(progress: RoundProgress) {
      const next = progress.phase as string;
      if (next === phase && progress.round === round) return;
      // The jump. Round one: as it begins, after its count-in. Round two: the moment the transition starts, with its
      // sting (2026-11-13: "make it go to hyperspace fast at the start of transition - right now it happens after the
      // 5 seconds"), and it stays at speed through the count-in; as play begins then, only a nudge.
      const transition = next === 'intro' && progress.round >= 2 && (phase !== 'intro' || round !== progress.round);
      if (transition) { surge = 1; flash = 1; pace = Math.max(pace, PACE.round1); context.play('jump', 1, 0.55); }
      else if (next === 'play' && phase === 'intro') {
        if (progress.round >= 2) { surge = Math.max(surge, 0.35); flash = Math.max(flash, 0.5); }
        else { surge = 1; flash = 1; context.play('jump', 1, 0.55); }
      }
      phase = next; round = progress.round;
    },
    dispose() { dustGeometry.dispose(); dustMaterial.dispose(); streakGeometry.dispose(); streakMaterial.dispose(); cometGeometry.dispose(); cometMaterial.dispose(); },
  };
}
