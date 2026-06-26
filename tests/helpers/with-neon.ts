import { beforeAll, afterAll } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@db/schema';
import { setTestDatabase, type Database } from '@db/client';
import { createTrackingDb, createRootRegistry, deleteTrackedRoots, type RootRegistry } from './tracking-db';
import { TEST_FIREBASE_UID } from './seed';

export function getNeonDatabaseUrl(): string | undefined {
  return process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
}

export function withNeon(hooks?: { before?: () => Promise<void>; after?: () => Promise<void> }) {
  // Roots (users, businesses) inserted during the run are recorded by the
  // tracking db. afterAll deletes exactly those ids; the schema's cascade
  // removes all descendants. Data written by concurrent writers is untouched
  // because we only ever delete ids we ourselves inserted.
  let registry: RootRegistry;

  beforeAll(async () => {
    const neonUrl = getNeonDatabaseUrl();
    if (!neonUrl) {
      throw new Error('NEON_DATABASE_URL or DATABASE_URL is required for Neon CRUD tests');
    }

    process.env.NODE_ENV = 'test';
    process.env.INTERNAL_KEY = process.env.INTERNAL_KEY ?? 'test-internal-key';
    process.env.META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN ?? 'test-token';
    process.env.AGENT_RUNNER_URL = process.env.AGENT_RUNNER_URL ?? 'http://localhost:3001';

    const sql = neon(neonUrl);
    const realDb = drizzle(sql, { schema }) as unknown as Database;
    registry = createRootRegistry();
    setTestDatabase(createTrackingDb(realDb, registry));
    await sql`SELECT 1`;

    await hooks?.before?.();
  });

  afterAll(async () => {
    // Delete only the roots this run created; preserve the shared scaffold
    // user (reused across runs). Cascade wipes every descendant.
    await deleteTrackedRoots(registry, { preserveFirebaseUids: new Set([TEST_FIREBASE_UID]) });
    await hooks?.after?.();
    setTestDatabase(null);
  });
}
