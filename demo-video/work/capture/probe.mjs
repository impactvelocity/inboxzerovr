import { createRequire } from 'module';
const require = createRequire('/Users/dylanjones/apps/inboxzerovr/vr3/play/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)); });
const urls = process.argv.slice(2);
for (const u of urls) {
  const t0 = Date.now();
  await page.goto(u, { waitUntil: 'load' });
  await page.waitForTimeout(6000);
  const name = u.replace(/[^a-z0-9]+/gi, '_').slice(-60);
  await page.screenshot({ path: `shots/${name}.png` });
  console.log(name, Date.now() - t0, 'ms');
}
await browser.close();
