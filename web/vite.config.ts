import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

// WebXR needs a secure context. `localhost` counts, so a headset on USB can use
// `adb reverse tcp:5180 tcp:5180` and open http://localhost:5180. For Wi-Fi by
// LAN address run `npm run dev:https` (self-signed certificate).
const https = process.env.HTTPS === '1';

export default defineConfig({
  plugins: https ? [basicSsl()] : [],
  server: { host: '0.0.0.0', port: 5180, strictPort: true },
  preview: { host: '0.0.0.0', port: 4180 },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1500 },
  base: './',
});
