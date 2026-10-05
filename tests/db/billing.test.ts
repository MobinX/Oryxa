import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@db/client';
import { businesses, notifications, plans, quotaUsage, users } from '@db/schema';
import { cycleOf, ensureQuotaNotice, getQuotaStatus, refundQuotaUnit, spendQuotaUnit } from '@db/crud/billing';
import { withPglite } from '../helpers/with-pglite';

withPglite({ timeoutMs: 120_000 });

const DAY_MS = 86_400_000;
const ANCHOR = new Date('2026-09-05T10:30:00.000Z');

function at(anchor: Date, days: number) {
  return new Date(anchor.getTime() + days * DAY_MS);
}

let seq = 0;

async function makePlan(messageLimit: number | null, commentLimit: number | null) {
  seq += 1;
  const [plan] = await db
    .insert(plans)
    .values({ name: `Plan ${seq}`, slug: `plan-${seq}`, messageLimit, commentLimit })
    .returning();
  return plan;
}

/** A business with a plan and a cycle anchor, written straight to the tables. */
async function makeBusiness(planId: string | null, anchor: Date | null = ANCHOR) {
  seq += 1;
  const [owner] = await db
    .insert(users)
    .values({ name: `Owner ${seq}`, firebaseUid: `billing-${seq}-${Date.now()}`, signInMethod: 'google' })
    .returning({ id: users.id });
  const [business] = await db
    .insert(businesses)
    .values({ userId: owner.id, name: `Store ${seq}`, planId, planStartedAt: anchor })
    .returning();
  return business;
}

async function usageRows(businessId: string) {
  return db.select().from(quotaUsage).where(eq(quotaUsage.businessId, businessId));
}

describe('cycleOf — 30 days from the day the business started', () => {
  it('holds one key for the whole cycle and rotates exactly on the 30th day', () => {
    expect(cycleOf(ANCHOR, ANCHOR)).toMatchObject({ period: '2026-09-05', daysLeft: 30 });
    expect(cycleOf(ANCHOR, at(ANCHOR, 29)).period).toBe('2026-09-05');
    expect(cycleOf(ANCHOR, at(ANCHOR, 29)).daysLeft).toBe(1);
    expect(cycleOf(ANCHOR, at(ANCHOR, 30))).toMatchObject({ period: '2026-10-05', daysLeft: 30 });
    expect(cycleOf(ANCHOR, at(ANCHOR, 59)).period).toBe('2026-10-05');
    expect(cycleOf(ANCHOR, at(ANCHOR, 60)).period).toBe('2026-11-04');
  });

  it('counts whole UTC days, so the hour of the anchor does not matter', () => {
    const morning = new Date('2026-09-05T00:01:00.000Z');
    const evening = new Date('2026-09-05T23:59:00.000Z');
    const now = new Date('2026-10-04T12:00:00.000Z');
    expect(cycleOf(morning, now).period).toBe(cycleOf(evening, now).period);
  });

  it('treats a future-dated anchor as cycle one instead of a negative index', () => {
    expect(cycleOf(at(ANCHOR, 10), ANCHOR).period).toBe('2026-09-15');
    expect(cycleOf(at(ANCHOR, 10), ANCHOR).daysLeft).toBe(30);
  });
});

describe('getQuotaStatus', () => {
  it('says unlimited, not zero, for a business with no plan', async () => {
    const business = await makeBusiness(null);
    const status = await getQuotaStatus(business.id, ANCHOR);

    expect(status).toMatchObject({
      assigned: false,
      planId: null,
      messageLimit: null,
      commentLimit: null,
      messagesUsed: 0,
      messageBlocked: false,
      commentBlocked: false,
    });
  });

  it('answers null for a business that does not exist', async () => {
    expect(await getQuotaStatus('00000000-0000-4000-8000-0000000000ff', ANCHOR)).toBeNull();
  });

  it('counts a soft-deleted plan as no plan at all', async () => {
    const plan = await makePlan(5, 5);
    const business = await makeBusiness(plan.id);
    await db.update(plans).set({ deletedAt: new Date() }).where(eq(plans.id, plan.id));

    const status = await getQuotaStatus(business.id, ANCHOR);
    expect(status?.assigned).toBe(false);
    expect(status?.messageBlocked).toBe(false);
  });
});

describe('spendQuotaUnit — the line that actually holds', () => {
  it('allows the last one, refuses the next, and does not increment on a refusal', async () => {
    const plan = await makePlan(3, 3);
    const business = await makeBusiness(plan.id);

    for (let i = 1; i <= 3; i += 1) {
      const spent = await spendQuotaUnit(business.id, 'message', at(ANCHOR, i));
      expect(spent).toMatchObject({ spent: true, used: i });
    }

    const refused = await spendQuotaUnit(business.id, 'message', at(ANCHOR, 4));
    expect(refused.spent).toBe(false);

    const [row] = await usageRows(business.id);
    expect(row.messagesUsed).toBe(3);
    expect((await getQuotaStatus(business.id, at(ANCHOR, 4)))?.messageBlocked).toBe(true);
  });

  it('refuses a hard freeze of 0 without even opening a counter row', async () => {
    const plan = await makePlan(0, 0);
    const business = await makeBusiness(plan.id);

    const spent = await spendQuotaUnit(business.id, 'message', ANCHOR);
    expect(spent.spent).toBe(false);
    expect(await usageRows(business.id)).toHaveLength(0);
  });

  it('never blocks an uncapped budget but still records the volume', async () => {
    const plan = await makePlan(null, null);
    const business = await makeBusiness(plan.id);

    for (let i = 1; i <= 5; i += 1) {
      expect((await spendQuotaUnit(business.id, 'message', at(ANCHOR, i))).used).toBe(i);
    }
    const status = await getQuotaStatus(business.id, at(ANCHOR, 5));
    expect(status).toMatchObject({ messagesUsed: 5, messageBlocked: false });
  });

  it('keeps the two budgets independent', async () => {
    const plan = await makePlan(3, 1);
    const business = await makeBusiness(plan.id);

    expect((await spendQuotaUnit(business.id, 'comment', at(ANCHOR, 1))).spent).toBe(true);
    expect((await spendQuotaUnit(business.id, 'message', at(ANCHOR, 2))).spent).toBe(true);
    expect((await spendQuotaUnit(business.id, 'message', at(ANCHOR, 3))).spent).toBe(true);

    // Comments ran out first, and the message budget did not notice.
    expect((await spendQuotaUnit(business.id, 'comment', at(ANCHOR, 4))).spent).toBe(false);
    const status = await getQuotaStatus(business.id, at(ANCHOR, 4));
    expect(status).toMatchObject({ messagesUsed: 2, commentsUsed: 1, messageBlocked: false, commentBlocked: true });
  });

  it('fails open when there is no business to charge', async () => {
    const spent = await spendQuotaUnit('00000000-0000-4000-8000-0000000000ff', 'message', ANCHOR);
    expect(spent.spent).toBe(true);
  });

  it('gives the unit back when the send afterwards fails', async () => {
    const plan = await makePlan(1, 1);
    const business = await makeBusiness(plan.id);

    const bought = await spendQuotaUnit(business.id, 'message', at(ANCHOR, 1));
    expect(bought.spent).toBe(true);
    expect((await spendQuotaUnit(business.id, 'message', at(ANCHOR, 2))).spent).toBe(false);

    await refundQuotaUnit(business.id, 'message', bought.period);
    expect((await getQuotaStatus(business.id, at(ANCHOR, 2)))?.messagesUsed).toBe(0);
    expect((await spendQuotaUnit(business.id, 'message', at(ANCHOR, 2))).spent).toBe(true);
  });

  it('never lets the counter go negative, and never opens a row to do it', async () => {
    const plan = await makePlan(5, 5);
    const business = await makeBusiness(plan.id);

    await refundQuotaUnit(business.id, 'message', cycleOf(ANCHOR, ANCHOR).period);
    expect(await usageRows(business.id)).toHaveLength(0);

    await spendQuotaUnit(business.id, 'message', at(ANCHOR, 1));
    await refundQuotaUnit(business.id, 'message', cycleOf(ANCHOR, ANCHOR).period);
    const [row] = await usageRows(business.id);
    expect(row?.messagesUsed).toBe(0);
  });
});

describe('the cycle rolls by itself, with no job', () => {
  it('reads zero after the boundary and opens a second row on the next send', async () => {
    const plan = await makePlan(2, 2);
    const business = await makeBusiness(plan.id);

    await spendQuotaUnit(business.id, 'message', at(ANCHOR, 1));
    await spendQuotaUnit(business.id, 'message', at(ANCHOR, 2));
    expect((await getQuotaStatus(business.id, at(ANCHOR, 3)))?.messageBlocked).toBe(true);

    // Day 30: the old row is history. Nothing was cleared, nothing was scheduled.
    const nextCycle = at(ANCHOR, 30);
    const rolled = await getQuotaStatus(business.id, nextCycle);
    expect(rolled).toMatchObject({ messagesUsed: 0, messageBlocked: false });
    expect(rolled?.cycle.period).toBe('2026-10-05');

    expect((await spendQuotaUnit(business.id, 'message', nextCycle)).spent).toBe(true);
    const rows = await usageRows(business.id);
    expect(rows.map((r) => r.period).sort()).toEqual(['2026-09-05', '2026-10-05']);
  });

  it('holds one row per cycle however many cycles pass', async () => {
    const plan = await makePlan(null, null);
    const business = await makeBusiness(plan.id);

    await spendQuotaUnit(business.id, 'message', at(ANCHOR, 1));
    await spendQuotaUnit(business.id, 'message', at(ANCHOR, 31));
    await spendQuotaUnit(business.id, 'message', at(ANCHOR, 95));

    const periods = (await usageRows(business.id)).map((r) => r.period).sort();
    expect(new Set(periods).size).toBe(3);
  });
});

describe('a plan edit reaches every business on it without a cron', () => {
  it('re-reads the limit at gate time instead of trusting a copy', async () => {
    const plan = await makePlan(10, 10);
    const business = await makeBusiness(plan.id);

    for (let i = 1; i <= 3; i += 1) await spendQuotaUnit(business.id, 'message', at(ANCHOR, i));

    await db.update(plans).set({ messageLimit: 5 }).where(eq(plans.id, plan.id));
    const lowered = await getQuotaStatus(business.id, at(ANCHOR, 4));
    expect(lowered).toMatchObject({ messageLimit: 5, messagesUsed: 3, messageBlocked: false });

    await db.update(plans).set({ messageLimit: 3 }).where(eq(plans.id, plan.id));
    expect((await getQuotaStatus(business.id, at(ANCHOR, 4)))?.messageBlocked).toBe(true);
    expect((await spendQuotaUnit(business.id, 'message', at(ANCHOR, 4))).spent).toBe(false);
  });
});

describe('notices', () => {
  async function noticesFor(businessId: string) {
    return db.select().from(notifications).where(eq(notifications.businessId, businessId));
  }

  it('fires at 80% and at 100%, once per cycle, from the spend itself', async () => {
    const plan = await makePlan(10, 10);
    const business = await makeBusiness(plan.id);

    for (let i = 1; i <= 7; i += 1) await spendQuotaUnit(business.id, 'message', at(ANCHOR, i));
    expect(await noticesFor(business.id)).toHaveLength(0);

    await spendQuotaUnit(business.id, 'message', at(ANCHOR, 8));
    const [after80] = await noticesFor(business.id);
    expect(after80).toMatchObject({ kind: 'quota_80', period: '2026-09-05' });
    expect(after80.title).toMatch(/80%/);
    expect(after80.link).toBe(`/b/${business.id}/billing`);

    await spendQuotaUnit(business.id, 'message', at(ANCHOR, 9));
    expect(await noticesFor(business.id)).toHaveLength(1);

    await spendQuotaUnit(business.id, 'message', at(ANCHOR, 10));
    const kinds = (await noticesFor(business.id)).map((n) => n.kind).sort();
    expect(kinds).toEqual(['quota_100', 'quota_80']);
  });

  it('does not retract when a unit is refunded', async () => {
    const plan = await makePlan(1, 1);
    const business = await makeBusiness(plan.id);

    const bought = await spendQuotaUnit(business.id, 'message', at(ANCHOR, 1));
    await refundQuotaUnit(business.id, 'message', bought.period);

    const rows = await noticesFor(business.id);
    expect(rows.map((r) => r.kind)).toEqual(['quota_100']);
  });

  it('is exactly-once per cycle even when the same threshold is crossed again', async () => {
    const plan = await makePlan(5, 5);
    const business = await makeBusiness(plan.id);

    await ensureQuotaNotice(business.id, 'message', '2026-09-05', 4, 5, '2026-10-05');
    await ensureQuotaNotice(business.id, 'message', '2026-09-05', 5, 5, '2026-10-05');
    // The self-healing path calls this again on every later delivery that reads an
    // exhausted budget; the unique index is what keeps that from becoming a spam feed.
    await ensureQuotaNotice(business.id, 'message', '2026-09-05', 5, 5, '2026-10-05');

    expect(await noticesFor(business.id)).toHaveLength(2);
  });

  it('gives the next cycle its own notice', async () => {
    const plan = await makePlan(1, 1);
    const business = await makeBusiness(plan.id);

    await spendQuotaUnit(business.id, 'message', at(ANCHOR, 1));
    await spendQuotaUnit(business.id, 'message', at(ANCHOR, 31));

    const rows = await noticesFor(business.id);
    expect(rows.map((r) => r.period).sort()).toEqual(['2026-09-05', '2026-10-05']);
  });
});
