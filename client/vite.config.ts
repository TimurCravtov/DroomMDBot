import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // The empty prefix loads every variable from .env files, not just VITE_ ones, so the
  // proxy target can be set without exposing it to the browser bundle.
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react(), tailwindcss()],
    server: {
      // In development the client calls the API at /api; forward that to the Go server
      // (see /server), by default on :8080. Set DEV_API_TARGET to use a remote one.
      proxy: { '/api': env.DEV_API_TARGET || 'http://localhost:8080' },
    },
  };
});
