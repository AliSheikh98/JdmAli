import { defineConfig } from 'vite';

// Relative base so the built `dist/` folder can be opened from any path
// (or served from a sub-folder) without rewriting asset URLs.
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
