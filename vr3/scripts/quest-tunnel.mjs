// Keeps the Quest's USB tunnel to the game open while the dev servers run (started by dev-all.mjs).
//
// The headset reaches the game at http://localhost:5183 through `adb reverse`. That tunnel is wiped every time the
// headset's USB link resets (it sleeps when taken off, the cable moves, it reboots), and then the game looks as if the
// server had stopped: "site can't be reached" (2026-11-13, "server keeps turning off"). So every few seconds this
// checks the tunnel is there and puts it back if not. With no adb or no headset plugged in it just waits, quietly.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const PORTS = [5183];
const EVERY = 3000;
const candidates = [
  process.env.ADB,
  '/Applications/Unity/Hub/Editor/6000.6.8f1/PlaybackEngines/AndroidPlayer/SDK/platform-tools/adb',
  `${homedir()}/Library/Android/sdk/platform-tools/adb`,
  '/opt/homebrew/bin/adb', '/usr/local/bin/adb',
].filter(Boolean);
const adb = candidates.find(p => existsSync(p)) ?? 'adb';

const run = (args) => new Promise(resolve => execFile(adb, args, { timeout: 5000 }, (error, stdout) => resolve(error ? null : String(stdout))));
let said = '';
const say = (text) => { if (text !== said) { said = text; console.log(text); } };

async function check() {
  const devices = await run(['devices']);
  if (devices === null) return say('adb not found: the Quest tunnel is not kept (set ADB to its path)');
  const ready = devices.split('\n').slice(1).filter(line => /\tdevice$/.test(line.trim()) || /\sdevice$/.test(line));
  if (!ready.length) return say('no headset on USB: waiting for one');
  const list = (await run(['reverse', '--list'])) ?? '';
  const missing = PORTS.filter(port => !list.includes(`tcp:${port} tcp:${port}`));
  if (!missing.length) return say(`headset tunnel open: localhost:${PORTS.join(', ')}`);
  for (const port of missing) await run(['reverse', `tcp:${port}`, `tcp:${port}`]);
  said = ''; say(`headset tunnel restored: localhost:${missing.join(', ')}`);
}

await check();
setInterval(() => { void check(); }, EVERY);
