// node render.mjs [name ...]  renders each <name>.html's .card to vr3/public/site/devpost/<name>.png (served at /site/devpost/) at 2000 px wide
import { createRequire } from 'module';
import path from 'path';
const require = createRequire('/Users/dylanjones/apps/inboxzerovr/vr3/play/package.json');
const { chromium } = require('playwright');
const dir = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(dir, '..', 'vr3', 'public', 'site', 'devpost');
const names = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2000, height: 1400 } });
for (const n of names) {
  await page.goto(`file://${dir}/${n}.html`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.locator('.card').screenshot({ path: `${out}/${n}.png` });
  console.log(n);
}
await browser.close();
