// node weapon.mjs kyoto [roll] [yaw]   renders a level's weapon by itself, see-through, to assets/<level>/weapon.png, trimmed
// Needs the game's dev server on 5183 (vr3/play): the weapon is built by the game's own file, in the page.
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire('/Users/dylanjones/apps/inboxzerovr/vr3/play/package.json');
const { chromium } = require('playwright');
const dir = path.dirname(new URL(import.meta.url).pathname);
const [level = 'kyoto', roll = '-38', yaw = '28'] = process.argv.slice(2);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('console', m => m.type() === 'error' && console.log('page:', m.text()));
await page.goto('http://localhost:5183/weapon.html?w=keyboard');
await page.waitForFunction(() => window.__view, null, { timeout: 60000 });
const data = await page.evaluate(async ({ level, roll, yaw }) => {
  const url = performance.getEntriesByType('resource').map(e => e.name).find(n => /\/deps\/three\.js/.test(n));
  const THREE = await import(url);
  const SIZE = 1800;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(SIZE, SIZE, false); renderer.setClearColor(0x000000, 0); renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  let model;
  if (level === 'kyoto') {
    const { createSword } = await import('/src/sword.ts');
    const made = [];
    createSword({ renderer, camera: new THREE.PerspectiveCamera(), createTransformEntity: o => { made.push(o); return {}; } });
    model = made[0]; model.visible = true;
    // the showcase's Kyoto light
    scene.add(new THREE.HemisphereLight('#d7dcff', '#5a4660', 1.25));
    const key = new THREE.DirectionalLight('#ffe6ef', 2.4); key.position.set(-1.2, 2, 2.4); scene.add(key);
    const lantern = new THREE.PointLight('#ffb36b', 2.2, 6, 1.6); lantern.position.set(1.6, 0.2, 1.4); scene.add(lantern);
  } else {
    // the other levels: the same builders and lights the site's showcase uses
    const BUILD = { office2: ['keyboard', 'buildKeyboard', 'office'], castle: ['knightsword', 'buildKnightSword', 'castle'], lab: ['sprayer', 'buildSprayer', 'lab'],
      space: ['saber', 'buildSaber', 'space'], inferno: ['flamethrower', 'buildFlameThrower', 'inferno'], lumber: ['axe', 'buildAxe', 'lumber'] }[level];
    const spec = (await import(`/src/weapons/${BUILD[0]}.ts`))[BUILD[1]](renderer);
    model = spec.model;
    const { levelLights } = await import('/src/levels/lights.ts');
    const rig = levelLights(BUILD[2]); scene.add(rig.group); rig.update(0);
    spec.onArmed?.(true);
    for (let i = 0; i < 90; i++) { spec.onLive?.(1, i / 60); spec.onUpdate?.(1 / 60, i / 60, 0, 0); }
  }
  scene.add(new THREE.AmbientLight('#ffffff', 0.55));
  const holder = new THREE.Group(); holder.add(model); scene.add(holder);
  holder.rotation.set(0, yaw * Math.PI / 180, roll * Math.PI / 180);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder), centre = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(24, 1, 0.01, 50);
  const reach = Math.max(size.x, size.y) / 2 / Math.tan(12 * Math.PI / 180) * 1.08 + size.z;
  camera.position.set(centre.x, centre.y, centre.z + reach); camera.lookAt(centre);
  renderer.render(scene, camera);
  // trim to what was drawn, with a little room
  const flat = document.createElement('canvas'); flat.width = flat.height = SIZE;
  const g = flat.getContext('2d'); g.drawImage(renderer.domElement, 0, 0);
  const px = g.getImageData(0, 0, SIZE, SIZE).data;
  let x0 = SIZE, y0 = SIZE, x1 = 0, y1 = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (px[(y * SIZE + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const pad = 24, w = x1 - x0 + 1 + pad * 2, h = y1 - y0 + 1 + pad * 2;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  out.getContext('2d').drawImage(flat, x0 - pad, y0 - pad, w, h, 0, 0, w, h);
  return out.toDataURL('image/png');
}, { level, roll: Number(roll), yaw: Number(yaw) });
fs.mkdirSync(path.join(dir, 'assets', level), { recursive: true });
const out = path.join(dir, 'assets', level, 'weapon.png');
fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
console.log(out);
await browser.close();
