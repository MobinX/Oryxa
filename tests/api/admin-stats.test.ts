import { describe, it, expect, beforeAll } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { app } from '@api/index';
import { db } from '@db/client';
import {
  businesses,
  channels,
  conversations,
  hourlyTokenAnalytics,
  messages,
  orders,
  users,
  visits,
} from '@db/schema';
import { logsOperatorPassword } from '@api/middleware/logs-access';
import type { AdminStatsResponse } from '@repo/shared';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const HEX = '0123456789abcdef';

/** Deterministic, unique, hex — the ids are written out rather than generated so a failure names its own row. */
function uuid(tag: string, slot: number): string {
  const body = `${tag}${HEX[slot]}${'0'.repeat(30)}`.slice(0, 30);
  return `${body.slice(0, 8)}-${body.slice(8, 12)}-4${body.slice(12, 15)}-8${body.slice(15, 18)}-${body.slice(18)}`;
}

async function stats(search: string): Promise<AdminStatsResponse> {
  const res = await app.request(`http://localhost/api2/admin/stats${search}`, {
    headers: { Authorization: `Bearer ${logsOperatorPassword()}` },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as AdminStatsResponse;
}

/**
 * Two live tenants, each with traffic inside the last 30 days and one message and one
 * order forty days old. The old rows are the point: a window that quietly swallowed
 * them would still return plausible numbers.
 */
async function seed(now: number): Promise<void> {
  const at = (hoursAgo: number) => new Date(now - hoursAgo * HOUR);

  async function tenant(tag: string, slug: string, ageHours: number) {
    const [user] = await db
      .insert(users)
      .values({
        id: uuid(tag, 1),
        name: `${tag} owner`,
        firebaseUid: `admin-stats-${tag}`,
        signInMethod: 'google',
      })
      .returning();
    await db
      .insert(businesses)
      .values({
        id: uuid(tag, 2),
        userId: user.id,
        name: `${tag} shop`,
        slug,
        storePublished: true,
      })
      .returning();
    await db.insert(channels).values({
      id: uuid(tag, 3),
      businessId: uuid(tag, 2),
      platform: 'facebook',
      apiToken: 'token',
      platformChannelId: `channel-${tag}`,
    });
    await db.insert(conversations).values({
      id: uuid(tag, 4),
      businessId: uuid(tag, 2),
      channelId: uuid(tag, 3),
      customerPlatformId: `customer-${tag}`,
      customerName: 'Shopper',
      createdAt: at(ageHours),
    });
    await db.insert(messages).values([
      {
        id: uuid(tag, 5),
        conversationId: uuid(tag, 4),
        from: 'customer',
        content: 'Do you have this in blue?',
        time: at(ageHours),
        state: 'done',
      },
      {
        id: uuid(tag, 6),
        conversationId: uuid(tag, 4),
        from: 'self',
        content: 'We do.',
        time: at(ageHours - 1),
        state: 'done',
      },
      {
        id: uuid(tag, 10),
        conversationId: uuid(tag, 4),
        from: 'customer',
        content: 'Older note',
        time: at(24 * 40),
        state: 'done',
      },
    ]);
    await db.insert(orders).values([
      {
        id: uuid(tag, 7),
        businessId: uuid(tag, 2),
        count: 2,
        variantPrice: '10.00',
        totalPrice: '20.00',
        customerName: 'Shopper',
        createdAt: at(ageHours),
      },
      {
        id: uuid(tag, 11),
        businessId: uuid(tag, 2),
        count: 1,
        variantPrice: '99.00',
        totalPrice: '99.00',
        customerName: 'Shopper',
        createdAt: at(24 * 40),
      },
    ]);
    await db.insert(visits).values({
      id: uuid(tag, 8),
      businessId: uuid(tag, 2),
      visitor: `0${tag}visitor${now}`,
      path: `/store/${slug}`,
      createdAt: at(ageHours),
    });
    await db.insert(hourlyTokenAnalytics).values({
      id: uuid(tag, 9),
      businessId: uuid(tag, 2),
      integrationType: 'facebook_messenger',
      hourBucket: at(ageHours),
      totalInputTokens: 700,
      totalOutputTokens: 300,
      totalTokens: 1000,
      totalEstimatedCostUsd: '0.010000',
      runCount: 3,
    });
  }

  await tenant('aa', 'admin-stats-a', 5);
  await tenant('bb', 'admin-stats-b', 9);
}

const sumOf = (
  daily: AdminStatsResponse['daily'],
  pick: (point: AdminStatsResponse['daily'][number]) => number,
): number => daily.reduce((total, point) => total + pick(point), 0);

describe('GET /api2/admin/stats', () => {
  withPglite({ timeoutMs: 120_000 });

  let snapshotBefore: AdminStatsResponse['snapshot'];

  beforeAll(
    async () => {
      const warm = await stats('?days=1');
      snapshotBefore = warm.snapshot;
      await seed(Date.now());
    },
    // The first request in a fresh pglite pays for the whole migration set.
    120_000,
  );

  it('answers the whole contract for a 30-day window', async () => {
    const body = await stats('?days=30&tz=UTC');

    expect(body.range.days).toBe(30);
    expect(body.range.tz).toBe('UTC');
    expect(Date.parse(body.range.startTime)).toBeLessThan(Date.parse(body.range.endTime));

    expect(Object.keys(body.snapshot).sort()).toEqual([
      'businesses',
      'channels',
      'products',
      'publishedStores',
      'users',
    ]);
    expect(Object.keys(body.window).sort()).toEqual(
      [
        'agentRuns',
        'conversations',
        'estimatedCostUsd',
        'inboundMessages',
        'llmTokens',
        'messages',
        'outboundMessages',
        'orders',
        'revenue',
        'visits',
      ].sort(),
    );
    expect(Object.keys(body.previous).sort()).toEqual(Object.keys(body.window).sort());

    expect(body.daily).toHaveLength(30);
    for (const point of body.daily) {
      expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof point.visits).toBe('number');
      expect(typeof point.costUsd).toBe('number');
    }
    // One bar per requested day, oldest first.
    expect(body.daily.map((point) => point.date)).toEqual([...body.daily.map((p) => p.date)].sort());

    // A quiet day is a zero, never a missing bar, and the bars add up to the totals.
    expect(sumOf(body.daily, (point) => point.visits)).toBe(body.window.visits);
    expect(sumOf(body.daily, (point) => point.messagesIn + point.messagesOut)).toBe(
      body.window.messages,
    );
    expect(sumOf(body.daily, (point) => point.orders)).toBe(body.window.orders);
    expect(sumOf(body.daily, (point) => point.tokens)).toBe(body.window.llmTokens);
    expect(sumOf(body.daily, (point) => point.conversations)).toBe(body.window.conversations);

    expect(body.anomalies === null || typeof body.anomalies.errors === 'number').toBe(true);
  });

  it('counts the tenants inside the window and not the rows from forty days ago', async () => {
    const thirty = await stats('?days=30&tz=UTC');
    const ninety = await stats('?days=90&tz=UTC');

    expect(thirty.snapshot.users).toBe(snapshotBefore.users + 2);
    expect(thirty.snapshot.businesses).toBe(snapshotBefore.businesses + 2);
    expect(thirty.snapshot.publishedStores).toBe(snapshotBefore.publishedStores + 2);

    // Two tenants × (1 inbound + 1 outbound + 1 order + 1 visit + 1000 tokens + 3 runs)
    expect(thirty.window.inboundMessages).toBeGreaterThanOrEqual(2);
    expect(thirty.window.outboundMessages).toBeGreaterThanOrEqual(2);
    expect(thirty.window.orders).toBeGreaterThanOrEqual(2);
    expect(thirty.window.visits).toBeGreaterThanOrEqual(2);
    expect(thirty.window.llmTokens).toBeGreaterThanOrEqual(2000);
    expect(thirty.window.agentRuns).toBeGreaterThanOrEqual(6);
    expect(thirty.window.revenue).toBeGreaterThanOrEqual(40);

    // The forty-day-old message and order exist only once the window reaches them.
    expect(ninety.window.messages - thirty.window.messages).toBeGreaterThanOrEqual(2);
    expect(ninety.window.orders - thirty.window.orders).toBeGreaterThanOrEqual(2);
    expect(ninety.window.revenue - thirty.window.revenue).toBeGreaterThanOrEqual(198);
    expect(ninety.daily).toHaveLength(90);
  });

  it('names the busiest stores with their own numbers', async () => {
    const body = await stats('?days=90&tz=UTC');
    const mine = body.topBusinesses.filter((row) => row.name === 'aa shop' || row.name === 'bb shop');
    expect(mine.length).toBe(2);

    const shop = mine.find((row) => row.name === 'aa shop');
    expect(shop).toBeDefined();
    expect(shop?.slug).toBe('admin-stats-a');
    expect(shop?.conversations).toBe(1);
    expect(shop?.messages).toBe(3);
    expect(shop?.orders).toBe(2);
    expect(shop?.revenue).toBe(119);

    // Ordered by conversation traffic, most first.
    const counts = body.topBusinesses.map((row) => row.messages);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('buckets days in the zone it is asked for, not the server clock', async () => {
    const utc = await stats('?days=7&tz=UTC');
    const karachi = await stats('?days=7&tz=Asia/Karachi');

    expect(utc.range.tz).toBe('UTC');
    expect(karachi.range.tz).toBe('Asia/Karachi');
    // Midnight in Karachi is not midnight in UTC, so the same seven days open at a
    // different instant — and the bars still add up to the same totals.
    expect(karachi.range.startTime).not.toBe(utc.range.startTime);
    expect(karachi.daily).toHaveLength(7);
    expect(sumOf(karachi.daily, (point) => point.messagesIn + point.messagesOut)).toBe(
      karachi.window.messages,
    );
    expect(sumOf(karachi.daily, (point) => point.visits)).toBe(karachi.window.visits);
  });

  it('falls back to UTC for a zone that does not exist', async () => {
    const body = await stats('?days=7&tz=Not%2FA+Zone');
    expect(body.range.tz).toBe('UTC');
    expect(body.daily).toHaveLength(7);
  });

  it('refuses a range that is not a positive integer', async () => {
    for (const search of ['?days=0', '?days=-3', '?days=abc']) {
      const res = await app.request(`http://localhost/api2/admin/stats${search}`, {
        headers: { Authorization: `Bearer ${logsOperatorPassword()}` },
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid days — expected a positive integer' });
    }
  });

  it('clamps a range wider than a dashboard is worth', async () => {
    const body = await stats('?days=100000');
    expect(body.range.days).toBe(365);
    expect(body.daily).toHaveLength(365);
  });

  it('stays behind the console gate', async () => {
    const anonymous = await app.request('http://localhost/api2/admin/stats');
    expect(anonymous.status).toBe(401);
  });
});
