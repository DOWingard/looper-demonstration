import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

// Frontend lives in src/web; built into ./dist which the Node server serves. In dev,
// `npm run dev:web` proxies API + WS to the backend on :4178.
export default defineConfig({
  root: path.join(dir, 'src/web'),
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.join(dir, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5178,
    proxy: {
      '/api': 'http://127.0.0.1:4178',
      '/ws': { target: 'ws://127.0.0.1:4178', ws: true },
    },
  },
});
