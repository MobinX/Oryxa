'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Facebook, Instagram, MessageCircle, Plus, ThumbsUp, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Channel, Post, PostState } from '@/lib/api';

type FeedFilter = 'all' | 'facebook' | 'instagram';

type PostFeedProps = {
  posts: Post[];
  channels: Channel[];
  businessId: string;
  filterPlatform: FeedFilter;
  onFilterPlatform: (platform: FeedFilter) => void;
  onDelete: (postId: string, e: React.MouseEvent) => void;
};

const STATE_STYLE: Record<PostState, string> = {
  published: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  draft: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
};

/**
 * Facebook puts a relative stamp on every post, and the offset from UTC is only known in the
 * browser — so the first paint stays empty and the reader's own clock fills it in afterwards.
 */
function FeedTime({ at }: { at: string }) {
  const [text, setText] = useState('');

  useEffect(() => {
    const then = new Date(at).getTime();
    const minutes = Math.round((Date.now() - then) / 60000);
    if (minutes < 1) setText('Just now');
    else if (minutes < 60) setText(`${minutes}m`);
    else if (minutes < 1440) setText(`${Math.round(minutes / 60)}h`);
    else if (minutes < 10080) setText(`${Math.round(minutes / 1440)}d`);
    else setText(new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  }, [at]);

  return <>{text}</>;
}

function PhotoGrid({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;

  if (urls.length === 1) {
    return (
      <img
        src={urls[0]}
        alt=""
        className="max-h-[420px] w-full rounded-lg border border-border/40 object-cover"
      />
    );
  }

  const shown = urls.slice(0, 4);
  const extra = urls.length - shown.length;

  return (
    <div className={cn('grid gap-1', shown.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
      {shown.map((url, i) => (
        <div key={url} className="relative aspect-square overflow-hidden rounded-lg border border-border/40">
          <img src={url} alt="" className="h-full w-full object-cover" />
          {i === shown.length - 1 && extra > 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-bold text-white">
              +{extra}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function countText(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return value.toLocaleString('en-US');
}

function FeedCard({
  post,
  businessId,
  channel,
  onDelete,
}: {
  post: Post;
  businessId: string;
  channel: Channel | null | undefined;
  onDelete: (postId: string, e: React.MouseEvent) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const photos = post.mediaUrls ?? [];
  const long = post.content.length > 280;
  const likes = countText(post.likeCount);
  const comments = countText(post.commentCount);
  const isPublished = post.postState === 'published';
  const href = `/b/${businessId}/posts/${post.id}`;

  return (
    <article className="cursor-pointer rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-all hover:border-border hover:shadow-md">
      {/* A real link, so the card opens even before this page's JavaScript is on its feet. */}
      <Link href={href} className="block">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white',
              channel?.platform === 'facebook' ? 'bg-blue-600' : 'bg-pink-600',
            )}
          >
            {channel?.platform === 'facebook' ? (
              <Facebook className="h-4.5 w-4.5" />
            ) : (
              <Instagram className="h-4.5 w-4.5" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">
              {channel?.pageName || 'Connected Page'}
            </p>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <FeedTime at={post.publishedAt ?? post.createdAt} />
              {post.scheduledAt && post.postState === 'scheduled' && (
                <>
                  <span>·</span>
                  <span>scheduled</span>
                </>
              )}
            </p>
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            STATE_STYLE[post.postState],
          )}
        >
          {post.postState}
        </span>
      </div>

      <div className="mt-3 space-y-3">
        {post.content ? (
          <>
            <p
              className={cn(
                'whitespace-pre-line text-sm leading-relaxed text-foreground/90',
                !expanded && 'line-clamp-4',
              )}
            >
              {post.content}
            </p>
            {(long || expanded) && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setExpanded((current) => !current);
                }}
                className="text-xs font-semibold text-primary hover:underline"
              >
                {expanded ? 'See less' : 'See more'}
              </button>
            )}
          </>
        ) : (
          <p className="text-sm italic text-muted-foreground">Empty post draft</p>
        )}

        <PhotoGrid urls={photos} />
      </div>

      {(likes || comments) && (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          {likes && <span>{likes} likes</span>}
          {likes && comments && <span>·</span>}
          {comments && <span>{comments} comments</span>}
        </div>
      )}
      </Link>

      <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2">
        <div className="flex items-center gap-1">
          <Link
            href={href}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            {likes ?? 'Like'}
          </Link>
          <Link
            href={href}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {comments ?? 'Comment'}
          </Link>
        </div>

        {!isPublished && (
          <button
            onClick={(e) => onDelete(post.id, e)}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            title="Delete draft"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </article>
  );
}

/** The merchant's post list drawn the way Facebook draws a page feed: one column of real posts. */
export function PostFeed({
  posts,
  channels,
  businessId,
  filterPlatform,
  onFilterPlatform,
  onDelete,
}: PostFeedProps) {
  const hasFacebook = channels.some((c) => c.platform === 'facebook');
  const hasInstagram = channels.some((c) => c.platform === 'instagram');

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-muted/10">
      <div className="shrink-0 space-y-3 border-b border-border/40 bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Page Feed
          </h2>
          <Link
            href={`/b/${businessId}/posts/new`}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:brightness-105 active:scale-[0.98]"
          >
            <Plus className="h-3.5 w-3.5" />
            New Post
          </Link>
        </div>

        {/* Dynamic Channel Filter: Only show tabs for actually connected platforms */}
        {(hasFacebook || hasInstagram) && (
          <div className="flex gap-1">
            <button
              onClick={() => onFilterPlatform('all')}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                filterPlatform === 'all'
                  ? 'bg-primary/10 font-bold text-primary'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              All
            </button>
            {hasFacebook && (
              <button
                onClick={() => onFilterPlatform('facebook')}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  filterPlatform === 'facebook'
                    ? 'bg-primary/10 font-bold text-primary'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <Facebook className="h-3 w-3" /> Facebook
              </button>
            )}
            {hasInstagram && (
              <button
                onClick={() => onFilterPlatform('instagram')}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  filterPlatform === 'instagram'
                    ? 'bg-primary/10 font-bold text-primary'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <Instagram className="h-3 w-3" /> Instagram
              </button>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl space-y-4">
          {posts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-card/50 py-12 text-center text-xs text-muted-foreground">
              Nothing on the feed yet. Click "+ New Post" to start a draft.
            </div>
          ) : (
            posts.map((post) => (
              <FeedCard
                key={post.id}
                post={post}
                businessId={businessId}
                channel={channels.find((c) => c.id === post.channelId)}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
