import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { withPglite } from '../helpers/with-pglite';
import { app } from '@api/app';
import { db } from '@db/client';
import { businesses, notifications, planAssignments, quotaUsage, users } from '@db/schema';
import { syncUser } from '@repo/db/crud/user';
import { logsOperatorPassword } from '@api/middleware/logs-access';
import { authHeaders, TEST_FIREBASE_UID } from '../helpers/seed';
import type {
  AdminBusinessPlan,
  AdminPlanEditResult,
  AdminPlanRow,
  BillingOverview,
  DeletePlanConflict,
  NotificationListResponse,
  PlanAssignment,
  PublicPlan,
  QuotaStatus,
} from '@repo/shared';

/**
 * The plans console, the merchant's billing page and the public price list.
 *
 * Businesses are inserted rather than created through `createBusiness`, because that path
 * is about to start assigning a default plan and nothing here should quietly inherit a
 * policy it is written around. Usage rows are always keyed to the period the API itself
 * reported for the business, never to a date guessed in this file.
 */

const ADMIN = { Authorization: `Bearer ${logsOperatorPassword()}` };

const admin = (path: string, init?: RequestInit) =>
  app.request(`http://localhost/api2${path}`, {
    ...init,
    headers: { ...ADMIN, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

async function adminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await admin(path, init);
  expect(res.status).toBe(200);
  return (await res.json()) as T;
}

/** The one thing `Response.json()` cannot say about itself. */
async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function newOwner(label: string): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ name: `${label} owner`, firebaseUid: `plans-${label}-${crypto.randomUUID()}`, signInMethod: 'google' })
    .returning({ id: users.id });
  return user.id;
}

/** A business the dev token's own user owns, so the /api/v1 routes accept it. */
async function devBusiness(label: string): Promise<string> {
  const user = await syncUser({
    firebaseUid: TEST_FIREBASE_UID,
    name: 'Test User',
    email: 'test@oryxa.dev',
    signInMethod: 'google',
  });
  const [biz] = await db
    .insert(businesses)
    .values({ userId: user.id, name: `plans ${label}` })
    .returning({ id: businesses.id });
  return biz.id;
}

async function use(businessId: string, period: string, messages: number, comments = 0): Promise<void> {
  await db.insert(quotaUsage).values({ businessId, period, messagesUsed: messages, commentsUsed: comments });
}

async function planOf(businessId: string) {
  const [row] = await db
    .select({ planId: businesses.planId, planStartedAt: businesses.planStartedAt })
    .from(businesses)
    .where(eq(businesses.id, businessId));
  return row;
}

async function seededPlan(slug: string): Promise<AdminPlanRow> {
  const rows = await adminJson<AdminPlanRow[]>('/admin/plans');
  const plan = rows.find((row) => row.slug === slug);
  if (!plan) throw new Error(`the ${slug} plan was not seeded`);
  return plan;
}

/** A tiny plan of our own, so no test depends on the numbers the marketing page advertises. */
async function makePlan(label: string, messageLimit: number | null, commentLimit: number | null) {
  const res = await admin('/admin/plans', {
    method: 'POST',
    body: JSON.stringify({
      name: `${label} plan`,
      slug: `plans-test-${label}-${crypto.randomUUID().slice(0, 8)}`,
      priceCents: 100,
      messageLimit,
      commentLimit,
      position: 50,
    }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as AdminPlanEditResult;
  return body.plan;
}

/** Assign and read back in one call: the PUT returns this business's live status. */
async function putOnPlan(businessId: string, planId: string | null): Promise<QuotaStatus> {
  return adminJson<QuotaStatus>(`/admin/businesses/${businessId}/plan`, {
    method: 'PUT',
    body: JSON.stringify({ planId }),
  });
}

async function merchantBilling(businessId: string): Promise<BillingOverview> {
  const res = await app.request(`http://localhost/api/v1/${businessId}/billing`, { headers: authHeaders() });
  expect(res.status).toBe(200);
  return (await res.json()) as BillingOverview;
}

/**
 * One PGlite for the whole file. Each `withPglite()` call replays the entire migration
 * set on its own database, and six of them in one file is enough to blow through the hook
 * timeout on this box without running a single assertion.
 */
withPglite({ timeoutMs: 300_000 });

describe('GET /api/v1/plans — the public price list', () => {

  it('answers a stranger, in order, and hands out no assignable ids', async () => {
    const res = await app.request('http://localhost/api/v1/plans');
    expect(res.status).toBe(200);

    const plans = (await res.json()) as PublicPlan[];
    expect(plans.map((plan) => plan.slug).slice(0, 4)).toEqual(['free', 'starter', 'pro', 'enterprise']);

    // A uuid on a marketing page is the handle the assignment endpoint accepts.
    for (const plan of plans) expect('id' in plan).toBe(false);

    const free = plans.find((plan) => plan.slug === 'free');
    expect(free?.priceLabel).toBe('Free');
    expect(free?.messageLimitLabel).toBe('1,000 messenger replies');
    expect(free?.commentLimitLabel).toBe('1,000 comment replies');

    // The three meanings of the limit column, all resolved server-side.
    const enterprise = plans.find((plan) => plan.slug === 'enterprise');
    expect(enterprise?.messageLimitLabel).toBe('Uncapped');
    expect(enterprise?.commentLimitLabel).toBe('Uncapped');
  });

  it('never lists a plan the operator retired, and still shows it in the console', async () => {
    const created = await makePlan('retired', 10, 10);
    const off = await adminJson<AdminPlanEditResult>(`/admin/plans/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: false }),
    });
    expect(off.plan.active).toBe(false);

    const publicRows = (await (await app.request('http://localhost/api/v1/plans')).json()) as PublicPlan[];
    expect(publicRows.some((row) => row.name === 'retired plan')).toBe(false);

    // The console still shows it, because the businesses on it still need a row to read.
    const adminRows = await adminJson<AdminPlanRow[]>('/admin/plans');
    expect(adminRows.some((row) => row.id === created.id)).toBe(true);
  });
});

describe('the admin plan catalogue', () => {

  it('stays behind the console gate', async () => {
    expect((await app.request('http://localhost/api2/admin/plans')).status).toBe(401);
    // A bearer that is not the console password goes down the ordinary auth path, which is
    // either rejected outright or — with no provider configured — unavailable. Either way
    // it does not reach the catalogue.
    const bogus = await admin('/admin/plans', { headers: { Authorization: 'Bearer nope' } });
    expect([401, 503]).toContain(bogus.status);
  });

  it('refuses a slug that is already taken', async () => {
    const res = await admin('/admin/plans', {
      method: 'POST',
      body: JSON.stringify({ name: 'Another Free', slug: 'free', messageLimit: 5, commentLimit: 5 }),
    });
    expect(res.status).toBe(409);
    expect((await json<{ error: string }>(res)).error).toContain('free');
  });

  it('counts the businesses an edit would hit', async () => {
    const plan = await makePlan('counted', 25, 25);
    const first = await devBusiness('counted-a');
    const second = await devBusiness('counted-b');
    await putOnPlan(first, plan.id);
    await putOnPlan(second, plan.id);

    const rows = await adminJson<AdminPlanRow[]>('/admin/plans');
    expect(rows.find((row) => row.id === plan.id)?.businessCount).toBe(2);
  });

  it('refuses to delete a plan that holds businesses, then allows it once they move', async () => {
    const plan = await makePlan('deletable', 25, 25);
    const businessId = await devBusiness('deletable');
    await putOnPlan(businessId, plan.id);

    const blocked = await admin(`/admin/plans/${plan.id}`, { method: 'DELETE' });
    expect(blocked.status).toBe(409);
    const conflict = (await blocked.json()) as DeletePlanConflict;
    // Deleting would leave them with no plan, which is unlimited — so it names who is in the way.
    expect(conflict.businesses.map((row) => row.id)).toContain(businessId);

    await putOnPlan(businessId, null);
    expect((await admin(`/admin/plans/${plan.id}`, { method: 'DELETE' })).status).toBe(204);

    const after = await adminJson<AdminPlanRow[]>('/admin/plans');
    expect(after.some((row) => row.id === plan.id)).toBe(false);
    expect((await planOf(businessId)).planId).toBeNull();
  });

  it('writes the notices a lowered cap causes, exactly once per threshold', async () => {
    const plan = await makePlan('lowered', 100, 100);
    const over = await devBusiness('lowered-over');
    const near = await devBusiness('lowered-near');
    const overStatus = await putOnPlan(over, plan.id);
    const nearStatus = await putOnPlan(near, plan.id);
    await use(over, overStatus.cycle.period, 90);
    await use(near, nearStatus.cycle.period, 45);

    // An edit that does not tighten anything cannot strand anybody.
    expect((await adminJson<AdminPlanEditResult>(`/admin/plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify({ messageLimit: 100 }) })).notified).toBe(0);

    // 90 of a new cap of 50 is over the line; 45 of 50 is 80% of it. Both are news now,
    // because the next reply may never come and there is no cron to tell them later.
    const tightened = await adminJson<AdminPlanEditResult>(`/admin/plans/${plan.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ messageLimit: 50 }),
    });
    expect(tightened.notified).toBe(2);

    // The cap is live in the same breath: no job, no cache, no propagation delay.
    const now = await merchantBilling(over);
    expect(now.quota.messageLimit).toBe(50);
    expect(now.quota.messagesUsed).toBe(90);
    expect(now.quota.messageBlocked).toBe(true);

    // Lowering again finds the 100% notice already written for the business that was
    // already over, and writes only the one that had merely reached 80%.
    const deeper = await adminJson<AdminPlanEditResult>(`/admin/plans/${plan.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ messageLimit: 10 }),
    });
    expect(deeper.notified).toBe(1);

    const rows = await db.select().from(notifications);
    const forOver = rows.filter((row) => row.businessId === over);
    const forNear = rows.filter((row) => row.businessId === near);
    expect(forOver).toHaveLength(1);
    expect(forOver[0].kind).toBe('quota_100');
    expect(forOver[0].link).toBe(`/b/${over}/billing`);
    expect(forNear.map((row) => row.kind).sort()).toEqual(['quota_100', 'quota_80']);
  });

  it('lists the fleet with the revoked businesses visible', async () => {
    const plan = await makePlan('fleet', 7, 7);
    const assigned = await devBusiness('fleet-on');
    const revoked = await devBusiness('fleet-off');
    const status = await putOnPlan(assigned, plan.id);
    await putOnPlan(revoked, null);
    await use(assigned, status.cycle.period, 3, 4);

    const rows = await adminJson<AdminBusinessPlan[]>('/admin/plans/businesses');
    const on = rows.find((row) => row.businessId === assigned);
    expect(on?.planName).toBe('fleet plan');
    expect(on?.messagesUsed).toBe(3);
    expect(on?.commentsUsed).toBe(4);
    expect(on?.messageLimit).toBe(7);

    const off = rows.find((row) => row.businessId === revoked);
    expect(off?.planId).toBeNull();
    expect(off?.planName).toBeNull();
    // Unlimited, but still counted: revoking a plan is not the same as blinding the console.
    expect(off?.period).toBe(status.cycle.period);
  });

  it('records who moved a business, newest first', async () => {
    const plan = await makePlan('audit', 5, 5);
    const businessId = await devBusiness('audit');
    await putOnPlan(businessId, plan.id);
    const pro = await seededPlan('pro');
    const switched = await app.request(`http://localhost/api/v1/${businessId}/billing/plan`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ planId: pro.id }),
    });
    expect(switched.status).toBe(200);

    const history = await adminJson<PlanAssignment[]>(`/admin/businesses/${businessId}/assignments`);
    expect(history).toHaveLength(2);
    expect(history[0].actorKind).toBe('merchant');
    expect(history[0].previousPlanName).toBe('audit plan');
    expect(history[0].planName).toBe('Pro');
    expect(history[1].actorKind).toBe('operator');
    expect(history[1].previousPlanId).toBeNull();
  });
});

describe('PUT /api2/admin/businesses/:businessId/plan', () => {

  it('sets the anchor on the first assignment and never moves it again', async () => {
    const businessId = await devBusiness('anchor');
    const first = await putOnPlan(businessId, (await seededPlan('free')).id);
    expect(first.assigned).toBe(true);
    expect(first.planName).toBe('Free');

    const anchored = await planOf(businessId);
    expect(anchored.planStartedAt).toBeInstanceOf(Date);
    const anchorTime = anchored.planStartedAt?.getTime();

    await use(businessId, first.cycle.period, 640);
    const switched = await putOnPlan(businessId, (await seededPlan('pro')).id);

    // The honest upgrade: what you already used still counts against the new budget.
    expect(switched.messageLimit).toBe(10_000);
    expect(switched.messagesUsed).toBe(640);
    // And the cycle it is measured inside did not restart, which is what would make
    // "exhaust it, switch plan, switch back" a way to mint replies for free.
    expect(switched.cycle.period).toBe(first.cycle.period);
    expect((await planOf(businessId)).planStartedAt?.getTime()).toBe(anchorTime);
  });

  it('revokes to unlimited, and may drop a business below what it already spent', async () => {
    const businessId = await devBusiness('override');
    const status = await putOnPlan(businessId, (await makePlan('override', 500, 500)).id);
    await use(businessId, status.cycle.period, 900);

    // No 409 for the operator: they are the one who can hand out more afterwards.
    const down = await putOnPlan(businessId, (await makePlan('override-small', 100, 100)).id);
    expect(down.messagesUsed).toBe(900);
    expect(down.messageBlocked).toBe(true);

    const revoked = await putOnPlan(businessId, null);
    expect(revoked.assigned).toBe(false);
    expect(revoked.messageLimit).toBeNull();
    expect(revoked.messageBlocked).toBe(false);
    // Still counted, because the counter is keyed by the cycle rather than by the plan.
    expect(revoked.messagesUsed).toBe(900);
  });

  it('answers a business that is not there with 404', async () => {
    const missing = crypto.randomUUID();
    const plan = await seededPlan('free');
    expect((await admin(`/admin/businesses/${missing}/plan`, { method: 'PUT', body: JSON.stringify({ planId: plan.id }) })).status).toBe(404);
    expect((await admin(`/admin/businesses/${missing}/plan/reset`, { method: 'POST' })).status).toBe(404);
  });
});

describe('POST /api2/admin/businesses/:businessId/plan/reset', () => {

  it('starts a fresh cycle without touching the plan or erasing the old counter', async () => {
    const plan = await makePlan('reset', 3, 3);
    const businessId = await devBusiness('reset');
    await putOnPlan(businessId, plan.id);

    // Backdate the anchor by two full cycles plus five days, so the cycle this business is
    // standing in right now is not today's key and a reset has somewhere new to go.
    const past = new Date(Date.now() - 65 * 86_400_000);
    const spentKey = new Date(past.getTime() + 60 * 86_400_000).toISOString().slice(0, 10);
    await db.update(businesses).set({ planStartedAt: past }).where(eq(businesses.id, businessId));
    const spent = await merchantBilling(businessId);
    expect(spent.quota.cycle.period).toBe(spentKey);

    await use(businessId, spent.quota.cycle.period, 3, 3);
    const exhausted = await merchantBilling(businessId);
    expect(exhausted.quota.messageBlocked).toBe(true);
    expect(exhausted.quota.commentBlocked).toBe(true);

    const fresh = await adminJson<QuotaStatus>(`/admin/businesses/${businessId}/plan/reset`, { method: 'POST' });
    expect(fresh.cycle.period).toBe(new Date().toISOString().slice(0, 10));
    expect(fresh.messagesUsed).toBe(0);
    expect(fresh.commentsUsed).toBe(0);
    expect(fresh.messageBlocked).toBe(false);
    expect(fresh.planName).toBe('reset plan');
    expect(fresh.messageLimit).toBe(3);

    // The old row is history, not something anyone deleted.
    const periods = await db
      .select({ period: quotaUsage.period })
      .from(quotaUsage)
      .where(eq(quotaUsage.businessId, businessId));
    expect(periods.map((row) => row.period)).toContain(spent.quota.cycle.period);

    const history = await adminJson<PlanAssignment[]>(`/admin/businesses/${businessId}/assignments`);
    // planId === previousPlanId is what makes this row read as "granted a fresh cycle".
    expect(history[0].planId).toBe(history[0].previousPlanId);
    expect(history[0].actorKind).toBe('operator');
  });
});

describe('the merchant billing page', () => {

  it('reads its own business and never another merchant’s', async () => {
    const businessId = await devBusiness('mine');
    const [foreign] = await db
      .insert(businesses)
      .values({ userId: await newOwner('stranger'), name: 'plans stranger' })
      .returning({ id: businesses.id });

    const body = await merchantBilling(businessId);
    expect(body.businessId).toBe(businessId);
    // No plan yet means unlimited, and the page has to be able to say so honestly.
    expect(body.plan).toBeNull();
    expect(body.quota.assigned).toBe(false);
    expect(body.quota.messageBlocked).toBe(false);
    expect(body.options.length).toBeGreaterThanOrEqual(4);

    expect(
      (await app.request(`http://localhost/api/v1/${foreign.id}/billing`, { headers: authHeaders() })).status,
    ).toBe(403);
    expect((await app.request(`http://localhost/api/v1/${businessId}/billing`)).status).toBe(401);
  });

  it('keeps the two budgets independent', async () => {
    const plan = await makePlan('meters', 10, 4);
    const businessId = await devBusiness('meters');
    const status = await putOnPlan(businessId, plan.id);
    await use(businessId, status.cycle.period, 8, 4);

    const body = await merchantBilling(businessId);
    expect(body.quota.messagesUsed).toBe(8);
    expect(body.quota.messageBlocked).toBe(false);
    expect(body.quota.commentBlocked).toBe(true);
    expect(body.plan?.name).toBe('meters plan');
    expect(body.quota.cycle.resetsAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.quota.cycle.daysLeft).toBeGreaterThanOrEqual(0);
    expect(body.quota.cycle.daysLeft).toBeLessThanOrEqual(30);
  });

  it('refuses a self-serve downgrade that would strand the business', async () => {
    const big = await makePlan('big', 5_000, 5_000);
    const small = await makePlan('small', 50, 50);
    const businessId = await devBusiness('downgrade');
    const status = await putOnPlan(businessId, big.id);
    await use(businessId, status.cycle.period, 80);

    const refused = await app.request(`http://localhost/api/v1/${businessId}/billing/plan`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ planId: small.id }),
    });
    expect(refused.status).toBe(409);
    const message = (await json<{ error: string }>(refused)).error;
    expect(message).toContain('80');
    expect(message).toContain(status.cycle.resetsAt);
    // Refusing is also not letting: nothing moved.
    expect((await planOf(businessId)).planId).toBe(big.id);

    const upgraded = await app.request(`http://localhost/api/v1/${businessId}/billing/plan`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ planId: (await seededPlan('enterprise')).id }),
    });
    expect(upgraded.status).toBe(200);
    expect((await json<{ name: string }>(upgraded)).name).toBe('Enterprise');

    expect(
      (
        await app.request(`http://localhost/api/v1/${businessId}/billing/plan`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({ planId: crypto.randomUUID() }),
        })
      ).status,
    ).toBe(400);
  });

  it('lights the bell and lets the merchant put it out', async () => {
    const businessId = await devBusiness('bell');
    const status = await putOnPlan(businessId, (await seededPlan('free')).id);
    await use(businessId, status.cycle.period, 1_000);
    await db.insert(notifications).values({
      businessId,
      kind: 'quota_100',
      period: status.cycle.period,
      title: 'Your messenger replies are used up',
      body: 'The agent has stopped replying.',
      link: `/b/${businessId}/billing`,
    });

    const bell = (path: string) => app.request(`http://localhost/api/v1/${businessId}/notifications${path}`, { headers: authHeaders() });

    const list = await json<NotificationListResponse>(await bell(''));
    expect(list.unreadCount).toBe(1);
    expect(list.notifications[0].kind).toBe('quota_100');
    expect(list.notifications[0].readAt).toBeNull();

    const read = await app.request(`http://localhost/api/v1/${businessId}/notifications/read`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ all: true }),
    });
    expect(read.status).toBe(200);
    expect((await json<{ updated: number }>(read)).updated).toBe(1);

    const after = await json<NotificationListResponse>(await bell(''));
    expect(after.unreadCount).toBe(0);
    // Read is not gone: the merchant may still want to see why the agent stopped.
    expect(after.notifications).toHaveLength(1);

    const onlyUnread = await json<NotificationListResponse>(await bell('?unread=true'));
    expect(onlyUnread.notifications).toHaveLength(0);

    expect(
      (
        await app.request(`http://localhost/api/v1/${businessId}/notifications/read`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({}),
        })
      ).status,
    ).toBe(400);
  });

  it('is not a way to read or clear another business’s notices', async () => {
    const [foreign] = await db
      .insert(businesses)
      .values({ userId: await newOwner('bell-stranger'), name: 'plans bell stranger' })
      .returning({ id: businesses.id });

    expect(
      (await app.request(`http://localhost/api/v1/${foreign.id}/notifications`, { headers: authHeaders() })).status,
    ).toBe(403);
    expect(
      (
        await app.request(`http://localhost/api/v1/${foreign.id}/notifications/read`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ all: true }),
        })
      ).status,
    ).toBe(403);
  });
});

describe('the OpenAPI contract', () => {

  it('documents the new paths without disturbing the ones already shipped', async () => {
    const doc = (await (await app.request('http://localhost/doc')).json()) as {
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };

    for (const path of [
      '/api/v1/plans',
      '/api/v1/{businessId}/billing',
      '/api/v1/{businessId}/billing/plan',
      '/api/v1/{businessId}/notifications',
      '/api2/admin/plans',
      '/api2/admin/plans/businesses',
      '/api2/admin/businesses/{businessId}/plan',
      '/api2/admin/businesses/{businessId}/plan/reset',
    ]) {
      expect(doc.paths[path]).toBeDefined();
    }

    for (const name of [
      'Plan',
      'PublicPlan',
      'AdminPlanRow',
      'AdminPlanEditResult',
      'DeletePlanConflict',
      'PlanAssignment',
      'AdminBusinessPlan',
      'QuotaStatus',
      'QuotaCycle',
      'BillingOverview',
      'NotificationItem',
      'NotificationListResponse',
    ]) {
      expect(doc.components.schemas[name]).toBeDefined();
    }

    // The routes the Flutter client was built against are still on the same paths.
    for (const path of ['/api/v1/{businessId}/conversations', '/api/v1/{businessId}/channels']) {
      expect(doc.paths[path]).toBeDefined();
    }
  });

  it('leaves the audit rows behind after the business itself is gone from the list', async () => {
    const plan = await makePlan('audit-kept', 3, 3);
    const businessId = await devBusiness('audit-kept');
    await putOnPlan(businessId, plan.id);
    await db.update(businesses).set({ deletedAt: new Date() }).where(eq(businesses.id, businessId));

    const rows = await adminJson<AdminBusinessPlan[]>('/admin/plans/businesses');
    expect(rows.some((row) => row.businessId === businessId)).toBe(false);

    // Soft-deleting a business must not rewrite its history: the assignment still reads.
    const history = await adminJson<PlanAssignment[]>(`/admin/businesses/${businessId}/assignments`);
    expect(history).toHaveLength(1);
    expect(history[0].planName).toBe('audit-kept plan');
  });
});
