'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, Inbox, Search, Trash2 } from 'lucide-react';
import type { Channel, Conversation } from '@/lib/api';
import { InboxChannelFilter, channelDisplayName } from '@/components/inbox-channel-filter';
import { cn } from '@/lib/utils';

export function ConversationList({
  conversations,
  channels,
  activeChannelId,
  businessId,
  selectedId,
  bulkDeleteAction,
}: {
  conversations: Conversation[];
  channels: Channel[];
  activeChannelId?: string;
  businessId: string;
  selectedId?: string;
  bulkDeleteAction: (formData: FormData) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');
  const [pending, startTransition] = useTransition();

  const activeChannel = channels.find((channel) => channel.id === activeChannelId);
  const activeChannelName = activeChannel ? channelDisplayName(activeChannel) : null;
  const channelQuery = activeChannelId ? `&channel=${activeChannelId}` : '';

  // Bulk actions only apply to what is on screen; switching channels drops the old selection.
  useEffect(() => {
    setSelected(new Set());
  }, [activeChannelId]);

  const filtered = useMemo(() => conversations.filter((conversation) => {
    const matchesQuery = `${conversation.customerName ?? ''} ${conversation.pageName ?? ''} ${conversation.customerPlatformId}`
      .toLowerCase().includes(query.trim().toLowerCase());
    const matchesState = filter === 'all'
      || (filter === 'pending' && (conversation.lastMessageState === 'pending' || conversation.lastMessageState === 'working'))
      || conversation.lastMessageState === filter;
    return matchesQuery && matchesState;
  }), [conversations, filter, query]);

  const allSelected = filtered.length > 0 && filtered.every(({ id }) => selected.has(id));
  const someSelected = filtered.some(({ id }) => selected.has(id)) && !allSelected;

  const toggle = (id: string) => setSelected((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const toggleAll = () => setSelected((previous) => {
    const next = new Set(previous);
    if (allSelected) filtered.forEach(({ id }) => next.delete(id));
    else filtered.forEach(({ id }) => next.add(id));
    return next;
  });

  const submitBulk = () => {
    const form = new FormData();
    for (const id of selected) form.append('conversationIds', id);
    startTransition(async () => {
      await bulkDeleteAction(form);
      setSelected(new Set());
    });
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-card" aria-label="Conversations">
      <div className="border-b border-border/70 px-4 pb-3 pt-4 sm:px-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">Inbox</h2>
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{conversations.length}</span>
        </div>
        {channels.length > 0 && (
          <div className="mb-2.5">
            <InboxChannelFilter businessId={businessId} channels={channels} activeChannelId={activeChannelId} />
          </div>
        )}
        <label className="flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-primary/20">
          <Search className="h-4 w-4 shrink-0" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={activeChannelName ? `Search ${activeChannelName}...` : 'Search conversations...'}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            aria-label="Search conversations"
          />
        </label>
        <div className="mt-3 flex gap-1 border-b border-border/60" role="tablist" aria-label="Conversation state">
          {([
            ['all', 'All', conversations.length],
            ['pending', 'Open', conversations.filter((item) => item.lastMessageState === 'pending' || item.lastMessageState === 'working').length],
            ['done', 'Resolved', conversations.filter((item) => item.lastMessageState === 'done').length],
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                'flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-xs font-medium transition-colors',
                filter === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {label}<span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{count}</span>
            </button>
          ))}
        </div>
        {selected.size > 0 && (
          <div className="mt-2 flex items-center justify-between rounded-lg bg-muted/70 px-2.5 py-2 text-xs">
            <span>{selected.size} selected</span>
            <button type="button" onClick={submitBulk} disabled={pending} className="inline-flex items-center gap-1 font-semibold text-destructive disabled:opacity-50">
              <Trash2 className="h-3.5 w-3.5" />{pending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.map((conversation) => {
          const initials = (conversation.customerName || 'Customer').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
          const isOpen = conversation.lastMessageState === 'pending' || conversation.lastMessageState === 'working';
          return (
            <div key={conversation.id} className={cn('group relative flex items-center gap-2 border-b border-border/50 px-3 py-3 transition-colors hover:bg-muted/50', selectedId === conversation.id && 'bg-primary/[0.07]')}>
              <input
                type="checkbox"
                checked={selected.has(conversation.id)}
                onChange={() => toggle(conversation.id)}
                aria-label={`Select ${conversation.customerName ?? 'customer'} conversation`}
                className="h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-primary/30"
              />
              <div className="relative shrink-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-violet-200 text-xs font-bold text-indigo-700 dark:from-indigo-950 dark:to-violet-900 dark:text-indigo-200">{initials}</div>
                {isOpen && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" />}
              </div>
              <Link href={`/b/${businessId}/inbox?c=${conversation.id}${channelQuery}`} className="min-w-0 flex-1 pr-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('truncate text-sm font-semibold', selectedId === conversation.id && 'text-primary')}>{conversation.customerName ?? 'Customer'}</span>
                  <time className="shrink-0 text-[10px] text-muted-foreground" dateTime={conversation.createdAt}>{new Date(conversation.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted-foreground">{conversation.pageName || 'Messenger'} · {conversation.lastMessageState === 'working' ? 'AI is replying' : isOpen ? 'Open conversation' : 'Resolved'}</span>
                  {isOpen && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </div>
              </Link>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center px-6 py-12 text-center text-muted-foreground">
            <Inbox className="mb-2 h-8 w-8 opacity-50" />
            <p className="text-sm font-medium">
              {query.trim()
                ? 'No matching conversations'
                : conversations.length
                  ? 'No matches in this view'
                  : activeChannelName
                    ? `No chats from ${activeChannelName} yet`
                    : 'Your inbox is empty'}
            </p>
            <p className="mt-1 text-xs">
              {query.trim()
                ? 'Try another name, Page or account.'
                : conversations.length
                  ? 'Switch the Open or Resolved tab to see the rest.'
                  : activeChannelName
                    ? 'New messages from this channel will show up here.'
                    : 'New customer messages will show up here.'}
            </p>
            {activeChannelName && !query.trim() && (
              <Link
                href={`/b/${businessId}/inbox`}
                className="mt-3 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
              >
                Show all channels
              </Link>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-border/60 px-4 py-2.5 text-[11px] text-muted-foreground">
        <input type="checkbox" checked={allSelected} ref={(element) => { if (element) element.indeterminate = someSelected; }} onChange={toggleAll} aria-label="Select all visible conversations" className="h-3.5 w-3.5 rounded border-border text-primary" />
        <Check className="h-3.5 w-3.5" />Select visible conversations
      </div>
    </section>
  );
}
