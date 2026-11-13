import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

/**
 * The site and API at the root; the game (vr3/play, a Vite build) is copied into public/play by
 * `npm run build:game` and served as static files at /play/.
 *
 * The game's assets are relative ('./assets/…', 'levels/…'), so it must be opened at /play/ with
 * the slash: Next's own trailing-slash redirect is off, /play goes to /play/ (proxy.ts), and /play/
 * is the game's index.html.
 */
const config: NextConfig = {
  turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) },      // (vr3, not the repo above it with its own lockfile)
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return { beforeFiles: [{ source: '/play/', destination: '/play/index.html' }], afterFiles: [], fallback: [] };
  },
  async headers() {
    // The headset reads the game's big paintings and sounds often: let them be cached; the page itself is not.
    return [
      { source: '/play/index.html', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/play/assets/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ];
  },
};

export default config;
