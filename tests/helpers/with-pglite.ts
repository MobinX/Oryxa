import { beforeAll, afterAll } from 'vitest';
import { setupPgliteDatabase, teardownPgliteDatabase } from './pglite-db';

export function withPglite(hooks?: {
  before?: () => Promise<void>;
  after?: () => Promise<void>;
  /** Migrations on this box sometimes need longer than vitest's 30 s default. */
  timeoutMs?: number;
}) {
  beforeAll(
    async () => {
      process.env.NODE_ENV = 'test';
      process.env.INTERNAL_KEY = process.env.INTERNAL_KEY ?? 'test-internal-key';
      process.env.META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN ?? 'test-token';
      process.env.META_APP_SECRET = process.env.META_APP_SECRET ?? 'test-app-secret';
      process.env.AGENT_RUNNER_URL = process.env.AGENT_RUNNER_URL ?? 'http://localhost:3001';
      await setupPgliteDatabase();
      await hooks?.before?.();
    },
    hooks?.timeoutMs,
  );

  afterAll(async () => {
    await hooks?.after?.();
    await teardownPgliteDatabase();
  });
}
