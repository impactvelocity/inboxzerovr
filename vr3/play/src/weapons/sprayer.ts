import * as THREE from 'three';
import { pistolHold, propEnvironment, type HeldSpec } from './held';
import { liveGlow, Soup, type P2 } from './parts';

/**
 * The lab's tool: a disinfectant sprayer (design: design/theme-tests-v2/chemical/weapon-angles.png
 * and weapon-hero.png). A beige faceted body with three vent slots and a grey screw, a teal nozzle
 * collar round a beige cone with a dark mouth, an orange trigger, a raked pistol handle, and under
 * the front a green bottle with bubbles rising in it.
 *
 * A pistol (held.ts): nozzle along -Z, handle down -Y, the middle of the fist at the origin. Six
 * draws: the body and everything fixed to it, the trigger, the liquid, its surface, the bubbles,
 * and the bottle's glass.
 *
 * Measured off the sheet's side view (nozzle to the left), one of its pixels being K metres:
 * px(x, y) is that view's point as [z, y] here.
 */
const K = 0.00046;
const px = (x: number, y: number): P2 => [(x - 880) * K, (310 - y) * K];
const AXIS_Y = px(0, 121)[1];        // the nozzle's line above the middle of the fist: 8.7 cm
const TIP_Z = px(541, 0)[0];         // the mouth of the nozzle: 15.6 cm ahead of it
const NECK_Z = px(697, 0)[0];        // the bottle hangs under the front of the body
const HANDLE_RAKE = 12;              // degrees the handle is raked back, as the sheet draws it
// Degrees the nozzle is lifted from the knuckles' line (held.ts, pistolHold). A Quest controller
// points 45 degrees up from there (iwer's gripOffsetMatrix for the Touch controllers). It was 45, so
// the spray went exactly where the controller points, but then the handle sat 33 degrees off the
// fist and the hand had to be bent round it; the user found that unnatural ("more natural like it's
// being held, more straight", 2026-11-11). Now the handle sits nearly in the fist, as a pistol's
// does, the hand is only turned 8 degrees, and the nozzle runs along the forearm, about 25 degrees
// under the controller's own pointing line. The mist's cone and one-touch melt are forgiving of that.
// (8 degrees higher than it was, and in the hand a little to the right, 2026-11-12: "move the gun more to the
// right (in hand slightly) and angle the gun up more, it feels too pointed down")
const AIM_RAKE = 28;
const SHIFT: [number, number, number] = [0.012, 0, 0];
const TURN = -7;                       // and swung a little to the left, so it points straight ahead of a level controller, not off to the right
const LEVEL = -0.003;                // how full the bottle is: the liquid's surface, y
const BUBBLES = 9;

export function buildSprayer(renderer: THREE.WebGLRenderer): HeldSpec {
  const beige = '#ffd2b0', teal = '#0aa58c', grey = '#7d7e84', dark = '#2f2f35';
  const fixed = new Soup();

  // ---- the body, its top hump, and the handle: slabs cut to their side views, edges taken off
  const WIDE = 0.029;                 // half the body's width: it is nearly as broad as the collar
  fixed.paint(beige).hull([px(645, 84), px(700, 60), px(935, 60), px(975, 100), px(975, 165), px(945, 208), px(662, 214), px(645, 176)], WIDE, 0.011, 0.008);
  fixed.hull([px(710, 68), px(727, 35), px(799, 35), px(816, 68)], 0.021, 0.008, 0.005);
  fixed.paint(grey).block(0, px(0, 35)[1] + 0.0005, px(786, 0)[0], 0.020, 0.0026, 0.0125, 0.0008);
  fixed.paint(beige).place(new THREE.Matrix4().makeRotationX(-HANDLE_RAKE * Math.PI / 180));
  fixed.hull([[-0.0215, 0.054], [0.0305, 0.054], [0.0240, -0.046], [0.0175, -0.0565], [-0.0200, -0.0565], [-0.0265, -0.0490], [-0.0225, -0.040]], 0.016, 0.006, 0.005);
  fixed.place(null);
  // three vent slots and a screw on each side
  for (const side of [-1, 1]) {
    const x = side * (WIDE + 0.00025);
    fixed.paint(dark);
    for (const y of [118, 142, 166]) {
      const [z0, y0] = px(872, y + 4.5), [z1, y1] = px(926, y - 4.5), r = 0.0018;
      fixed.fan([[x, y0, z0 + r], [x, y0, z1 - r], [x, (y0 + y1) / 2, z1], [x, y1, z1 - r], [x, y1, z0 + r], [x, (y0 + y1) / 2, z0]]);
    }
    const [sz, sy] = px(728, 158);
    fixed.paint(grey).place(new THREE.Matrix4().makeTranslation(side * (WIDE + 0.0001), sy, sz).multiply(new THREE.Matrix4().makeRotationZ(-side * Math.PI / 2)));
    fixed.lathe([[0, 0.0013], [0.0033, 0.0013], [0.0044, 0]], 8);
    fixed.place(null);
  }
  // ---- the nozzle, turned about its own line: a beige cone with a dark mouth, in a teal collar
  fixed.place(new THREE.Matrix4().makeTranslation(0, AXIS_Y, TIP_Z).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
  fixed.paint(teal, 1).lathe([[0.0130, 0.0088], [0.0248, 0.0074], [0.0305, 0.0160], [0.0325, 0.0270], [0.0307, 0.0385], [0.0264, 0.0480], [0.0120, 0.0480]], 10, Math.PI / 10);
  fixed.paint('#f7cfa6', 0.25).lathe([[0.0068, 0], [0.0118, 0], [0.0138, 0.0042], [0.0142, 0.0100]], 10, Math.PI / 10);
  fixed.paint(dark, 0.5).lathe([[0, 0.0042], [0.0068, 0.0042], [0.0068, 0]], 10, Math.PI / 10);
  // ---- the neck the bottle screws into: beige, a grey ring, a beige cap
  fixed.place(new THREE.Matrix4().makeTranslation(0, 0, NECK_Z));
  fixed.paint(beige).lathe([[0.0165, 0.0490], [0.0165, 0.0322]], 10);
  fixed.paint(grey).lathe([[0.0165, 0.0322], [0.0206, 0.0318], [0.0206, 0.0282], [0.0165, 0.0276]], 10);
  fixed.paint(beige).lathe([[0.0165, 0.0276], [0.0216, 0.0276], [0.0238, 0.0258], [0.0254, 0.0120], [0.0205, 0.0106], [0, 0.0106]], 10);
  fixed.place(null);
  const fixedGeometry = fixed.geometry();

  // ---- the trigger, by itself because it moves
  // (a broad paddle: it shows either side of the body, as the sheet's front view has it)
  const TRIGGER = WIDE + 0.0012;
  const triggerSoup = new Soup().paint('#ff7a14').block(0, 0, 0, TRIGGER * 2, 0.034, 0.024, 0.005);
  triggerSoup.paint('#c4560a');
  for (const side of [-1, 1]) { const x = side * (TRIGGER + 0.0002); triggerSoup.quad([x, 0.0045, -0.0055], [x, 0.0045, 0.0055], [x, 0.0015, 0.0055], [x, 0.0015, -0.0055]); }
  const triggerGeometry = triggerSoup.geometry();
  const [triggerZ, triggerY] = px(804, 213);          // a little ahead of where the sheet has it: this handle rakes back

  // ---- the bottle: glass, the liquid in it, the liquid's surface, bubbles climbing its sides
  const SIDES = 8;
  const glassSoup = new Soup().paint('#ffffff').lathe([[0.0190, 0.0124], [0.0252, 0.0062], [0.0378, -0.0420], [0.0340, -0.0540], [0.0270, -0.0585], [0, -0.0585]], SIDES);
  const wall: P2[] = [[0.0250, LEVEL], [0.0346, -0.0420], [0.0308, -0.0534], [0.0244, -0.0572]];      // the liquid's side, [radius, y]
  const liquidSoup = new Soup().paint('#ffffff').lathe([...wall, [0, -0.0572]], SIDES);
  const surfaceSoup = new Soup().paint('#ffffff').lathe([[0, 0], [wall[0][0], 0]], SIDES);
  const glassGeometry = glassSoup.geometry(), liquidGeometry = liquidSoup.geometry(), surfaceGeometry = surfaceSoup.geometry();
  const bubbleGeometry = new THREE.IcosahedronGeometry(1, 1);
  /** The liquid's radius at height y, out to the middle of a flat or to a corner as the angle has it. */
  const wallAt = (y: number, angle: number) => {
    let r = wall[wall.length - 1][0];
    for (let i = 0; i < wall.length - 1; i++) if (y <= wall[i][1] && y >= wall[i + 1][1]) { r = wall[i][0] + (wall[i + 1][0] - wall[i][0]) * (wall[i][1] - y) / (wall[i][1] - wall[i + 1][1]); break; }
    const step = Math.PI * 2 / SIDES, off = ((angle % step) + step) % step - step / 2;
    return r * Math.cos(step / 2) / Math.cos(off);
  };

  const environment = propEnvironment(renderer, [[0, '#f8fcff'], [0.45, '#d3e6ea'], [0.55, '#8fb0b4'], [1, '#5b7f86']], [[30, 6, 80, 12, '#ffffff'], [160, 10, 60, 10, '#ffffff'], [200, 70, 20, 14, '#ffb060']]);
  const plastic = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.62, metalness: 0, envMap: environment.texture, envMapIntensity: 0.2 });
  const live = liveGlow(plastic, '#3dffd9', '#3dffd9');
  const orange = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.5, metalness: 0, envMap: environment.texture, envMapIntensity: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: '#9cf5b8', emissive: '#2bc470', emissiveIntensity: 0.4, transparent: true, opacity: 0.36, depthWrite: false, forceSinglePass: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.12, metalness: 0, envMap: environment.texture, envMapIntensity: 1.3 });
  const liquid = new THREE.MeshStandardMaterial({ color: '#22c26a', emissive: '#0a7a38', emissiveIntensity: 0.6, flatShading: true, side: THREE.DoubleSide, roughness: 0.4, metalness: 0, envMap: environment.texture, envMapIntensity: 0.5 });
  const foam = new THREE.MeshStandardMaterial({ color: '#c2f7d6', emissive: '#62dc9c', emissiveIntensity: 0.45, flatShading: true, roughness: 0.35, metalness: 0 });

  const model = new THREE.Group(); model.name = 'Disinfectant sprayer';
  const body = new THREE.Mesh(fixedGeometry, plastic); body.name = 'Sprayer body, nozzle and handle';
  const trigger = new THREE.Mesh(triggerGeometry, orange); trigger.name = 'Orange trigger'; trigger.position.set(0, triggerY, triggerZ);
  const bottle = new THREE.Group(); bottle.name = 'Bottle'; bottle.position.set(0, 0, NECK_Z);
  const liquidMesh = new THREE.Mesh(liquidGeometry, liquid); liquidMesh.name = 'Disinfectant';
  const surface = new THREE.Mesh(surfaceGeometry, foam); surface.name = "The liquid's surface"; surface.position.y = LEVEL;
  const bubbles = new THREE.InstancedMesh(bubbleGeometry, foam, BUBBLES); bubbles.name = `${BUBBLES} bubbles`; bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage); bubbles.frustumCulled = false;
  const glassMesh = new THREE.Mesh(glassGeometry, glass); glassMesh.name = 'Bottle glass'; glassMesh.renderOrder = 2;
  bottle.add(liquidMesh, surface, bubbles, glassMesh);
  model.add(body, trigger, bottle);

  let seed = 4127;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const each = Array.from({ length: BUBBLES }, (_, i) => ({ angle: (i + random() * 0.7) / BUBBLES * Math.PI * 2, phase: random(), pace: 0.16 + random() * 0.14, size: 0.0026 + random() * 0.0028 }));
  const dummy = new THREE.Object3D();
  let fizz = 0, squeezed = 0, slosh = 0;

  const spec: HeldSpec = {
    name: 'Disinfectant sprayer — right grip', model,
    hold: pistolHold({ rake: AIM_RAKE, turn: TURN, shift: SHIFT }), tilt: HANDLE_RAKE - AIM_RAKE,
    aim: { origin: new THREE.Vector3(0, AXIS_Y, TIP_Z - 0.001), direction: new THREE.Vector3(0, 0, -1) },
    onLive(level) {
      // the trigger squeezes in, and the nozzle's collar brightens
      squeezed = level;
      trigger.position.set(0, triggerY - 0.0012 * level, triggerZ + 0.0062 * level); trigger.rotation.x = -0.16 * level;
      live.liveLevel.value = level * 0.4;
    },
    onUpdate(dt, clock, speed) {
      // bubbles climb the bottle's sides, faster while it is spraying; the surface rocks, more when the hand moves
      fizz += dt * (1 + 2.6 * squeezed);
      slosh += (Math.min(0.11, speed * 0.035) - slosh) * (1 - Math.exp(-dt * 4));
      surface.rotation.set((0.035 + slosh) * Math.sin(clock * 2.3 + squeezed), 0, (0.035 + slosh) * Math.cos(clock * 1.9));
      for (let i = 0; i < BUBBLES; i++) {
        const b = each[i], t = (b.phase + fizz * b.pace) % 1;
        const y = -0.051 + (LEVEL - 0.005 + 0.051) * t, angle = b.angle + Math.sin(fizz * 0.7 + i * 2.1) * 0.1;
        const r = wallAt(y, angle) + 0.0004;
        dummy.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
        // flat against the glass, as a bubble on the inside of a bottle is
        const size = b.size * Math.min(1, t / 0.12) * Math.min(1, (1 - t) / 0.08);
        dummy.rotation.y = -angle; dummy.scale.set(size * 0.3, size, size);
        dummy.updateMatrix(); bubbles.setMatrixAt(i, dummy.matrix);
      }
      bubbles.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const g of [fixedGeometry, triggerGeometry, glassGeometry, liquidGeometry, surfaceGeometry, bubbleGeometry]) g.dispose();
      for (const m of [plastic, orange, glass, liquid, foam]) m.dispose();
      environment.dispose();
    },
  };
  spec.onUpdate!(0, 0, 0, 0);          // the bubbles in their places before anything measures or draws it
  return spec;
}
