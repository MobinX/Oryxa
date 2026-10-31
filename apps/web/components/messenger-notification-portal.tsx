'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, MessageCircle, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Follower = { id: string; name: string | null; connectedAt: string };
type Overview = { code: string | null; users: Follower[] };

/**
 * The merchant's Messenger door: a code created on demand, sent as a DM to the operator's page.
 * Once redeemed, every business notice also arrives in that Messenger account — and several
 * accounts can follow the same business.
 */
export function MessengerNotificationPortal({ businessId }: { businessId: string }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/messenger-notifications?businessId=${encodeURIComponent(businessId)}`,
      );
      const data = (await res.json().catch(() => null)) as Overview | { error?: string } | null;
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? `Failed to load (${res.status})`);
      setOverview(data as Overview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the Messenger status.');
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const createCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/messenger-notifications?businessId=${encodeURIComponent(businessId)}`,
        { method: 'POST' },
      );
      const data = (await res.json().catch(() => null)) as { code?: string; error?: string } | null;
      if (!res.ok || !data?.code) {
        throw new Error(data?.error ?? `Could not create the code (${res.status})`);
      }
      setOverview((prev) => ({ users: prev?.users ?? [], code: data.code! }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the notification code.');
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!overview?.code) return;
    try {
      await navigator.clipboard.writeText(overview.code);
    } catch {
      // Older browsers: the code is on screen to select by hand.
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const removeFollower = async (user: Follower) => {
    if (
      !window.confirm(
        `Remove ${user.name ?? 'this Messenger account'} from notifications? It can be connected again with the code.`,
      )
    ) {
      return;
    }
    setRemovingId(user.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/messenger-notifications?businessId=${encodeURIComponent(businessId)}&userId=${encodeURIComponent(user.id)}`,
        { method: 'DELETE' },
      );
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? `Could not remove it (${res.status})`);
      setOverview((prev) =>
        prev ? { ...prev, users: prev.users.filter((follower) => follower.id !== user.id) } : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that account.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MessageCircle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Messenger notifications</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Get every order and allowance notice in your Messenger too. Create your code, send it as
            a message to our Facebook page, and this business is linked to that account. Repeat with
            another account if more than one person should hear about it. Once connected, send{' '}
            <strong className="font-semibold text-foreground">ON</strong> or{' '}
            <strong className="font-semibold text-foreground">OFF</strong> to that chat to start or
            stop the AI agent for this business.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => void load()} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {overview?.code ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm">
              {overview.code}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={copyCode}>
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? 'Copied' : 'Copy code'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Send this code in a message to our Facebook page. From then on notices arrive in
            Messenger, and sending <strong className="font-semibold text-foreground">ON</strong> or{' '}
            <strong className="font-semibold text-foreground">OFF</strong> here starts or stops the
            AI agent for this business.
          </p>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Connected accounts
            </p>
            {overview.users.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                None yet — send the code to connect one.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border/60 rounded-lg border border-border">
                {overview.users.map((user) => (
                  <li key={user.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {user.name ?? 'Messenger account'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Connected{' '}
                        {new Date(user.connectedAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-red-600 hover:text-red-700"
                      disabled={removingId === user.id}
                      onClick={() => void removeFollower(user)}
                      title="Remove this account"
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      {removingId === user.id ? 'Removing…' : 'Remove'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <Button type="button" onClick={createCode} disabled={busy || overview === null}>
          {busy ? 'Creating…' : 'Connect my Messenger'}
        </Button>
      )}
    </Card>
  );
}
