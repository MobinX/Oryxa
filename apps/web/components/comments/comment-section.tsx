'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createPostCommentAction,
  getPostCommentsAction,
  reactToCommentAction,
  replyToCommentAction,
} from '@/app/actions/comments';
import type { CommentReaction, LiveCommentThread } from '@/lib/comment-types';
import { CommentComposer } from '@/components/comments/comment-composer';
import { CommentItem } from '@/components/comments/comment-item';
import { Facebook, Loader2 } from 'lucide-react';

type CommentSectionProps = {
  businessId: string;
  channelId: string;
  platformPostId: string;
  onCommentCountChange?: (count: number) => void;
};

const REFRESH_EVERY_SEC = 15;

function persistContextForReply(thread: LiveCommentThread, parentCommentId: string) {
  if (parentCommentId === thread.id) {
    return {
      commenterPlatformId: thread.commenterPlatformId,
      commenterName: thread.commenterName,
      parentContent: thread.comment.content,
      parentFrom: 'customer' as const,
    };
  }

  const reply = thread.replies.find((r) => r.id === parentCommentId);
  if (!reply || reply.from === 'self') {
    return {
      commenterPlatformId: thread.commenterPlatformId,
      commenterName: thread.commenterName,
      parentContent: reply?.content ?? thread.comment.content,
      parentFrom: reply?.from === 'self' ? ('self' as const) : ('customer' as const),
    };
  }

  return {
    commenterPlatformId: reply.commenterPlatformId || thread.commenterPlatformId,
    commenterName: reply.commenterName || thread.commenterName,
    parentContent: reply.content,
    parentFrom: 'customer' as const,
  };
}

function mergeCommentThreads(
  fetched: LiveCommentThread[],
  previous: LiveCommentThread[],
): LiveCommentThread[] {
  const fetchedIds = new Set<string>();
  for (const t of fetched) {
    fetchedIds.add(t.id);
    for (const r of t.replies) fetchedIds.add(r.id);
  }

  const fetchedById = new Map(fetched.map((t) => [t.id, t]));
  const merged = fetched.map((t) => {
    const prev = previous.find((p) => p.id === t.id);
    if (!prev) return t;
    const extra = prev.replies.filter(
      (r) =>
        !fetchedIds.has(r.id) &&
        !t.replies.some(
          (x) => x.content === r.content && x.from === r.from,
        ),
    );
    if (extra.length === 0) return t;
    return { ...t, replies: [...t.replies, ...extra] };
  });

  for (const prev of previous) {
    if (fetchedById.has(prev.id)) continue;
    // Keep optimistic top-level comments Graph has not indexed yet
    merged.unshift(prev);
  }

  return merged;
}

function patchCommentReaction(
  threads: LiveCommentThread[],
  commentId: string,
  nextReaction: CommentReaction | null,
  prevReaction: CommentReaction | null,
): LiveCommentThread[] {
  const wasLiked = prevReaction !== null;
  const willLike = nextReaction !== null;
  const delta = wasLiked === willLike ? 0 : willLike ? 1 : -1;

  return threads.map((t) => {
    if (t.id === commentId) {
      return {
        ...t,
        comment: {
          ...t.comment,
          likeCount: Math.max(0, t.comment.likeCount + delta),
          userLikes: willLike,
        },
      };
    }

    return {
      ...t,
      replies: t.replies.map((r) =>
        r.id === commentId
          ? {
              ...r,
              likeCount: Math.max(0, r.likeCount + delta),
              userLikes: willLike,
            }
          : r,
      ),
    };
  });
}

export function CommentSection({
  businessId,
  channelId,
  platformPostId,
  onCommentCountChange,
}: CommentSectionProps) {
  const [threads, setThreads] = useState<LiveCommentThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeReplyToId, setActiveReplyToId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [submittingById, setSubmittingById] = useState<Record<string, boolean>>({});
  const [topLevelDraft, setTopLevelDraft] = useState('');
  const [submittingTopLevel, setSubmittingTopLevel] = useState(false);
  const [viewerReactions, setViewerReactions] = useState<
    Record<string, CommentReaction | null>
  >({});
  const [reactingById, setReactingById] = useState<Record<string, boolean>>({});

  const seedReactionsFromThreads = useCallback((data: LiveCommentThread[]) => {
    setViewerReactions((prev) => {
      const next = { ...prev };
      for (const t of data) {
        if (!t.comment.userLikes) {
          next[t.id] = null;
        } else if (!next[t.id]) {
          // Graph only exposes boolean likes — keep richer local reaction if set
          next[t.id] = 'LIKE';
        }
        for (const r of t.replies) {
          if (!r.userLikes) {
            next[r.id] = null;
          } else if (!next[r.id]) {
            next[r.id] = 'LIKE';
          }
        }
      }
      return next;
    });
  }, []);

  const refetch = useCallback(async () => {
    try {
      const data = await getPostCommentsAction(businessId, channelId, platformPostId);
      setThreads((prev) => mergeCommentThreads(data, prev));
      seedReactionsFromThreads(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load comments:', err);
      setError(err instanceof Error ? err.message : 'Failed to load comments.');
    }
  }, [businessId, channelId, platformPostId, seedReactionsFromThreads]);

  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  const [secondsLeft, setSecondsLeft] = useState(REFRESH_EVERY_SEC);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (loading) return;

    let seconds = REFRESH_EVERY_SEC;
    setSecondsLeft(seconds);
    let cancelled = false;

    const id = window.setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        seconds = REFRESH_EVERY_SEC;
        setSecondsLeft(seconds);
        void (async () => {
          if (cancelled) return;
          setRefreshing(true);
          await refetchRef.current();
          if (!cancelled) setRefreshing(false);
        })();
        return;
      }
      setSecondsLeft(seconds);
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [loading, businessId, channelId, platformPostId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getPostCommentsAction(businessId, channelId, platformPostId);
        if (!cancelled) {
          setThreads(data);
          seedReactionsFromThreads(data);
        }
      } catch (err) {
        console.error('Failed to load comments:', err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load comments.');
          setThreads([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [businessId, channelId, platformPostId, seedReactionsFromThreads]);

  function handleDraftChange(commentId: string, value: string) {
    setDrafts((prev) => ({ ...prev, [commentId]: value }));
  }

  function handleReplyClick(commentId: string) {
    setActiveReplyToId((prev) => (prev === commentId ? null : commentId));
  }

  function handleCancelReply() {
    setActiveReplyToId(null);
  }

  async function handleSubmitReply(parentCommentId: string, threadId: string) {
    const text = drafts[parentCommentId]?.trim();
    if (!text) return;

    const liveThread = threads.find((t) => t.id === threadId);
    const persist = liveThread
      ? persistContextForReply(liveThread, parentCommentId)
      : undefined;

    setSubmittingById((prev) => ({ ...prev, [parentCommentId]: true }));
    setError(null);

    try {
      const created = await replyToCommentAction(
        businessId,
        channelId,
        parentCommentId,
        text,
        platformPostId,
        persist,
      );

      // Optimistic: FB flattens nested replies under the top-level thread
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                replies: [
                  ...t.replies,
                  {
                    id: created.id,
                    externalId: created.externalId,
                    content: created.content,
                    time: created.time,
                    from: 'self' as const,
                    commenterPlatformId: null,
                    commenterName: null,
                    likeCount: 0,
                    userLikes: false,
                  },
                ],
              }
            : t,
        ),
      );

      setDrafts((prev) => ({ ...prev, [parentCommentId]: '' }));
      setActiveReplyToId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post reply.');
    } finally {
      setSubmittingById((prev) => ({ ...prev, [parentCommentId]: false }));
    }
  }

  async function handleTopLevelComment() {
    const text = topLevelDraft.trim();
    if (!text) return;

    setSubmittingTopLevel(true);
    setError(null);

    try {
      const created = await createPostCommentAction(
        businessId,
        channelId,
        platformPostId,
        text,
      );

      setThreads((prev) => [
        {
          id: created.id,
          commenterPlatformId: null,
          commenterName: 'Page Response',
          commenterAvatar: null,
          comment: {
            externalId: created.externalId,
            content: created.content,
            time: created.time,
            from: 'customer',
            likeCount: 0,
            userLikes: false,
          },
          replies: [],
        },
        ...prev,
      ]);

      setTopLevelDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post comment.');
    } finally {
      setSubmittingTopLevel(false);
    }
  }

  async function handleReact(
    commentId: string,
    reaction: CommentReaction | null,
  ) {
    const prevReaction = viewerReactions[commentId] ?? null;
    if (prevReaction === reaction) return;

    setReactingById((prev) => ({ ...prev, [commentId]: true }));
    setError(null);

    // Optimistic update
    setViewerReactions((prev) => ({ ...prev, [commentId]: reaction }));
    setThreads((prev) =>
      patchCommentReaction(prev, commentId, reaction, prevReaction),
    );

    try {
      await reactToCommentAction(businessId, channelId, commentId, reaction);
    } catch (err) {
      // Roll back
      setViewerReactions((prev) => ({ ...prev, [commentId]: prevReaction }));
      setThreads((prev) =>
        patchCommentReaction(prev, commentId, prevReaction, reaction),
      );
      setError(err instanceof Error ? err.message : 'Failed to update reaction.');
    } finally {
      setReactingById((prev) => ({ ...prev, [commentId]: false }));
    }
  }

  const commentCount =
    threads.reduce((sum, t) => sum + 1 + t.replies.length, 0);

  useEffect(() => {
    if (loading) return;
    onCommentCountChange?.(commentCount);
  }, [commentCount, loading, onCommentCountChange]);

  return (
    <div className="bg-card border border-border/80 rounded-2xl p-5 shrink-0 space-y-4">
      <div className="flex items-center justify-between border-b border-border/40 pb-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Facebook className="h-4 w-4 text-blue-600" />
          Comments
          {!loading && (
            <span className="normal-case font-semibold text-foreground/70">
              ({commentCount})
            </span>
          )}
        </h4>
        {!loading && (
          <span className="text-[10px] font-medium text-muted-foreground inline-flex items-center gap-1">
            {refreshing ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Refreshing comments…
              </>
            ) : (
              `Refreshing comments in ${secondsLeft}s`
            )}
          </span>
        )}
      </div>

      <CommentComposer
        value={topLevelDraft}
        onChange={setTopLevelDraft}
        onSubmit={handleTopLevelComment}
        placeholder="Write a comment…"
        submitting={submittingTopLevel}
      />

      {error && (
        <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {loading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : threads.length === 0 ? (
        <p className="text-xs text-muted-foreground italic text-center py-4">
          No comments on this post yet.
        </p>
      ) : (
        <div className="space-y-4">
          {threads.map((thread) => (
            <CommentItem
              key={thread.id}
              thread={thread}
              activeReplyToId={activeReplyToId}
              drafts={drafts}
              submittingById={submittingById}
              viewerReactions={viewerReactions}
              reactingById={reactingById}
              onReplyClick={handleReplyClick}
              onDraftChange={handleDraftChange}
              onSubmitReply={handleSubmitReply}
              onCancelReply={handleCancelReply}
              onReact={handleReact}
            />
          ))}
        </div>
      )}
    </div>
  );
}
