import { describe, it, expect, vi, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, type TestSeed } from '../helpers/seed';
import { stubAgentRun } from '../helpers/agent-run';
import type { AgentConfig } from '@repo/agent';
import { createCommentAgentTools } from '@agent/tools/comment';
import { runAgentCore } from '@api/lib/agent-runner-core';
import { runAgentForCommentThread } from '@api/lib/comment-runner';
import { db } from '@db/client';
import { conversations, messages, quotaUsage } from '@db/schema';
import { assignPlan, createPlan } from '@repo/db/crud/plans';
import { getQuotaStatus, spendQuotaUnit } from '@repo/db/crud/billing';
import { createComment, processInboundComment } from '@repo/db/crud/comment';

/**
 * The spend: one agent reply that reaches a customer is one unit, charged at the moment of
 * the send and given back if the send fails.
 *
 * Display tools, final Messenger delivery, public comment replies and private messages all
 * charge at the send boundary, so these tests cover each path that can reach a customer.
 */

const sendMock = vi.fn(async (..._args: unknown[]) => undefined);
const replyMock = vi.fn(async (..._args: unknown[]) => `reply-${Math.random().toString(36).slice(2, 8)}`);
const dmMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@repo/integrations/facebook', () => ({
  sendMessage: (...args: unknown[]) => sendMock(...args),
  replyToFacebookComment: (...args: unknown[]) => replyMock(...args),
  sendCommenterMessage: (...args: unknown[]) => dmMock(...args),
  getFacebookPostContext: vi.fn(async () => null),
  senderAction: vi.fn(async () => undefined),
  verifyWebhookSignature: vi.fn(async () => true),
}));

// The runners build an Agent; the fake LLM keeps that constructor off the network. Every
// test here replaces `run`, so the model never actually decides anything.
vi.mock('@repo/agent', async () => {
  const mod = await import('../../packages/agent/index');
  const { createDefaultReplyFakeLlm } = await import('../helpers/fake-llm');
  return {
    ...mod,
    Agent: class PatchedAgent extends mod.Agent {
      constructor(config: AgentConfig) {
        super({ ...config, llm: config.llm ?? createDefaultReplyFakeLlm('') });
      }
    },
  };
});

async function spent(businessId: string): Promise<{ messages: number; comments: number }> {
  const [row] = await db.select().from(quotaUsage).where(eq(quotaUsage.businessId, businessId)).limit(1);
  return { messages: row?.messagesUsed ?? 0, comments: row?.commentsUsed ?? 0 };
}

/** A business on a plan of the given caps, with the cycle its counters land in. */
async function onPlan(label: string, messageLimit: number | null, commentLimit: number | null) {
  const seed = await seedTestWorld();
  const plan = await createPlan({
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
  await assignPlan(seed.business.id, plan.id, { actorKind: 'operator' });
  const status = await getQuotaStatus(seed.business.id);
  if (!status) throw new Error('the seeded business is gone');
  return { seed, status, period: status.cycle.period };
}

async function selfReplies(conversationId: string): Promise<number> {
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.from, 'self')));
  return rows.length;
}

const commentTool = (context: Parameters<typeof createCommentAgentTools>[0], onSent?: (text: string) => void) =>
  createCommentAgentTools(context, onSent).find((t) => t.name === 'reply_comment')!;

const privateTool = (context: Parameters<typeof createCommentAgentTools>[0], onSent?: (text: string) => void) =>
  createCommentAgentTools(context, onSent).find((t) => t.name === 'send_private_message')!;

async function seedThread(seed: TestSeed, commenterId: string, postSuffix: string): Promise<string> {
  const { threadId } = await processInboundComment(
    { id: seed.channel.id, businessId: seed.business.id },
    commenterId,
    `Commenter ${commenterId}`,
    `POST_${postSuffix}`,
    'do you ship to dhaka?',
    `c-${commenterId}-${postSuffix}-0`,
    undefined,
  );
  return threadId;
}

describe('the quota spend', () => {
  withPglite({ timeoutMs: 300_000 });

  beforeEach(() => {
    sendMock.mockClear();
    sendMock.mockResolvedValue(undefined);
    replyMock.mockClear();
    dmMock.mockClear();
    dmMock.mockResolvedValue(undefined);
  });

  it('charges the final Messenger reply once and persists it', async () => {
    const { seed } = await onPlan('charge', 10, 10);
    const { Agent } = await import('@repo/agent');
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(stubAgentRun('Yes, we have it in red.'));
    try {
      await runAgentCore(seed.conversation.id, {});
    } finally {
      runSpy.mockRestore();
    }
    expect(await spent(seed.business.id)).toEqual({ messages: 1, comments: 0 });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(await selfReplies(seed.conversation.id)).toBe(1);
  });

  it('does not charge a dry-run final reply', async () => {
    const { seed } = await onPlan('override', 10, 10);
    const viaOverride = vi.fn(async () => undefined);
    const { Agent } = await import('@repo/agent');
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(stubAgentRun('Test reply, sent nowhere.'));
    try {
      await runAgentCore(seed.conversation.id, { sendMessageOverride: viaOverride });
    } finally {
      runSpy.mockRestore();
    }
    expect(viaOverride).toHaveBeenCalledTimes(1);
    expect(await selfReplies(seed.conversation.id)).toBe(1);
    expect(await spent(seed.business.id)).toEqual({ messages: 0, comments: 0 });
  });

  it('treats SILENT as no reply at all', async () => {
    const { seed } = await onPlan('silent', 10, 10);
    const { Agent } = await import('@repo/agent');
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(stubAgentRun('  SILENT  '));
    try {
      await runAgentCore(seed.conversation.id, {});
    } finally {
      runSpy.mockRestore();
    }
    expect(sendMock).not.toHaveBeenCalled();
    expect(await spent(seed.business.id)).toEqual({ messages: 0, comments: 0 });
    expect(await selfReplies(seed.conversation.id)).toBe(0);
  });

  it('refunds the message unit when final reply delivery fails', async () => {
    const { seed } = await onPlan('refund', 5, 5);
    sendMock.mockRejectedValueOnce(new Error('Graph 500'));
    const { Agent } = await import('@repo/agent');
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(stubAgentRun('This one will fail.'));
    try {
      await runAgentCore(seed.conversation.id, {});
    } finally {
      runSpy.mockRestore();
    }
    expect(await spent(seed.business.id)).toEqual({ messages: 0, comments: 0 });
    expect(await selfReplies(seed.conversation.id)).toBe(0);
  });

  it('does not let concurrent requests spend the last unit twice', async () => {
    const { seed, period } = await onPlan('race', 1, 1);
    await db.insert(quotaUsage).values({ businessId: seed.business.id, period, messagesUsed: 0 });
    const results = await Promise.all([
      spendQuotaUnit(seed.business.id, 'message'),
      spendQuotaUnit(seed.business.id, 'message'),
    ]);
    expect(results.filter((result) => result.spent)).toHaveLength(1);
    expect(results.filter((result) => !result.spent)).toHaveLength(1);
    expect(await spent(seed.business.id)).toEqual({ messages: 1, comments: 0 });
  });

  it('charges the messenger fallback, which is the reply when the tool never ran', async () => {
    const { seed } = await onPlan('fallback', 10, 10);
    const { Agent } = await import('@repo/agent');
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(stubAgentRun('Direct final answer.'));

    try {
      await runAgentCore(seed.conversation.id, {});
    } finally {
      runSpy.mockRestore();
    }

    expect(await spent(seed.business.id)).toEqual({ messages: 1, comments: 0 });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(await selfReplies(seed.conversation.id)).toBe(1);
  });

  it('does not send the fallback past the cap, and still ends the run done', async () => {
    const { seed, period } = await onPlan('fallback-full', 1, 1);
    await db.insert(quotaUsage).values({ businessId: seed.business.id, period, messagesUsed: 1 });
    const { Agent } = await import('@repo/agent');
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(stubAgentRun('Would have replied.'));

    try {
      await runAgentCore(seed.conversation.id, {});
    } finally {
      runSpy.mockRestore();
    }

    expect(sendMock).not.toHaveBeenCalled();
    expect(await spent(seed.business.id)).toEqual({ messages: 1, comments: 0 });
    expect(await selfReplies(seed.conversation.id)).toBe(0);

    const [conversation] = await db
      .select({ state: conversations.lastMessageState })
      .from(conversations)
      .where(eq(conversations.id, seed.conversation.id));
    // A shut budget mutes the agent; it must not leave the conversation locked in working.
    expect(conversation?.state).toBe('done');
  });

  it('charges reply_comment as a comment, and a prevented duplicate as nothing', async () => {
    const { seed } = await onPlan('comment', 10, 2);
    const threadId = await seedThread(seed, 'USER_A', 'SPEND1');

    await commentTool({
      businessId: seed.business.id,
      commentThreadId: threadId,
      pageToken: 'token',
      parentCommentExternalId: 'c-USER_A-SPEND1-0',
    }).invoke({ text: 'Yes we do.' });

    expect(await spent(seed.business.id)).toEqual({ messages: 0, comments: 1 });
    expect(replyMock).toHaveBeenCalledTimes(1);

    // The thread already has a page reply to that comment, so the tool returns early —
    // before the reserve. A duplicate that was never going to post costs nothing.
    await createComment({
      commentThreadId: threadId,
      from: 'self',
      content: 'already posted',
      externalId: 'EXISTING_REPLY',
      parentExternalId: 'c-USER_A-SPEND1-0',
      state: 'done',
    });
    const second = await commentTool({
      businessId: seed.business.id,
      commentThreadId: threadId,
      pageToken: 'token',
      parentCommentExternalId: 'c-USER_A-SPEND1-0',
    }).invoke({ text: 'Would have been a duplicate.' });

    expect(String(second)).toContain('already posted');
    expect(replyMock).toHaveBeenCalledTimes(1);
    expect(await spent(seed.business.id)).toEqual({ messages: 0, comments: 1 });
  });

  it('charges send_private_message as a message, and gives it back when Meta refuses', async () => {
    const { seed } = await onPlan('dm', 3, 3);
    const threadId = await seedThread(seed, 'USER_E', 'SPEND5');
    const context = {
      businessId: seed.business.id,
      commentThreadId: threadId,
      pageToken: 'token',
      parentCommentExternalId: 'c-USER_E-SPEND5-0',
      channelId: seed.channel.id,
      commenterPlatformId: 'USER_E',
    };

    await privateTool(context).invoke({ text: 'It is $59 and we ship nationwide.' });

    // A comment agent that answers in Messenger spends the message allowance, not the
    // comment one — the public line is a separate reply_comment call with its own unit.
    expect(await spent(seed.business.id)).toEqual({ messages: 1, comments: 0 });

    dmMock.mockRejectedValueOnce(new Error('Graph 550'));
    const refused = await privateTool(context).invoke({ text: 'Would have been a second DM.' });

    expect(String(refused)).toMatch(/could not be reached/i);
    // Nobody was messaged, so the cycle pays for nobody.
    expect(await spent(seed.business.id)).toEqual({ messages: 1, comments: 0 });
  });

  it('refuses a comment reply at the cap and charges nothing for the test override', async () => {
    const { seed, period } = await onPlan('comment-full', 10, 1);
    await db.insert(quotaUsage).values({ businessId: seed.business.id, period, commentsUsed: 1 });
    const threadId = await seedThread(seed, 'USER_B', 'SPEND2');

    const refused = await commentTool({
      businessId: seed.business.id,
      commentThreadId: threadId,
      pageToken: 'token',
      parentCommentExternalId: 'c-USER_B-SPEND2-0',
    }).invoke({ text: 'Would have replied.' });

    expect(String(refused)).toContain('used up');
    expect(replyMock).not.toHaveBeenCalled();

    const withOverride = await commentTool({
      businessId: seed.business.id,
      commentThreadId: threadId,
      pageToken: 'token',
      parentCommentExternalId: 'c-USER_B-SPEND2-0',
      replyCommentOverride: async () => 'OVERRIDE_ID',
    }).invoke({ text: 'Test reply, posted nowhere.' });

    expect(String(withOverride)).toContain('posted');
    expect(await spent(seed.business.id)).toEqual({ messages: 0, comments: 1 });
  });

  it('charges the comment fallback, which is the reply when the tool never ran', async () => {
    const { seed } = await onPlan('comment-fallback', 10, 2);
    const threadId = await seedThread(seed, 'USER_C', 'SPEND3');
    const { Agent } = await import('@repo/agent');
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(stubAgentRun('Direct public reply.'));

    try {
      await runAgentForCommentThread(threadId);
    } finally {
      runSpy.mockRestore();
    }

    // The public reply the commenter sees, charged even though reply_comment never ran.
    expect(await spent(seed.business.id)).toEqual({ messages: 0, comments: 1 });
    expect(replyMock).toHaveBeenCalledTimes(1);
  });

  it('does not post the comment fallback past the cap', async () => {
    const { seed, period } = await onPlan('comment-fallback-full', 10, 1);
    await db.insert(quotaUsage).values({ businessId: seed.business.id, period, commentsUsed: 1 });
    const threadId = await seedThread(seed, 'USER_D', 'SPEND4');
    const { Agent } = await import('@repo/agent');
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(stubAgentRun('Would have replied.'));

    try {
      await runAgentForCommentThread(threadId);
    } finally {
      runSpy.mockRestore();
    }

    expect(replyMock).not.toHaveBeenCalled();
    expect(await spent(seed.business.id)).toEqual({ messages: 0, comments: 1 });
  });
});
