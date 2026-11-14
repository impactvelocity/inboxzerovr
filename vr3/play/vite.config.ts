import { defineConfig, loadEnv } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { readFileSync, writeFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/**
 * Weapon tuning (src/tweak.ts, tune.html): the dev server keeps every level's weapon tweak in
 * tools/weapon-tweaks.json and passes each change straight on to every open page (the headset's game too),
 * over the dev server's own socket. It also keeps a list of the pages that have said hello, for tune.html.
 */
function weaponTweaks(): Plugin {
  const file = new URL('./tools/weapon-tweaks.json', import.meta.url);
  let state: Record<string, unknown> = {};
  try { state = JSON.parse(readFileSync(file, 'utf8')); } catch { state = {}; }
  const pages = new Map<string, Record<string, unknown> & { seen: number }>();
  return {
    name: 'vr3-weapon-tweaks', apply: 'serve',
    configureServer(server) {
      const pageList = () => { const now = Date.now(); for (const [id, p] of pages) if (now - p.seen > 12000) pages.delete(id); return [...pages.values()]; };
      server.ws.on('vr3:tweak:get', (_data, client) => { client.send('vr3:tweak:all', state); client.send('vr3:tweak:pages', pageList()); });
      server.ws.on('vr3:tweak:set', (data: { level: string; tweak: unknown }) => {
        if (!data || typeof data.level !== 'string') return;
        state = { ...state, [data.level]: data.tweak };
        try { writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`); } catch { /* read-only: kept in memory */ }
        server.ws.send('vr3:tweak:all', state);
      });
      // "Save as default" on tune.html: the live tweak is added to src/weapon-holds.json (part of the game, builds too)
      // and set back to zero, so it is not applied twice. The JSON changing reloads every open game page.
      const holdsFile = new URL('./src/weapon-holds.json', import.meta.url);
      const readHolds = (): Record<string, unknown[]> => { try { return JSON.parse(readFileSync(holdsFile, 'utf8')); } catch { return {}; } };
      const saveState = () => { try { writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`); } catch { /* kept in memory */ } };
      server.ws.on('vr3:tweak:save', (data: { level: string }) => {
        const live = data && (state[data.level] as Record<string, number> | undefined);
        if (!live || !Object.values(live).some(v => v !== 0)) return;
        const holds = readHolds(); holds[data.level] = [...(holds[data.level] ?? []), live];
        writeFileSync(holdsFile, `${JSON.stringify(holds, null, 2)}\n`);
        state = { ...state, [data.level]: Object.fromEntries(Object.keys(live).map(k => [k, 0])) }; saveState();
        server.ws.send('vr3:tweak:all', state);
      });
      server.ws.on('vr3:tweak:clear-saved', (data: { level: string }) => {
        if (!data || typeof data.level !== 'string') return;
        const holds = readHolds(); if (!holds[data.level]) return;
        delete holds[data.level]; writeFileSync(holdsFile, `${JSON.stringify(holds, null, 2)}\n`);
      });
      server.ws.on('vr3:tweak:hello', (data: Record<string, unknown>) => {
        if (!data || typeof data.id !== 'string') return;
        pages.set(data.id, { ...data, seen: Date.now() });
        server.ws.send('vr3:tweak:pages', pageList());
      });
    },
  };
}

/**
 * The headset never reloads mid-game (2026-11-13: "the game still stall and kick me out, and the page reloads").
 * The Quest reaches this server over USB (`adb reverse`), and that link drops every few minutes. Each drop closed
 * Vite's live socket, and when it came back Vite's client reloaded the page: out of VR, mid-game. Any file saved
 * (by any chat) did the same. So in the Quest's browser only, the client's socket is a stand-in that quietly
 * reconnects underneath and never reports a close; and while a VR session is running, "reload" messages are held
 * back and acted on when it ends. The weapon tuning (tune.html) still reaches the game over it. Desktop pages are
 * left as Vite makes them.
 */
const HEADSET_SOCKET = /* js */ `
(() => {
  if (!/OculusBrowser|Quest/i.test(navigator.userAgent)) return;
  const Real = window.WebSocket;
  let inVR = false, reloadLater = false;
  const xr = window.XRSystem && XRSystem.prototype, request = xr && xr.requestSession;
  if (request) xr.requestSession = function (...args) {
    return request.apply(this, args).then(session => {
      inVR = true;
      session.addEventListener('end', () => { inVR = false; if (reloadLater) location.reload(); });
      return session;
    });
  };
  class Steady extends EventTarget {
    constructor(url, protocols) {
      super(); this.url = url; this.protocols = protocols; this.readyState = 0; this.queue = []; this.wait = 500; this.connect();
    }
    connect() {
      const ws = new Real(this.url, this.protocols); this.ws = ws;
      ws.addEventListener('open', () => {
        this.wait = 500; const first = this.readyState !== 1; this.readyState = 1;
        for (const data of this.queue.splice(0)) ws.send(data);
        if (first) this.dispatchEvent(new Event('open'));
      });
      ws.addEventListener('message', e => {
        // (a file saved while in VR: held until the session ends; Vite's own client would reload now)
        try { const m = JSON.parse(e.data); if (inVR && m && (m.type === 'full-reload' || m.type === 'update')) { reloadLater = true; return; } } catch {}
        this.dispatchEvent(new MessageEvent('message', { data: e.data }));
      });
      ws.addEventListener('close', () => {
        if (this.closed) return;
        // (never passed on: Vite would wait for the server and reload the page)
        if (this.readyState === 1) console.info('[headset] dev socket dropped: reconnecting without a reload');
        setTimeout(() => this.connect(), this.wait); this.wait = Math.min(5000, this.wait * 2);
      });
      ws.addEventListener('error', () => {});
    }
    send(data) { if (this.ws.readyState === 1) this.ws.send(data); else this.queue.push(data); }
    close() { this.closed = true; this.ws.close(); }
  }
  window.WebSocket = function (url, protocols) {
    return String(protocols).includes('vite-hmr') ? new Steady(url, protocols) : new Real(url, protocols);
  };
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3, prototype: Real.prototype });
})();`;
function headsetSocket(): Plugin {
  return { name: 'vr3-headset-socket', apply: 'serve', transformIndexHtml: () => [{ tag: 'script', children: HEADSET_SOCKET, injectTo: 'head-prepend' }] };
}

/**
 * The game. Since 2026-11-12 it lives in vr3/play and the site and API (Next.js) in vr3 above it.
 * In production the site serves this build at /play, so `base` stays relative.
 *
 * Everything under /api (agent rounds, the Scribe token for round two's mic) is the Next.js app.
 * In development this server passes /api through to it (vr3: `npm run dev`, on port 3000;
 * API_ORIGIN changes that), so the page and the API share one origin and the mic's cookie
 * reaches both. Without the Next app running the game still plays: the demo inbox
 * is bundled, and the mic falls back to the browser's own speech recognition, then the mock.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const api = env.API_ORIGIN || process.env.API_ORIGIN || 'http://localhost:3000';
  return {
    base: './',
    plugins: [weaponTweaks(), headsetSocket(),...(process.env.HTTPS === '1' ? [basicSsl()] : [])],
    server: { port: 5183, strictPort: true, proxy: { '/api': { target: api, changeOrigin: false, xfwd: true } } },
    preview: { port: 4183, strictPort: true, proxy: { '/api': { target: api, changeOrigin: false, xfwd: true } } },
    resolve: { dedupe: ['three', '@pmndrs/uikit'] },
    optimizeDeps: { exclude: ['@babylonjs/havok'] },
    // (two pages: the game, and showcase.html, the one-level 3D view the site's front page lays over each level's painting)
    build: { target: 'esnext', chunkSizeWarningLimit: 1600, rollupOptions: { input: { main: 'index.html', showcase: 'showcase.html' } } },
  };
});
