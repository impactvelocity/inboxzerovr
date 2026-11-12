import * as THREE from 'three';
import { levelLights } from './levels/lights';
import type { HeldSpec } from './weapons/held';

/**
 * A look at one held weapon by itself, for modelling it against its reference sheet (development
 * only: weapon.html is not part of the build).
 *
 *   /weapon.html?w=keyboard&yaw=35&pitch=25            turn it about
 *   &dist=1.1    camera distance, metres       &live=1   as lit by the trigger     &blend=1  the level's end lighting
 *   &marks=1     show the hit line (red to green) or the nozzle (yellow)
 *   &view=hand   as held: the fist at the origin, seen from a seated player's eye
 *
 * __view.set({yaw: 90}) in the console changes the view without a reload.
 */
const builders = {
  keyboard: { level: 'office', build: () => import('./weapons/keyboard').then(m => m.buildKeyboard) },
  knight: { level: 'castle', build: () => import('./weapons/knightsword').then(m => m.buildKnightSword) },
  sprayer: { level: 'lab', build: () => import('./weapons/sprayer').then(m => m.buildSprayer) },
} as const;

async function main() {
  const query = new URLSearchParams(location.search);
  const which = (query.get('w') ?? 'keyboard') as keyof typeof builders;
  const entry = builders[which] ?? builders.keyboard;
  const view = { yaw: Number(query.get('yaw') ?? 35), pitch: Number(query.get('pitch') ?? 22), dist: Number(query.get('dist') ?? 0), live: Number(query.get('live') ?? 0),
    blend: Number(query.get('blend') ?? 0), marks: query.get('marks') === '1', hand: query.get('view') === 'hand' };
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.toneMapping = THREE.NoToneMapping;
  document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#2b2c31');
  const camera = new THREE.PerspectiveCamera(view.hand ? 85 : 32, 1, 0.02, 50);
  const lights = levelLights(entry.level); scene.add(lights.group);
  const spec: HeldSpec = (await entry.build())(renderer);
  const holder = new THREE.Group(); holder.add(spec.model); scene.add(holder);
  const box = new THREE.Box3().setFromObject(spec.model), centre = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const marks = new THREE.Group(); holder.add(marks);
  if (spec.hit) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([spec.hit.base, spec.hit.tip]), new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
    line.geometry.setAttribute('color', new THREE.Float32BufferAttribute([1, 0.2, 0.2, 0.2, 1, 0.3], 3)); line.renderOrder = 9; marks.add(line);
  }
  if (spec.aim) {
    const to = spec.aim.origin.clone().addScaledVector(spec.aim.direction, 0.3);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([spec.aim.origin, to]), new THREE.LineBasicMaterial({ color: '#ffe14a', depthTest: false })); line.renderOrder = 9; marks.add(line);
  }
  // the fist: a 9 cm ball at the middle of the grip, for scale
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff5e7e', wireframe: true })); marks.add(fist);
  // A fist held out, thumb up and tipped 35 degrees forward. Grip space has -Z out of the thumb
  // side and -Y towards the knuckles, so thumb-up is a quarter turn about X, less the tip forward.
  const grip = new THREE.Matrix4().makeRotationX((90 - 35) * Math.PI / 180);
  let clock = 0;
  function frame() {
    clock += 1 / 60;
    const w = innerWidth, h = innerHeight;
    if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio()) || renderer.domElement.height !== Math.round(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    marks.visible = view.marks;
    lights.update(view.blend);
    spec.onLive?.(view.live, clock); spec.onUpdate?.(1 / 60, clock, 0, view.blend);
    if (view.hand) {
      camera.fov = 85; camera.position.set(0, 1.6, 0); camera.rotation.set(-0.25, 0, 0);
      holder.matrixAutoUpdate = false; holder.matrix.makeTranslation(0.24, 1.22, -0.42).multiply(grip).multiply(spec.hold);
      fist.matrixAutoUpdate = false; fist.matrix.copy(spec.hold).invert();
    } else {
      camera.fov = 32; holder.matrixAutoUpdate = true; holder.position.set(0, 0, 0); holder.rotation.set(0, 0, 0); holder.updateMatrix();
      fist.matrixAutoUpdate = false; fist.matrix.copy(spec.hold).invert();
      const reach = view.dist > 0 ? view.dist : Math.max(size.x, size.y, size.z) * 2.3 + 0.1;
      const yaw = view.yaw * Math.PI / 180, pitch = view.pitch * Math.PI / 180;
      camera.position.set(centre.x + Math.sin(yaw) * Math.cos(pitch) * reach, centre.y + Math.sin(pitch) * reach, centre.z + Math.cos(yaw) * Math.cos(pitch) * reach);
      camera.lookAt(centre);
    }
    holder.matrixWorldNeedsUpdate = true;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    document.getElementById('note')!.textContent = `${which} · ${(size.x * 100).toFixed(1)} x ${(size.y * 100).toFixed(1)} x ${(size.z * 100).toFixed(1)} cm · ${renderer.info.render.calls} draws · ${renderer.info.render.triangles} tris`;
  }
  // (a hidden pane gives no animation frames: a timer keeps the picture fresh for screenshots)
  const loop = () => { frame(); requestAnimationFrame(loop); }; loop(); setInterval(frame, 400);
  Object.assign(window, { __view: { scene, camera, spec, renderer, view, set: (next: Partial<typeof view>) => { Object.assign(view, next); frame(); } } });
}
main().catch(error => { console.error(error); document.getElementById('note')!.textContent = String(error); });
