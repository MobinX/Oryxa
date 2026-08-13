'use server';

import { db } from '@repo/db/client';
import { channels } from '@repo/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';
import { GRAPH_API, graphFetch } from '@/lib/facebook-graph';
import { persistPageReply } from '@repo/db/crud/comment';
import type { CommentReaction, LiveCommentThread } from '@/lib/comment-types';

/** Resolve page access token the same way messaging/posts do: channel FK → apiToken. */
async function resolveChannel(businessId: string, channelId: string) {
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

  return {
    apiToken: channel.apiToken,
    pageId: channel.platformChannelId,
  };
}

async function resolveChannelToken(businessId: string, channelId: string) {
  return (await resolveChannel(businessId, channelId)).apiToken;
}

/**
 * Fetches Facebook post comments LIVE from the Graph API on every call.
 * Never reads from the local DB — always reflects the real-time state on Facebook.
 *
 * Resolves the page token via the post's channelId (same pattern as messaging /
 * reply/create/react) — never by parsing platformPostId.
 */
export async function getPostCommentsAction(
  businessId: string,
  channelId: string,
  platformPostId: string,
): Promise<LiveCommentThread[]> {
  await requireAuth();

  const { apiToken: pageToken, pageId } = await resolveChannel(businessId, channelId);

  type GraphComment = {
    id: string;
    message?: string;
    from?: { id?: string; name?: string };
    created_time?: string;
    like_count?: number;
    user_likes?: boolean;
    parent?: { id?: string };
    comments?: { data: GraphComment[] };
  };

  // filter=stream returns replies in the same list (with `parent`), which the
  // nested comments{} edge often omits — that's why UI replies vanished on refetch.
  const fields = [
    'id',
    'message',
    'from',
    'created_time',
    'like_count',
    'user_likes',
    'parent',
    'comments.limit(50){id,message,from,created_time,like_count,user_likes,parent}',
  ].join(',');

  const url = `${GRAPH_API}/${platformPostId}/comments?fields=${encodeURIComponent(fields)}&filter=stream&order=chronological&limit=100&access_token=${pageToken}`;
  const res = await graphFetch(url);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to fetch Facebook comments: ${err}`);
  }

  const data = (await res.json()) as { data: GraphComment[] };
  const flat: GraphComment[] = [];
  for (const item of data.data ?? []) {
    flat.push(item);
    for (const nested of item.comments?.data ?? []) {
      flat.push({ ...nested, parent: nested.parent ?? { id: item.id } });
    }
  }

  const unique: GraphComment[] = [];
  const seenIds = new Set<string>();
  for (const c of flat) {
    if (seenIds.has(c.id)) continue;
    seenIds.add(c.id);
    unique.push(c);
  }

  const byId = new Map(unique.map((c) => [c.id, c]));

  function rootId(comment: GraphComment): string {
    let current = comment;
    const walked = new Set<string>();
    while (current.parent?.id && !walked.has(current.id)) {
      walked.add(current.id);
      const parent = byId.get(current.parent.id);
      if (!parent) return current.parent.id;
      current = parent;
    }
    return current.id;
  }

  // Top-level: no parent comment in this payload (parent is the post itself).
  const roots = unique.filter((c) => !c.parent?.id || !byId.has(c.parent.id));
  const repliesByRoot = new Map<string, GraphComment[]>();

  for (const c of unique) {
    if (!c.parent?.id || !byId.has(c.parent.id)) continue;
    const rid = rootId(c);
    if (rid === c.id) continue;
    const list = repliesByRoot.get(rid) ?? [];
    list.push(c);
    repliesByRoot.set(rid, list);
  }

  const threads: LiveCommentThread[] = roots.map((fbComment) => {
    const replies = (repliesByRoot.get(fbComment.id) ?? []).map((r) => {
      const fromSelf = r.from?.id === pageId;
      return {
        id: r.id,
        externalId: r.id,
        content: r.message ?? '',
        time: r.created_time ?? new Date().toISOString(),
        from: fromSelf ? ('self' as const) : ('customer' as const),
        commenterPlatformId: fromSelf ? null : (r.from?.id ?? null),
        commenterName: fromSelf ? null : (r.from?.name ?? null),
        likeCount: r.like_count ?? 0,
        userLikes: Boolean(r.user_likes),
      };
    });

    const rootFromPage = fbComment.from?.id === pageId;
    return {
      id: fbComment.id,
      commenterPlatformId: rootFromPage ? null : (fbComment.from?.id ?? null),
      commenterName:
        rootFromPage
          ? 'Page Response'
          : (fbComment.from?.name ?? null),
      commenterAvatar: null,
      comment: {
        externalId: fbComment.id,
        content: fbComment.message ?? '',
        time: fbComment.created_time ?? new Date().toISOString(),
        from: 'customer' as const,
        likeCount: fbComment.like_count ?? 0,
        userLikes: Boolean(fbComment.user_likes),
      },
      replies,
    };
  });

  return threads;
}

/**
 * Posts a reply to a Facebook comment from the UI, then best-effort persists
 * the reply locally. Returns a plain serializable object for the client.
 */
export async function replyToCommentAction(
  businessId: string,
  channelId: string,
  parentCommentId: string,
  content: string,
  platformPostId?: string,
  persist?: {
    commenterPlatformId: string | null;
    commenterName?: string | null;
    parentContent: string;
    parentFrom: 'customer' | 'self';
  },
) {
  await requireAuth();

  const { apiToken: pageToken, pageId } = await resolveChannel(businessId, channelId);

  // Same Graph call shape as createPostCommentAction (form-urlencoded).
  let externalReplyId: string | undefined;
  try {
    const res = await graphFetch(`${GRAPH_API}/${parentCommentId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        message: content,
        access_token: pageToken,
      }),
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    const data = (await res.json()) as { id?: string };
    externalReplyId = data.id;
  } catch (err) {
    console.error('[replyToCommentAction] Facebook reply failed:', err);
    throw new Error(
      err instanceof Error ? err.message : 'Failed to post reply to Facebook.',
    );
  }

  const replyId = externalReplyId ?? `ui_reply_${Date.now()}`;

  try {
    const commenterId =
      persist?.commenterPlatformId && persist.commenterPlatformId !== pageId
        ? persist.commenterPlatformId
        : undefined;

    await persistPageReply({
      parentCommentId,
      content,
      externalId: replyId,
      businessId,
      channelId,
      platformPostId,
      commenterPlatformId: commenterId,
      commenterName: persist?.commenterName,
      parentContent: persist?.parentContent,
      parentFrom: persist?.parentFrom,
    });
  } catch (err) {
    console.error('[replyToCommentAction] Local persist failed (FB reply OK):', err);
  }

  return {
    id: replyId,
    externalId: replyId,
    content,
    time: new Date().toISOString(),
    parentExternalId: parentCommentId,
  };
}

/**
 * Posts a top-level comment on a Facebook post from the UI.
 * Graph only — not a customer thread, so it is not written to comment history.
 */
export async function createPostCommentAction(
  businessId: string,
  channelId: string,
  platformPostId: string,
  content: string,
) {
  await requireAuth();

  const pageToken = await resolveChannelToken(businessId, channelId);
  const url = `${GRAPH_API}/${platformPostId}/comments`;
  const body = new URLSearchParams({
    message: content,
    access_token: pageToken,
  });

  let externalCommentId: string | undefined;
  try {
    const res = await graphFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }
    const data = (await res.json()) as { id?: string };
    externalCommentId = data.id;
  } catch (err) {
    console.error('[createPostCommentAction] Facebook comment failed:', err);
    throw new Error(
      err instanceof Error ? err.message : 'Failed to post comment to Facebook.',
    );
  }

  const id = externalCommentId ?? `ui_comment_${Date.now()}`;
  return {
    id,
    externalId: id,
    content,
    time: new Date().toISOString(),
  };
}

/**
 * Sets or clears a Page reaction on a Facebook comment.
 * Pass `reaction: null` to remove the current reaction.
 */
export async function reactToCommentAction(
  businessId: string,
  channelId: string,
  commentId: string,
  reaction: CommentReaction | null,
): Promise<{ reaction: CommentReaction | null }> {
  await requireAuth();

  const pageToken = await resolveChannelToken(businessId, channelId);

  try {
    if (reaction === null) {
      // Prefer reactions delete; fall back to likes delete for older like-only state.
      const reactionsRes = await graphFetch(
        `${GRAPH_API}/${commentId}/reactions?access_token=${pageToken}`,
        { method: 'DELETE' },
      );
      if (!reactionsRes.ok) {
        const likesRes = await graphFetch(
          `${GRAPH_API}/${commentId}/likes?access_token=${pageToken}`,
          { method: 'DELETE' },
        );
        if (!likesRes.ok) {
          throw new Error(await likesRes.text());
        }
      }
      return { reaction: null };
    }

    if (reaction === 'LIKE') {
      const res = await graphFetch(`${GRAPH_API}/${commentId}/likes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ access_token: pageToken }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return { reaction: 'LIKE' };
    }

    const res = await graphFetch(`${GRAPH_API}/${commentId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        type: reaction,
        access_token: pageToken,
      }),
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return { reaction };
  } catch (err) {
    console.error('[reactToCommentAction] Facebook reaction failed:', err);
    throw new Error(
      err instanceof Error ? err.message : 'Failed to update Facebook reaction.',
    );
  }
}
