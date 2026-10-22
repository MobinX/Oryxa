'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { listAdminAiComments } from '@/lib/api';

type CommentRow = {
  id: string;
  platform: string;
  platformItemId: string;
  commenterName: string | null;
  lastCommentState: string;
  createdAt: string;
  latest: { id: string; from: string; content: string; time: string } | null;
};

/**
 * Comments overview (spec F): every comment thread on this business's channels with the
 * last comment and its state, so an operator can see what the AI answered where and when.
 */
export function CommentsOverview({ bearer, businessId }: { bearer: string; businessId: string }) {
  const [rows, setRows] = useState<CommentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows((await listAdminAiComments(bearer, businessId)).comments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Comments</h2>
          <p className="text-sm text-muted-foreground">
            Post and Reel comment threads across this business&apos;s channels — public replies,
            private replies and flags, newest first.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Load comments'}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {rows && (rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comment threads yet.</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {rows.map((thread) => (
            <li key={thread.id} className="py-3 text-sm">
              <p className="font-medium">
                {thread.commenterName ?? 'unknown commenter'}{' '}
                <span className="text-muted-foreground">
                  · {thread.platform} · {thread.lastCommentState} · {new Date(thread.createdAt).toLocaleString()}
                </span>
              </p>
              {thread.latest && (
                <p className="mt-1 whitespace-pre-line text-muted-foreground">
                  {thread.latest.from}: {thread.latest.content}
                </p>
              )}
            </li>
          ))}
        </ul>
      ))}
    </Card>
  );
}
