// node render-level.mjs kyoto [castle ...]   renders level-<name>.html's .card (2400 x 1600, 3:2) to levels/<name>.png
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire('/Users/dylanjones/apps/inboxzerovr/vr3/play/package.json');
const { chromium } = require('playwright');
const dir = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(dir, 'levels');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2400, height: 1600 } });
for (const n of process.argv.slice(2)) {
  await page.goto(`file://${dir}/level-${n}.html`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await page.locator('.card').screenshot({ path: `${out}/${n}.png` });
  console.log(`${out}/${n}.png`);
}
await browser.close();
