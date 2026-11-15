// node render-og.mjs  renders og.html's .card (1200 x 630) to vr3/app/opengraph-image.jpg and twitter-image.jpg,
// which Next serves and points the og:image and twitter:image tags at.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire('/Users/dylanjones/apps/inboxzerovr/vr3/play/package.json');
const { chromium } = require('playwright');
const dir = path.dirname(new URL(import.meta.url).pathname);
const app = path.join(dir, '..', 'vr3', 'app');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`file://${dir}/og.html`);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
const png = await page.locator('.card').screenshot({ type: 'jpeg', quality: 88 });
fs.writeFileSync(path.join(app, 'opengraph-image.jpg'), png);
fs.writeFileSync(path.join(app, 'twitter-image.jpg'), png);
await browser.close();
console.log('opengraph-image.jpg, twitter-image.jpg');
