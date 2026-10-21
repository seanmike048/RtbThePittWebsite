import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  // Local development: the API runs on server.mjs (npm run api:dev); the browser only ever calls same-origin /api.
  server: { proxy: { '/api': 'http://localhost:8080' } },
});
