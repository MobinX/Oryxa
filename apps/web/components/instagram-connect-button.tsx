'use client';

import { useState, useTransition } from 'react';
import { Instagram, Lock, MessageCircle, MessageSquare, ShieldCheck } from 'lucide-react';
import { connectInstagramAction } from '@/app/actions/channels';
import { COMPANY_NAME } from '@/lib/brand';

const PERMISSIONS = [
  {
    icon: MessageCircle,
    permission: 'Read and reply to Instagram Direct messages',
    why: 'So the agent can answer customer DMs with your products, orders and delivery details.',
  },
  {
    icon: MessageSquare,
    permission: 'Read and reply to comments',
    why: 'So the agent can answer public comments and move price or stock questions into Direct.',
  },
  {
    icon: ShieldCheck,
    permission: 'See the linked Instagram professional account',
    why: 'To confirm which account is connected and show its username in your channel list.',
  },
];

/** The consent screen for an Instagram connection, then the same Facebook Login the Page uses. */
export function InstagramConnectButton({ businessId }: { businessId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const connect = () => {
    startTransition(async () => {
      await connectInstagramAction(businessId);
    });
  };

  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={() => setOpen(true)}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[12px] bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] px-5 text-sm font-medium tracking-wide text-white shadow-sm transition-all duration-200 hover:brightness-105 active:brightness-95 disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
      >
        <Instagram className="h-4 w-4" />
        Connect Instagram
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl">
            <div className="bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <Instagram className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Connect Instagram</h2>
                  <p className="mt-0.5 text-xs text-white/75">Permissions we will request</p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <p className="text-sm text-[var(--muted-foreground)]">
                {COMPANY_NAME} answers customers through the Instagram professional account
                linked to your Facebook Page. The login asks for:
              </p>

              <div className="space-y-3">
                {PERMISSIONS.map(({ icon: Icon, permission, why }) => (
                  <div key={permission} className="flex gap-3 rounded-xl bg-[var(--muted)]/50 p-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[var(--foreground)]">{permission}</p>
                      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{why}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-4 py-3 text-xs text-[var(--muted-foreground)]">
                <p className="flex items-center gap-1.5 font-semibold text-[var(--foreground)]">
                  <Lock className="h-3.5 w-3.5" />
                  Your account stays yours
                </p>
                <p className="mt-1">
                  The agent only answers people who message or comment on the connected account.
                  It never posts to your feed and never shares your data with third parties.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-6 pb-5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={connect}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Connecting…
                  </>
                ) : (
                  <>
                    <Instagram className="h-4 w-4" />
                    Accept &amp; Connect
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
