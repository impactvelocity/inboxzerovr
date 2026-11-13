// Runs the site and API (Next, port 3000) and the game (Vite, port 5183) together.
// Open the game at http://localhost:5183/ : its /api calls pass through to Next.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (name, args, cwd) => {
  const child = spawn('npm', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  const tag = (data) => String(data).split('\n').filter(Boolean).forEach(line => console.log(`[${name}] ${line}`));
  child.stdout.on('data', tag); child.stderr.on('data', tag);
  child.on('exit', code => { console.log(`[${name}] stopped (${code})`); process.exit(code ?? 0); });
  return child;
};
const kids = [run('site', ['run', 'dev'], root), run('game', ['run', 'dev', ...process.argv.slice(2)], `${root}play`)];
const stop = () => { for (const k of kids) k.kill('SIGTERM'); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
