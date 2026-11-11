import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
export default defineConfig({
  base: './',
  plugins: process.env.HTTPS === '1' ? [basicSsl()] : [],
  server: { port: 5183, strictPort: true },
  preview: { port: 4183, strictPort: true },
  resolve: { dedupe: ['three', '@pmndrs/uikit'] },
  optimizeDeps: { exclude: ['@babylonjs/havok'] },
  build: { target: 'esnext', chunkSizeWarningLimit: 1600 },
});
