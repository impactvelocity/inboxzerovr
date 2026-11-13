import { defineConfig, loadEnv } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

/**
 * The game. Since 2026-11-12 it lives in vr3/play and the site and API (Next.js) in vr3 above it.
 * In production the site serves this build at /play, so `base` stays relative.
 *
 * Everything under /api (the inbox, replies, Gmail sign-in, the Scribe token for round two's mic)
 * is the Next.js app. In development this server passes /api through to it (vr3: `npm run dev`,
 * on port 3000; API_ORIGIN changes that), so the page and the API share one origin and the
 * sign-in cookie reaches both. Without the Next app running the game still plays: the demo inbox
 * is bundled, and the mic falls back to the browser's own speech recognition, then the mock.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const api = env.API_ORIGIN || process.env.API_ORIGIN || 'http://localhost:3000';
  return {
    base: './',
    plugins: process.env.HTTPS === '1' ? [basicSsl()] : [],
    server: { port: 5183, strictPort: true, proxy: { '/api': { target: api, changeOrigin: false, xfwd: true } } },
    preview: { port: 4183, strictPort: true, proxy: { '/api': { target: api, changeOrigin: false, xfwd: true } } },
    resolve: { dedupe: ['three', '@pmndrs/uikit'] },
    optimizeDeps: { exclude: ['@babylonjs/havok'] },
    // (two pages: the game, and showcase.html, the one-level 3D view the site's front page lays over each level's painting)
    build: { target: 'esnext', chunkSizeWarningLimit: 1600, rollupOptions: { input: { main: 'index.html', showcase: 'showcase.html' } } },
  };
});
