import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import {
  processInboundComment,
  getOrCreateCommentThread,
  claimCommentThreadForRun,
  getOldestPendingComment,
  listDoneCommentHistory,
  markCommentDone,
  checkPendingComments,
  createComment,
  listComments,
  updateCommentThreadState,
} from '@repo/db/crud/comment';

describe('Comment CRUD', () => {
  withPglite();

  it('processInboundComment creates a thread + pending comment and marks the thread pending', async () => {
    const seed = await seedTestWorld();
    const res = await processInboundComment(
      { id: seed.channel.id, businessId: seed.business.id },
      'COMMENTER_1',
      'Alice',
      'POST_1',
      'Hi, is this available?',
      'CMT_1',
    );
    expect(res.inserted).toBe(true);
    expect(res.priorStatus).toBe('done');

    const all = await listComments(res.threadId);
    expect(all).toHaveLength(1);
    expect(all[0].from).toBe('customer');
    expect(all[0].state).toBe('pending');
    expect(all[0].content).toBe('Hi, is this available?');

    const thread = await getOrCreateCommentThread(seed.business.id, seed.channel.id, 'POST_1', 'COMMENTER_1', 'Alice');
    expect(thread.id).toBe(res.threadId);
    expect(thread.lastCommentState).toBe('pending');
  });

  it('is idempotent on the platform comment id (retries do not duplicate)', async () => {
    const seed = await seedTestWorld();
    const first = await processInboundComment(
      { id: seed.channel.id, businessId: seed.business.id },
      'COMMENTER_DUP',
      'Bob',
      'POST_D',
      'hello',
      'CMT_DUP',
    );
    const second = await processInboundComment(
      { id: seed.channel.id, businessId: seed.business.id },
      'COMMENTER_DUP',
      'Bob',
      'POST_D',
      'hello',
      'CMT_DUP',
    );
    expect(first.threadId).toBe(second.threadId);
    expect(second.inserted).toBe(false);
    const all = await listComments(first.threadId);
    expect(all).toHaveLength(1);
  });

  it('separates threads by (post, commenter) so different commenters are independent', async () => {
    const seed = await seedTestWorld();
    const a = await processInboundComment(
      { id: seed.channel.id, businessId: seed.business.id },
      'USER_A',
      'A',
      'POST_SHARED',
      'q1',
      'C_A1',
    );
    const b = await processInboundComment(
      { id: seed.channel.id, businessId: seed.business.id },
      'USER_B',
      'B',
      'POST_SHARED',
      'q2',
      'C_B1',
    );
    expect(a.threadId).not.toBe(b.threadId);

    // Same commenter, different post → also separate.
    const aPost2 = await processInboundComment(
      { id: seed.channel.id, businessId: seed.business.id },
      'USER_A',
      'A',
      'POST_OTHER',
      'q3',
      'C_A2',
    );
    expect(aPost2.threadId).not.toBe(a.threadId);
  });

  it('claimCommentThreadForRun is race-free within a thread', async () => {
    const seed = await seedTestWorld();
    const { threadId } = await processInboundComment(
      { id: seed.channel.id, businessId: seed.business.id },
      'USER_CLAIM',
      'C',
      'POST_C',
      'hi',
      'C_C1',
    );
    const first = await claimCommentThreadForRun(threadId);
    const second = await claimCommentThreadForRun(threadId);
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('getOldestPendingComment returns the oldest, and listDoneCommentHistory excludes pending', async () => {
    const seed = await seedTestWorld();
    const { threadId } = await processInboundComment(
      { id: seed.channel.id, businessId: seed.business.id },
      'USER_HIST',
      'H',
      'POST_H',
      'first',
      'C_H1',
    );
    // Add a second pending comment a moment later.
    await processInboundComment(
      { id: seed.channel.id, businessId: seed.business.id },
      'USER_HIST',
      'H',
      'POST_H',
      'second',
      'C_H2',
    );

    const oldest = await getOldestPendingComment(threadId);
    expect(oldest?.content).toBe('first');

    const doneHist = await listDoneCommentHistory(threadId);
    expect(doneHist).toHaveLength(0);
  });

  it('markCommentDone + checkPendingComments drain the queue one at a time', async () => {
    const seed = await seedTestWorld();
    const { threadId } = await processInboundComment(
      { id: seed.channel.id, businessId: seed.business.id },
      'USER_DRAIN',
      'D',
      'POST_D2',
      'one',
      'C_D1',
    );
    await processInboundComment(
      { id: seed.channel.id, businessId: seed.business.id },
      'USER_DRAIN',
      'D',
      'POST_D2',
      'two',
      'C_D2',
    );

    expect(await checkPendingComments(threadId)).toBe(true);

    const first = await getOldestPendingComment(threadId);
    expect(first?.content).toBe('one');
    await markCommentDone(first!.id);

    // A self reply also becomes part of the done history.
    await createComment({ commentThreadId: threadId, from: 'self', content: 'reply one', state: 'done' });
    const doneHist = await listDoneCommentHistory(threadId);
    expect(doneHist.map((c) => c.content)).toEqual(expect.arrayContaining(['one', 'reply one']));

    const second = await getOldestPendingComment(threadId);
    expect(second?.content).toBe('two');
    await markCommentDone(second!.id);
    expect(await checkPendingComments(threadId)).toBe(false);

    await updateCommentThreadState(threadId, 'done');
  });
});
