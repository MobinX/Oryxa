import { beforeAll, afterAll } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@db/schema';
import { setTestDatabase, type Database } from '@db/client';

export function getNeonDatabaseUrl(): string | undefined {
  return process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
}

export function withNeon(hooks?: { before?: () => Promise<void>; after?: () => Promise<void> }) {
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
    const db = drizzle(sql, { schema }) as unknown as Database;
    setTestDatabase(db);
    await sql`SELECT 1`;
    await hooks?.before?.();
  });

  afterAll(async () => {
    await hooks?.after?.();
    setTestDatabase(null);
  });
}
