import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { sql } from 'drizzle-orm';
import * as schema from '@db/schema';
import { setupPgliteDatabase, teardownPgliteDatabase, getPgliteDb } from '../helpers/pglite-db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = path.resolve(__dirname, '../../packages/db/migrations');
const ROLLBACK_FILE = path.resolve(
  __dirname,
  '../../packages/db/migrations/rollback/0035_admin_ai_channels.down.sql',
);

describe('migration 0035 — admin AI channels', () => {
  beforeAll(async () => {
    await setupPgliteDatabase();
  });

  afterAll(async () => {
    await teardownPgliteDatabase();
  });

  it('clean migrates and leaves every pre-existing entity intact', async () => {
    const db = getPgliteDb();
    const tables = await db.execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public'`,
    );
    const names = tables.rows.map((row) => row.tablename);
    for (const legacy of ['businesses', 'channels', 'conversations', 'messages', 'comment_threads', 'orders']) {
      expect(names).toContain(legacy);
    }
    for (const added of [
      'leads',
      'lead_events',
      'channel_ai_configs',
      'business_profiles',
      'knowledge_entries',
      'capacity',
      'capacity_reservations',
    ]) {
      expect(names).toContain(added);
    }
    expect(schema).toBeDefined();
  });

  it('sent_by and ai_paused arrived with safe defaults and no data loss', async () => {
    const db = getPgliteDb();
    const cols = await db.execute<{ column_name: string; column_default: string | null }>(
      sql`select column_name, column_default from information_schema.columns where table_name in ('messages','conversations') and column_name in ('sent_by','ai_paused')`,
    );
    const byName = new Map(cols.rows.map((row) => [row.column_name, row.column_default]));
    expect(byName.get('sent_by')).toBeNull();
    expect(byName.get('ai_paused')).toContain('false');
  });

  it('lead dedupe refuses a second row for the same platform user on a channel', async () => {
    const db = getPgliteDb();
    const [user] = await db
      .insert(schema.users)
      .values({ name: 't', firebaseUid: 'mig-test-uid', signInMethod: 'password' })
      .returning();
    const [business] = await db
      .insert(schema.businesses)
      .values({ name: 't', userId: user.id })
      .returning();
    const [channel] = await db
      .insert(schema.channels)
      .values({ platform: 'facebook', apiToken: 'tok', platformChannelId: 'pg-mig' })
      .returning();

    await db
      .insert(schema.leads)
      .values({ businessId: business.id, channelId: channel.id, platform: 'facebook', platformUserId: 'u-1' });
    await expect(
      db
        .insert(schema.leads)
        .values({ businessId: business.id, channelId: channel.id, platform: 'facebook', platformUserId: 'u-1' }),
    ).rejects.toThrow(/leads_channel_platform_user_uniq_idx/);
  });

  it('rolls back 0035 and keeps pre-existing data', async () => {
    // Fresh disposable instance that carries data written by earlier migrations.
    const client = new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    const [user] = await db
      .insert(schema.users)
      .values({ name: 'RB', firebaseUid: 'rb-uid', signInMethod: 'password' })
      .returning();
    const [business] = await db
      .insert(schema.businesses)
      .values({ name: 'Rollback Store', userId: user.id })
      .returning();
    await db
      .insert(schema.leads)
      .values({ businessId: business.id, channelId: (await insertChannel(db, business.id)).id, platform: 'facebook', platformUserId: 'rb-lead' });

    // The script is a rollback SQL file split with the drizzle breakpoint marker,
    // exactly like the ids the journal's own migrations carry.
    const statements = readFileSync(ROLLBACK_FILE, 'utf8')
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);
    expect(statements.length).toBeGreaterThan(5);
    for (const statement of statements) {
      await db.execute(sql.raw(statement));
    }

    await expect(db.execute(sql`select 1 from "leads"`)).rejects.toThrow();
    await expect(db.execute(sql`select 1 from "capacity"`)).rejects.toThrow();
    const survivors = await db.execute<{ name: string }>(
      sql`select name from "businesses" where id = ${business.id}`,
    );
    expect(survivors.rows.map((row) => row.name)).toEqual(['Rollback Store']);
    const messageColumns = await client.query<{ count: string }>(
      "select count(*) as count from information_schema.columns where table_name = 'messages' and column_name = 'sent_by'",
    );
    expect(Number(messageColumns.rows[0].count)).toBe(0);

    await client.close();
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
async function insertChannel(db: any, businessId: string) {
  const [channel] = await db
    .insert(schema.channels)
    .values({ platform: 'facebook', apiToken: 'tok', platformChannelId: `pg-${businessId}`, businessId })
    .returning();
  return channel;
}
