// Small copies of the level-select pictures, for the cards (the flat home screen and the menu in VR).
//
// A card is about 250 px wide on the home screen and a 640 by 400 canvas in VR, but its pictures are
// 1672 by 941 (or a whole 2172 by 724 painting): sixteen of those on the home screen cost ~2.5 MB to fetch
// and ~100 MB of decoded pixels in the headset's browser. Each copy here is 432 px tall (enough for a
// card at twice the pixels, zoomed 1.1 on hover), same shape as its picture, at public/thumbs/<its path>.
// The game asks for the thumb and falls back to the full picture if there is none (src/thumbs.ts).
//
// Run after changing any card, home or level picture:  node tools/thumbs.mjs   (needs cwebp: brew install webp)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pub = fileURLToPath(new URL('../public/', import.meta.url));
const HEIGHT = 432;

const sources = [];
for (const f of readdirSync(join(pub, 'home'))) if (f.endsWith('.webp')) sources.push(`home/${f}`);
for (const id of readdirSync(join(pub, 'levels'))) {
  const dir = join(pub, 'levels', id);
  if (!statSync(dir).isDirectory()) continue;
  const files = readdirSync(dir);
  const cards = files.filter(f => /^card-.*\.webp$/.test(f));
  // a level with no card art shows its painting on the card (src/home.ts: level.card ?? level.art)
  for (const f of cards.length ? cards : files.filter(f => /^(start|end)\.webp$/.test(f))) sources.push(`levels/${id}/${f}`);
}

let before = 0, after = 0;
for (const rel of sources) {
  const from = join(pub, rel), to = join(pub, 'thumbs', rel);
  if (existsSync(to) && statSync(to).mtimeMs >= statSync(from).mtimeMs) { before += statSync(from).size; after += statSync(to).size; continue; }
  mkdirSync(dirname(to), { recursive: true });
  // -resize 0 H keeps the shape; -sharp_yuv keeps thin edges and saturated colour crisp; -m 6 is the slowest, smallest encode
  execFileSync('cwebp', ['-quiet', '-q', '90', '-m', '6', '-sharp_yuv', '-resize', '0', String(HEIGHT), from, '-o', to]);
  before += statSync(from).size; after += statSync(to).size;
  console.log(`${rel}: ${Math.round(statSync(from).size / 1024)} KB -> ${Math.round(statSync(to).size / 1024)} KB`);
}
console.log(`${sources.length} thumbs: ${(before / 1048576).toFixed(2)} MB of pictures, ${(after / 1048576).toFixed(2)} MB of thumbs`);
