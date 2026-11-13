// Records real game footage frame by frame: the game is stepped by hand (__vr3.step) so every
// frame is exactly 1/30 s apart however slow the software renderer is. Frames land in ../footage/<clip>/.
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('/Users/dylanjones/apps/inboxzerovr/vr3/play/package.json');
const { chromium } = require('playwright');
const FPS = 30, OUT = new URL('../footage/', import.meta.url).pathname;

const CLIPS = {
  // level, then a script of steps; rec() frames are saved, ff() frames are not
  'kyoto-cut':    { level: 'kyoto',  run: async g => { await g.untilLetter(); await g.rec(1.3); await g.key('x'); await g.rec(3.4); } },
  'kyoto-keep':   { level: 'kyoto',  run: async g => { await g.untilLetter(); await g.key('x'); await g.untilLetter(); await g.rec(1.4); await g.key('c'); await g.rec(1.6); } },
  'kyoto-stream': { level: 'kyoto',  run: async g => { await g.untilLetter(); await g.key('x'); for (let i = 0; i < 4; i++) { await g.untilLetter(true); await g.rec(0.9); await g.key('x'); } await g.rec(0.8); } },
  'inferno':      { level: 'inferno', run: async g => { await g.untilLetter(); await g.rec(1.2); await g.key('x'); await g.rec(3.4); } },
  'office2':      { level: 'office2', run: async g => { await g.untilLetter(); await g.rec(1.3); await g.key('x'); await g.rec(3.4); } },
  'castle':       { level: 'castle', run: async g => { await g.untilLetter(); await g.rec(1.3); await g.key('x'); await g.rec(3.4); } },
  'lab':          { level: 'lab',    run: async g => { await g.untilLetter(); await g.rec(1.2); await g.key('x'); await g.rec(3.4); } },
  'lumber':       { level: 'lumber', run: async g => { await g.untilLetter(); await g.rec(1.3); await g.key('x'); await g.rec(1.8); } },
  'space':        { level: 'space',  run: async g => { await g.untilLetter(); await g.rec(1.3); await g.key('x'); await g.rec(4.0); } },
  'kyoto-round2': { level: 'kyoto',  run: async g => {
      for (let i = 0; i < 10; i++) { await g.untilLetter(); await g.ff(0.8); await g.key(i % 3 === 0 ? 'c' : 'x'); }
      await g.untilPhase('play', 2); await g.untilLetter(); await g.rec(2.6); await g.key('1'); await g.rec(3.4); await g.key('1');
      await g.untilLetter(true, 6); await g.rec(1.4); await g.key('2'); await g.rec(3.0);
      for (let i = 0; i < 3; i++) { if (await g.phase() !== 'play') break; await g.untilLetter(true, 6); await g.key('1'); await g.ff(4); }
      await g.ff(1); await g.rec(5);
  } },
  'kyoto-intro':  { level: 'kyoto',  run: async g => { await g.rec(6.5); } },
  'kyoto-keep2':  { level: 'kyoto',  run: async g => { await g.untilLetter(); await g.key('x'); await g.untilLetter(); await g.rec(2.6); await g.key('c'); await g.rec(1.8); } },
  'kyoto-cut2':   { level: 'kyoto',  run: async g => { await g.untilLetter(); await g.key('x'); await g.untilLetter(); await g.rec(2.2); await g.key('x'); await g.rec(2.0); } },
  'kyoto-round2b': { level: 'kyoto', run: async g => {
      for (let i = 0; i < 10; i++) { await g.untilLetter(); await g.ff(0.8); await g.key(i % 3 === 0 ? 'c' : 'x'); }
      await g.untilPhase('play', 2); await g.untilLetter(); await g.rec(3.3); await g.key('1'); await g.rec(3.4);
      await g.untilLetter(false, 8); await g.rec(1.6); await g.key('c'); await g.rec(1.8);
      for (let i = 0; i < 4; i++) { if (await g.phase() !== 'play') break; await g.untilLetter(false, 8); await g.ff(0.8); await g.key('1'); await g.ff(4); }
      await g.ff(0.5); await g.rec(6);
  } },
  ...Object.fromEntries(['office2', 'castle', 'lab', 'inferno', 'kyoto', 'lumber', 'space'].map(lv => [lv + '-long', { level: lv, long: true, run: async g => {
      await g.untilLetter(); await g.rec(1.3); await g.cut();
      const end = g.frames() + 10.5 * 30;
      while (g.frames() < end) { await g.untilLetter(true, (end - g.frames()) / 30); if (g.frames() >= end) break; await g.rec(1.0); await g.cut(); }
  } }])),
  'home':         { level: null, run: async g => { await g.rec(4); } },
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const name of process.argv.slice(2)) {
  const clip = CLIPS[name];
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  // other chats edit the game while this runs: keep Vite's live reload from restarting the page mid-clip
  await page.addInitScript(() => { window.WebSocket = class { constructor() { this.readyState = 0; } addEventListener() {} removeEventListener() {} send() {} close() {} }; });
  await page.goto(clip.level ? `http://localhost:5183/?level=${clip.level}&play=1` : 'http://localhost:5183/?level=kyoto', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__vr3, null, { timeout: 90000 });
  await page.addStyleTag({ content: '#hud,#hint,#home-dev,.home-dev,#mail-status,#xr-status,#start-here{display:none!important} #loading{display:none!important}' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => __vr3.world.renderer.setAnimationLoop(null));
  const fov = clip.fov ?? +(process.env.FOV || 0);
  if (fov && clip.level) await page.evaluate(([f, p]) => { const c = __vr3.world.camera; window.__fov0 = c.fov; c.fov = f; c.rotation.x = p; c.updateProjectionMatrix(); }, [fov, clip.pitch ?? -0.07]);
  const dir = OUT + name; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  let n = 0; const cuts = [];
  const L = () => page.evaluate(() => gardenDiagnostics().letters);
  const step = s => page.evaluate(s => __vr3.step(s), s);
  const g = {
    async ff(s) { for (let t = 0; t < s; t += 0.5) await step(Math.min(0.5, s - t)); },
    async rec(s) { for (let i = Math.round(s * FPS); i > 0; i--) { if (clip.long && cuts.length) await page.evaluate(([t, f0, p0]) => { const c = __vr3.world.camera, e = x => { x = Math.min(1, Math.max(0, x)); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }; c.fov = f0 + 20 * e((t - .9) / 4); c.rotation.set(p0 + .05 * e((t - .9) / 4), -.09 * e((t - 1.5) / 7), 0, 'YXZ'); c.updateProjectionMatrix(); }, [(n - cuts[0]) / FPS, fov, clip.pitch ?? -0.07]); await step(1 / FPS); await page.screenshot({ path: `${dir}/${String(++n).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 88 }); } },
    async key(k) { await page.keyboard.press(k); },
    async cut() { cuts.push(n + 1); await page.keyboard.press('x'); },
    frames() { return n; },
    async phase() { return (await L()).phase; },
    // step until a letter is on its way in (recording while waiting if asked)
    async untilLetter(recording = false, limit = 20) {
      for (let t = 0; t < limit; t += 1 / FPS) { const l = await L(); if (l.state !== 'none' && l.subject && l.phase === 'play') return; recording ? await g.rec(1 / FPS) : await step(1 / FPS); }
    },
    async untilPhase(p, round, limit = 30) { for (let t = 0; t < limit; t += 0.25) { const l = await L(); if (l.phase === p && (!round || l.round === round)) return; await step(0.25); } },
  };
  const t0 = Date.now();
  await clip.run(g);
  fs.writeFileSync(`${dir}/cuts.json`, JSON.stringify(cuts));
  console.log(name, n, 'frames', ((Date.now() - t0) / 1000).toFixed(0) + 's', JSON.stringify(await L()).slice(0, 160));
  await page.close();
}
await browser.close();
