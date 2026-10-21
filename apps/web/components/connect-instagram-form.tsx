'use client';

import { useState, useTransition } from 'react';
import { Instagram, ShieldAlert } from 'lucide-react';
import { connectSelectedInstagramAccountsAction } from '@/app/actions/channels';
import type { InstagramPendingAccount } from '@/lib/api';

interface ConnectInstagramFormProps {
  businessId: string;
  token: string;
  accounts: InstagramPendingAccount[];
}

/** The picker: one row per Instagram professional account, grouped nowhere because there is
 *  no portfolio concept for an Instagram account — it belongs to the Page that links it. */
export function ConnectInstagramForm({ businessId, token, accounts }: ConnectInstagramFormProps) {
  const [selected, setSelected] = useState<Set<string>>(() => {
    const only = accounts.length === 1 ? accounts[0] : null;
    return only && !only.connected && !only.heldByOtherStore ? new Set([only.id]) : new Set();
  });
  const [isPending, startTransition] = useTransition();
  const [localError, setLocalError] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setLocalError(null);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (selected.size === 0) {
      setLocalError('Please select at least one Instagram account to connect.');
      return;
    }
    setLocalError(null);
    startTransition(async () => {
      const formData = new FormData();
      selected.forEach((id) => formData.append('accountIds', id));
      await connectSelectedInstagramAccountsAction(businessId, token, formData);
    });
  };

  return (
    <form onSubmit={submit}>
      {localError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {localError}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
        {accounts.length === 0 ? (
          <p className="p-4 text-sm text-[var(--muted-foreground)]">
            No Instagram professional accounts were found on this Facebook account.
          </p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {accounts.map((account) => (
              <label
                key={account.id}
                className={`flex items-start gap-3 p-4 transition-colors ${
                  account.heldByOtherStore
                    ? 'cursor-not-allowed opacity-70'
                    : 'cursor-pointer hover:bg-[var(--muted)]/40'
                } ${selected.has(account.id) ? 'bg-[var(--primary)]/5' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(account.id)}
                  onChange={() => toggle(account.id)}
                  disabled={isPending || account.heldByOtherStore}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]"
                />
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045] text-white">
                  {account.profilePic ? (
                    <img
                      src={account.profilePic}
                      alt=""
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <Instagram className="h-5 w-5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">@{account.username}</span>
                  <span className="block truncate text-xs text-[var(--muted-foreground)]">
                    {account.name ? `${account.name} · ` : ''}
                    Linked to {account.pageName}
                  </span>
                  {account.heldByOtherStore && (
                    <span className="mt-1 inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                      <ShieldAlert className="h-3 w-3" />
                      Already connected to another store — disconnect it there first
                    </span>
                  )}
                  {account.connected && (
                    <span className="mt-1 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                      <ShieldAlert className="h-3 w-3" />
                      Already connected — select to refresh the access token
                    </span>
                  )}
                </span>
                {selected.has(account.id) && (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-bold text-white">
                    ✓
                  </span>
                )}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={isPending || accounts.length === 0}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[12px] bg-primary px-5 text-sm font-medium tracking-wide text-primary-foreground shadow-sm transition-all duration-200 hover:brightness-105 active:brightness-95 disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
        >
          {isPending ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Connecting accounts…
            </>
          ) : (
            `Connect selected${selected.size > 0 ? ` (${selected.size})` : ''}`
          )}
        </button>
        <a
          href={`/b/${businessId}/channels`}
          className="inline-flex h-10 w-full items-center justify-center rounded-[12px] border border-border bg-card px-5 text-sm font-medium text-foreground transition-all hover:bg-muted sm:w-auto"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
