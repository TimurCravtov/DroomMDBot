import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The Go server (see /server) listens on :8080 by default.
    proxy: { '/api': 'http://localhost:8080' },
  },
});
