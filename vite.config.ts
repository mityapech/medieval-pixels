import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    rollupOptions: {
      input: { stats: resolve(__dirname, 'stats.html') },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
