'use server';

import { db } from '@repo/db/client';
import { commentThreads, comments } from '@repo/db/schema';
import { and, eq, isNull, asc } from 'drizzle-orm';
import { replyToFacebookComment } from '@repo/integrations/facebook';
import { requireAuth } from '@/lib/auth';

export async function getPostCommentsAction(businessId: string, platformPostId: string) {
  await requireAuth();

  const threads = await db.query.commentThreads.findMany({
    where: and(
      eq(commentThreads.businessId, businessId),
      eq(commentThreads.platformItemId, platformPostId),
      isNull(commentThreads.deletedAt)
    ),
    with: {
      comments: {
        where: isNull(comments.deletedAt),
        orderBy: [asc(comments.time)]
      }
    }
  });

  return threads;
}

export async function replyToCommentAction(
  businessId: string,
  threadId: string,
  parentExternalId: string,
  content: string
) {
  await requireAuth();

  // Find the thread and its channel (to get the channel token)
  const thread = await db.query.commentThreads.findFirst({
    where: and(
      eq(commentThreads.id, threadId),
      eq(commentThreads.businessId, businessId),
      isNull(commentThreads.deletedAt)
    ),
    with: {
      channel: true
    }
  });

  if (!thread) {
    throw new Error('Comment thread not found');
  }

  const channel = thread.channel;
  let externalId: string | undefined = undefined;

  // Post to Facebook if token exists
  if (channel && channel.platform === 'facebook' && channel.apiToken) {
    try {
      externalId = await replyToFacebookComment(
        channel.apiToken,
        parentExternalId,
        content
      );
    } catch (err) {
      console.error('Failed to reply to Facebook comment:', err);
    }
  }

  // Persist the reply locally in the comments table
  const [newComment] = await db
    .insert(comments)
    .values({
      commentThreadId: threadId,
      from: 'self',
      content,
      state: 'done',
      externalId: externalId || `reply_${Date.now()}`,
      parentExternalId,
    })
    .returning();

  return newComment;
}

export async function toggleAutoReplyAction(
  businessId: string,
  threadId: string,
  enabled: boolean
) {
  await requireAuth();

  const [thread] = await db
    .update(commentThreads)
    .set({
      lastCommentState: enabled ? 'done' : 'working'
    })
    .where(
      and(
        eq(commentThreads.id, threadId),
        eq(commentThreads.businessId, businessId)
      )
    )
    .returning();

  return thread;
}
