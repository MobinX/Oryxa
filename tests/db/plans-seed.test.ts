import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { sql, asc } from 'drizzle-orm';
import { db } from '@db/client';
import { plans, businesses, users } from '@db/schema';
import { withPglite } from '../helpers/with-pglite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_FILE = path.resolve(__dirname, '../../packages/db/migrations/0012_add_plans_quota.sql');

withPglite({ timeoutMs: 120_000 });

/** The statements exactly as drizzle's migrator would run them, split the same way. */
function migrationStatements(): string[] {
  return readFileSync(MIGRATION_FILE, 'utf8')
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A business with no plan, written straight to the table — this file is about the DDL. */
async function newBusiness(name: string) {
  const [owner] = await db
    .insert(users)
    .values({ name: `${name} owner`, firebaseUid: `plans-seed-${name}-${Date.now()}`, signInMethod: 'google' })
    .returning({ id: users.id });
  const [business] = await db
    .insert(businesses)
    .values({ userId: owner.id, name })
    .returning();
  return business;
}

describe('0012 plans seed', () => {
  it('creates the four offers with the limits the operator named', async () => {
    const rows = await db.select().from(plans).orderBy(asc(plans.position));

    expect(rows.map((r) => r.slug)).toEqual(['free', 'starter', 'pro', 'enterprise']);
    expect(rows.map((r) => [r.messageLimit, r.commentLimit])).toEqual([[1000, 1000], [1000, 1000], [10000, 10000], [null, null]]);
    expect(rows.map((r) => r.priceCents)).toEqual([0, 2900, 7900, 0]);
    expect(rows.every((r) => r.active && r.deletedAt === null)).toBe(true);
    // Free is the fleet default, so it is the row every existing business inherits.
    expect(rows.find((r) => r.slug === 'free')?.name).toBe('Free');
  });

  it('is idempotent — replaying the file changes nothing', async () => {
    const before = await db.select().from(plans);

    // Production applies this file once; PGlite replays it on every fresh cluster, and
    // the hand-run against Neon is the same SQL. A second run must be a silent no-op,
    // including the CREATE TYPE (which 0000/0005/0008 get wrong) and the seeds (which
    // must not resurrect a plan the operator retired, nor reset a limit they edited).
    for (const statement of migrationStatements()) {
      await db.execute(sql.raw(statement));
    }

    const after = await db.select().from(plans);
    expect(after).toHaveLength(before.length);
    expect(after.map((r) => r.slug).sort()).toEqual(['enterprise', 'free', 'pro', 'starter']);
  });

  it('keeps an operator edit to a seeded plan across a replay', async () => {
    await db.update(plans).set({ messageLimit: 250 }).where(sql`${plans.slug} = 'free'`);
    for (const statement of migrationStatements()) {
      await db.execute(sql.raw(statement));
    }
    const [free] = await db.select().from(plans).where(sql`${plans.slug} = 'free'`);
    expect(free.messageLimit).toBe(250);
    await db.update(plans).set({ messageLimit: 1000 }).where(sql`${plans.slug} = 'free'`);
  });

  it('gives every business a plan pointer and a cycle anchor, both NULL until assigned', async () => {
    const business = await newBusiness('Unassigned Store');
    expect(business.planId).toBeNull();
    expect(business.planStartedAt).toBeNull();
  });
});

describe('quota_usage as the ON CONFLICT target', () => {
  it('accepts the atomic spend shape against the plain unique index', async () => {
    const business = await newBusiness('Counter Store');

    const insert = (used: number) => sql`
      INSERT INTO "quota_usage" (id, business_id, period, messages_used, comments_used)
      SELECT gen_random_uuid(), ${business.id}::uuid, '2026-10-01', ${used}, 0
      ON CONFLICT (business_id, period) DO UPDATE
        SET messages_used = quota_usage.messages_used + EXCLUDED.messages_used,
            updated_at = now()
      RETURNING messages_used`;

    const first = await db.execute(insert(1));
    const second = await db.execute(insert(1));

    // Two round trips on one HTTP driver, one row after both: this is the whole reason
    // the counter is a conditional upsert rather than a read-then-write.
    expect((first.rows[0] as { messages_used: number }).messages_used).toBe(1);
    expect((second.rows[0] as { messages_used: number }).messages_used).toBe(2);
  });
});
