import { gte, type Column, type SQL } from 'drizzle-orm';

/**
 * Inclusive lower bound on a row's last-change timestamp (the `since` query filter).
 *
 * Callers pass the table's `updatedAt` column where it exists. Where a table has no
 * `updatedAt`, they pass the column that actually records the last change — `createdAt`
 * on append-only tables, `time` on message/comment rows, `lastStateAt` on threads —
 * so the wire contract is identical for every read endpoint.
 *
 * Absent, empty or unparseable values mean "no filter": the query must never fail or
 * silently return nothing because a client sent a blank `?since=`.
 */
export function sinceCondition(column: Column, since: unknown): SQL | undefined {
  if (typeof since !== 'string' && !(since instanceof Date)) return undefined;
  if (since === '') return undefined;
  const date = since instanceof Date ? since : new Date(since);
  if (Number.isNaN(date.getTime())) return undefined;
  return gte(column, date);
}

/**
 * Parse the raw `?since=` value from routes that read the query string by hand.
 * Blank and malformed values are treated as "no filter", matching sinceCondition.
 */
export function parseSince(raw: string | undefined | null): Date | undefined {
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
