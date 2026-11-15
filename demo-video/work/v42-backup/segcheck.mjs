// Lists each footage shot, the clip frames it needs, and how long it would freeze on a first or last frame.
import { createRequire } from 'module';
const require = createRequire('/Users/dylanjones/apps/inboxzerovr/vr3/play/package.json');
const { chromium } = require('playwright');
const ROOT = new URL('..', import.meta.url).pathname;
const b = await chromium.launch(); const p = await b.newPage();
await p.goto('file://' + ROOT + 'scenes/index.html'); await p.waitForFunction(() => window.READY);
const rows = await p.evaluate(() => SEG.map(([clip, from, to, at, key0]) => {
  const n = FOOT[clip], key = keyOf(clip, key0);
  const f0 = key + (from - at) * 30, f1 = key + (to - at) * 30;
  return { clip, from: +from.toFixed(2), len: +(to - from).toFixed(2), f0: Math.round(f0), f1: Math.round(f1), n, headFreeze: +Math.max(0, (1 - f0) / 30).toFixed(2), tailFreeze: +Math.max(0, (f1 - n) / 30).toFixed(2) };
}));
console.table(rows); await b.close();
