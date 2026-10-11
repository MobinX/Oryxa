import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { createCommentAgentTools } from '@agent/tools/comment';
import { getOrCreateCommentThread, listComments } from '@repo/db/crud/comment';
import { getOrCreateConversation, listMessages } from '@repo/db/crud/conversation';

// A fresh id per call: `comments.external_id` is unique, and one pglite database serves
// every test in this file.
const replyToFacebookCommentMock = vi.fn(async () => `NEW_REPLY_ID-${crypto.randomUUID()}`);const sendCommenterMessageMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@repo/integrations/facebook', () => ({
  replyToFacebookComment: (...args: unknown[]) => replyToFacebookCommentMock(...args),
  sendCommenterMessage: (...args: unknown[]) => sendCommenterMessageMock(...args),
  sendMessage: vi.fn(),
}));

describe('comment agent tools: reply_comment', () => {
  withPglite();
  beforeEach(() => {
    replyToFacebookCommentMock.mockClear();
    sendCommenterMessageMock.mockClear();
  });

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
    expect(self?.externalId).toMatch(/^NEW_REPLY_ID-/);
    expect(self?.parentExternalId).toBe('PARENT_COMMENT_ID');
    expect(self?.state).toBe('done');
  }, 30_000);

  it('delivers the answer to the commenter inbox and posts only the pointer under the comment', async () => {
    const seed = await seedTestWorld();
    const thread = await getOrCreateCommentThread(
      seed.business.id,
      seed.channel.id,
      'POST_DM',
      'COMMENTER_DM',
      'Commenter DM',
    );

    const tools = createCommentAgentTools({
      businessId: seed.business.id,
      commentThreadId: thread.id,
      pageToken: 'page-token-test',
      parentCommentExternalId: 'PARENT_COMMENT_ID',
      customerName: 'Commenter DM',
      channelId: seed.channel.id,
      commenterPlatformId: 'COMMENTER_DM',
    });
    const replyTool = tools.find((t) => t.name === 'reply_comment')!;

    const answer = 'The Photo Hoodie is $59 and sizes S–XL are in stock. Tell us your size to order.';
    const result = await replyTool.invoke({ text: answer });

    // The whole answer went to the inbox, addressed to the comment that asked.
    expect(sendCommenterMessageMock).toHaveBeenCalledWith(
      'page-token-test',
      'PARENT_COMMENT_ID',
      answer,
    );

    // The public thread got the pointer, never the answer.
    expect(replyToFacebookCommentMock).toHaveBeenCalledWith(
      'page-token-test',
      'PARENT_COMMENT_ID',
      expect.stringMatching(/Messenger/i),
    );
    expect(result).toMatch(/Messenger/);

    // What was saved is what was posted, so the persisted row proves the public text too.
    const all = await listComments(thread.id);
    const selfComment = all.find((c) => c.from === 'self');
    expect(selfComment?.content).toMatch(/Messenger/i);
    expect(selfComment?.content).not.toContain(answer);

    // And the private answer is on record, so the Messenger agent knows this customer
    // was already told it.
    const conversation = await getOrCreateConversation(
      seed.business.id,
      seed.channel.id,
      'COMMENTER_DM',
      'Commenter DM',
    );
    const messages = await listMessages(conversation.id, seed.business.id);
    expect(messages?.some((m) => m.from === 'self' && m.content === answer)).toBe(true);
  }, 30_000);

  it('answers in the comment itself when Meta will not open the inbox', async () => {
    const seed = await seedTestWorld();
    const thread = await getOrCreateCommentThread(
      seed.business.id,
      seed.channel.id,
      'POST_REFUSED',
      'COMMENTER_REFUSED',
      'Commenter Refused',
    );

    sendCommenterMessageMock.mockRejectedValueOnce(new Error('Meta refused the send'));

    const tools = createCommentAgentTools({
      businessId: seed.business.id,
      commentThreadId: thread.id,
      pageToken: 'page-token-test',
      parentCommentExternalId: 'PARENT_COMMENT_ID',
      customerName: 'Commenter Refused',
      channelId: seed.channel.id,
      commenterPlatformId: 'COMMENTER_REFUSED',
    });
    const replyTool = tools.find((t) => t.name === 'reply_comment')!;

    const result = await replyTool.invoke({ text: 'Yes, it ships within 3 days.' });

    // Pointing at an empty inbox would be a lie, so the answer is posted publicly.
    expect(replyToFacebookCommentMock).toHaveBeenCalledWith(
      'page-token-test',
      'PARENT_COMMENT_ID',
      'Yes, it ships within 3 days.',
    );
    expect(result).toBe('Reply posted to the comment.');

    const all = await listComments(thread.id);
    expect(all.find((c) => c.from === 'self')?.content).toBe('Yes, it ships within 3 days.');
  }, 30_000);
});
