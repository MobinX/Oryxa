import { eq, and, isNull, inArray, asc } from 'drizzle-orm';
import { db } from '@db/client';
import { commentThreads, comments } from '@db/schema';

export async function getOrCreateCommentThreadWithFlag(
  businessId: string,
  channelId: string,
  platformItemId: string,
  commenterPlatformId: string,
  commenterName?: string,
  commenterAvatar?: string,
): Promise<{ thread: typeof commentThreads.$inferSelect; created: boolean }> {
  const existing = await db.query.commentThreads.findFirst({
    where: and(
      eq(commentThreads.channelId, channelId),
      eq(commentThreads.platformItemId, platformItemId),
      eq(commentThreads.commenterPlatformId, commenterPlatformId),
      isNull(commentThreads.deletedAt),
    ),
  });

  if (existing) return { thread: existing, created: false };

  const [created] = await db
    .insert(commentThreads)
    .values({
      businessId,
      channelId,
      platformItemId,
      commenterPlatformId,
      commenterName,
      commenterAvatar,
    })
    .returning();

  return { thread: created, created: true };
}

export async function getOrCreateCommentThread(
  businessId: string,
  channelId: string,
  platformItemId: string,
  commenterPlatformId: string,
  commenterName?: string,
  commenterAvatar?: string,
) {
  return (await getOrCreateCommentThreadWithFlag(
    businessId,
    channelId,
    platformItemId,
    commenterPlatformId,
    commenterName,
    commenterAvatar,
  )).thread;
}

export async function getCommentThreadWithChannel(threadId: string) {
  return db.query.commentThreads.findFirst({
    where: and(eq(commentThreads.id, threadId), isNull(commentThreads.deletedAt)),
    with: {
      channel: {
        with: { agent: true, business: true },
      },
      business: true,
    },
  });
}

export async function updateCommentThreadState(
  threadId: string,
  state: 'pending' | 'working' | 'done',
) {
  await db
    .update(commentThreads)
    .set({ lastCommentState: state, lastStateAt: new Date() })
    .where(eq(commentThreads.id, threadId));
}

export async function createComment(data: {
  commentThreadId: string;
  from: 'self' | 'customer';
  content: string;
  contentType?: string;
  state?: 'pending' | 'working' | 'done';
  externalId?: string;
  parentExternalId?: string;
}) {
  const [comment] = await db
    .insert(comments)
    .values({
      commentThreadId: data.commentThreadId,
      from: data.from,
      content: data.content,
      contentType: data.contentType ?? 'text',
      state: data.state ?? (data.from === 'customer' ? 'pending' : 'done'),
      externalId: data.externalId,
      parentExternalId: data.parentExternalId,
    })
    .returning();
  return comment;
}

/**
 * Inbound comment → get-or-create the (channel, post, commenter) thread, insert
 * the comment idempotently on its platform comment id, and mark the thread
 * pending only if it was idle. Returns `inserted` so the webhook knows whether
 * to trigger an agent run (retries must not re-trigger).
 */
export async function processInboundComment(
  channel: { id: string; businessId: string },
  commenterPlatformId: string,
  commenterName: string | undefined,
  platformItemId: string,
  text: string,
  externalId: string,
  parentExternalId?: string,
): Promise<{ threadId: string; priorStatus: string; inserted: boolean; needsProfile: boolean }> {
  // Avatar isn't known at insert time (the webhook payload has no picture); it's
  // enriched after via setCommentThreadProfileIfMissing, so create without it.
  const { thread } = await getOrCreateCommentThreadWithFlag(
    channel.businessId,
    channel.id,
    platformItemId,
    commenterPlatformId,
    commenterName,
    undefined,
  );

  const priorStatus = thread.lastCommentState;

  const inserted = await db
    .insert(comments)
    .values({
      commentThreadId: thread.id,
      from: 'customer',
      content: text,
      state: 'pending',
      externalId,
      parentExternalId,
    })
    .onConflictDoNothing({ target: comments.externalId })
    .returning();

  if (inserted.length === 0) {
    return { threadId: thread.id, priorStatus, inserted: false, needsProfile: false };
  }

  // Mark the thread needing attention, but only if it was idle — never downgrade
  // an in-progress ('working') run.
  await db
    .update(commentThreads)
    .set({ lastCommentState: 'pending', lastStateAt: new Date() })
    .where(and(eq(commentThreads.id, thread.id), eq(commentThreads.lastCommentState, 'done')));

  // Enrich name/avatar from the platform if either is still missing (best-effort,
  // done by the webhook). Cheap to signal here; the Graph call happens once.
  const needsProfile = !thread.commenterName || !thread.commenterAvatar;

  return { threadId: thread.id, priorStatus, inserted: true, needsProfile };
}

/**
 * Fills in MISSING name/avatar on a comment thread only — each field is written
 * solely when its column is NULL, so a value already cached is never overwritten
 * by a re-fetch. Called after a best-effort Graph profile lookup.
 */
export async function setCommentThreadProfileIfMissing(
  threadId: string,
  profile: { name?: string; avatar?: string },
): Promise<void> {
  if (profile.name !== undefined) {
    await db
      .update(commentThreads)
      .set({ commenterName: profile.name })
      .where(and(eq(commentThreads.id, threadId), isNull(commentThreads.commenterName)));
  }
  if (profile.avatar !== undefined) {
    await db
      .update(commentThreads)
      .set({ commenterAvatar: profile.avatar })
      .where(and(eq(commentThreads.id, threadId), isNull(commentThreads.commenterAvatar)));
  }
}

/** Caches the post caption/attachment/permalink on the thread (fetched once). */
export async function setCommentThreadPostContext(
  threadId: string,
  postContext: string,
): Promise<void> {
  await db
    .update(commentThreads)
    .set({ postContext })
    .where(and(eq(commentThreads.id, threadId), isNull(commentThreads.postContext)));
}

/**
 * Atomically transitions a comment thread from idle ('done' or 'pending') to
 * 'working'. The single race-free gate that prevents duplicate comment runs when
 * overlapping webhooks or the tail re-trigger fire at the same time. Different
 * threads (different commenters) are independent → parallel.
 */
export async function claimCommentThreadForRun(threadId: string): Promise<boolean> {
  const claimed = await db
    .update(commentThreads)
    .set({ lastCommentState: 'working', lastStateAt: new Date() })
    .where(
      and(
        eq(commentThreads.id, threadId),
        inArray(commentThreads.lastCommentState, ['done', 'pending']),
      ),
    )
    .returning({ id: commentThreads.id });
  return claimed.length > 0;
}

/**
 * Atomically resets a comment thread that has been stuck in `working` or
 * `pending` for longer than the stale threshold back to `pending`, so that
 * the webhook can kick off a fresh comment agent run. Returns the thread id
 * when the reset happened (this caller owns recovery), or null otherwise.
 */
export async function resetStaleCommentThread(
  threadId: string,
): Promise<string | null> {
  const reset = await db
    .update(commentThreads)
    .set({ lastCommentState: 'pending', lastStateAt: new Date() })
    .where(
      and(
        eq(commentThreads.id, threadId),
        inArray(commentThreads.lastCommentState, ['working', 'pending']),
      ),
    )
    .returning({ id: commentThreads.id });
  return reset.length > 0 ? reset[0].id : null;
}

/** The single oldest pending customer comment in a thread (the head of that user's queue). */
export async function getOldestPendingComment(threadId: string) {
  return db.query.comments.findFirst({
    where: and(
      eq(comments.commentThreadId, threadId),
      eq(comments.from, 'customer'),
      eq(comments.state, 'pending'),
      isNull(comments.deletedAt),
    ),
    orderBy: [asc(comments.time)],
  });
}

/** Whether any customer comment in the thread is still pending (drives the tail re-trigger). */
export async function checkPendingComments(threadId: string): Promise<boolean> {
  const pending = await db.query.comments.findFirst({
    where: and(
      eq(comments.commentThreadId, threadId),
      eq(comments.from, 'customer'),
      eq(comments.state, 'pending'),
      isNull(comments.deletedAt),
    ),
  });
  return !!pending;
}

/**
 * Already-handled comments in a thread (both the commenter's prior comments and
 * the bot's replies), oldest first. This is the clean back-and-forth history the
 * agent sees when processing the next pending comment — newer pending comments
 * are excluded so history stays clean.
 */
export async function listDoneCommentHistory(threadId: string) {
  return db.query.comments.findMany({
    where: and(
      eq(comments.commentThreadId, threadId),
      eq(comments.state, 'done'),
      isNull(comments.deletedAt),
    ),
    orderBy: [asc(comments.time)],
  });
}

export async function markCommentDone(commentId: string): Promise<void> {
  await db
    .update(comments)
    .set({ state: 'done' })
    .where(eq(comments.id, commentId));
}

export async function findCommentByExternalId(externalId: string) {
  return db.query.comments.findFirst({
    where: and(eq(comments.externalId, externalId), isNull(comments.deletedAt)),
  });
}

/**
 * Persist a page/admin reply onto the *customer* thread that owns `parentCommentId`.
 * Never creates a ghost thread keyed by the Facebook comment id (that poisons
 * agent history and leaves the real thread's customer comment pending forever).
 *
 * If the parent was never ingested (live Graph comment, no webhook yet), seeds
 * the real (channel, post, commenter) thread with the parent already `done`
 * and attaches this reply. Requires the commenter's Facebook user id — not the
 * comment id, and not the page id.
 *
 * Marks the parent customer comment done so the agent will not also reply to it.
 */
export async function persistPageReply(opts: {
  parentCommentId: string;
  content: string;
  externalId: string;
  businessId?: string;
  channelId?: string;
  platformPostId?: string;
  commenterPlatformId?: string;
  commenterName?: string | null;
  parentContent?: string;
  parentFrom?: 'customer' | 'self';
}): Promise<{ threadId: string } | null> {
  let parent = await findCommentByExternalId(opts.parentCommentId);
  let threadId = parent?.commentThreadId;

  if (!threadId) {
    const commenterId = opts.commenterPlatformId?.trim();
    // Comment id as commenter id is the old ghost-thread bug. Skip seeding.
    const canSeed =
      !!commenterId &&
      commenterId !== opts.parentCommentId &&
      !!opts.businessId &&
      !!opts.channelId &&
      !!opts.platformPostId;

    if (!canSeed) return null;

    const thread = await getOrCreateCommentThread(
      opts.businessId!,
      opts.channelId!,
      opts.platformPostId!,
      commenterId,
      opts.commenterName ?? undefined,
    );
    threadId = thread.id;

    await db
      .insert(comments)
      .values({
        commentThreadId: threadId,
        from: opts.parentFrom ?? 'customer',
        content: opts.parentContent ?? '',
        state: 'done',
        externalId: opts.parentCommentId,
      })
      .onConflictDoNothing({ target: comments.externalId });

    parent = await findCommentByExternalId(opts.parentCommentId);
    threadId = parent?.commentThreadId ?? threadId;
  }

  await db
    .insert(comments)
    .values({
      commentThreadId: threadId,
      from: 'self',
      content: opts.content,
      state: 'done',
      externalId: opts.externalId,
      parentExternalId: opts.parentCommentId,
    })
    .onConflictDoNothing({ target: comments.externalId });

  if (parent?.from === 'customer' && parent.state !== 'done') {
    await markCommentDone(parent.id);
  }

  const hasPending = await checkPendingComments(threadId);
  if (!hasPending) {
    await updateCommentThreadState(threadId, 'done');
  }

  return { threadId };
}

export async function listComments(threadId: string) {
  return db.query.comments.findMany({
    where: and(eq(comments.commentThreadId, threadId), isNull(comments.deletedAt)),
    orderBy: [asc(comments.time)],
  });
}
