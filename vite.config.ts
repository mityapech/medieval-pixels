import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths, so the built game works from any folder (GitHub Pages serves it under /medieval-pixels/).
  base: './',
  build: {
    target: 'es2022', // the town view uses top-level await
    rollupOptions: {
      input: { town: resolve(__dirname, 'index.html') },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // Whole-town runs of 100 days take a second or two each.
    testTimeout: 60_000,
  },
});
