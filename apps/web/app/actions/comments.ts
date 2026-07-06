'use server';

import { db } from '@repo/db/client';
import { comments, commentThreads, channels } from '@repo/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { replyToFacebookComment } from '@repo/integrations/facebook';
import { requireAuth } from '@/lib/auth';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

/**
 * Shape of a top-level Facebook comment (and its replies) returned to the UI.
 * Using the Facebook comment id as the "thread" identifier so no DB lookup is
 * needed just to browse comments.
 */
export type LiveCommentThread = {
  /** The Facebook top-level comment id — used as the thread key in the UI. */
  id: string;
  commenterName: string | null;
  commenterAvatar: string | null;
  /** The top-level (parent) comment. */
  comment: {
    externalId: string;
    content: string;
    time: string;
    from: 'customer';
  };
  /** Replies to the top-level comment (from page or agent). */
  replies: Array<{
    id: string;
    externalId: string;
    content: string;
    time: string;
    /** 'self' = page/agent reply; 'customer' = commenter's own follow-up reply */
    from: 'self' | 'customer';
  }>;
};

/**
 * Fetches Facebook post comments LIVE from the Graph API on every call.
 * Never reads from the local DB — always reflects the real-time state on Facebook.
 *
 * The `platformPostId` is the Facebook post id (e.g. "123456789_987654321").
 * We extract the page id prefix to look up the correct channel (and page token).
 */
export async function getPostCommentsAction(
  businessId: string,
  platformPostId: string,
): Promise<LiveCommentThread[]> {
  await requireAuth();

  // Resolve the page token from the DB channel record.
  // FB post ids are formatted as "{pageId}_{postId}".
  const pageId = platformPostId.split('_')[0];
  if (!pageId) {
    throw new Error('Invalid platformPostId — cannot extract page id.');
  }

  const channel = await db.query.channels.findFirst({
    where: and(
      eq(channels.businessId, businessId),
      eq(channels.platformChannelId, pageId),
      isNull(channels.deletedAt),
    ),
  });

  if (!channel || !channel.apiToken) {
    throw new Error('Facebook channel not found or missing access token for this business.');
  }

  const pageToken = channel.apiToken;

  // Fetch top-level comments with their nested replies in one Graph API call.
  // fields: id, message, from, created_time, comments (nested replies)
  const fields = [
    'id',
    'message',
    'from',
    'created_time',
    'comments{id,message,from,created_time}',
  ].join(',');

  const url = `${GRAPH_API}/${platformPostId}/comments?fields=${encodeURIComponent(fields)}&limit=100&access_token=${pageToken}`;
  const res = await fetch(url);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to fetch Facebook comments: ${err}`);
  }

  const data = (await res.json()) as {
    data: Array<{
      id: string;
      message?: string;
      from?: { id?: string; name?: string };
      created_time?: string;
      comments?: {
        data: Array<{
          id: string;
          message?: string;
          from?: { id?: string; name?: string };
          created_time?: string;
        }>;
      };
    }>;
  };

  // Map each FB top-level comment into a LiveCommentThread.
  const threads: LiveCommentThread[] = (data.data ?? []).map((fbComment) => {
    const replies = (fbComment.comments?.data ?? []).map((r) => ({
      id: r.id,
      externalId: r.id,
      content: r.message ?? '',
      time: r.created_time ?? new Date().toISOString(),
      // We treat replies from the same commenter as 'customer', others as 'self'
      from: r.from?.id === fbComment.from?.id ? ('customer' as const) : ('self' as const),
    }));

    return {
      id: fbComment.id, // Facebook comment id as thread key
      commenterName: fbComment.from?.name ?? null,
      commenterAvatar: null, // Graph API doesn't expose profile pics on feed comments
      comment: {
        externalId: fbComment.id,
        content: fbComment.message ?? '',
        time: fbComment.created_time ?? new Date().toISOString(),
        from: 'customer' as const,
      },
      replies,
    };
  });

  return threads;
}

/**
 * Posts a reply to a Facebook comment from the UI, then persists the reply
 * to the local DB (inside a commentThread row, creating one if needed).
 *
 * @param businessId   - the merchant's business id
 * @param channelId    - the Oryxa channel id (from the post detail) used to look up the page token
 * @param parentCommentId - the Facebook comment id to reply to
 * @param content      - the reply text
 * @returns the saved DB comment row
 */
export async function replyToCommentAction(
  businessId: string,
  channelId: string,
  parentCommentId: string,
  content: string,
) {
  await requireAuth();

  // Fetch the channel (page token) directly by channelId.
  const channel = await db.query.channels.findFirst({
    where: and(
      eq(channels.id, channelId),
      eq(channels.businessId, businessId),
      isNull(channels.deletedAt),
    ),
  });

  if (!channel) {
    throw new Error('Channel not found for this business.');
  }
  if (!channel.apiToken) {
    throw new Error('Channel is missing a Facebook access token.');
  }

  // Post the reply to Facebook Graph API.
  let externalReplyId: string | undefined;
  try {
    externalReplyId = await replyToFacebookComment(channel.apiToken, parentCommentId, content);
  } catch (err) {
    console.error('[replyToCommentAction] Facebook reply failed:', err);
    throw new Error(
      err instanceof Error ? err.message : 'Failed to post reply to Facebook.',
    );
  }

  // Resolve or create a commentThread row so the reply is tied to a thread.
  // Threads are keyed by (channelId, platformItemId=postId, commenterPlatformId).
  // For a manual UI reply we use the parentCommentId as a stand-in commenter id
  // (the real commenter id isn't available here without an extra API call).
  // If a thread already exists (created by the webhook flow) we reuse it.
  let thread = await db.query.commentThreads.findFirst({
    where: and(
      eq(commentThreads.channelId, channelId),
      eq(commentThreads.commenterPlatformId, parentCommentId),
      isNull(commentThreads.deletedAt),
    ),
  });

  if (!thread) {
    // Determine the FB post id from the parentCommentId prefix if possible,
    // otherwise use parentCommentId as the platformItemId (best-effort).
    const platformItemId = parentCommentId.includes('_')
      ? parentCommentId.split('_').slice(0, 2).join('_')
      : parentCommentId;

    const [created] = await db
      .insert(commentThreads)
      .values({
        businessId,
        channelId,
        platformItemId,
        commenterPlatformId: parentCommentId,
        lastCommentState: 'done',
      })
      .returning();
    thread = created;
  }

  // Persist the reply comment row.
  const [newComment] = await db
    .insert(comments)
    .values({
      commentThreadId: thread!.id,
      from: 'self',
      content,
      state: 'done',
      externalId: externalReplyId ?? `ui_reply_${Date.now()}`,
      parentExternalId: parentCommentId,
    })
    .returning();

  return newComment;
}
