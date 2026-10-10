import { describe, it, expect, beforeAll } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { app } from '@api/index';
import { db } from '@db/client';
import { businesses, hourlyTokenAnalytics, users } from '@db/schema';
import { logsOperatorPassword } from '@api/middleware/logs-access';
import {
  getBusinessTokenUsageDetail,
  listBusinessTokenUsage,
} from '@repo/db/crud/admin-token-analytics';

const HEX = '0123456789abcdef';

/** Deterministic, unique, hex — the ids are written out rather than generated so a failure names its own row. */
function uuid(tag: string, slot: number): string {
  const body = `${tag}${HEX[slot]}${'0'.repeat(30)}`.slice(0, 30);
  return `${body.slice(0, 8)}-${body.slice(8, 12)}-4${body.slice(12, 15)}-8${body.slice(15, 18)}-${body.slice(18)}`;
}

/**
 * The window under test is one whole calendar month, built from the month rather than from
 * `now`: on the first hour of the first day of a month, a "five hours ago" row would fall
 * into last month and every assertion about this one would be a coincidence.
 */
function months(now = new Date()) {
  const currentStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const previousStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const at = (day: number, hour: number) =>
    new Date(currentStart.getTime() + ((day - 1) * 24 + hour) * 3_600_000);
  return {
    current: currentStart.toISOString().slice(0, 7),
    previous: previousStart.toISOString().slice(0, 7),
    at,
  };
}

type UsageRow = {
  businessId: string;
  name: string;
  slug: string | null;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  runCount: number;
  avgTokensPerRun: number;
  cacheHitPercent: number;
  estimatedCostUsd: number;
};

type UsageList = {
  month: string;
  platform: {
    businesses: number;
    totalTokens: number;
    inputTokens: number;
    cacheHitTokens: number;
    runCount: number;
    avgTokensPerRun: number;
    cacheHitPercent: number;
  };
  businesses: UsageRow[];
};

type UsageDetail = {
  business: { id: string; name: string };
  totals: {
    totalTokens: number;
    avgTokensPerRun: number;
    avgLatencyMs: number;
    cacheHitPercent: number;
    cacheMissTokens: number;
  };
  byIntegration: Array<{ integrationType: string; totalTokens: number }>;
  daily: Array<{ date: string; totalTokens: number; runCount: number }>;
};

async function ask<T = unknown>(
  path: string,
  bearer = logsOperatorPassword(),
): Promise<{ status: number; body: T }> {
  const res = await app.request(`http://localhost${path}`, {
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : undefined,
  });
  return { status: res.status, body: (await res.json()) as T };
}

const listFor = (month: string) =>
  ask<UsageList>(`/api2/admin/token-analytics/businesses?month=${month}`);

/**
 * Two live tenants and one deleted. Heaviest is `aa`: two integrations in the current month
 * plus a fat bucket last month, which is the point — a window that leaked would report
 * 12_100 tokens for it and still look plausible.
 */
async function seed() {
  const { at } = months();

  async function tenant(tag: string, slug: string, deleted = false) {
    await db
      .insert(users)
      .values({
        id: uuid(tag, 1),
        name: `${tag} owner`,
        firebaseUid: `token-usage-${tag}`,
        signInMethod: 'google',
      })
      .returning();
    await db.insert(businesses).values({
      id: uuid(tag, 2),
      userId: uuid(tag, 1),
      name: `${tag} shop`,
      slug,
      deletedAt: deleted ? new Date() : null,
    });
  }

  await tenant('aa', 'token-usage-a');
  await tenant('bb', 'token-usage-b');
  await tenant('cc', 'token-usage-c', true);

  await db.insert(hourlyTokenAnalytics).values([
    {
      id: uuid('aa', 3),
      businessId: uuid('aa', 2),
      integrationType: 'facebook_messenger',
      hourBucket: at(2, 3),
      totalInputTokens: 1_000,
      totalOutputTokens: 500,
      totalTokens: 1_500,
      totalCacheHitTokens: 800,
      totalCacheMissTokens: 200,
      runCount: 4,
      avgLatencyMs: 200,
      totalEstimatedCostUsd: '0.020000',
    },
    {
      id: uuid('aa', 4),
      businessId: uuid('aa', 2),
      integrationType: 'ai_post_generation',
      hourBucket: at(2, 5),
      totalInputTokens: 500,
      totalOutputTokens: 100,
      totalTokens: 600,
      totalCacheHitTokens: 100,
      totalCacheMissTokens: 400,
      runCount: 2,
      avgLatencyMs: 100,
      totalEstimatedCostUsd: '0.005000',
    },
    {
      id: uuid('aa', 5),
      businessId: uuid('aa', 2),
      integrationType: 'facebook_messenger',
      hourBucket: new Date(at(1, 0).getTime() - 48 * 3_600_000),
      totalInputTokens: 9_000,
      totalOutputTokens: 1_000,
      totalTokens: 10_000,
      runCount: 5,
      totalEstimatedCostUsd: '0.100000',
    },
    {
      id: uuid('bb', 3),
      businessId: uuid('bb', 2),
      integrationType: 'facebook_comment',
      hourBucket: at(3, 1),
      totalInputTokens: 100,
      totalOutputTokens: 50,
      totalTokens: 150,
      runCount: 1,
      avgLatencyMs: 50,
      totalEstimatedCostUsd: '0.001000',
    },
    {
      // A deleted store's spend stays in the table, but it is nobody's cost to review.
      id: uuid('cc', 3),
      businessId: uuid('cc', 2),
      integrationType: 'facebook_messenger',
      hourBucket: at(2, 1),
      totalInputTokens: 7_777,
      totalTokens: 7_777,
      runCount: 9,
      totalEstimatedCostUsd: '0.090000',
    },
  ]);
}

describe('admin token analytics', () => {
  withPglite({ timeoutMs: 120_000 });

  const window = months();
  const inCurrentMonth = { from: window.at(1, 0), to: window.at(28, 0) };

  beforeAll(seed, 120_000);

  it('lists live stores that spent tokens, heaviest first, for one month', async () => {
    const { status, body } = await listFor(window.current);
    expect(status).toBe(200);

    expect(body.month).toBe(window.current);
    expect(body.businesses.map((row) => row.name)).toEqual(['aa shop', 'bb shop']);

    const aa = body.businesses[0];
    expect(aa).toMatchObject({
      businessId: uuid('aa', 2),
      slug: 'token-usage-a',
      totalTokens: 2_100,
      inputTokens: 1_500,
      outputTokens: 600,
      cacheHitTokens: 900,
      runCount: 6,
    });
    expect(aa.avgTokensPerRun).toBeCloseTo(350, 2);
    // Cached reads are billed as input, so the denominator is input and not total tokens.
    expect(aa.cacheHitPercent).toBeCloseTo(60, 2);
    expect(aa.estimatedCostUsd).toBeCloseTo(0.025, 6);

    expect(body.businesses[1]).toMatchObject({
      totalTokens: 150,
      cacheHitPercent: 0,
      runCount: 1,
      cacheMissTokens: 0,
    });
  });

  it('sums the platform from the rows it returned, weighted by runs', async () => {
    const { body } = await listFor(window.current);

    expect(body.platform.businesses).toBe(2);
    expect(body.platform.totalTokens).toBe(2_250);
    expect(body.platform.inputTokens).toBe(1_600);
    expect(body.platform.runCount).toBe(7);
    // 2250 / 7, not the mean of 350 and 150: one store with a single run must not weigh
    // as much as one with six.
    expect(body.platform.avgTokensPerRun).toBeCloseTo(321.43, 2);
    expect(body.platform.cacheHitPercent).toBeCloseTo(56.25, 2);
  });

  it('answers another month with only that month', async () => {
    const { body } = await listFor(window.previous);

    expect(body.businesses.map((row) => [row.name, row.totalTokens])).toEqual([
      ['aa shop', 10_000],
    ]);
  });

  it('reads a month that is not a month as this month', async () => {
    const { status, body } = await listFor('last-tuesday');

    expect(status).toBe(200);
    expect(body.month).toBe(window.current);
    expect(body.platform.totalTokens).toBe(2_250);
  });

  it('answers a store id with its totals, its pipelines and its days', async () => {
    const { status, body } = await ask<UsageDetail>(
      `/api2/admin/token-analytics/businesses/${uuid('aa', 2)}?month=${window.current}`,
    );
    expect(status).toBe(200);

    expect(body.business).toMatchObject({ id: uuid('aa', 2), name: 'aa shop' });
    expect(body.totals.totalTokens).toBe(2_100);
    expect(body.totals.cacheHitPercent).toBeCloseTo(60, 2);
    // Weighted by runs — (200×4 + 100×2) / 6 — not the plain mean of the two buckets.
    expect(body.totals.avgLatencyMs).toBeCloseTo(167, 0);

    expect(body.byIntegration.map((row) => row.totalTokens)).toEqual([1_500, 600]);
    expect(body.byIntegration[0].integrationType).toBe('facebook_messenger');

    expect(body.daily).toHaveLength(1);
    expect(body.daily[0]).toMatchObject({ runCount: 6, totalTokens: 2_100 });
    expect(body.daily[0].date).toBe(window.at(2, 0).toISOString().slice(0, 10));
  });

  it('refuses a deleted store, a stranger, and an id that is not an id', async () => {
    expect((await ask(`/api2/admin/token-analytics/businesses/${uuid('cc', 2)}`)).status).toBe(404);
    expect((await ask(`/api2/admin/token-analytics/businesses/${uuid('dd', 2)}`)).status).toBe(404);
    expect((await ask('/api2/admin/token-analytics/businesses/not-a-uuid')).status).toBe(400);
  });

  it('leaves a store with no usage in the window at zero, not at NaN', async () => {
    const detail = await getBusinessTokenUsageDetail(
      uuid('bb', 2),
      window.at(20, 0),
      window.at(21, 0),
    );

    expect(detail?.business.id).toBe(uuid('bb', 2));
    expect(detail?.totals.totalTokens).toBe(0);
    // A run-less window divides by zero in three places, and none of them may answer NaN.
    expect(detail?.totals.avgTokensPerRun).toBe(0);
    expect(detail?.totals.cacheHitPercent).toBe(0);
    expect(detail?.byIntegration).toEqual([]);
    expect(detail?.daily).toEqual([]);
  });

  it('returns null for a store that is not there, rather than a zero-filled page', async () => {
    expect(
      await getBusinessTokenUsageDetail(uuid('dd', 2), inCurrentMonth.from, inCurrentMonth.to),
    ).toBeNull();
    expect(
      await getBusinessTokenUsageDetail(uuid('cc', 2), inCurrentMonth.from, inCurrentMonth.to),
    ).toBeNull();
  });

  it('keeps the deleted store out of the crud list too', async () => {
    const rows = await listBusinessTokenUsage(inCurrentMonth.from, inCurrentMonth.to);

    expect(rows.map((row) => row.businessId)).toEqual([uuid('aa', 2), uuid('bb', 2)]);
    expect(rows[0].cacheMissTokens).toBe(600);
  });
});
