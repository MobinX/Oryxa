'use client';

import { useEffect, useRef, useState } from 'react';
import {
  COMMENT_REACTIONS,
  type CommentReaction,
} from '@/lib/comment-types';
import { cn } from '@/lib/utils';

export const REACTION_META: Record<
  CommentReaction,
  { emoji: string; label: string; color: string }
> = {
  LIKE: { emoji: '👍', label: 'Like', color: 'text-blue-600' },
  LOVE: { emoji: '❤️', label: 'Love', color: 'text-rose-600' },
  CARE: { emoji: '🤗', label: 'Care', color: 'text-amber-600' },
  HAHA: { emoji: '😆', label: 'Haha', color: 'text-amber-500' },
  WOW: { emoji: '😮', label: 'Wow', color: 'text-amber-500' },
  SAD: { emoji: '😢', label: 'Sad', color: 'text-amber-500' },
  ANGRY: { emoji: '😡', label: 'Angry', color: 'text-orange-600' },
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function clearHoverTimer() {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }

  function handleMouseEnter() {
    clearHoverTimer();
    hoverTimer.current = setTimeout(() => setOpen(true), 350);
  }

  function handleMouseLeave() {
    clearHoverTimer();
    hoverTimer.current = setTimeout(() => setOpen(false), 200);
  }

  const meta = viewerReaction ? REACTION_META[viewerReaction] : null;

  return (
    <div
      ref={rootRef}
      className="relative inline-flex items-center gap-1.5"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {open && (
        <div
          className="absolute bottom-full left-0 mb-1.5 z-20 flex items-center gap-0.5 rounded-full border border-border/60 bg-card px-1.5 py-1 shadow-lg"
          role="listbox"
          aria-label="Choose a reaction"
        >
          {COMMENT_REACTIONS.map((reaction) => {
            const r = REACTION_META[reaction];
            return (
              <button
                key={reaction}
                type="button"
                role="option"
                aria-label={r.label}
                disabled={disabled}
                title={r.label}
                className={cn(
                  'h-8 w-8 rounded-full text-base leading-none transition-transform hover:scale-125 disabled:opacity-50',
                  viewerReaction === reaction && 'bg-muted scale-110',
                )}
                onClick={() => {
                  onReact(
                    commentId,
                    viewerReaction === reaction ? null : reaction,
                  );
                  setOpen(false);
                }}
              >
                <span aria-hidden>{r.emoji}</span>
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        disabled={disabled}
        className={cn(
          'hover:underline disabled:opacity-50',
          meta ? meta.color : 'text-foreground/70 hover:text-foreground',
        )}
        onClick={() => {
          // Quick click: toggle LIKE, or clear current reaction
          if (viewerReaction) {
            onReact(commentId, null);
          } else {
            onReact(commentId, 'LIKE');
          }
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
