import { and, eq, gte, isNull, lt, sql, type SQL } from 'drizzle-orm';
import type { Column } from 'drizzle-orm';
import { db } from '@db/client';
import {
  businesses,
  channels,
  conversations,
  hourlyTokenAnalytics,
  messages,
  orders,
  products,
  users,
  visits,
} from '@db/schema';
import type {
  AdminDailyPoint,
  AdminSnapshot,
  AdminTopBusiness,
  AdminWindowMetrics,
} from '@repo/shared';

/**
 * Platform-wide analytics for the operator console. These are the merchant queries
 * in `crud/stats.ts` with the `business_id` predicate removed, kept in their own file
 * because a global aggregate has different failure modes: no business to bound the
 * scan, and no per-tenant index that a whole-table group can use.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type AdminRange = {
  start: Date;
  end: Date;
  days: number;
  tz: string;
  /** The calendar days `daily` will contain, oldest first — computed once, with the window. */
  keys: string[];
};

/**
 * `created_at`/`time` columns are `timestamp without time zone` holding UTC, so
 * `AT TIME ZONE 'UTC'` declares the naive value as an instant and the second cast
 * renders it in the reader's zone. With `tz = 'UTC'` this is the plain UTC bucketing
 * the merchant dashboard has always used.
 */
function dayInZone(col: Column | SQL, tz: string): SQL<string> {
  return sql<string>`to_char((${col} at time zone 'UTC') at time zone ${tz}::text, 'YYYY-MM-DD')`;
}

const int = sql<number>`count(*)::int`;

function countOf(value: { count: number } | undefined): number {
  return value?.count ?? 0;
}

function keyOf(at: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/**
 * Whole calendar days apart, walked in `Date.UTC` so a DST change in the reader's
 * zone cannot make a day go missing or come twice.
 */
function shiftKey(key: string, by: number): string {
  const [year, month, day] = key.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day) + by * DAY_MS);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(
    shifted.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** Milliseconds to add to UTC to read the wall clock in `tz` at that instant. */
function zoneOffset(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const value = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return (
    Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second')) -
    at.getTime()
  );
}

/**
 * The instant the reader's clock struck midnight on that day — the wall clock reading
 * put back into UTC. Twice, because the offset on each side of a DST change differs
 * and the first pass is what tells you which side you are on.
 *
 * Done in Node rather than by asking Postgres `AT TIME ZONE`: the answer must be the
 * same in production and in the pglite tests, and only the ECMAScript implementation
 * is guaranteed to be. It also takes the two extra queries out of every page load.
 */
function zoneMidnight(key: string, tz: string): Date {
  const wall = new Date(`${key}T00:00:00Z`).getTime();
  const once = wall - zoneOffset(new Date(wall), tz);
  return new Date(wall - zoneOffset(new Date(once), tz));
}

/**
 * A window whose start is a midnight in the reader's own zone. That is what lets the
 * per-day bars and the summary number add up to the same thing: a window that began
 * mid-evening would put its first bar in a day the totals only partly cover, and the
 * chart would read as a dip nobody caused.
 */
export function resolveAdminRange(days: number, tz: string, now = new Date()) {
  const today = keyOf(now, tz);
  const keys = Array.from({ length: days }, (_, index) => shiftKey(today, index - (days - 1)));
  const start = zoneMidnight(keys[0], tz);
  const previousStart = zoneMidnight(shiftKey(keys[0], -days), tz);

  return {
    range: { start, end: now, days, tz, keys } satisfies AdminRange,
    previous: { start: previousStart, end: start, days, tz, keys: [] } satisfies AdminRange,
  };
}

export async function getAdminSnapshot(): Promise<AdminSnapshot> {
  const [usersRow, businessesRow, storesRow, channelsRow, productsRow] = await Promise.all([
    db.select({ count: int }).from(users).where(isNull(users.deletedAt)),
    db.select({ count: int }).from(businesses).where(isNull(businesses.deletedAt)),
    db
      .select({ count: int })
      .from(businesses)
      .where(and(isNull(businesses.deletedAt), businesses.storePublished)),
    db.select({ count: int }).from(channels).where(isNull(channels.deletedAt)),
    db.select({ count: int }).from(products).where(isNull(products.deletedAt)),
  ]);

  return {
    users: countOf(usersRow[0]),
    businesses: countOf(businessesRow[0]),
    publishedStores: countOf(storesRow[0]),
    channels: countOf(channelsRow[0]),
    products: countOf(productsRow[0]),
  };
}

/**
 * Totals for one window. The window starts on a midnight in the reader's zone and
 * ends now, so it and `getAdminDailySeries` below cover the same calendar days and
 * the two add up — only the newest day is partly empty, which is what "so far today"
 * means. The comparison window is `days` finished days, so it runs a few hours
 * longer than the live one: a delta against it is a slightly generous target, not an
 * equal-footing one, and the console says "previous N days" rather than implying more.
 */
export async function getAdminWindowMetrics(range: AdminRange): Promise<AdminWindowMetrics> {
  const { start, end } = range;
  const liveConversation = isNull(conversations.deletedAt);

  const [conversationsRow, messageRows, ordersRow, visitsRow, tokenRow] = await Promise.all([
    db
      .select({ count: int })
      .from(conversations)
      .where(and(liveConversation, gte(conversations.createdAt, start), lt(conversations.createdAt, end))),
    db
      .select({ from: messages.from, count: int })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          isNull(messages.deletedAt),
          liveConversation,
          gte(messages.time, start),
          lt(messages.time, end),
        ),
      )
      .groupBy(messages.from),
    db
      .select({
        count: int,
        revenue: sql<number>`coalesce(sum(${orders.totalPrice}), 0)::float`,
      })
      .from(orders)
      .where(and(isNull(orders.deletedAt), gte(orders.createdAt, start), lt(orders.createdAt, end))),
    db
      .select({ count: int })
      .from(visits)
      .where(and(gte(visits.createdAt, start), lt(visits.createdAt, end))),
    db
      .select({
        tokens: sql<number>`coalesce(sum(${hourlyTokenAnalytics.totalTokens}), 0)::int`,
        cost: sql<number>`coalesce(sum(${hourlyTokenAnalytics.totalEstimatedCostUsd}), 0)::float`,
        runs: sql<number>`coalesce(sum(${hourlyTokenAnalytics.runCount}), 0)::int`,
      })
      .from(hourlyTokenAnalytics)
      .where(
        and(
          gte(hourlyTokenAnalytics.hourBucket, start),
          lt(hourlyTokenAnalytics.hourBucket, end),
        ),
      ),
  ]);

  const inbound = messageRows.find((row) => row.from === 'customer')?.count ?? 0;
  const outbound = messageRows.find((row) => row.from === 'self')?.count ?? 0;

  return {
    conversations: countOf(conversationsRow[0]),
    messages: inbound + outbound,
    inboundMessages: inbound,
    outboundMessages: outbound,
    orders: ordersRow[0]?.count ?? 0,
    revenue: ordersRow[0]?.revenue ?? 0,
    visits: countOf(visitsRow[0]),
    // The hourly rollup is what the merchant dashboard already reports. It has known
    // pre-existing gaps, so this is a floor on spend, not an audit of it.
    llmTokens: tokenRow[0]?.tokens ?? 0,
    estimatedCostUsd: tokenRow[0]?.cost ?? 0,
    agentRuns: tokenRow[0]?.runs ?? 0,
  };
}

export async function getAdminDailySeries(range: AdminRange): Promise<AdminDailyPoint[]> {
  const { start, end, tz } = range;
  const liveConversation = isNull(conversations.deletedAt);
  const day = (col: Column) => dayInZone(col, tz);

  // Grouped by output-column ordinal, never by repeating `day(...)`: the zone arrives
  // as a bound parameter, so a second copy of the expression is a *different*
  // parameter number, and Postgres then says the selected column is not in the group.
  const byDay = sql`1`;
  const byDayAndSender = sql`1, 2`;

  const [visitRows, conversationRows, messageRows, orderRows, tokenRows] = await Promise.all([
    db
      .select({ date: day(visits.createdAt), count: int })
      .from(visits)
      .where(and(gte(visits.createdAt, start), lt(visits.createdAt, end)))
      .groupBy(byDay),
    db
      .select({ date: day(conversations.createdAt), count: int })
      .from(conversations)
      .where(and(liveConversation, gte(conversations.createdAt, start), lt(conversations.createdAt, end)))
      .groupBy(byDay),
    db
      .select({ date: day(messages.time), from: messages.from, count: int })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          isNull(messages.deletedAt),
          liveConversation,
          gte(messages.time, start),
          lt(messages.time, end),
        ),
      )
      .groupBy(byDayAndSender),
    db
      .select({
        date: day(orders.createdAt),
        count: int,
        revenue: sql<number>`coalesce(sum(${orders.totalPrice}), 0)::float`,
      })
      .from(orders)
      .where(and(isNull(orders.deletedAt), gte(orders.createdAt, start), lt(orders.createdAt, end)))
      .groupBy(byDay),
    db
      .select({
        date: day(hourlyTokenAnalytics.hourBucket),
        tokens: sql<number>`coalesce(sum(${hourlyTokenAnalytics.totalTokens}), 0)::int`,
        cost: sql<number>`coalesce(sum(${hourlyTokenAnalytics.totalEstimatedCostUsd}), 0)::float`,
      })
      .from(hourlyTokenAnalytics)
      .where(and(gte(hourlyTokenAnalytics.hourBucket, start), lt(hourlyTokenAnalytics.hourBucket, end)))
      .groupBy(byDay),
  ]);

  const zero = (date: string): AdminDailyPoint => ({
    date,
    visits: 0,
    conversations: 0,
    messagesIn: 0,
    messagesOut: 0,
    orders: 0,
    revenue: 0,
    tokens: 0,
    costUsd: 0,
  });

  const byDate = new Map<string, AdminDailyPoint>(range.keys.map((date) => [date, zero(date)]));
  const at = (date: string) => byDate.get(date);

  for (const row of visitRows) {
    const point = at(row.date);
    if (point) point.visits = row.count;
  }
  for (const row of conversationRows) {
    const point = at(row.date);
    if (point) point.conversations = row.count;
  }
  for (const row of messageRows) {
    const point = at(row.date);
    if (!point) continue;
    if (row.from === 'customer') point.messagesIn = row.count;
    else point.messagesOut = row.count;
  }
  for (const row of orderRows) {
    const point = at(row.date);
    if (point) {
      point.orders = row.count;
      point.revenue = row.revenue;
    }
  }
  for (const row of tokenRows) {
    const point = at(row.date);
    if (point) {
      point.tokens = row.tokens;
      point.costUsd = row.cost;
    }
  }

  return [...byDate.values()];
}

/**
 * The busiest stores in the window. Messages and orders come back as two grouped
 * queries rather than one join: businesses→conversations→messages→orders is a
 * cross product, and `count(*)` over it would multiply every message by the number of
 * orders the same store happened to take.
 */
export async function getAdminTopBusinesses(
  range: AdminRange,
  limit = 10,
): Promise<AdminTopBusiness[]> {
  const { start, end } = range;
  const liveBusiness = isNull(businesses.deletedAt);
  const liveConversation = isNull(conversations.deletedAt);

  const [activityRows, orderRows] = await Promise.all([
    db
      .select({
        id: businesses.id,
        name: businesses.name,
        slug: businesses.slug,
        conversations: sql<number>`count(distinct ${conversations.id})::int`,
        messages: int,
      })
      .from(businesses)
      .innerJoin(conversations, and(eq(conversations.businessId, businesses.id), liveConversation))
      .innerJoin(messages, and(eq(messages.conversationId, conversations.id), isNull(messages.deletedAt)))
      .where(and(liveBusiness, gte(messages.time, start), lt(messages.time, end)))
      .groupBy(businesses.id, businesses.name, businesses.slug),
    db
      .select({
        id: orders.businessId,
        orders: int,
        revenue: sql<number>`coalesce(sum(${orders.totalPrice}), 0)::float`,
      })
      .from(orders)
      .where(and(isNull(orders.deletedAt), gte(orders.createdAt, start), lt(orders.createdAt, end)))
      .groupBy(orders.businessId),
  ]);

  const names = new Map(
    activityRows.map((row) => [row.id, { name: row.name, slug: row.slug ?? null }]),
  );
  const byBusiness = new Map<string, AdminTopBusiness>();

  for (const row of activityRows) {
    byBusiness.set(row.id, {
      id: row.id,
      name: row.name,
      slug: row.slug ?? null,
      conversations: row.conversations,
      messages: row.messages,
      orders: 0,
      revenue: 0,
    });
  }

  // A store can sell without ever chatting, so the order side is merged in and its
  // names are read back from businesses — they were not in the activity rows.
  const orderOnly = orderRows.filter((row) => !byBusiness.has(row.id));
  if (orderOnly.length > 0) {
    const extras = await db
      .select({ id: businesses.id, name: businesses.name, slug: businesses.slug })
      .from(businesses)
      .where(
        and(
          liveBusiness,
          sql`${businesses.id} in (${sql.join(
            orderOnly.map((row) => sql`${row.id}::uuid`),
            sql`, `,
          )})`,
        ),
      );
    for (const row of extras) names.set(row.id, { name: row.name, slug: row.slug ?? null });
  }

  for (const row of orderRows) {
    const known = byBusiness.get(row.id);
    if (known) {
      known.orders = row.orders;
      known.revenue = row.revenue;
      continue;
    }
    const identity = names.get(row.id);
    if (!identity) continue; // deleted, or never a live business
    byBusiness.set(row.id, {
      id: row.id,
      name: identity.name,
      slug: identity.slug,
      conversations: 0,
      messages: 0,
      orders: row.orders,
      revenue: row.revenue,
    });
  }

  return [...byBusiness.values()]
    .sort((a, b) => b.messages - a.messages || b.revenue - a.revenue)
    .slice(0, limit);
}
