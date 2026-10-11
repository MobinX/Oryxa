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

  it('sends the private answer to the inbox, then posts publicly only what the agent wrote', async () => {
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
    const privateTool = tools.find((t) => t.name === 'send_private_message')!;
    const replyTool = tools.find((t) => t.name === 'reply_comment')!;

    const answer = 'The Photo Hoodie is $59 and 5 pieces are left. Tell us your size and address to order.';
    const dmResult = await privateTool.invoke({ text: answer });

    // The whole answer went to the inbox, addressed to the comment that asked.
    expect(sendCommenterMessageMock).toHaveBeenCalledWith(
      'page-token-test',
      'PARENT_COMMENT_ID',
      answer,
    );
    // Choosing the private route posts nothing publicly — that is reply_comment's job, and
    // the tool result is what tells the model to make the one public line.
    expect(replyToFacebookCommentMock).not.toHaveBeenCalled();
    expect(dmResult).toMatch(/reply_comment/);

    const courtesy = 'Shared the price and what is left in stock with you in Messenger — please check your inbox!';
    const replyResult = await replyTool.invoke({ text: courtesy });

    // No swap, no rewriting: the comment says exactly the words the agent gave it.
    expect(replyToFacebookCommentMock).toHaveBeenCalledWith(
      'page-token-test',
      'PARENT_COMMENT_ID',
      courtesy,
    );
    expect(replyResult).toBe('Reply posted to the comment.');

    const all = await listComments(thread.id);
    expect(all.find((c) => c.from === 'self')?.content).toBe(courtesy);

    // And the private answer is on record, so the Messenger agent knows this customer was
    // already told the price and the stock count.
    const conversation = await getOrCreateConversation(
      seed.business.id,
      seed.channel.id,
      'COMMENTER_DM',
      'Commenter DM',
    );
    const messages = await listMessages(conversation.id, seed.business.id);
    expect(messages?.some((m) => m.from === 'self' && m.content === answer)).toBe(true);
  }, 30_000);

  it('tells the agent to answer in the comment when Messenger cannot be reached', async () => {
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
    const privateTool = tools.find((t) => t.name === 'send_private_message')!;

    const result = await privateTool.invoke({ text: 'It is $59, and we ship nationwide.' });

    expect(String(result)).toMatch(/could not be reached/i);
    expect(replyToFacebookCommentMock).not.toHaveBeenCalled();
  }, 30_000);

  it('refuses the private route when the thread has no commenter to message', async () => {
    const seed = await seedTestWorld();
    const thread = await getOrCreateCommentThread(
      seed.business.id,
      seed.channel.id,
      'POST_NO_DM',
      'COMMENTER_NO_DM',
      'Commenter No DM',
    );

    // The same tool set without the thread's channel and commenter: there is no inbox to
    // open, so the only honest answer is a public one — and it is said to the model, not
    // silently substituted.
    const tools = createCommentAgentTools({
      businessId: seed.business.id,
      commentThreadId: thread.id,
      pageToken: 'page-token-test',
      parentCommentExternalId: 'PARENT_COMMENT_ID',
      customerName: 'Commenter No DM',
    });
    const privateTool = tools.find((t) => t.name === 'send_private_message')!;

    const result = await privateTool.invoke({ text: 'It is $59.' });

    expect(sendCommenterMessageMock).not.toHaveBeenCalled();
    expect(String(result)).toMatch(/cannot be messaged privately/i);
  }, 30_000);
});
