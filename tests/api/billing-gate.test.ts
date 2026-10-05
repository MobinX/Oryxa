import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { webhookHeaders } from '../helpers/meta-sign';
import { flushBackground } from '@api/lib/background';
import { fbWebhookRouter } from '@api/webhooks/facebook';
import { triggerAgentRun } from '@api/lib/agent-runner';
import { triggerCommentRun } from '@api/lib/comment-runner';
import { quotaGate, readQuota } from '@api/lib/quota';
import { __testOnly, flush } from '@api/lib/log';
import { db } from '@db/client';
import { plans, quotaUsage } from '@db/schema';
import { assignPlan, createPlan } from '@repo/db/crud/plans';
import { getQuotaStatus, listNotifications } from '@repo/db/crud/billing';
import { listConversations, listMessages } from '@repo/db/crud/conversation';

/**
 * The gate: the decision taken before an agent run starts, so an exhausted allowance buys
 * no LLM tokens and no customer is answered off a budget that is gone.
 *
 * These drive the real trigger helpers and the real webhook with `fetch` stubbed, because
 * the fact that matters is "no POST went to /internal/run". Mocking the trigger could not
 * prove that — the mock is the thing being skipped.
 */

process.env.META_APP_SECRET = 'test-app-secret';

vi.mock('@repo/integrations/facebook', () => ({
  verifyWebhookSignature: vi.fn(async () => true),
  getFacebookUserProfile: vi.fn(async () => ({ name: 'FB Sender', avatar: 'https://fb/img.png' })),
  getFacebookPostContext: vi.fn(async () => null),
  replyToFacebookComment: vi.fn(async () => 'MOCK_REPLY_ID'),
  publishFacebookPost: vi.fn(async () => 'MOCK_POST_ID'),
  sendMessage: vi.fn(async () => 'MOCK_MSG_ID'),
  senderAction: vi.fn(async () => undefined),
}));

let logEvents: Record<string, unknown>[] = [];

beforeEach(() => {
  logEvents = [];
  __testOnly.reset();
  __testOnly.setSink('axiom');
  __testOnly.setIngest((events) => {
    logEvents.push(...events);
    return Promise.resolve();
  });
});

afterEach(() => {
  __testOnly.reset();
  vi.unstubAllGlobals();
});

/** Every outbound call, with the ones that started a run reduced to their endpoint. */
function recordFetch(): string[] {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      urls.push(String(input));
      return new Response('accepted', { status: 202 });
    }),
  );
  return urls;
}

const runStarted = (urls: string[]) =>
  urls.filter((url) => url.includes('/internal/')).map((url) => url.replace(/^.*\/internal\//, '/internal/'));

async function makePlan(label: string, messageLimit: number | null, commentLimit: number | null) {
  return createPlan({
    name: `${label} plan`,
    slug: `${label}-${crypto.randomUUID().slice(0, 13)}`,
    priceCents: 0,
    currency: 'USD',
    messageLimit,
    commentLimit,
    features: [],
    position: 0,
    active: true,
  });
}

/** A business on a plan of the given caps, plus the cycle its counter sits in. */
async function world(label: string, messageLimit: number | null, commentLimit: number | null) {
  const seed = await seedTestWorld();
  const plan = await makePlan(label, messageLimit, commentLimit);
  await assignPlan(seed.business.id, plan.id, { actorKind: 'operator' });
  const status = await getQuotaStatus(seed.business.id);
  if (!status) throw new Error('the seeded business is gone');
  return { seed, plan, status };
}

/**
 * Fill the counter by writing the usage row, not by sending replies: the spend path lives
 * in the runners and is tested there. The key is the period the API itself reported, never
 * a date guessed in this file.
 */
async function spend(businessId: string, period: string, messages: number, comments = 0): Promise<void> {
  await db.insert(quotaUsage).values({ businessId, period, messagesUsed: messages, commentsUsed: comments });
}

async function used(businessId: string, messages: number, comments: number): Promise<void> {
  await db
    .update(quotaUsage)
    .set({ messagesUsed: messages, commentsUsed: comments })
    .where(eq(quotaUsage.businessId, businessId));
}

describe('the quota gate', () => {
  withPglite({ timeoutMs: 300_000 });

  it('lets a run through while the allowance has room and stops it at the cap', async () => {
    const { seed, status } = await world('room', 3, 3);
    await spend(seed.business.id, status.cycle.period, 2);

    expect(await quotaGate('message', seed.conversation.id, { businessId: seed.business.id })).toBe('fired');

    await used(seed.business.id, 3, 0);
    expect(await quotaGate('message', seed.conversation.id, { businessId: seed.business.id })).toBe('blocked');

    // A zero allowance is spent before it has answered anybody.
    const zero = await world('zero', 0, 0);
    expect(await quotaGate('message', zero.seed.conversation.id, { businessId: zero.seed.business.id })).toBe('blocked');
  });

  it('keeps the two budgets apart', async () => {
    const commentsGone = await world('only-comments', 5, 2);
    await spend(commentsGone.seed.business.id, commentsGone.status.cycle.period, 0, 2);
    expect(await quotaGate('message', commentsGone.seed.conversation.id, { businessId: commentsGone.seed.business.id })).toBe('fired');
    expect(await quotaGate('comment', 'thread-1', { businessId: commentsGone.seed.business.id })).toBe('blocked');

    const messagesGone = await world('only-messages', 5, 2);
    await spend(messagesGone.seed.business.id, messagesGone.status.cycle.period, 5, 0);
    expect(await quotaGate('message', messagesGone.seed.conversation.id, { businessId: messagesGone.seed.business.id })).toBe('blocked');
    expect(await quotaGate('comment', 'thread-2', { businessId: messagesGone.seed.business.id })).toBe('fired');
  });

  it('enforces nothing on a business with no plan, however much it has used', async () => {
    const seed = await seedTestWorld();
    // A new store starts on the seeded free plan, so this case has to be handed back
    // explicitly — the same revoke the operator console makes.
    await assignPlan(seed.business.id, null, { actorKind: 'operator' });
    const status = await getQuotaStatus(seed.business.id);
    if (!status) throw new Error('the seeded business is gone');
    expect(status.assigned).toBe(false);

    await spend(seed.business.id, status.cycle.period, 99_999, 99_999);
    expect(await quotaGate('message', seed.conversation.id, { businessId: seed.business.id })).toBe('fired');
    expect(await quotaGate('comment', 'thread-3', { businessId: seed.business.id })).toBe('fired');
  });

  it('stops enforcing the moment the plan itself is gone', async () => {
    const { seed, plan, status } = await world('dying', 1, 1);
    await spend(seed.business.id, status.cycle.period, 1);
    expect(await quotaGate('message', seed.conversation.id, { businessId: seed.business.id })).toBe('blocked');

    // Deleted out from under the business, which the console refuses while anyone is on
    // the plan but a migration or an operator with psql can still do. An enforceable ghost
    // is exactly what `resolvePlan`'s join prevents: no row, no caps, no blocked replies.
    await db.delete(plans).where(eq(plans.id, plan.id));
    expect(await quotaGate('message', seed.conversation.id, { businessId: seed.business.id })).toBe('fired');
  });

  it('fails open when the budget cannot be read', async () => {
    // A business row that is not there: nothing to charge, so the run goes ahead.
    expect(await quotaGate('message', 'conv-1', { businessId: crypto.randomUUID() })).toBe('fail_open');

    // A read that cannot even be attempted — the shape a database failure takes from here.
    expect((await readQuota('not-a-uuid')).failed).toBe(true);
    expect(await quotaGate('message', 'conv-1', { businessId: 'not-a-uuid' })).toBe('fail_open');

    // No business given and no row to find it in: the gate is blind, the run starts, and
    // it says so, because "allowed" and "not checked" must not read the same.
    expect(await quotaGate('message', 'conv-not-a-uuid')).toBe('fail_open');
  });

  it('writes the notice the spend never got to, and only once', async () => {
    const { seed, status } = await world('notice', 2, 2);
    await spend(seed.business.id, status.cycle.period, 2);

    // The bell is empty because the writer that crossed the line died before it rang it,
    // and nothing is scheduled anywhere to tell them later.
    expect(await listNotifications(seed.business.id)).toHaveLength(0);

    expect(await quotaGate('message', seed.conversation.id, { businessId: seed.business.id })).toBe('blocked');
    const after = await listNotifications(seed.business.id);
    expect(after).toHaveLength(1);
    expect(after[0]?.kind).toBe('message_quota_100');
    expect(after[0]?.link).toBe(`/b/${seed.business.id}/billing`);

    expect(await quotaGate('message', seed.conversation.id, { businessId: seed.business.id })).toBe('blocked');
    expect(await listNotifications(seed.business.id)).toHaveLength(1);
  });

  /**
   * Both allowances can run out in one cycle, and the merchant has to hear about each:
   * the bell is unique per (business, kind, period), so a kind that left out the budget
   * would let the messenger wall swallow the comment one for the whole cycle.
   */
  it('rings once per budget, not once per cycle', async () => {
    const { seed, status } = await world('both-budgets', 2, 2);
    await spend(seed.business.id, status.cycle.period, 2, 2);

    expect(await quotaGate('message', seed.conversation.id, { businessId: seed.business.id })).toBe('blocked');
    expect(await quotaGate('comment', 'thread-both', { businessId: seed.business.id })).toBe('blocked');

    const kinds = (await listNotifications(seed.business.id)).map((row) => row.kind).sort();
    expect(kinds).toEqual(['comment_quota_100', 'message_quota_100']);
  });

  it('starts no run at all when the gate blocks: nothing reaches the runner', async () => {
    const urls = recordFetch();
    const { seed, status } = await world('blocked-run', 1, 1);
    await spend(seed.business.id, status.cycle.period, 1, 1);

    expect(await triggerAgentRun(seed.conversation.id, { businessId: seed.business.id })).toBe('blocked');
    expect(await triggerCommentRun('thread-4', { businessId: seed.business.id })).toBe('blocked');
    expect(runStarted(urls)).toEqual([]);
  });

  it('posts the run when there is room', async () => {
    const urls = recordFetch();
    const { seed, status } = await world('room-run', 10, 10);
    await spend(seed.business.id, status.cycle.period, 9);

    // The fired path waits out the runner's hand-back window, so this one is slow on purpose.
    expect(await triggerAgentRun(seed.conversation.id, { businessId: seed.business.id })).toBe('fired');
    expect(runStarted(urls)).toEqual(['/internal/run']);
  }, 40_000);

  it('gates a comment run on the comment budget only', async () => {
    const urls = recordFetch();
    const { seed, status } = await world('comment-run', 10, 3);
    await spend(seed.business.id, status.cycle.period, 10, 3);

    expect(await triggerCommentRun('thread-5', { businessId: seed.business.id })).toBe('blocked');
    expect(runStarted(urls)).toEqual([]);

    await used(seed.business.id, 10, 1);
    expect(await triggerCommentRun('thread-5', { businessId: seed.business.id })).toBe('fired');
    expect(runStarted(urls)).toEqual(['/internal/run-comment']);
  });

  it('webhook: an inbound message with no allowance left never reaches the runner', async () => {
    const urls = recordFetch();
    const { seed, status } = await world('webhook-blocked', 1, 1);
    await spend(seed.business.id, status.cycle.period, 1);

    const res = await deliver(seed.pageChannelId, 'GATE_SENDER_1', 'Do you have this in red?', 'gate-mid-1');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('EVENT_RECEIVED');

    expect(runStarted(urls)).toEqual([]);
    expect(
      logEvents.filter((e) => e.evt === 'webhook_item').map((e) => e.outcome),
    ).toEqual(['quota_exhausted']);

    // The customer is kept, not dropped: the merchant must see what arrived while shut,
    // and it is still there to answer when the cycle resets or the plan gets bigger.
    const [conversation] = await listConversations(seed.business.id, { limit: 5 });
    if (!conversation) throw new Error('the webhook stored no conversation');
    const messages = await listMessages(conversation.id, seed.business.id);
    expect(messages?.filter((m) => m.from === 'customer')).toHaveLength(1);
    expect(await listNotifications(seed.business.id)).toHaveLength(1);
  }, 60_000);

  it('webhook: the same message with room left still reaches the runner', async () => {
    const urls = recordFetch();
    const { seed } = await world('webhook-open', 20, 20);

    await deliver(seed.pageChannelId, 'GATE_SENDER_2', 'What about delivery?', 'gate-mid-2');

    expect(runStarted(urls)).toEqual(['/internal/run']);
    expect(
      logEvents.filter((e) => e.evt === 'webhook_item').map((e) => e.outcome),
    ).toEqual(['agent_triggered']);
    expect(await listNotifications(seed.business.id)).toHaveLength(0);
  }, 60_000);
});

/** One Meta delivery, acked then flushed, so the side effects have happened by the return. */
async function deliver(pageId: string, senderId: string, text: string, mid: string): Promise<Response> {
  const body = JSON.stringify({
    object: 'page',
    entry: [{ id: pageId, messaging: [{ sender: { id: senderId }, message: { text, mid } }] }],
  });
  const res = await fbWebhookRouter.request('http://localhost/facebook', {
    method: 'POST',
    headers: await webhookHeaders(body),
    body,
  });
  await flushBackground();
  await flush();
  return res;
}
