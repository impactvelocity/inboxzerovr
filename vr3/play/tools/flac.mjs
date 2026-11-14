// The game's sound effects as FLAC instead of WAV: lossless (every sample the same, checked below)
// at about half the size. Every browser that runs the game decodes FLAC with decodeAudioData (Quest
// browser, Chrome, Safari, Firefox), and unlike MP3 or AAC it adds no silence at the start, so a cut
// still sounds the instant it lands.
//
// src/ambience.ts asks for <name>.flac and falls back to <name>.wav, so a WAV a tool has just written
// still plays; run this afterwards to convert it:  node tools/flac.mjs   (needs ffmpeg)
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/audio/', import.meta.url));
const walk = dir => readdirSync(dir).flatMap(f => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const pcm = file => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a', '-f', 'md5', '-'], { encoding: 'utf8' }).trim();

let before = 0, after = 0, count = 0;
for (const wav of walk(root).filter(f => f.endsWith('.wav'))) {
  const flac = wav.slice(0, -4) + '.flac';
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-map', '0:a', '-map_metadata', '-1', '-c:a', 'flac', '-compression_level', '12', flac]);
  if (pcm(wav) !== pcm(flac)) { unlinkSync(flac); console.error(`${wav}: not identical once converted, left as WAV`); continue; }
  before += statSync(wav).size; after += statSync(flac).size; count++;
  unlinkSync(wav);
}
console.log(`${count} effects: ${(before / 1048576).toFixed(1)} MB of WAV is now ${(after / 1048576).toFixed(1)} MB of FLAC`);
