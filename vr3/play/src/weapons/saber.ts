import * as THREE from 'three';
import { propEnvironment, rodHold, type HeldSpec } from './held';
import { liveGlow, Soup, type P2 } from './parts';

/**
 * Super Space's weapon: the space saber (design: ../../../design/space-assets-v3, saber-hero.png and
 * saber-diagram.png; modeling-notes.md has the sizes, which are the ones used here). A chunky
 * faceted hilt of twelve-sided sections: a silver pommel, a plum grip with three sunk rings, an
 * ivory shell with one magenta button, and a stepped silver emitter with a cyan ring round its
 * mouth. The blade is light: a white core in a cyan glow.
 *
 * A rod (held.ts): its length runs up +Y, y = 0 is the top of the grip, and the fist closes round
 * the middle of the grip. The blade is not always there. It shoots out of the emitter when the
 * saber is made ready to cut (the trigger, with a controller) and draws back in when it is not.
 *
 * Draws: the hilt's metal, the rest of the hilt, and three for the blade while it is out.
 */
const POMMEL = 0.03, GRIP = 0.12, SHELL = 0.09, EMITTER = 0.04;      // the sheet's four lengths, bottom to top: 28 cm of hilt
const R = 0.02;                       // the body, 4 cm across
const COLLAR = 0.025;                 // the emitter at its widest, 5 cm across
const MOUTH = SHELL + EMITTER;        // the emitter's mouth, measured from the top of the grip
/**
 * The blade's length past the emitter. The sheet draws 80 cm; in the seat the katana felt right at
 * 58 cm (the user's own number, 2026-11-11), so it is 58 here. This one number changes it.
 */
const BLADE = 0.58;
const CORE = 0.0105, SHEATH = 0.0135; // the blade's white core, and the cyan round it (2.6 cm across, as the sheet has it)
const SIDES = 12;
/** Seconds, about, for the blade to come out and to go back in. */
const IGNITE = 0.11, RETRACT = 0.17;

export function buildSaber(renderer: THREE.WebGLRenderer): HeldSpec {
  let seed = 9133;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  /** A colour, a hair lighter or darker each time, so that no two facets of a part are quite the same. */
  const shade = (colour: string, by = 0.08) => new THREE.Color(colour).multiplyScalar(1 - by / 2 + random() * by);

  // ---- metal: the pommel and the emitter
  const metal = new Soup();
  const bottom = -GRIP - POMMEL;
  const pommel: P2[] = [[0, bottom], [0.0125, bottom], [0.0205, bottom + 0.009], [0.0216, bottom + 0.013], [0.0216, bottom + 0.024], [0.0196, -GRIP]];
  for (let k = 0; k < pommel.length - 1; k++) metal.paint(shade('#a9a9b4')).lathe([pommel[k], pommel[k + 1]], SIDES);
  const emitter: P2[] = [[0.0186, SHELL], [0.0212, SHELL + 0.002], [0.0212, SHELL + 0.009], [COLLAR, SHELL + 0.014], [COLLAR, SHELL + 0.030], [0.0226, SHELL + 0.036], [0.0214, MOUTH], [0.0166, MOUTH]];
  for (let k = 0; k < emitter.length - 1; k++) metal.paint(shade('#a9a9b4'), k >= emitter.length - 3 ? 0.35 : 0.06).lathe([emitter[k], emitter[k + 1]], SIDES);
  const metalGeometry = metal.geometry();

  // ---- the rest: the plum grip and its rings, the ivory shell, the button, the cyan ring and the dark of the mouth
  const body = new Soup();
  const rib = 0.0012, sunk = R - 0.0030;
  let y = -GRIP;
  for (const [length, ring] of [[0.022, false], [0.006, true], [0.022, false], [0.006, true], [0.022, false], [0.006, true], [0.036, false]] as const) {
    if (ring) body.paint(shade('#4a1c47', 0.05)).lathe([[sunk, y], [sunk, y + length]], SIDES);
    else {
      // a band of the grip: its two shoulders, and its face
      body.paint(shade('#5a2355')).lathe([[sunk, y], [R, y + rib]], SIDES);
      body.paint(shade('#6b2c64')).lathe([[R, y + rib], [R, y + length - rib]], SIDES);
      body.paint(shade('#7a3672')).lathe([[R, y + length - rib], [sunk, y + length]], SIDES);
    }
    y += length;
  }
  body.paint(shade('#e2d4c2', 0.04)).lathe([[sunk, 0], [R, 0.0022]], SIDES);
  body.paint('#f2e6d6').lathe([[R, 0.0022], [R, SHELL - 0.0022]], SIDES);
  body.paint(shade('#e2d4c2', 0.04)).lathe([[R, SHELL - 0.0022], [0.0186, SHELL]], SIDES);
  // The button: on the flat that faces the player's eye (between the side turned to them and the side turned to their left).
  const apothem = R * Math.cos(Math.PI / SIDES);
  body.place(new THREE.Matrix4().makeRotationY(-Math.PI / 4));
  body.paint('#e229a6', 0.25).block(apothem + 0.0012, SHELL * 0.62, 0, 0.0062, 0.024, 0.0105, 0.0016);
  body.place(null);
  // the mouth: a cyan ring, and the dark it shines out of
  body.paint('#00e5ff', 1).lathe([[0.0166, MOUTH], [0.0136, MOUTH - 0.003]], SIDES);
  body.paint('#0b0d16', 0.5).lathe([[0.0136, MOUTH - 0.003], [0.0136, MOUTH - 0.017], [0, MOUTH - 0.017]], SIDES);
  const bodyGeometry = body.geometry();

  // Deep space to reflect: indigo all round, a cyan light and a magenta one, and a white one overhead.
  const environment = propEnvironment(renderer, [[0, '#9a92d8'], [0.3, '#e8e4ff'], [0.46, '#ffffff'], [0.6, '#8880c4'], [1, '#221a4c']],
    [[26, 40, 26, 30, '#7df3ff'], [118, 22, 26, 30, '#ffffff'], [192, 44, 24, 28, '#ff8ae0'], [232, 70, 14, 18, '#c9f4ff']]);
  const metalMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, metalness: 0.9, roughness: 0.3, envMap: environment.texture, envMapIntensity: 1.15 });
  const bodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, metalness: 0.04, roughness: 0.46, envMap: environment.texture, envMapIntensity: 0.45 });
  const metalLive = liveGlow(metalMaterial, '#8ff4ff', '#1fa8d8'), bodyLive = liveGlow(bodyMaterial, '#5ff0ff', '#ff3fc0');

  // ---- the blade: a white core, a cyan sheath round it, and a soft light that always faces the eye
  const blade = new THREE.Group(); blade.name = 'Energy blade'; blade.position.y = MOUTH - 0.006; blade.visible = false;
  const rounded = (r: number): P2[] => [[r, 0], [r, BLADE - r * 1.5], [r * 0.82, BLADE - r * 0.62], [r * 0.46, BLADE - r * 0.14], [0, BLADE]];
  const coreGeometry = new Soup().lathe(rounded(CORE), SIDES).geometry(), sheathGeometry = new Soup().lathe(rounded(SHEATH), SIDES, Math.PI / SIDES).geometry();
  const coreMaterial = new THREE.MeshBasicMaterial({ color: '#f1ffff' });
  const sheathMaterial = new THREE.MeshBasicMaterial({ color: '#12cfff', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  const core = new THREE.Mesh(coreGeometry, coreMaterial); core.name = 'Blade core';
  const sheath = new THREE.Mesh(sheathGeometry, sheathMaterial); sheath.name = 'Blade sheath'; sheath.renderOrder = 2;
  const rings = 8, position: number[] = [], place: number[] = [], index: number[] = [];
  for (let r = 0; r <= rings; r++) {
    // (it starts a little inside the emitter and ends a little past the tip, so both ends are round with light)
    for (const side of [-1, 1]) { position.push(0, -0.02 + (BLADE + 0.05) * r / rings, 0); place.push(side, r / rings); }
    if (r < rings) index.push(r * 2, r * 2 + 1, r * 2 + 2, r * 2 + 1, r * 2 + 3, r * 2 + 2);
  }
  const haloGeometry = new THREE.BufferGeometry();
  haloGeometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  haloGeometry.setAttribute('place', new THREE.Float32BufferAttribute(place, 2));
  haloGeometry.setIndex(index);
  const haloMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { level: { value: 0 }, time: { value: 0 }, swing: { value: 0 }, width: { value: 0.085 },
      halo: { value: new THREE.Color('#00b7ff') }, heart: { value: new THREE.Color('#b8fbff') } },
    vertexShader: /* glsl */ `
      attribute vec2 place; uniform float width,swing; varying vec2 at;
      void main(){
        at=place;
        vec4 mv=modelViewMatrix*vec4(position,1.);
        vec3 run=normalize((modelViewMatrix*vec4(0.,1.,0.,0.)).xyz);
        vec3 side=cross(run,normalize(mv.xyz)); side/=max(length(side),1e-4);
        mv.xyz+=side*place.x*width*(1.+.45*swing);
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float level,time,swing; uniform vec3 halo,heart; varying vec2 at;
      void main(){
        float across=at.x, along=at.y;
        float ends=smoothstep(0.,.07,along)*(1.-smoothstep(.86,1.,along));
        // never quite steady: a fast flutter all along it, and a slower pulse running out to the tip
        float flutter=.9+.07*sin(time*61.)*sin(time*37.+along*11.)+.05*sin(along*18.-time*14.);
        float soft=exp(-across*across*6.)*.5, near=exp(-across*across*38.)*.55;
        gl_FragColor=vec4(mix(halo,heart,near/(soft+near+1e-4)),(soft+near)*ends*flutter*level*(1.+.35*swing));
        #include <colorspace_fragment>
      }`,
  });
  const halo = new THREE.Mesh(haloGeometry, haloMaterial); halo.name = 'Blade glow'; halo.frustumCulled = false; halo.renderOrder = 3;
  blade.add(core, sheath, halo);

  const model = new THREE.Group(); model.name = 'Space saber';
  const hiltMetal = new THREE.Mesh(metalGeometry, metalMaterial); hiltMetal.name = 'Silver pommel and emitter';
  const hiltBody = new THREE.Mesh(bodyGeometry, bodyMaterial); hiltBody.name = 'Plum grip, ivory shell, magenta button';
  model.add(hiltMetal, hiltBody, blade);

  // How far out the blade is, 0 to 1, and whether it is wanted: by the game (ready to cut) or by the trigger's own light.
  let out = 0, armed = false, lit = 0, swing = 0;
  return {
    name: 'Space saber — right grip', model,
    // Upright in the hand, as the knight's sword and the keyboard were asked to be (2026-11-11), the fist
    // round the middle of the grip (the notes' "origin at grip center").
    hold: rodHold({ guardY: 0, reach: GRIP / 2, tilt: -15, turn: 8 }), tilt: -15, rod: { guardY: 0, reach: GRIP / 2, tilt: -15, turn: 8 },
    hit: { base: new THREE.Vector3(0, MOUTH + 0.01, 0), tip: new THREE.Vector3(0, MOUTH + BLADE, 0) },
    trail: [0.3, 0.9, 1],
    shown: () => out,
    onArmed(ready) { armed = ready; },
    onLive(level) { lit = level; },
    onUpdate(dt, clock, speed) {
      const want = armed || lit > 0.5 ? 1 : 0;
      out += (want - out) * (1 - Math.exp(-dt / ((want ? IGNITE : RETRACT) / 3)));
      if (!want && out < 0.01) out = 0;
      swing += (Math.min(1, speed / 7) - swing) * (1 - Math.exp(-dt * 14));
      blade.visible = out > 0;
      // it comes out a touch too far and settles back, and its core trembles
      const reach = out < 1 ? out * (1 + 0.12 * Math.sin(out * Math.PI)) : 1, tremble = 1 + 0.035 * Math.sin(clock * 53) * Math.sin(clock * 29);
      blade.scale.set(tremble, Math.max(0.001, reach), tremble);
      haloMaterial.uniforms.level.value = out; haloMaterial.uniforms.time.value = clock; haloMaterial.uniforms.swing.value = swing;
      sheathMaterial.opacity = 0.6 * out;
      // the ring round the mouth is always alight a little; with the blade out it and the emitter's lip blaze
      const glow = 0.3 + 0.7 * out * (0.93 + 0.07 * Math.sin(clock * 41));
      metalLive.liveLevel.value = out * 0.9; bodyLive.liveLevel.value = glow; metalLive.liveTime.value = bodyLive.liveTime.value = clock;
    },
    dispose() {
      metalGeometry.dispose(); bodyGeometry.dispose(); coreGeometry.dispose(); sheathGeometry.dispose(); haloGeometry.dispose();
      metalMaterial.dispose(); bodyMaterial.dispose(); coreMaterial.dispose(); sheathMaterial.dispose(); haloMaterial.dispose(); environment.dispose();
    },
  };
}
