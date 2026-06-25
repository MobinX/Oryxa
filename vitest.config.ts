import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@repo/db': path.resolve(__dirname, './packages/db'),
      '@repo/shared': path.resolve(__dirname, './packages/shared'),
      '@repo/agent': path.resolve(__dirname, './packages/agent'),
      '@repo/integrations': path.resolve(__dirname, './packages/integrations'),
      '@repo/utils': path.resolve(__dirname, './packages/utils'),
    },
  },
});
