import * as THREE from 'three';
import { tweaks, ZERO, TWEAK_KEYS, type Tweak } from './tweak';
import type { HeldSpec } from './weapons/held';

/**
 * tune.html: weapon tuning (development only; not part of the build). Pick a level, turn and move its weapon about
 * the fist, and see it here against the fist and its axes; every change goes to the game on the headset at once
 * (src/tweak.ts, and the relay in vite.config.ts). The numbers are kept in tools/weapon-tweaks.json.
 */

interface Entry { id: string; name: string; build(renderer: THREE.WebGLRenderer): Promise<{ model: THREE.Object3D; hold(): THREE.Matrix4; tilt(): number }> }
const fromSpec = (load: () => Promise<(r: THREE.WebGLRenderer) => HeldSpec>) => async (renderer: THREE.WebGLRenderer) => {
  const spec = (await load())(renderer);
  return { model: spec.model, hold: () => spec.hold, tilt: () => spec.tilt };
};
const LEVELS: Entry[] = [
  { id: 'kyoto', name: 'Kyoto Nights · katana', build: katana },
  { id: 'office2', name: 'Keyboard Smash · keyboard', build: fromSpec(() => import('./weapons/keyboard').then(m => m.buildKeyboard)) },
  { id: 'castle', name: 'Haunted Halls · sword', build: fromSpec(() => import('./weapons/knightsword').then(m => m.buildKnightSword)) },
  { id: 'lab', name: 'Toxic Danger · sprayer', build: fromSpec(() => import('./weapons/sprayer').then(m => m.buildSprayer)) },
  { id: 'space', name: 'Super Space · saber', build: fromSpec(() => import('./weapons/saber').then(m => m.buildSaber)) },
  { id: 'inferno', name: 'Inferno · flamethrower', build: fromSpec(() => import('./weapons/flamethrower').then(m => m.buildFlameThrower)) },
  { id: 'lumber', name: 'LumberHack · axe', build: fromSpec(() => import('./weapons/axe').then(m => m.buildAxe)) },
];
const NAMES: Record<string, string> = Object.fromEntries(LEVELS.map(l => [l.id, l.name.split(' · ')[0]]));

/** The katana is made for the game's world; here it is given just enough of one to be built and looked at. */
async function katana(renderer: THREE.WebGLRenderer) {
  const sword = await import('./sword');
  const made: THREE.Object3D[] = [];
  const stand = { renderer, camera: new THREE.PerspectiveCamera(), player: { matrixWorld: new THREE.Matrix4() }, createTransformEntity: (o: THREE.Object3D) => { made.push(o); return {}; } };
  sword.createSword(stand as never);
  const root = made.find(o => o.name.startsWith('Sakura katana')) ?? made[0];
  return { model: root, hold: () => sword.swordHoldMatrix(), tilt: () => sword.swordHold.tilt };
}

const SLIDERS: Record<keyof Tweak, { label: string; hint: string; min: number; max: number; step: number }> = {
  tipForward: { label: 'Tip forward / back', hint: '+ towards the knuckles', min: -60, max: 60, step: 1 },
  tipRight: { label: 'Tip right / left', hint: '+ the tip to your right', min: -60, max: 60, step: 1 },
  spin: { label: 'Spin about the fist', hint: '+ the edge turns right', min: -90, max: 90, step: 1 },
  right: { label: 'Move right / left', hint: '+ to your right', min: -8, max: 8, step: 0.1 },
  up: { label: 'Move up / down the fist', hint: '+ out past the thumb', min: -8, max: 8, step: 0.1 },
  forward: { label: 'Move forward / back', hint: '+ towards the knuckles', min: -8, max: 8, step: 0.1 },
};

async function main() {
  const view = document.getElementById('view')!;
  const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  view.prepend(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#2b2c31');
  scene.add(new THREE.HemisphereLight('#dfe6ff', '#3a3340', 1.6));
  const sun = new THREE.DirectionalLight('#ffffff', 2.2); sun.position.set(1, 2, 1.5); scene.add(sun);
  const floor = new THREE.GridHelper(4, 40, '#44464f', '#34363e'); scene.add(floor);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 30);

  // The fist: held out in front of a seated player, thumb up and tipped forward, as the game's weapon viewer has it.
  const GRIP = new THREE.Matrix4().makeTranslation(0.22, 1.2, -0.42).multiply(new THREE.Matrix4().makeRotationX((90 - 35) * Math.PI / 180));
  const FIST = new THREE.Vector3().setFromMatrixPosition(GRIP);
  const fist = new THREE.Group(); fist.matrixAutoUpdate = false; scene.add(fist);
  const skin = new THREE.MeshStandardMaterial({ color: '#c9ccd6', transparent: true, opacity: 0.45, roughness: 0.8, depthWrite: false });
  const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.034, 0.05, 6, 14), skin); palm.rotation.x = Math.PI / 2; fist.add(palm);
  const knuckles = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.085), skin); knuckles.position.set(0, -0.032, 0); fist.add(knuckles);
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.03, 4, 8), skin); thumb.position.set(-0.012, -0.02, -0.055); thumb.rotation.set(Math.PI / 2, 0, 0.4); fist.add(thumb);
  const axes = new THREE.Group(); axes.matrixAutoUpdate = false; scene.add(axes);
  const arrow = (dir: THREE.Vector3, colour: string) => axes.add(new THREE.ArrowHelper(dir, new THREE.Vector3(), 0.16, colour, 0.025, 0.015));
  arrow(new THREE.Vector3(1, 0, 0), '#ff6b6b'); arrow(new THREE.Vector3(0, -1, 0), '#5fe08a'); arrow(new THREE.Vector3(0, 0, -1), '#6aa8ff');
  const holder = new THREE.Group(); holder.matrixAutoUpdate = false; scene.add(holder);

  // cameras: from the player's eye, and round the fist
  const cams = { eye: { pos: [0.02, 1.62, 0.32], look: null as number[] | null }, side: { pos: [0.85, 1.35, -0.4], look: null }, front: { pos: [0.22, 1.35, -1.25], look: null }, top: { pos: [0.24, 2.05, -0.4], look: null }, back: { pos: [0.1, 1.45, 0.35], look: null } };
  let orbit = { yaw: 0, pitch: 0, dist: 0 }, camName: keyof typeof cams = 'eye';
  const camBar = document.getElementById('cams')!;
  for (const name of Object.keys(cams) as (keyof typeof cams)[]) {
    const b = document.createElement('button'); b.textContent = { eye: 'Your eye', side: 'Right side', front: 'Front', top: 'Above', back: 'Behind' }[name];
    b.addEventListener('click', () => { camName = name; orbit = { yaw: 0, pitch: 0, dist: 0 }; for (const c of Array.from(camBar.children)) c.classList.toggle('on', c === b); });
    if (name === 'eye') b.classList.add('on'); camBar.append(b);
  }
  let drag: { x: number; y: number } | null = null;
  renderer.domElement.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; renderer.domElement.setPointerCapture(e.pointerId); });
  renderer.domElement.addEventListener('pointermove', e => { if (!drag) return; orbit.yaw -= (e.clientX - drag.x) * 0.01; orbit.pitch = Math.max(-1.4, Math.min(1.4, orbit.pitch + (e.clientY - drag.y) * 0.01)); drag = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener('pointerup', () => { drag = null; });
  renderer.domElement.addEventListener('wheel', e => { e.preventDefault(); orbit.dist = Math.max(-0.6, Math.min(1.5, orbit.dist + e.deltaY * 0.001)); }, { passive: false });

  // the level picker and its weapon
  const select = document.getElementById('level') as HTMLSelectElement;
  for (const l of LEVELS) select.add(new Option(l.name, l.id));
  const built = new Map<string, Awaited<ReturnType<Entry['build']>>>();
  let current: Awaited<ReturnType<Entry['build']>> | null = null, level = LEVELS[0].id;
  async function show(id: string) {
    level = id; select.value = id;
    let got = built.get(id);
    if (!got) { const entry = LEVELS.find(l => l.id === id)!; got = await entry.build(renderer); built.set(id, got); }
    if (level !== id) return;
    holder.clear(); got.model.matrixAutoUpdate = true; got.model.position.set(0, 0, 0); got.model.quaternion.identity(); got.model.scale.setScalar(1); got.model.visible = true;
    holder.add(got.model); current = got; fill();
  }
  select.addEventListener('change', () => void show(select.value));

  // sliders
  const inputs = new Map<keyof Tweak, { range: HTMLInputElement; number: HTMLInputElement }>();
  for (const key of TWEAK_KEYS) {
    const s = SLIDERS[key], row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<div class="top"><b>${s.label}</b><span>${s.hint}</span></div><div class="ctl"><button type="button" data-d="-1">−</button><input type="range" min="${s.min}" max="${s.max}" step="${s.step}"><button type="button" data-d="1">+</button><input type="number" step="${s.step}"></div>`;
    document.getElementById(['right', 'up', 'forward'].includes(key) ? 'moves' : 'turns')!.append(row);
    const range = row.querySelector('input[type=range]') as HTMLInputElement, number = row.querySelector('input[type=number]') as HTMLInputElement;
    inputs.set(key, { range, number });
    const commit = (v: number) => { const t = tweaks.get(level); t[key] = Math.round(v / s.step) * s.step; t[key] = +t[key].toFixed(2); tweaks.set(level, t); fill(); };
    range.addEventListener('input', () => commit(Number(range.value)));
    number.addEventListener('change', () => commit(Number(number.value)));
    for (const b of Array.from(row.querySelectorAll("button"))) b.addEventListener('click', () => commit(tweaks.get(level)[key] + Number((b as HTMLElement).dataset.d) * (s.step < 1 ? 0.5 : 1)));
  }
  function fill() {
    const t = tweaks.get(level);
    for (const [key, { range, number }] of inputs) { range.value = String(t[key]); if (document.activeElement !== number) number.value = String(t[key]); }
    const changed = TWEAK_KEYS.filter(k => t[k] !== 0).map(k => `${k}: ${t[k]}`).join(', ');
    const kept = tweaks.savedCount(level), keptLine = kept ? ` · ${kept} change${kept === 1 ? '' : 's'} saved as its default` : '';
    document.getElementById('out')!.textContent = (changed ? `${NAMES[level]} weapon tweak: { ${changed} }` : `${NAMES[level]}: sliders at zero`) + keptLine;
    (document.getElementById('save') as HTMLButtonElement).disabled = !changed;
    (document.getElementById('unsave') as HTMLButtonElement).disabled = !kept;
  }
  tweaks.onChange(fill);
  document.getElementById('reset')!.addEventListener('click', () => { tweaks.set(level, { ...ZERO }); fill(); });
  // Save as default: asked first, so a stray click cannot do it. The sliders go back to zero, and the weapon stays where they had it.
  document.getElementById('save')!.addEventListener('click', () => {
    const t = tweaks.get(level), changed = TWEAK_KEYS.filter(k => t[k] !== 0).map(k => `${SLIDERS[k].label}: ${t[k]}`).join('\n');
    if (!changed) return;
    if (!confirm(`Save this as the ${NAMES[level]} weapon's default?\n\n${changed}\n\nIt becomes how the weapon is held in the game, and the sliders go back to zero.`)) return;
    tweaks.saveAsDefault(level);
    // (the saved file reloads this page: the word that it was saved is kept for the page that comes back)
    const note = `✓ Saved as the ${NAMES[level]} default`;
    try { sessionStorage.setItem('tune.toast', JSON.stringify({ note, level, at: Date.now() })); } catch { /* private window */ }
    toast(note);
  });
  document.getElementById('unsave')!.addEventListener('click', () => {
    const n = tweaks.savedCount(level); if (!n) return;
    if (!confirm(`Undo the ${n} change${n === 1 ? '' : 's'} saved as the ${NAMES[level]} weapon's default?\n\nIt goes back to how its code holds it.`)) return;
    tweaks.clearDefault(level);
    const note = `↺ ${NAMES[level]} is back to how its code holds it`;
    try { sessionStorage.setItem('tune.toast', JSON.stringify({ note, level, at: Date.now() })); } catch { /* private window */ }
    toast(note);
  });
  document.getElementById('copy')!.addEventListener('click', () => { void navigator.clipboard?.writeText(document.getElementById('out')!.textContent ?? ''); const b = document.getElementById('copy')!; b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy numbers'; }, 1200); });

  // the headset, as the dev server last heard from it
  const status = document.getElementById('status')!;
  let followed = false;
  import.meta.hot?.on('vr3:tweak:pages', (pages: { kind: string; level: string; vr: boolean; headset: boolean; seen: number }[]) => {
    Object.assign(window, { __pages: pages });
    const games = pages.filter(p => p.kind === 'game'), headset = games.find(p => p.headset) ?? null;
    status.innerHTML = headset ? `<span class="ok">● Headset connected</span> · ${NAMES[headset.level] ?? headset.level ?? '…'}${headset.vr ? ' · in VR' : ''}`
      : games.length ? `<span class="no">● No headset</span> · ${games.length} game page${games.length === 1 ? '' : 's'} open here, they get every change too` : '<span class="no">● No game open</span> · open localhost:5183/play/ on the headset';
    const on = headset ?? games[0];
    if (on && !followed && on.level) { followed = true; void show(on.level); }      // (starts on the level the headset is playing)
  });

  // a word that something was saved or undone, at the top for a few seconds (2026-11-12: "there is no feedback for saving as default")
  let toastTimer = 0;
  function toast(text: string) {
    const el = document.getElementById('toast')!; el.textContent = text; el.classList.add('on');
    clearTimeout(toastTimer); toastTimer = window.setTimeout(() => el.classList.remove('on'), 4000);
  }
  let resume = '';
  try {
    const kept = JSON.parse(sessionStorage.getItem('tune.toast') ?? 'null') as { note: string; level: string; at: number } | null;
    sessionStorage.removeItem('tune.toast');
    if (kept && Date.now() - kept.at < 15000) { resume = kept.level; setTimeout(() => toast(kept.note), 300); }
  } catch { /* private window */ }
  if (resume) { followed = true; level = resume; }
  await show(level);
  const eye = new THREE.Vector3(), m = new THREE.Matrix4();
  function frame() {
    const w = view.clientWidth, h = view.clientHeight;
    if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio()) || renderer.domElement.height !== Math.round(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); }
    if (current) {
      holder.matrix.copy(GRIP).multiply(tweaks.matrix(level)).multiply(current.hold());
      fist.matrix.copy(GRIP).multiply(m.makeRotationX(-current.tilt() * Math.PI / 180));      // (the drawn hand turns with the weapon's lean, as hands.ts has it)
      axes.matrix.copy(GRIP);
    }
    const c = cams[camName];
    eye.set(c.pos[0], c.pos[1], c.pos[2]).sub(FIST);
    const r = eye.length() * (1 + orbit.dist);
    const sph = new THREE.Spherical().setFromVector3(eye); sph.theta += orbit.yaw; sph.phi = Math.max(0.05, Math.min(Math.PI - 0.05, sph.phi - orbit.pitch)); sph.radius = r;
    camera.position.setFromSpherical(sph).add(FIST);
    camera.lookAt(camName === 'eye' && !orbit.yaw && !orbit.pitch ? new THREE.Vector3(FIST.x, FIST.y + 0.12, FIST.z - 0.2) : FIST);
    renderer.render(scene, camera);
  }
  const loop = () => { frame(); requestAnimationFrame(loop); }; loop();
}
main().catch(error => { console.error(error); document.getElementById('out')!.textContent = String(error); });
