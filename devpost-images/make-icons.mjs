// node make-icons.mjs  draws the site's favicon (the logo's slashed zero, Ø, as 16x16 pixel art) and writes
// vr3/app/icon.svg, vr3/app/apple-icon.png (180) and vr3/app/favicon.ico (16, 32, 48). Next turns those files into <link> tags.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire('/Users/dylanjones/apps/inboxzerovr/vr3/play/package.json');
const { chromium } = require('playwright');
const app = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'vr3', 'app');

// The logo's colours: mint letters, a blue drop shadow, pink for the blade, on the game's dark ink.
const C = { '#': '#140c2a', M: '#4df5c9', H: '#c6fff0', B: '#3d5cff', P: '#ff2d9b', W: '#ffd6ec', '.': null };
// Drawn from rules on a 16x16 grid: M ring, H its shine, B its shadow, # the cut, P the blade, W the blade's edge.
const GRID = Array.from({ length: 16 }, () => Array(16).fill('.'));
const inBox = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const corner = (x, y, x0, y0, x1, y1) => (x === x0 || x === x1) && (y === y0 || y === y1);
const ring = (x, y) => inBox(x, y, 4, 2, 11, 13) && !corner(x, y, 4, 2, 11, 13)
  && !(inBox(x, y, 6, 4, 9, 11) && !corner(x, y, 6, 4, 9, 11));
const blade = (x, y) => x + y === 15 || x + y === 16;           // two pixels thick, corner to corner at 45 degrees
for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
  if (ring(x + 1, y - 1) && !ring(x, y)) GRID[y][x] = 'B';       // shadow down and to the left, as on the logo
  if (ring(x, y)) GRID[y][x] = (y === 2 || x === 4 && y < 8) ? 'H' : 'M';
  if ((x + y === 14 || x + y === 17) && ring(x, y)) GRID[y][x] = '#';   // the cut: ink either side of the blade
  if (blade(x, y) && x >= 1 && x <= 14 && y >= 1 && y <= 14) GRID[y][x] = x + y === 15 ? 'W' : 'P';
}

const pad = 0;   // the tile fills the icon; rounded corners keep it from looking like a square sticker
const rects = [];
GRID.forEach((row, y) => row.forEach((ch, x) => {
  if (C[ch]) rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${C[ch]}"/>`);
}));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
<rect x="${pad}" y="${pad}" width="${16 - pad * 2}" height="${16 - pad * 2}" rx="3" fill="${C['#']}" shape-rendering="geometricPrecision"/>
${rects.join('\n')}
</svg>
`;
fs.writeFileSync(path.join(app, 'icon.svg'), svg);

const browser = await chromium.launch();
const page = await browser.newPage();
const png = async size => {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}" style="display:block;image-rendering:pixelated"></body></html>`);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
};
// Apple draws its own rounded corners, so its icon is the full square tile.
const apple = svg.replace('rx="3"', 'rx="0"');
await page.setViewportSize({ width: 180, height: 180 });
await page.setContent(`<html><body style="margin:0"><img src="data:image/svg+xml;base64,${Buffer.from(apple).toString('base64')}" width="180" height="180" style="display:block"></body></html>`);
fs.writeFileSync(path.join(app, 'apple-icon.png'), await page.screenshot({ clip: { x: 0, y: 0, width: 180, height: 180 } }));

// favicon.ico for old browsers and crawlers: PNG entries packed in an ICO header.
const sizes = [16, 32, 48];
const pngs = [];
for (const s of sizes) pngs.push(await png(s));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(s, e); head.writeUInt8(s, e + 1); head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
  head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
fs.writeFileSync(path.join(app, 'favicon.ico'), Buffer.concat([head, ...pngs]));

// A sheet to look at: the icon at tab size on light and dark, and big.
await page.setViewportSize({ width: 560, height: 220 });
await page.setContent(`<html><body style="margin:0;display:flex;font:12px system-ui">
${['#ffffff', '#202124'].map(bg => `<div style="background:${bg};padding:20px;display:flex;gap:16px;align-items:center">
${[16, 32, 48].map(s => `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${s}" height="${s}">`).join('')}</div>`).join('')}
<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="180" height="180" style="margin:20px;image-rendering:pixelated"></body></html>`);
const sheet = process.argv[2];
if (sheet) fs.writeFileSync(sheet, await page.screenshot());
await browser.close();
console.log('icon.svg, apple-icon.png, favicon.ico');
