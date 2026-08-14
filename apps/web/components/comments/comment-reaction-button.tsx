'use client';

import type { CommentReaction } from '@/lib/comment-types';
import { cn } from '@/lib/utils';

export const REACTION_META: Record<
  CommentReaction,
  { emoji: string; label: string; color: string }
> = {
  LIKE: { emoji: '👍', label: 'Like', color: 'text-blue-600' },
};

type CommentReactionButtonProps = {
  commentId: string;
  likeCount: number;
  viewerReaction: CommentReaction | null;
  disabled?: boolean;
  onReact: (commentId: string, reaction: CommentReaction | null) => void;
};

export function CommentReactionButton({
  commentId,
  likeCount,
  viewerReaction,
  disabled = false,
  onReact,
}: CommentReactionButtonProps) {
  const meta = viewerReaction ? REACTION_META[viewerReaction] : null;

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={disabled}
        className={cn(
          'hover:underline disabled:opacity-50',
          meta ? meta.color : 'text-foreground/70 hover:text-foreground',
        )}
        onClick={() => {
          onReact(commentId, viewerReaction ? null : 'LIKE');
        }}
      >
        {meta ? (
          <span className="inline-flex items-center gap-1">
            <span aria-hidden>{meta.emoji}</span>
            {meta.label}
          </span>
        ) : (
          'Like'
        )}
      </button>

      {likeCount > 0 && (
        <span className="inline-flex items-center gap-0.5 text-muted-foreground font-medium tabular-nums">
          {viewerReaction && (
            <span aria-hidden className="text-[11px]">
              {REACTION_META[viewerReaction].emoji}
            </span>
          )}
          {likeCount}
        </span>
      )}
    </div>
  );
}
