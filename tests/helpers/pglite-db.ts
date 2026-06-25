import path from 'path';
import { fileURLToPath } from 'url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@db/schema';
import { setTestDatabase, type Database } from '@db/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = path.resolve(__dirname, '../../packages/db/migrations');

let pgliteClient: PGlite | null = null;
let testDb: Database | null = null;

export async function setupPgliteDatabase(): Promise<Database> {
  if (testDb) return testDb;

  pgliteClient = new PGlite();
  testDb = drizzle(pgliteClient, { schema });
  await migrate(testDb, { migrationsFolder: MIGRATIONS_FOLDER });
  setTestDatabase(testDb);
  return testDb;
}

export async function teardownPgliteDatabase(): Promise<void> {
  setTestDatabase(null);
  if (pgliteClient) {
    await pgliteClient.close();
  }
  pgliteClient = null;
  testDb = null;
}

export function getPgliteDb(): Database {
  if (!testDb) throw new Error('PGlite not initialized — call setupPgliteDatabase() first');
  return testDb;
}
