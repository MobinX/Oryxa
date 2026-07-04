'use client';

import { useState, useTransition } from 'react';
import { hardDeleteBusinessAction } from '@/app/actions/business';

interface DeleteDataDialogProps {
  businessId: string;
  businessName: string;
}

export function DeleteDataDialog({ businessId, businessName }: DeleteDataDialogProps) {
  const [open, setOpen] = useState(false);
  const [inputName, setInputName] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isMatch = inputName.trim() === businessName.trim();

  const handleDelete = () => {
    if (!isMatch) {
      setError('Business name does not match. Please type it exactly.');
      return;
    }
    setError(null);
    startTransition(async () => {
      await hardDeleteBusinessAction(businessId);
    });
  };

  return (
    <>
      {/* Trigger Button */}
      <div className="rounded-2xl border-2 border-red-500/30 bg-red-50/50 dark:bg-red-950/20 p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/50 flex items-center justify-center text-2xl">
            🗑️
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-red-700 dark:text-red-400">Delete My Data for this Business</h3>
            <p className="mt-1 text-sm text-red-600/80 dark:text-red-400/80">
              Permanently delete all data associated with this business, including channels, messages, orders, products, agents, and settings. This action cannot be undone.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-red-600/70 dark:text-red-400/70">
              {['Channels & Facebook connections', 'All orders', 'All products', 'AI agents', 'Conversations & messages', 'Posts & analytics'].map((item) => (
                <span key={item} className="inline-flex items-center gap-1 bg-red-100 dark:bg-red-900/40 rounded-md px-2 py-1">
                  <span>✕</span> {item}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5">
          <button
            type="button"
            onClick={() => { setOpen(true); setInputName(''); setError(null); }}
            className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 active:bg-red-800 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete My Data
          </button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget && !isPending) setOpen(false); }}
        >
          <div className="w-full max-w-md bg-[var(--card)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl">
                  ⚠️
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Confirm permanent deletion</h2>
                  <p className="text-xs text-white/70 mt-0.5">This action cannot be undone</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-[var(--foreground)]">
                You are about to permanently delete <strong>all data</strong> for{' '}
                <span className="font-semibold text-red-600 dark:text-red-400">{businessName}</span>.
                This will delete:
              </p>

              <ul className="text-sm text-[var(--muted-foreground)] space-y-1.5 ml-4">
                {[
                  'All connected channels (Facebook pages will be unsubscribed)',
                  'All products and categories',
                  'All orders and customer data',
                  'All conversations and message history',
                  'All AI agents and their configurations',
                  'All posts and analytics data',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="text-red-500 font-bold mt-0.5">✕</span>
                    {item}
                  </li>
                ))}
              </ul>

              <div className="rounded-xl bg-red-50 border border-red-200 dark:bg-red-950/40 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300 font-medium">
                ⛔ This is irreversible. There is no way to recover this data.
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                  Type your business name to confirm:{' '}
                  <span className="font-bold text-red-600 dark:text-red-400">{businessName}</span>
                </label>
                <input
                  type="text"
                  value={inputName}
                  onChange={(e) => { setInputName(e.target.value); setError(null); }}
                  placeholder={businessName}
                  disabled={isPending}
                  className="w-full h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-60"
                />
                {error && (
                  <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between px-6 pb-5 gap-3">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setOpen(false)}
                className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!isMatch || isPending}
                onClick={handleDelete}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:pointer-events-none shadow-sm"
              >
                {isPending ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Deleting all data…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Permanently Delete All Data
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
