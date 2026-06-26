import { db } from '@db/client';
import {
  messages,
  conversations,
  channels,
  agents,
  orders,
  variants,
  products,
  categories,
  businesses,
  users,
} from '@db/schema';

/**
 * Hard-deletes ALL data from every application table.
 *
 * Used by the Neon integration test harness to guarantee the test database is
 * left empty after a run — no soft-deleted rows, no orphans. Order matters:
 * children first, then parents, to respect FK constraints.
 *
 * PGlite tests don't need this (the in-memory DB is destroyed on teardown), but
 * the function is safe to call against PGlite too.
 */
export async function hardDeleteAllData(): Promise<void> {
  await db.delete(messages);
  await db.delete(conversations);
  await db.delete(channels);
  await db.delete(agents);
  await db.delete(orders);
  await db.delete(variants);
  await db.delete(products);
  await db.delete(categories);
  await db.delete(businesses);
  await db.delete(users);
}
