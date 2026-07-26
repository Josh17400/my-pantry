import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@larder/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // better-sqlite3 is native; pool forks isolate better on Windows
    pool: 'forks',
  },
});
