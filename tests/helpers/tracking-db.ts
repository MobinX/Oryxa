import { inArray } from 'drizzle-orm';
import { db } from '@db/client';
import { users, businesses } from '@db/schema';
import type { Database } from '@db/client';

export type RootRegistry = {
  /** user id -> firebaseUid, for users inserted during the run */
  users: Map<string, string>;
  /** business ids inserted during the run */
  businesses: Set<string>;
};

export function createRootRegistry(): RootRegistry {
  return { users: new Map(), businesses: new Set() };
}

/**
 * Wraps a drizzle `Database` so every INSERT into a root table (`users` or
 * `businesses`) records the returned id in {@link registry}.
 *
 * Why only roots: the schema cascades `ON DELETE CASCADE` from
 * `users -> businesses -> {categories, products->variants, orders,
 * agents->channels, conversations->messages}`. Deleting a root removes its
 * entire subtree, so descendants never need to be tracked.
 *
 * Only `insert` is proxied, and only for the two root tables — every other
 * method and table passes straight through to the real instance, so non-root
 * inserts, queries, updates and deletes are unaffected.
 */
export function createTrackingDb<T extends Database>(real: T, registry: RootRegistry): T {
  return new Proxy(real as object, {
    get(target: T, prop: string | symbol) {
      const value = (target as Record<string | symbol, unknown>)[prop];
      if (prop === 'insert' && typeof value === 'function') {
        return (table: unknown) => {
          const builder = (value as (...a: unknown[]) => unknown).call(target, table);
          if (table === users || table === businesses) {
            return wrapRootInsert(builder, table, registry);
          }
          return builder;
        };
      }
      if (typeof value === 'function') return (value as (...a: unknown[]) => unknown).bind(target);
      return value;
    },
  }) as T;
}

/**
 * Proxies a root-table insert builder so the terminal `.returning()` result is
 * scanned for created ids. Intermediate chain steps (`.values()`,
 * `.onConflictDoUpdate()`, ...) are re-wrapped so the proxy survives the
 * fluent chain until `.returning()` is reached.
 */
function wrapRootInsert(builder: unknown, table: unknown, registry: RootRegistry): unknown {
  return new Proxy(builder as object, {
    get(target: Record<string | symbol, unknown>, prop: string | symbol) {
      if (prop === 'returning') {
        const returning = target.returning as (...a: unknown[]) => unknown;
        return (...args: unknown[]) => captureRoots(returning.apply(target, args), table, registry);
      }
      const value = target[prop];
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          const result = (value as (...a: unknown[]) => unknown).apply(target, args);
          if (result && typeof result === 'object' && typeof (result as { returning?: unknown }).returning === 'function') {
            return wrapRootInsert(result, table, registry);
          }
          return result;
        };
      }
      // Forward direct `await builder` (no .returning) so the insert still runs.
      if (prop === 'then') {
        return (resolve: unknown, reject: unknown) =>
          (target.then as (r: unknown, j: unknown) => unknown)(resolve, reject);
      }
      return value;
    },
  });
}

/** Awaits a `.returning()` result and records any returned root ids. */
function captureRoots(resultThenable: unknown, table: unknown, registry: RootRegistry): Promise<unknown> {
  return Promise.resolve(resultThenable).then((rows) => {
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (!row || typeof row.id !== 'string') continue;
        if (table === users) registry.users.set(row.id, row.firebaseUid ?? '');
        else if (table === businesses) registry.businesses.add(row.id);
      }
    }
    return rows;
  });
}

/**
 * Hard-deletes every root recorded during the run, relying on the schema's
 * `ON DELETE CASCADE` to remove all descendants.
 *
 * Businesses are deleted first (their subtree cascades away), then users —
 * except any whose `firebaseUid` is in `preserveFirebaseUids` (the shared
 * test-scaffold user is reused across runs and should survive).
 *
 * Only the exact ids inserted during this run are touched, so data written by
 * concurrent writers (e.g. the live app hitting the same Neon DB) is never
 * affected — unlike a timestamp-window delete.
 */
export async function deleteTrackedRoots(
  registry: RootRegistry,
  opts: { preserveFirebaseUids?: Set<string> } = {},
): Promise<void> {
  if (registry.businesses.size > 0) {
    await db.delete(businesses).where(inArray(businesses.id, [...registry.businesses]));
  }
  const preserve = opts.preserveFirebaseUids ?? new Set<string>();
  const userIds = [...registry.users.entries()]
    .filter(([, firebaseUid]) => !preserve.has(firebaseUid))
    .map(([id]) => id);
  if (userIds.length > 0) {
    await db.delete(users).where(inArray(users.id, userIds));
  }
}
