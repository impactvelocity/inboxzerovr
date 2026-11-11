import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vitest/config';

// WebXR needs a secure context. `localhost` already counts (use
// `adb reverse tcp:5173 tcp:5173` for a USB-connected headset). For Wi-Fi
// access by LAN IP run `npm run dev:https`, which serves a self-signed cert.
const https = process.env.HTTPS === '1';

export default defineConfig({
  plugins: https ? [basicSsl()] : [],
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  preview: { host: '0.0.0.0', port: 4173 },
  build: { target: 'es2022', sourcemap: true },
  base: './',
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
