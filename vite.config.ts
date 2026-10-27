import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    target: 'es2022', // the town view uses top-level await
    rollupOptions: {
      input: { town: resolve(__dirname, 'index.html'), stats: resolve(__dirname, 'stats.html') },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
