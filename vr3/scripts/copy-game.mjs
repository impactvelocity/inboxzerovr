// Copies the game's build (play/dist) to public/play, where Next serves it at /play/.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const from = `${root}play/dist`, to = `${root}public/play`;
if (!existsSync(`${from}/index.html`)) { console.error('play/dist has no index.html: build the game first (npm --prefix play run build)'); process.exit(1); }
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`copied the game to public/play`);
