import { createRequire } from 'module';
const require = createRequire('/Users/dylanjones/apps/inboxzerovr/vr3/play/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`http://localhost:5183/?level=${process.argv[2]}&play=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__vr3, null, { timeout: 90000 });
await page.addStyleTag({ content: '#hud,#hint{display:none!important}' });
await page.waitForTimeout(2500);
await page.evaluate(() => __vr3.world.renderer.setAnimationLoop(null));
console.log(await page.evaluate(() => __vr3.world.camera.fov));
await page.evaluate(() => { const c = __vr3.world.camera; c.fov = 42; c.updateProjectionMatrix(); });
for (let t = 0; t < 30; t++) { await page.evaluate(() => __vr3.step(0.25)); const l = await page.evaluate(() => gardenDiagnostics().letters); if (l.phase === 'play' && l.subject) break; }
await page.evaluate(() => __vr3.step(1.0));
console.log(await page.evaluate(() => __vr3.world.camera.fov));
await page.screenshot({ path: `shots/fov-${process.argv[2]}.jpg`, type: 'jpeg' });
await browser.close();
