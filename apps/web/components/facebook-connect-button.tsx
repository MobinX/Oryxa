'use client';

import { useState, useTransition } from 'react';
import { connectFacebookAction } from '@/app/actions/channels';

interface FacebookConnectButtonProps {
  businessId: string;
}

type Step = 'closed' | 'consent' | 'data-deletion';

export function FacebookConnectButton({ businessId }: FacebookConnectButtonProps) {
  const [step, setStep] = useState<Step>('closed');
  const [isPending, startTransition] = useTransition();

  const handleConnect = () => {
    startTransition(async () => {
      await connectFacebookAction(businessId);
    });
  };

  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={() => setStep('consent')}
        className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-[12px] text-sm font-medium tracking-wide bg-primary text-primary-foreground shadow-sm hover:brightness-105 active:brightness-95 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none w-full sm:w-auto"
      >
        {isPending ? (
          <>
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Connecting…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            Connect Facebook
          </>
        )}
      </button>

      {/* Backdrop */}
      {step !== 'closed' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setStep('closed'); }}
        >
          {/* Step 1: Consent */}
          {step === 'consent' && (
            <div className="relative w-full max-w-lg bg-[var(--card)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Connect Facebook Page</h2>
                    <p className="text-xs text-white/70 mt-0.5">Permissions we&apos;ll request</p>
                  </div>
                </div>
              </div>

              <div className="px-6 py-5 space-y-4">
                <p className="text-sm text-[var(--muted-foreground)]">
                  To enable AI-powered customer support and automated replies on your Facebook Page, Oryxa will request the following permissions:
                </p>

                <div className="space-y-3">
                  {[
                    {
                      icon: '💬',
                      permission: 'Manage and reply to messages',
                      why: 'So our AI agent can read customer questions and send replies on your behalf.',
                    },
                    {
                      icon: '📋',
                      permission: 'View your Pages list',
                      why: 'To let you choose which Facebook Page to connect to Oryxa.',
                    },
                    {
                      icon: '🔔',
                      permission: 'Page metadata & webhooks',
                      why: 'To receive real-time notifications when customers message your Page.',
                    },
                    {
                      icon: '💡',
                      permission: 'Read page engagement & posts',
                      why: 'To understand post context when customers comment, so the AI can respond accurately.',
                    },
                    {
                      icon: '✍️',
                      permission: 'Reply to comments & create posts',
                      why: 'To let the AI respond to comments on your Page posts.',
                    },
                  ].map(({ icon, permission, why }) => (
                    <div key={permission} className="flex gap-3 rounded-xl bg-[var(--muted)]/50 p-3">
                      <span className="text-xl flex-shrink-0 mt-0.5">{icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-[var(--foreground)]">{permission}</p>
                        <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{why}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-900 px-4 py-3 text-xs text-blue-700 dark:text-blue-300">
                  🔒 <strong>Your data is private.</strong> We never post anything without your agent configuration and never share your data with third parties.
                </div>
              </div>

              <div className="flex items-center justify-between px-6 pb-5 gap-3">
                <button
                  type="button"
                  onClick={() => setStep('closed')}
                  className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setStep('data-deletion')}
                  className="inline-flex items-center gap-2 h-10 px-5 rounded-[12px] text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  Next
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Data Deletion Info */}
          {step === 'data-deletion' && (
            <div className="relative w-full max-w-lg bg-[var(--card)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden">
              <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl">
                    🗑️
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">How to delete your data</h2>
                    <p className="text-xs text-white/70 mt-0.5">Your data rights explained</p>
                  </div>
                </div>
              </div>

              <div className="px-6 py-5 space-y-4">
                <p className="text-sm text-[var(--muted-foreground)]">
                  You can request complete deletion of all your business data from Oryxa at any time. Here's how:
                </p>

                <div className="space-y-3">
                  {[
                    { step: '1', text: 'Go to your Business Settings page from the left sidebar.' },
                    { step: '2', text: 'Scroll to the bottom and find the "Delete My Data for this Business" section.' },
                    { step: '3', text: 'Click the red "Delete My Data" button.' },
                    { step: '4', text: 'Type your business name to confirm — this prevents accidental deletion.' },
                    { step: '5', text: 'All channels, messages, orders, products, and settings for this business will be permanently deleted.' },
                  ].map(({ step: s, text }) => (
                    <div key={s} className="flex gap-3 items-start">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--primary)] text-white text-xs font-bold flex items-center justify-center">
                        {s}
                      </span>
                      <p className="text-sm text-[var(--foreground)]">{text}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
                  ⚠️ <strong>Data deletion is permanent and irreversible.</strong> Connected Facebook Pages will be automatically unsubscribed from our app.
                </div>

                <p className="text-xs text-[var(--muted-foreground)]">
                  You can also remove Oryxa from your Facebook Page directly in your{' '}
                  <a
                    href="https://www.facebook.com/settings/?tab=business_tools"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-[var(--foreground)]"
                  >
                    Facebook Business Integrations settings
                  </a>.
                </p>
              </div>

              <div className="flex items-center justify-between px-6 pb-5 gap-3">
                <button
                  type="button"
                  onClick={() => setStep('consent')}
                  className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleConnect}
                  className="inline-flex items-center gap-2 h-10 px-5 rounded-[12px] text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isPending ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Connecting…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                      Accept & Connect Facebook
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
