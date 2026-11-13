import { createRequire } from 'module';
const require = createRequire('/Users/dylanjones/apps/inboxzerovr/vr3/play/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const level = process.argv[2] || 'kyoto';
await page.goto(`http://localhost:5183/?level=${level}&play=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__vr3, null, { timeout: 60000 });
await page.waitForTimeout(2000);
await page.evaluate(() => __vr3.world.renderer.setAnimationLoop(null));
const d = () => page.evaluate(() => { const l = gardenDiagnostics().letters; return `${l.phase} r${l.round} dealt${l.dealt} state=${l.state} subj="${(l.subject||'').slice(0,30)}" cut${l.cut} kept${l.kept} air${l.inTheAir} stage=${l.ui.stage} replies=${l.ui.replies}`; });
let n = 0;
for (let i = 0; i < 60; i++) {
  await page.evaluate(() => __vr3.step(0.5));
  const s = await d(); console.log((i*0.5+0.5).toFixed(1), s);
  if (/state=(waiting|ready|front|docked|hover)/.test(s) || /state=\w+/.test(s) && !/state=none/.test(s)) {
    if (i % 4 === 0) await page.screenshot({ path: `shots/${level}-x${n++}.jpg` });
    await page.keyboard.press(i % 3 === 0 ? 'c' : 'x');
  }
}
await browser.close();
