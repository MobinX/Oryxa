import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { fbWebhookRouter } from '@api/webhooks/facebook';
import { webhookHeaders } from '../helpers/meta-sign';
import { flushBackground } from '@api/lib/background';
import { listComments, getOrCreateCommentThread } from '@repo/db/crud/comment';

process.env.META_APP_SECRET = 'test-app-secret';

const triggerCommentRunMock = vi.fn();
const triggerAgentRunMock = vi.fn();
vi.mock('@api/lib/comment-runner', () => ({
  triggerCommentRun: (...args: unknown[]) => triggerCommentRunMock(...args),
  runAgentForCommentThread: vi.fn(),
}));
vi.mock('@api/lib/agent-runner', () => ({
  triggerAgentRun: (...args: unknown[]) => triggerAgentRunMock(...args),
  runAgentForConversation: vi.fn(),
}));

// Stub the Graph profile/post lookups so comment webhook tests never hit the network.
vi.mock('@repo/integrations/facebook', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/integrations/facebook')>();
  return {
    ...actual,
    getFacebookUserProfile: vi.fn(async () => ({ name: 'Alice', avatar: 'https://img/alice.png' })),
    getFacebookPostContext: vi.fn(async () => null),
  };
});

async function postWebhook(payload: unknown) {
  const body = JSON.stringify(payload);
  const res = await fbWebhookRouter.request('http://localhost/facebook', {
    method: 'POST',
    headers: await webhookHeaders(body),
    body,
  });
  await flushBackground();
  return res;
}

const commentEntry = (pageId: string, value: Record<string, unknown>) => ({
  id: pageId,
  changes: [{ field: 'feed', value }],
});

const commentValue = (overrides: Partial<Record<string, unknown>> = {}) => ({
  item: 'comment',
  verb: 'add',
  comment_id: 'CMT_1',
  message: 'Do you have this in red?',
  from: { id: 'COMMENTER_1', name: 'Alice' },
  post_id: 'POST_1',
  ...overrides,
});

describe('Facebook Webhook: comments', () => {
  withPglite();
  beforeEach(() => {
    process.env.META_APP_SECRET = 'test-app-secret';
    triggerCommentRunMock.mockClear();
    triggerAgentRunMock.mockClear();
  });

  it('saves a comment and triggers the comment runner for a new page comment', async () => {
    const seed = await seedTestWorld();
    const res = await postWebhook({
      object: 'page',
      entry: [commentEntry(seed.pageChannelId, commentValue())],
    });
    expect(res.status).toBe(200);
    expect(triggerCommentRunMock).toHaveBeenCalledTimes(1);
    // A DM trigger must not fire for a comment event.
    expect(triggerAgentRunMock).not.toHaveBeenCalled();
  });

  it('skips the page\u2019s own comments (no re-ingest, no trigger)', async () => {
    const seed = await seedTestWorld();
    const res = await postWebhook({
      object: 'page',
      entry: [commentEntry(seed.pageChannelId, commentValue({ from: { id: seed.pageChannelId, name: 'Page' } }))],
    });
    expect(res.status).toBe(200);
    expect(triggerCommentRunMock).not.toHaveBeenCalled();
  });

  it('ignores edited/removed comment verbs', async () => {
    const seed = await seedTestWorld();
    const res = await postWebhook({
      object: 'page',
      entry: [commentEntry(seed.pageChannelId, commentValue({ verb: 'edited' }))],
    });
    expect(res.status).toBe(200);
    expect(triggerCommentRunMock).not.toHaveBeenCalled();
  });

  it('is idempotent under retries (same comment_id stored once)', async () => {
    const seed = await seedTestWorld();
    const payload = {
      object: 'page',
      entry: [commentEntry(seed.pageChannelId, commentValue({ comment_id: 'CMT_DUP', from: { id: 'DUP_USER', name: 'Bob' } }))],
    };
    await postWebhook(payload);
    await postWebhook(payload);
    expect(triggerCommentRunMock).toHaveBeenCalledTimes(1);

    const thread = await getOrCreateCommentThread(
      seed.business.id,
      seed.channel.id,
      'POST_1',
      'DUP_USER',
      'Bob',
    );
    const all = await listComments(thread.id);
    expect(all.filter((c) => c.content === 'Do you have this in red?')).toHaveLength(1);
  });

  it('routes different commenters on the same post to separate threads (parallel)', async () => {
    const seed = await seedTestWorld();
    const res = await postWebhook({
      object: 'page',
      entry: [
        commentEntry(seed.pageChannelId, commentValue({ comment_id: 'C_A', from: { id: 'USER_A', name: 'A' } })),
        commentEntry(seed.pageChannelId, commentValue({ comment_id: 'C_B', from: { id: 'USER_B', name: 'B' } })),
      ],
    });
    expect(res.status).toBe(200);
    // Two independent threads → two triggers (parallel processing).
    expect(triggerCommentRunMock).toHaveBeenCalledTimes(2);

    const tA = await getOrCreateCommentThread(seed.business.id, seed.channel.id, 'POST_1', 'USER_A', 'A');
    const tB = await getOrCreateCommentThread(seed.business.id, seed.channel.id, 'POST_1', 'USER_B', 'B');
    expect(tA.id).not.toBe(tB.id);
  });

  it('does not trigger when the channel has no agent', async () => {
    const seed = await seedTestWorld();
    const { updateChannelAgent } = await import('@repo/db/crud/channel');
    await updateChannelAgent(seed.channel.id, seed.business.id, null);

    const res = await postWebhook({
      object: 'page',
      entry: [commentEntry(seed.pageChannelId, commentValue({ comment_id: 'C_NOAGENT', from: { id: 'NA', name: 'NA' } }))],
    });
    expect(res.status).toBe(200);
    expect(triggerCommentRunMock).not.toHaveBeenCalled();
  });

  it('enriches the commenter avatar from Facebook (name comes from the payload)', async () => {
    const seed = await seedTestWorld();
    await postWebhook({
      object: 'page',
      entry: [commentEntry(seed.pageChannelId, commentValue({ comment_id: 'C_AV', from: { id: 'AV_USER', name: 'Avatar User' } }))],
    });

    const thread = await getOrCreateCommentThread(seed.business.id, seed.channel.id, 'POST_1', 'AV_USER', 'Avatar User');
    expect(thread.commenterName).toBe('Avatar User');
    expect(thread.commenterAvatar).toBe('https://img/alice.png');
  });
});
