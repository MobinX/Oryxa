import { inArray } from 'drizzle-orm';
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
 * A snapshot of the IDs present in every application table at a point in time.
 * Used by the Neon test harness to delete only rows created during a test run
 * (the diff between a snapshot taken at start and the IDs present at end),
 * leaving any pre-existing data untouched.
 */
export type TableIdSnapshot = {
  users: Set<string>;
  businesses: Set<string>;
  categories: Set<string>;
  products: Set<string>;
  variants: Set<string>;
  orders: Set<string>;
  agents: Set<string>;
  channels: Set<string>;
  conversations: Set<string>;
  messages: Set<string>;
};

/**
 * Captures the current set of primary-key IDs for every application table.
 * Call this before a test run; pass the result to {@link deleteRowsCreatedSince}
 * after the run to remove only the rows created in between.
 */
export async function snapshotTableRowIds(): Promise<TableIdSnapshot> {
  const [u, b, c, p, v, o, a, ch, cv, m] = await Promise.all([
    db.select({ id: users.id }).from(users),
    db.select({ id: businesses.id }).from(businesses),
    db.select({ id: categories.id }).from(categories),
    db.select({ id: products.id }).from(products),
    db.select({ id: variants.id }).from(variants),
    db.select({ id: orders.id }).from(orders),
    db.select({ id: agents.id }).from(agents),
    db.select({ id: channels.id }).from(channels),
    db.select({ id: conversations.id }).from(conversations),
    db.select({ id: messages.id }).from(messages),
  ]);
  return {
    users: new Set(u.map((r) => r.id)),
    businesses: new Set(b.map((r) => r.id)),
    categories: new Set(c.map((r) => r.id)),
    products: new Set(p.map((r) => r.id)),
    variants: new Set(v.map((r) => r.id)),
    orders: new Set(o.map((r) => r.id)),
    agents: new Set(a.map((r) => r.id)),
    channels: new Set(ch.map((r) => r.id)),
    conversations: new Set(cv.map((r) => r.id)),
    messages: new Set(m.map((r) => r.id)),
  };
}

/**
 * Deletes only the rows whose IDs are present now but were NOT in {@link before}.
 * Children are deleted before parents to respect FK constraints without relying
 * on cascade. Pre-existing rows (those in the snapshot) are left untouched.
 */
export async function deleteRowsCreatedSince(before: TableIdSnapshot): Promise<void> {
  const tables = [
    [messages, before.messages],
    [conversations, before.conversations],
    [channels, before.channels],
    [agents, before.agents],
    [orders, before.orders],
    [variants, before.variants],
    [products, before.products],
    [categories, before.categories],
    [businesses, before.businesses],
    [users, before.users],
  ] as const;

  for (const [table, beforeIds] of tables) {
    const rows = await db.select({ id: table.id }).from(table);
    const newIds = rows.map((r) => r.id).filter((id) => !beforeIds.has(id));
    if (newIds.length > 0) {
      await db.delete(table).where(inArray(table.id, newIds));
    }
  }
}
