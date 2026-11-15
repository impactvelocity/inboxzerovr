// Renders the composition (scenes/index.html) frame by frame.
//   node render.mjs frames <outDir> [from] [to]   -> JPEG frames at 30 fps
//   node render.mjs stills <outDir> t1 t2 ...       -> PNG stills at those times (+ text audit)
//   node render.mjs sfx <out.json>                  -> the effects list
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire('/Users/dylanjones/apps/inboxzerovr/vr3/play/package.json');
const { chromium } = require('playwright');
const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const [mode, out, ...rest] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto('file://' + ROOT + '/scenes/index.html');
await page.waitForFunction(() => window.READY, null, { timeout: 60000 });
const AUDIT = () => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el), txt = el.innerText.trim();
    let hidden = false; for (let p = el; p; p = p.parentElement) { const c = getComputedStyle(p); if (c.visibility === 'hidden' || +c.opacity === 0 || c.display === 'none') hidden = true; }
    if (!txt || hidden || !el.offsetWidth) continue;
    const tag = `"${txt.slice(0, 40)}"`;
    if (cs.textTransform === 'uppercase' || (/[A-Z]{4,}/.test(txt) && txt === txt.toUpperCase())) out.push(['uppercase', tag]);
    if (/[^.]\.$/.test(txt) && !/\.(com|app|ai|dev|sh|store|io|chat)$/.test(txt)) out.push(['trailing period', tag]);
    if (parseFloat(cs.fontSize) < 19) out.push(['under 19px', tag]);
    const tops = [];
    for (const n of el.childNodes) { if (n.nodeType !== 3) continue; for (const m of n.textContent.matchAll(/\S+/g)) { const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length); const q = r.getClientRects()[0]; if (q) tops.push(Math.round(q.top)); } }
    const lastTop = Math.max(...tops), lineCount = new Set(tops).size;
    if (lineCount > 1 && tops.filter(t => Math.abs(t - lastTop) < 4).length <= 2) out.push(['orphan', tag]);
    if (el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis') out.push(['overflow', tag]);
  }
  return out;
};
if (mode === 'sfx') {
  fs.writeFileSync(out, JSON.stringify(await page.evaluate(() => ({ dur: DUR, sfx: SFX, amb: AMB })), null, 1));
} else if (mode === 'stills') {
  fs.mkdirSync(out, { recursive: true });
  // render frames in order up to each still, so anything built on the way (the split card) is there
  const times = rest.map(Number).sort((a, b) => a - b);
  for (const t of times) {
    await page.evaluate(t => renderAt(t), t);
    await page.screenshot({ path: `${out}/t${t.toFixed(2).padStart(6, '0')}.png` });
    const a = await page.evaluate(AUDIT);
    if (a.length) console.log(t, JSON.stringify(a));
  }
} else {
  fs.mkdirSync(out, { recursive: true });
  const fps = 30, dur = await page.evaluate(() => DUR);
  const from = Math.round((+rest[0] || 0) * fps), to = Math.round((+rest[1] || dur) * fps);
  const t0 = Date.now();
  for (let f = from; f < to; f++) {
    await page.evaluate(t => renderAt(t), f / fps);
    await page.screenshot({ path: `${out}/${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
    if (f % 150 === 0) console.log('frame', f, '/', to, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
}
await browser.close();
