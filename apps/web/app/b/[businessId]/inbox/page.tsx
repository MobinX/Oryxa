import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowLeft, Check, Trash2, MessageSquare } from 'lucide-react';
import { requireAuth } from '@/lib/auth';
import { listConversations, listMessages } from '@/lib/api';
import {
  deleteConversationAction,
  deleteConversationsBulkAction,
  updateConversationStateAction,
} from '@/app/actions/inbox';
import { InboxChat } from '@/components/inbox-chat';
import { ConversationList } from '@/components/conversation-list';
import { cn } from '@/lib/utils';
import InboxSkeleton from './skeleton';

// Suggestion turns run an LLM inside a server action; give them room on Vercel.
export const maxDuration = 60;

export default function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  return (
    <>
      <h1 className="mb-4 text-xl font-bold sm:text-2xl lg:hidden">Inbox</h1>
      <Suspense fallback={<InboxSkeleton />}>
        <InboxContent params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function InboxContent({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { businessId } = await params;
  const { c: selectedId } = await searchParams;
  const token = await requireAuth();
  const conversations = await listConversations(token, businessId, { limit: 100 }).catch(() => []);
  const selected = conversations.find((conversation) => conversation.id === selectedId);
  const messages = selected ? await listMessages(token, businessId, selected.id).catch(() => null) : null;
  const state = selected?.lastMessageState;
  const resolved = state === 'done';

  return (
    <div className="flex h-[min(76dvh,680px)] min-h-[440px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-[#111427] lg:fixed lg:inset-y-0 lg:left-[252px] lg:right-0 lg:z-20 lg:h-dvh lg:min-h-0 lg:flex-row lg:rounded-none lg:border-0 lg:shadow-none">
      <div
        className={cn(
          'min-h-0 border-b border-slate-200/80 bg-white dark:border-slate-800 dark:bg-[#0F1123] lg:w-[320px] lg:shrink-0 lg:border-b-0 lg:border-r',
          selectedId ? 'hidden lg:block' : 'flex-1 lg:flex-none',
        )}
      >
        <ConversationList
          conversations={conversations}
          businessId={businessId}
          selectedId={selectedId}
          bulkDeleteAction={deleteConversationsBulkAction.bind(null, businessId)}
        />
      </div>

      {/* min-h-0 is what keeps this section a scroll box instead of a grows-to-fit box: without it
          a flex child's min-height:auto sizes it to the whole thread, and on mobile everything past
          the container's clip — the rest of the thread and the reply box — becomes unreachable. */}
      <section
        className={cn('min-h-0 min-w-0 flex-1 flex-col bg-slate-50/50 dark:bg-[#0B0D1B]', selectedId ? 'flex' : 'hidden lg:flex')}
        aria-label="Message thread"
      >
        {selected && messages ? (
          <>
            <header className="flex min-h-[76px] shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 bg-white px-4 py-3 dark:border-slate-800 dark:bg-[#111427] sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <Link
                  href={`/b/${businessId}/inbox`}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Link>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#5B3DF5]/15 text-sm font-bold text-[#5B3DF5]">
                  {(selected.customerName || 'C')
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join('')
                    .toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold text-slate-900 dark:text-white sm:text-base">
                    {selected.customerName || 'Customer'}
                  </h2>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                    {selected.pageName || 'Facebook Messenger'}
                    <span>·</span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 font-semibold text-[10px]',
                        resolved
                          ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
                      )}
                    >
                      {resolved ? 'Resolved' : state === 'working' ? 'AI Replying' : 'Active'}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <form
                  action={updateConversationStateAction.bind(
                    null,
                    businessId,
                    selected.id,
                    resolved ? 'pending' : 'done',
                  )}
                >
                  <button
                    type="submit"
                    className={cn(
                      'inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold text-white shadow-xs transition-colors',
                      resolved ? 'bg-slate-600 hover:bg-slate-700' : 'bg-emerald-600 hover:bg-emerald-700',
                    )}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {resolved ? 'Reopen' : 'Mark Resolved'}
                  </button>
                </form>
                <form action={deleteConversationAction.bind(null, businessId, selected.id)}>
                  <button
                    type="submit"
                    aria-label="Delete conversation"
                    title="Delete conversation"
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-rose-950/40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </header>

            <InboxChat
              businessId={businessId}
              conversationId={selected.id}
              customerName={selected.customerName}
              createdAt={selected.createdAt}
              initialMessages={messages}
              initialAutoPilot={selected.autoPilot ?? true}
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-slate-400">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#5B3DF5]/10 text-[#5B3DF5]">
              <MessageSquare className="h-7 w-7" />
            </div>
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                {conversations.length === 0 ? 'No conversations yet' : 'Choose a conversation'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                {conversations.length === 0
                  ? 'Connect your Facebook Page in Integrations. When customers send messages, they appear here live.'
                  : 'Select a conversation from the left to read and send replies.'}
              </p>
              {conversations.length === 0 && (
                <Link
                  href={`/b/${businessId}/channels`}
                  className="mt-3 inline-block rounded-xl bg-[#5B3DF5] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#4C2EE0] transition"
                >
                  Go to Integrations
                </Link>
              )}
            </div>
          </div>
        )}
      </section>

      <aside
        className="hidden w-[280px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-200/80 bg-white/70 p-4 dark:border-slate-800 dark:bg-[#0E1020] xl:flex"
        aria-label="Customer details"
      >
        {selected ? (
          <>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#13172B]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Customer details</h3>
              <div className="mt-3 flex items-center gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#5B3DF5]/15 text-sm font-bold text-[#5B3DF5]">
                  {(selected.customerName || 'C')
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join('')
                    .toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                    {selected.customerName || 'Customer'}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-400">
                    {selected.pageName || 'Facebook Messenger'}
                  </p>
                </div>
              </div>
              <dl className="mt-3 space-y-2.5 text-xs">
                <div>
                  <dt className="text-[10px] text-slate-400">Platform</dt>
                  <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">Facebook Messenger</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-slate-400">Customer Platform ID</dt>
                  <dd className="mt-0.5 break-all font-mono text-[11px] text-slate-700 dark:text-slate-300">
                    {selected.customerPlatformId}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-slate-400">Conversation started</dt>
                  <dd className="mt-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                    {new Date(selected.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#13172B]">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Recent Activity</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {messages?.length ?? 0}
                </span>
              </div>
              <div className="mt-3 space-y-2.5">
                {(messages ?? [])
                  .slice(-4)
                  .reverse()
                  .map((message) => (
                    <div key={message.id} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#5B3DF5]" />
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-[11px] text-slate-700 dark:text-slate-300">
                          {message.content || 'Photo attachment'}
                        </p>
                        <time className="mt-0.5 block text-[9px] text-slate-400" dateTime={message.time}>
                          {new Date(message.time).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </time>
                      </div>
                    </div>
                  ))}
                {!messages?.length && <p className="text-xs text-slate-400">No recent activity.</p>}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-400 dark:border-slate-800">
            Customer details appear when you open a conversation.
          </div>
        )}
      </aside>
    </div>
  );
}
