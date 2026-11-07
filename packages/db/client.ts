import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from '@db/schema';
import { instrumentSql, withFetchTimeout } from './query-log';

export type Database = NeonHttpDatabase<typeof schema>;

let _db: Database | null = null;
let _testOverride: Database | null = null;

export function setTestDatabase(db: Database | null) {
  _testOverride = db;
}

function getDb(): Database {
  if (_testOverride) return _testOverride;
  if (_db) return _db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  // Timed out and instrumented at the one place every query passes through. The
  // timeout is always on (a wedged connection must fail a query in seconds, not
  // hang it for the fetch default of 300); the instrument stays inert until the
  // API wires a sink.
  const sql = instrumentSql(withFetchTimeout(neon(connectionString)));
  _db = drizzle(sql, { schema });
  return _db;
}

export const db = new Proxy({} as Database, {
  get(_target, prop) {
    const instance = getDb();
    const value = instance[prop as keyof Database];
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(instance);
    }
    return value;
  },
});
