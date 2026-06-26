import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { createCommentAgentTools } from '@agent/tools/comment';
import { getOrCreateCommentThread, listComments } from '@repo/db/crud/comment';

const replyToFacebookCommentMock = vi.fn(async () => 'NEW_REPLY_ID');
vi.mock('@repo/integrations/facebook', () => ({
  replyToFacebookComment: (...args: unknown[]) => replyToFacebookCommentMock(...args),
  sendMessage: vi.fn(),
}));

describe('comment agent tools: reply_comment', () => {
  withPglite();
  beforeEach(() => replyToFacebookCommentMock.mockClear());

  it('posts the reply to the platform AND persists a self comment with the returned id', async () => {
    const seed = await seedTestWorld();
    const thread = await getOrCreateCommentThread(
      seed.business.id,
      seed.channel.id,
      'POST_PX',
      'COMMENTER_Z',
      'Commenter Z',
    );

    const tools = createCommentAgentTools({
      businessId: seed.business.id,
      commentThreadId: thread.id,
      pageToken: 'page-token-test',
      parentCommentExternalId: 'PARENT_COMMENT_ID',
      customerName: 'Commenter Z',
    });
    const replyTool = tools.find((t) => t.name === 'reply_comment')!;
    expect(replyTool).toBeDefined();

    const result = await replyTool.invoke({ text: 'Thanks for your comment!' });

    // Posted to the platform as a reply to the specific comment id.
    expect(replyToFacebookCommentMock).toHaveBeenCalledWith(
      'page-token-test',
      'PARENT_COMMENT_ID',
      'Thanks for your comment!',
    );
    expect(result).toBe('Reply posted to the comment.');

    // Persisted as a self comment with the platform id Meta returned + parent link.
    const all = await listComments(thread.id);
    const self = all.find((c) => c.from === 'self');
    expect(self).toBeDefined();
    expect(self?.content).toBe('Thanks for your comment!');
    expect(self?.externalId).toBe('NEW_REPLY_ID');
    expect(self?.parentExternalId).toBe('PARENT_COMMENT_ID');
    expect(self?.state).toBe('done');
  }, 30_000);
});
