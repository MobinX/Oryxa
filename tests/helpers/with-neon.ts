import { beforeAll, afterAll } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@db/schema';
import { setTestDatabase, type Database } from '@db/client';
import { deleteRowsCreatedSince } from './cleanup';

export function getNeonDatabaseUrl(): string | undefined {
  return process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
}

export function withNeon(hooks?: { before?: () => Promise<void>; after?: () => Promise<void> }) {
  // Marker captured from the DB clock at test start. Rows whose creation
  // timestamp is >= this are deleted in afterAll, so only data created during
  // the run is removed — pre-existing data is preserved regardless of DB size.
  let marker: Date;

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

    // Capture the DB's current time as the cleanup marker. Using DB-side time
    // (not `new Date()`) avoids JS/DB clock skew. Taken before the before-hook
    // so any data it seeds is also cleaned up.
    const markerRows = await sql`SELECT now() AS ts`;
    marker = new Date(markerRows[0].ts);

    await hooks?.before?.();
  });

  afterAll(async () => {
    // Delete only rows created during this test run (creation timestamp >=
    // the start marker). Preserves all pre-existing data; scales to tables of
    // any size without loading IDs into memory.
    await deleteRowsCreatedSince(marker);
    await hooks?.after?.();
    setTestDatabase(null);
  });
}
