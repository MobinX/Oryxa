import { gte } from 'drizzle-orm';
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
 * WARNING: this wipes pre-existing data too — only use against a throwaway
 * database. Order matters: children first, then parents, to respect FK
 * constraints. PGlite tests don't need this (the in-memory DB is destroyed
 * on teardown).
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

/**
 * Deletes only rows created at or after {@link marker}.
 *
 * Each application table has an immutable creation timestamp (`created_at` for
 * all tables except `messages`, which uses `time`). Comparing against a marker
 * captured at test start means we delete exactly the rows created during the
 * run — without reading every existing ID into memory. This scales to tables
 * of any size: it's a single filtered DELETE per table (O(test-created rows)),
 * not a full scan-and-transfer of all IDs.
 *
 * Children are deleted before parents to respect FK constraints without
 * relying on cascade. Pre-existing rows (which keep their old timestamp even
 * if a test updated or soft-deleted them) are left untouched.
 *
 * @param marker A timestamp captured from the DB (`SELECT now()`) at test
 *   start. Use DB-side time, not `new Date()`, to avoid JS/DB clock skew.
 */
export async function deleteRowsCreatedSince(marker: Date): Promise<void> {
  // Child-first order. messages uses `time`; every other table uses `created_at`.
  await db.delete(messages).where(gte(messages.time, marker));
  await db.delete(conversations).where(gte(conversations.createdAt, marker));
  await db.delete(channels).where(gte(channels.createdAt, marker));
  await db.delete(agents).where(gte(agents.createdAt, marker));
  await db.delete(orders).where(gte(orders.createdAt, marker));
  await db.delete(variants).where(gte(variants.createdAt, marker));
  await db.delete(products).where(gte(products.createdAt, marker));
  await db.delete(categories).where(gte(categories.createdAt, marker));
  await db.delete(businesses).where(gte(businesses.createdAt, marker));
  await db.delete(users).where(gte(users.createdAt, marker));
}
