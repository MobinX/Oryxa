import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowLeft, Check, Clock3, Trash2, UserRound } from 'lucide-react';
import { requireAuth } from '@/lib/auth';
import { listConversations, listMessages } from '@/lib/api';
import { deleteConversationAction, deleteConversationsBulkAction, updateConversationStateAction } from '@/app/actions/inbox';
import { InboxReplyForm } from '@/components/inbox-reply-form';
import { ConversationList } from '@/components/conversation-list';
import { cn } from '@/lib/utils';
import InboxSkeleton from './skeleton';

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
  const conversations = await listConversations(token, businessId, { limit: 100 });
  const selected = conversations.find((conversation) => conversation.id === selectedId);
  const messages = selected ? await listMessages(token, businessId, selected.id) : null;
  const state = selected?.lastMessageState;
  const resolved = state === 'done';

  return (
    <div className="flex h-[min(76dvh,680px)] min-h-[440px] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card lg:fixed lg:inset-y-0 lg:left-[280px] lg:right-0 lg:z-20 lg:h-dvh lg:min-h-0 lg:flex-row lg:rounded-none lg:border-0 lg:shadow-none">
      <div className={cn('min-h-0 border-b border-border/70 lg:w-[310px] lg:shrink-0 lg:border-b-0 lg:border-r', selectedId ? 'hidden lg:block' : 'flex-1 lg:flex-none')}>
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
      <section className={cn('min-h-0 min-w-0 flex-1 flex-col bg-background/40', selectedId ? 'flex' : 'hidden lg:flex')} aria-label="Message thread">
        {selected && messages ? (
          <>
            <header className="flex min-h-[76px] shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-card px-4 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <Link href={`/b/${businessId}/inbox`} className="rounded-lg p-2 text-muted-foreground hover:bg-muted lg:hidden" aria-label="Back to conversations"><ArrowLeft className="h-4 w-4" /></Link>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{(selected.customerName || 'C').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold sm:text-base">{selected.customerName || 'Customer'}</h2>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />{selected.pageName || 'Facebook Messenger'}<span>·</span>
                    <span className={cn('rounded-full px-2 py-0.5 font-semibold', resolved ? 'bg-muted text-muted-foreground' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300')}>{resolved ? 'Resolved' : state === 'working' ? 'AI replying' : 'Open'}</span>
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <form action={updateConversationStateAction.bind(null, businessId, selected.id, resolved ? 'pending' : 'done')}>
                  <button type="submit" className={cn('inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-white shadow-sm transition-colors sm:px-4 sm:text-sm', resolved ? 'bg-slate-600 hover:bg-slate-700' : 'bg-emerald-600 hover:bg-emerald-700')}>
                    <Check className="h-4 w-4" />{resolved ? 'Reopen' : 'Resolve'}
                  </button>
                </form>
                <form action={deleteConversationAction.bind(null, businessId, selected.id)}>
                  <button type="submit" aria-label="Delete conversation" title="Delete conversation" className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </form>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
              <div className="mx-auto mb-1 flex items-center gap-2 rounded-full bg-muted/80 px-3 py-1.5 text-[11px] text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />Conversation started {new Date(selected.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</div>
              {messages.map((message) => {
                const fromCustomer = message.from === 'customer';
                return (
                  <div key={message.id} className={cn('flex items-end gap-2.5', fromCustomer ? 'justify-start' : 'justify-end')}>
                    {fromCustomer && <div className="mb-5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{(selected.customerName || 'C').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div>}
                    <div className={cn('max-w-[88%] space-y-2 sm:max-w-[75%] lg:max-w-[68%]')}>
                      <div className={cn('space-y-2 rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm', fromCustomer ? 'rounded-bl-md border border-border/50 bg-card text-foreground' : 'rounded-br-md bg-blue-600 text-white')}>
                        {message.images?.length ? <div className="flex flex-wrap gap-2">{message.images.map((url, index) => <a key={`${message.id}-${url}`} href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Message attachment ${index + 1}`} className="max-h-64 w-auto max-w-full rounded-xl object-cover" /></a>)}</div> : null}
                        {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}
                      </div>
                      <time className={cn('block px-1 text-[10px] text-muted-foreground', fromCustomer ? 'text-left' : 'text-right')} dateTime={message.time}>{new Date(message.time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time>
                    </div>
                    {!fromCustomer && <div className="mb-5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">O</div>}
                  </div>
                );
              })}
              {messages.length === 0 && <p className="m-auto text-sm text-muted-foreground">No messages in this conversation yet.</p>}
            </div>
            <InboxReplyForm businessId={businessId} conversationId={selected.id} />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><UserRound className="h-7 w-7" /></div>
            <div><p className="font-semibold text-foreground">Choose a conversation</p><p className="mt-1 text-sm">Select a customer thread to read and reply.</p></div>
          </div>
        )}
      </section>

      <aside className="hidden w-[280px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-border/70 bg-background/60 p-4 xl:flex" aria-label="Customer details">
        {selected ? (
          <>
            <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
              <h3 className="text-sm font-bold">Customer details</h3>
              <div className="mt-4 flex items-center gap-3 border-b border-border/60 pb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">{(selected.customerName || 'C').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div>
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{selected.customerName || 'Customer'}</p><p className="mt-1 truncate text-xs text-muted-foreground">{selected.pageName || 'Facebook Messenger'}</p></div>
              </div>
              <dl className="mt-3 space-y-3 text-xs">
                <div><dt className="text-muted-foreground">Platform</dt><dd className="mt-0.5 font-medium">Facebook Messenger</dd></div>
                <div><dt className="text-muted-foreground">Customer ID</dt><dd className="mt-0.5 break-all font-medium">{selected.customerPlatformId}</dd></div>
                <div><dt className="text-muted-foreground">Conversation started</dt><dd className="mt-0.5 font-medium">{new Date(selected.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</dd></div>
              </dl>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between"><h3 className="text-sm font-bold">Conversation activity</h3><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{messages?.length ?? 0}</span></div>
              <div className="mt-3 space-y-3">
                {(messages ?? []).slice(-4).reverse().map((message) => <div key={message.id} className="flex gap-2"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/70" /><div className="min-w-0"><p className="line-clamp-2 text-xs text-foreground">{message.content || 'Photo attachment'}</p><time className="mt-1 block text-[10px] text-muted-foreground" dateTime={message.time}>{new Date(message.time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></div></div>)}
                {!messages?.length && <p className="text-xs text-muted-foreground">No recent activity.</p>}
              </div>
            </div>
          </>
        ) : <div className="rounded-2xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">Customer details will appear when you open a conversation.</div>}
      </aside>
    </div>
  );
}
