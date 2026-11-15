import { defineConfig } from 'vite';

// `base: './'` makes the build relocatable: drop `dist/` into any folder of a website.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 900 },
});
