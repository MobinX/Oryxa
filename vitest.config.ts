import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    // tests/neon writes into the real (shared) DATABASE_URL — only run it via
    // `bun run test:neon` (which passes the tests/neon path argument).
    exclude: process.argv.some((a) => a.includes('tests/neon'))
      ? ['**/node_modules/**']
      : ['**/node_modules/**', '**/tests/neon/**'],
    server: {
      deps: {
        inline: ['@neondatabase/serverless', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'apps/api/src/**/*.ts',
        'packages/db/**/*.ts',
        'packages/agent/**/*.ts',
        'packages/integrations/**/*.ts',
        'packages/shared/**/*.ts',
        'packages/utils/**/*.ts',
      ],
      exclude: ['**/*.test.ts', '**/node_modules/**'],
    },
  },
  resolve: {
    alias: {
      '@repo/db': path.resolve(__dirname, './packages/db'),
      '@repo/shared': path.resolve(__dirname, './packages/shared'),
      '@repo/agent': path.resolve(__dirname, './packages/agent'),
      '@repo/integrations': path.resolve(__dirname, './packages/integrations'),
      '@repo/utils': path.resolve(__dirname, './packages/utils'),
      '@db': path.resolve(__dirname, './packages/db'),
      '@shared': path.resolve(__dirname, './packages/shared'),
      '@agent': path.resolve(__dirname, './packages/agent'),
      '@api': path.resolve(__dirname, './apps/api/src'),
    },
  },
});
