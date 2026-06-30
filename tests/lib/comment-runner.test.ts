import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { runAgentForCommentThread, triggerCommentRun } from '@api/lib/comment-runner';
import { listComments } from '@repo/db/crud/comment';
import type { AgentConfig } from '@repo/agent';

const replyToFacebookCommentMock = vi.fn(async () => `reply-id-${Math.random()}`);
const sendMessageMock = vi.fn(async () => undefined);
const getFacebookPostContextMock = vi.fn(async () => null);
vi.mock('@repo/integrations/facebook', () => ({
  replyToFacebookComment: (...args: unknown[]) => replyToFacebookCommentMock(...args),
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
  getFacebookPostContext: (...args: unknown[]) => getFacebookPostContextMock(...args),
}));

vi.mock('@repo/agent', async ({ importOriginal }) => {
  const mod = await importOriginal<typeof import('@repo/agent')>();
  const { createSendMessageFakeLlm } = await import('../helpers/fake-llm');
  return {
    ...mod,
    Agent: class PatchedAgent extends mod.Agent {
      constructor(config: AgentConfig) {
        super({ ...config, llm: config.llm ?? createSendMessageFakeLlm('') });
      }
    },
  };
});

async function seedCommentThread(seed: {
  business: { id: string };
  channel: { id: string; platformChannelId: string };
}, commenterId: string, postSuffix: string) {
  const { processInboundComment } = await import('@repo/db/crud/comment');
  const postId = `POST_${postSuffix}`;
  const res = await processInboundComment(
    { id: seed.channel.id, businessId: seed.business.id },
    commenterId,
    `Commenter ${commenterId}`,
    postId,
    'first comment',
    `c-${commenterId}-${postSuffix}-0`,
  );
  return res.threadId;
}

describe('Comment Runner', () => {
  withPglite();
  beforeEach(() => {
    replyToFacebookCommentMock.mockClear();
    sendMessageMock.mockClear();
    getFacebookPostContextMock.mockClear();
  });

  it('runAgentForCommentThread processes only the oldest pending comment (one per run)', async () => {
    const seed = await seedTestWorld();
    const { processInboundComment } = await import('@repo/db/crud/comment');
    const threadId = await seedCommentThread(seed, 'USER_A', 'P1');
    // Add two more pending comments from the same user on the same post.
    await processInboundComment(
      { id: seed.channel.id, businessId: seed.business.id },
      'USER_A',
      'Commenter USER_A',
      'POST_P1',
      'second comment',
      'c-USER_A-P1-1',
    );
    await processInboundComment(
      { id: seed.channel.id, businessId: seed.business.id },
      'USER_A',
      'Commenter USER_A',
      'POST_P1',
      'third comment',
      'c-USER_A-P1-2',
    );

    const { Agent } = await import('@repo/agent');
    let capturedHistory: Array<{ from: string; content: string }> = [];
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(async function (this: unknown) {
      capturedHistory = [...(this as { config: { history: Array<{ from: string; content: string }> } }).config.history];
      return 'ok';
    });

    await runAgentForCommentThread(threadId);

    // History contains ONLY the first (oldest) pending comment — not the newer
    // pending ones — keeping the reply context clean.
    const customerTexts = capturedHistory.filter((m) => m.from === 'customer').map((m) => m.content);
    expect(customerTexts).toEqual(['first comment']);

    // Only the oldest comment is marked done; the other two stay pending.
    const all = await listComments(threadId);
    const byContent = Object.fromEntries(all.map((c) => [c.content, c.state]));
    expect(byContent['first comment']).toBe('done');
    expect(byContent['second comment']).toBe('pending');
    expect(byContent['third comment']).toBe('pending');

    runSpy.mockRestore();
  }, 30_000);

  it('has NO fallback send: when the agent stays silent, nothing is posted but the comment is still marked done', async () => {
    const seed = await seedTestWorld();
    const threadId = await seedCommentThread(seed, 'USER_SILENT', 'P2');

    const { Agent } = await import('@repo/agent');
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(async function () {
      // Agent judged it not-for-page → no tool call, empty reply.
      return '';
    });

    replyToFacebookCommentMock.mockClear();
    await runAgentForCommentThread(threadId);

    expect(replyToFacebookCommentMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();

    const all = await listComments(threadId);
    expect(all.find((c) => c.content === 'first comment')?.state).toBe('done');
    // No self reply row was created.
    expect(all.filter((c) => c.from === 'self')).toHaveLength(0);

    runSpy.mockRestore();
  }, 30_000);

  it('re-triggers to drain the rest of the commenter\u2019s queue', async () => {
    const seed = await seedTestWorld();
    const { processInboundComment } = await import('@repo/db/crud/comment');
    const threadId = await seedCommentThread(seed, 'USER_DRAIN', 'P3');
    await processInboundComment(
      { id: seed.channel.id, businessId: seed.business.id },
      'USER_DRAIN',
      'Commenter USER_DRAIN',
      'POST_P3',
      'second comment',
      'c-USER_DRAIN-P3-1',
    );

    const { Agent } = await import('@repo/agent');
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockResolvedValue('ok');

    const fetchMock = vi.fn(async () => new Response('accepted', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await runAgentForCommentThread(threadId);
    await new Promise((r) => setTimeout(r, 30));

    // After processing the first, a second still pending → tail re-trigger to /internal/run-comment.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/internal/run-comment'),
      expect.objectContaining({ method: 'POST' }),
    );

    runSpy.mockRestore();
    vi.unstubAllGlobals();
  }, 30_000);

  it('different commenters run in parallel (independent claims)', async () => {
    const seed = await seedTestWorld();
    const { claimCommentThreadForRun } = await import('@repo/db/crud/comment');
    const threadA = await seedCommentThread(seed, 'USER_X', 'P4');
    const threadB = await seedCommentThread(seed, 'USER_Y', 'P4');

    const claimedA = await claimCommentThreadForRun(threadA);
    const claimedB = await claimCommentThreadForRun(threadB);
    // Both win their own claim — threads are independent and parallel.
    expect(claimedA).toBe(true);
    expect(claimedB).toBe(true);

    // A second claim on the same thread loses (race-free within a thread).
    const claimedA2 = await claimCommentThreadForRun(threadA);
    expect(claimedA2).toBe(false);
  }, 30_000);

  it('on agent error the comment is still marked done (no duplicate public reply on retry)', async () => {
    const seed = await seedTestWorld();
    const threadId = await seedCommentThread(seed, 'USER_ERR', 'P5');

    const { Agent } = await import('@repo/agent');
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockRejectedValueOnce(new Error('boom'));

    replyToFacebookCommentMock.mockClear();
    await runAgentForCommentThread(threadId);

    // No reply was posted, and the comment is marked done so a retry won't re-send.
    expect(replyToFacebookCommentMock).not.toHaveBeenCalled();
    const all = await listComments(threadId);
    expect(all.find((c) => c.content === 'first comment')?.state).toBe('done');

    runSpy.mockRestore();
  }, 30_000);

  it('triggerCommentRun fires fetch to the comment internal endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response('accepted', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    triggerCommentRun('thread-abc');
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/internal/run-comment'),
      expect.objectContaining({ method: 'POST' }),
    );
    vi.unstubAllGlobals();
  });

  it('injects cached post context into the agent system prompt', async () => {
    const seed = await seedTestWorld();
    const threadId = await seedCommentThread(seed, 'USER_POST', 'PCTX');
    const { setCommentThreadPostContext } = await import('@repo/db/crud/comment');
    await setCommentThreadPostContext(threadId, 'Post caption: Big sale this weekend!');

    const { Agent } = await import('@repo/agent');
    let capturedSystemPrompt = '';
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(async function (this: unknown) {
      capturedSystemPrompt = (this as { config: { systemPrompt: string } }).config.systemPrompt;
      return 'ok';
    });

    getFacebookPostContextMock.mockClear();
    await runAgentForCommentThread(threadId);

    // Cached context is used; no Graph call is made.
    expect(getFacebookPostContextMock).not.toHaveBeenCalled();
    expect(capturedSystemPrompt).toContain('Big sale this weekend!');
    expect(capturedSystemPrompt.startsWith('Post being commented on:')).toBe(true);

    runSpy.mockRestore();
  }, 30_000);

  it('fetches and caches post context from the Graph API when not yet stored', async () => {
    const seed = await seedTestWorld();
    const threadId = await seedCommentThread(seed, 'USER_FETCH', 'PFETCH');

    getFacebookPostContextMock.mockResolvedValueOnce('Post caption: New drop!');
    const { Agent } = await import('@repo/agent');
    let capturedSystemPrompt = '';
    const runSpy = vi.spyOn(Agent.prototype, 'run').mockImplementation(async function (this: unknown) {
      capturedSystemPrompt = (this as { config: { systemPrompt: string } }).config.systemPrompt;
      return 'ok';
    });

    await runAgentForCommentThread(threadId);

    expect(getFacebookPostContextMock).toHaveBeenCalledWith('page-token-test', 'POST_PFETCH');
    expect(capturedSystemPrompt).toContain('New drop!');

    // Cached on the thread so the next run won't re-fetch.
    const { getCommentThreadWithChannel } = await import('@repo/db/crud/comment');
    const thread = await getCommentThreadWithChannel(threadId);
    expect(thread?.postContext).toContain('New drop!');

    runSpy.mockRestore();
  }, 30_000);
});
