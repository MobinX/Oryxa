'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Conversation = {
  id: string;
  customerName: string | null;
  lastMessageState: string;
};

/**
 * Conversation list for the inbox with multi-select bulk delete. Selection
 * state is client-side; deletion is submitted as a server action form.
 */
export function ConversationList({
  conversations,
  businessId,
  selectedId,
  bulkDeleteAction,
}: {
  conversations: Conversation[];
  businessId: string;
  selectedId?: string;
  bulkDeleteAction: (formData: FormData) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const ids = conversations.map((c) => c.id);
  const allSelected = ids.length > 0 && selected.size === ids.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => (prev.size === ids.length ? new Set() : new Set(ids)));

  const submitBulk = () => {
    const form = new FormData();
    for (const id of selected) form.append('conversationIds', id);
    startTransition(async () => {
      await bulkDeleteAction(form);
      setSelected(new Set());
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] p-3">
        <label className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={toggleAll}
            disabled={ids.length === 0}
            className="h-4 w-4 rounded border-[var(--border)]"
          />
          {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
        </label>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={submitBulk}
            disabled={pending}
            className="text-xs text-red-600 hover:underline disabled:opacity-50"
          >
            {pending ? 'Working…' : `Delete (${selected.size})`}
          </button>
        )}
      </div>
      <div className="max-h-64 overflow-y-auto lg:max-h-none">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={cn(
              'flex items-center gap-2 border-b border-[var(--border)] p-3 hover:bg-[var(--muted)]',
              selectedId === conv.id && 'bg-[var(--primary)]/5',
            )}
          >
            <input
              type="checkbox"
              checked={selected.has(conv.id)}
              onChange={() => toggle(conv.id)}
              className="h-4 w-4 shrink-0 rounded border-[var(--border)]"
              aria-label="Select conversation"
            />
            <Link
              href={`/b/${businessId}/inbox?c=${conv.id}`}
              className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
            >
              <span className="truncate font-medium">{conv.customerName ?? 'Customer'}</span>
              <Badge variant={conv.lastMessageState === 'pending' ? 'warning' : 'default'}>
                {conv.lastMessageState}
              </Badge>
            </Link>
          </div>
        ))}
        {conversations.length === 0 && (
          <p className="p-4 text-sm text-[var(--muted-foreground)]">No conversations yet.</p>
        )}
      </div>
    </div>
  );
}
