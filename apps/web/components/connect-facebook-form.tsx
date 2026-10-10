'use client';

import { useState, useTransition } from 'react';
import { connectSelectedFacebookPagesAction } from '@/app/actions/channels';

interface ConnectFacebookFormProps {
  businessId: string;
  token: string;
  pages: Array<{ id: string; name: string; connected: boolean; heldByOtherStore?: boolean; business?: string | null }>;
}

export function ConnectFacebookForm({ businessId, token, pages }: ConnectFacebookFormProps) {
  const [selected, setSelected] = useState<Set<string>>(() => {
    // Pre-select the only page if there's just one and it's connectable here
    if (pages.length === 1 && !pages[0].connected && !pages[0].heldByOtherStore) return new Set([pages[0].id]);
    return new Set();
  });
  const [isPending, startTransition] = useTransition();
  const [localError, setLocalError] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setLocalError(null);
  };

  // A Page a person administers themselves and a Page they only reach through a business
  // portfolio are different kinds of access, and a merchant recognises the second one by
  // the portfolio name rather than by the flat list it used to be buried in.
  const sections: Array<{ label: string | null; pages: typeof pages }> = [];
  const personal = pages.filter((page) => !page.business);
  if (personal.length > 0) sections.push({ label: null, pages: personal });
  for (const page of pages.filter((p) => p.business)) {
    const section = sections.find((s) => s.label === page.business);
    if (section) section.pages.push(page);
    else sections.push({ label: page.business!, pages: [page] });
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selected.size === 0) {
      setLocalError('Please select at least one page to connect.');
      return;
    }
    setLocalError(null);
    startTransition(async () => {
      const fd = new FormData();
      selected.forEach((id) => fd.append('pageIds', id));
      await connectSelectedFacebookPagesAction(businessId, token, fd);
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      {localError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {localError}
        </div>
      )}

      <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
        {pages.length === 0 ? (
          <p className="p-4 text-sm text-[var(--muted-foreground)]">No Facebook pages found on this account.</p>
        ) : (
          sections.map((section) => (
            <div key={section.label ?? 'personal-pages'} className="divide-y divide-[var(--border)]">
              {section.label && (
                <p className="bg-[var(--muted)]/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Meta Business Portfolio · {section.label}
                </p>
              )}
              {section.pages.map((page) => (
                <label
                  key={page.id}
                  className={`flex items-start gap-3 p-4 transition-colors ${
                    page.heldByOtherStore
                      ? 'cursor-not-allowed opacity-70'
                      : 'cursor-pointer hover:bg-[var(--muted)]/40'
                  } ${
                    selected.has(page.id) ? 'bg-[var(--primary)]/5' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(page.id)}
                    onChange={() => toggle(page.id)}
                    disabled={isPending || page.heldByOtherStore}
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{page.name}</span>
                    <span className="block truncate text-xs text-[var(--muted-foreground)]">
                      Page ID: {page.id}
                    </span>
                    {page.heldByOtherStore && (
                      <span className="mt-1 inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.257 7.586a1 1 0 111.414-1.414L10 7.086l.329-.914a1 1 0 111.886.678L11.414 8.5l.914.329a1 1 0 01-.678 1.886L10 10.414l-.329.914a1 1 0 11-1.886-.678l.914-.329-.914-.914z" clipRule="evenodd" />
                        </svg>
                        Already connected to another store — disconnect it there first
                      </span>
                    )}
                    {page.connected && (
                      <span className="mt-1 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        Already connected — select to refresh token
                      </span>
                    )}
                  </span>
                  {selected.has(page.id) && (
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-xs font-bold">✓</span>
                  )}
                </label>
              ))}
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={isPending || pages.length === 0}
          className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-[12px] text-sm font-medium tracking-wide bg-primary text-primary-foreground shadow-sm hover:brightness-105 active:brightness-95 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none w-full sm:w-auto"
        >
          {isPending ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Connecting pages…
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

      {pages.filter(p => p.connected).length > 0 && pages.filter(p => !p.connected).length > 0 && (
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
          Some pages are already linked to this business. Select them again to refresh their Facebook access token.
        </p>
      )}
    </form>
  );
}
