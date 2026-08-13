'use client';

import type {
  CommentReaction,
  LiveCommentThread,
} from '@/lib/comment-types';
import { CommentComposer } from '@/components/comments/comment-composer';
import { CommentReactionButton } from '@/components/comments/comment-reaction-button';
import { cn } from '@/lib/utils';

function formatCommentTime(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type CommentRowProps = {
  authorName: string;
  content: string;
  time: string;
  fromSelf?: boolean;
  avatarLetter: string;
  avatarUrl?: string | null;
  compact?: boolean;
  commentId: string;
  likeCount: number;
  viewerReaction: CommentReaction | null;
  reacting?: boolean;
  activeReplyToId: string | null;
  draft: string;
  submitting: boolean;
  onReplyClick: (commentId: string) => void;
  onDraftChange: (commentId: string, value: string) => void;
  onSubmitReply: (commentId: string) => void;
  onCancelReply: () => void;
  onReact: (commentId: string, reaction: CommentReaction | null) => void;
};

function CommentRow({
  authorName,
  content,
  time,
  fromSelf = false,
  avatarLetter,
  avatarUrl,
  compact = false,
  commentId,
  likeCount,
  viewerReaction,
  reacting = false,
  activeReplyToId,
  draft,
  submitting,
  onReplyClick,
  onDraftChange,
  onSubmitReply,
  onCancelReply,
  onReact,
}: CommentRowProps) {
  const isReplying = activeReplyToId === commentId;

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2.5 items-start">
        <div
          className={cn(
            'rounded-full shrink-0 flex items-center justify-center font-semibold uppercase border overflow-hidden',
            compact ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs',
            fromSelf
              ? 'bg-primary/10 text-primary border-primary/20'
              : 'bg-muted text-muted-foreground border-border',
          )}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={authorName} className="h-full w-full object-cover" />
          ) : fromSelf ? (
            '✦'
          ) : (
            avatarLetter
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className={cn(
              'rounded-2xl px-3 py-2 inline-block max-w-full',
              fromSelf ? 'bg-primary/5 dark:bg-primary/10' : 'bg-muted/40 dark:bg-muted/15',
            )}
          >
            <span className={cn('block font-bold text-foreground', compact ? 'text-[11px]' : 'text-xs')}>
              {authorName}
            </span>
            <p className="text-xs text-foreground/90 mt-0.5 leading-relaxed whitespace-pre-wrap break-words">
              {content || 'No comment content.'}
            </p>
          </div>
          <div className="mt-1 pl-1 flex items-center gap-3 text-[10px] font-semibold text-muted-foreground">
            <CommentReactionButton
              commentId={commentId}
              likeCount={likeCount}
              viewerReaction={viewerReaction}
              disabled={reacting}
              onReact={onReact}
            />
            <button
              type="button"
              className="hover:underline text-foreground/70 hover:text-foreground"
              onClick={() => onReplyClick(commentId)}
            >
              Reply
            </button>
            <span>{formatCommentTime(time)}</span>
          </div>
        </div>
      </div>

      {isReplying && (
        <div className={cn(compact ? 'pl-8' : 'pl-10')}>
          <CommentComposer
            value={draft}
            onChange={(v) => onDraftChange(commentId, v)}
            onSubmit={() => onSubmitReply(commentId)}
            onCancel={onCancelReply}
            placeholder="Write a reply as page…"
            submitting={submitting}
            autoFocus
            compact
          />
        </div>
      )}
    </div>
  );
}

type CommentItemProps = {
  thread: LiveCommentThread;
  activeReplyToId: string | null;
  drafts: Record<string, string>;
  submittingById: Record<string, boolean>;
  viewerReactions: Record<string, CommentReaction | null>;
  reactingById: Record<string, boolean>;
  onReplyClick: (commentId: string) => void;
  onDraftChange: (commentId: string, value: string) => void;
  onSubmitReply: (commentId: string, threadId: string) => void;
  onCancelReply: () => void;
  onReact: (commentId: string, reaction: CommentReaction | null) => void;
};

export function CommentItem({
  thread,
  activeReplyToId,
  drafts,
  submittingById,
  viewerReactions,
  reactingById,
  onReplyClick,
  onDraftChange,
  onSubmitReply,
  onCancelReply,
  onReact,
}: CommentItemProps) {
  const customerName = thread.commenterName || 'Facebook User';
  const avatarLetter = customerName.charAt(0);

  const topReaction =
    viewerReactions[thread.id] !== undefined
      ? viewerReactions[thread.id]
      : thread.comment.userLikes
        ? 'LIKE'
        : null;

  return (
    <div className="space-y-3 border-b border-border/20 pb-4 last:border-0 last:pb-0">
      <CommentRow
        commentId={thread.id}
        authorName={customerName}
        content={thread.comment.content}
        time={thread.comment.time}
        avatarLetter={avatarLetter}
        avatarUrl={thread.commenterAvatar}
        likeCount={thread.comment.likeCount}
        viewerReaction={topReaction}
        reacting={Boolean(reactingById[thread.id])}
        activeReplyToId={activeReplyToId}
        draft={drafts[thread.id] || ''}
        submitting={Boolean(submittingById[thread.id])}
        onReplyClick={onReplyClick}
        onDraftChange={onDraftChange}
        onSubmitReply={(id) => onSubmitReply(id, thread.id)}
        onCancelReply={onCancelReply}
        onReact={onReact}
      />

      {thread.replies.length > 0 && (
        <div className="space-y-3 pl-10 border-l border-border/30 ml-4">
          {thread.replies.map((reply) => {
            const replyReaction =
              viewerReactions[reply.id] !== undefined
                ? viewerReactions[reply.id]
                : reply.userLikes
                  ? 'LIKE'
                  : null;

            return (
              <CommentRow
                key={reply.id}
                commentId={reply.id}
                authorName={
                  reply.from === 'self' ? 'Page Response' : customerName
                }
                content={reply.content}
                time={reply.time}
                fromSelf={reply.from === 'self'}
                avatarLetter={avatarLetter}
                compact
                likeCount={reply.likeCount}
                viewerReaction={replyReaction}
                reacting={Boolean(reactingById[reply.id])}
                activeReplyToId={activeReplyToId}
                draft={drafts[reply.id] || ''}
                submitting={Boolean(submittingById[reply.id])}
                onReplyClick={onReplyClick}
                onDraftChange={onDraftChange}
                onSubmitReply={(id) => onSubmitReply(id, thread.id)}
                onCancelReply={onCancelReply}
                onReact={onReact}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
