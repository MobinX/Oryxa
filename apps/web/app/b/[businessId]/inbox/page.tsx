'use client';

import { use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth-provider';
import { listConversations, listMessages, sendMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default function InboxPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = use(params);
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  const { data: conversations } = useQuery({
    queryKey: ['conversations', businessId],
    queryFn: () => listConversations(token!, businessId),
    enabled: !!token,
    refetchInterval: 5000,
  });

  const { data: messages } = useQuery({
    queryKey: ['messages', businessId, selectedId],
    queryFn: () => listMessages(token!, businessId, selectedId!),
    enabled: !!token && !!selectedId,
    refetchInterval: 3000,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Inbox</h1>
      <div className="mt-6 flex h-[calc(100vh-12rem)] overflow-hidden rounded-xl border border-[var(--border)] bg-white">
        <div className="w-80 overflow-y-auto border-r border-[var(--border)]">
          {conversations?.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setSelectedId(conv.id)}
              className={cn(
                'w-full border-b border-[var(--border)] p-4 text-left hover:bg-[var(--muted)]',
                selectedId === conv.id && 'bg-[var(--primary)]/5',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{conv.customerName ?? 'Customer'}</span>
                <Badge variant={conv.lastMessageState === 'pending' ? 'warning' : 'default'}>
                  {conv.lastMessageState}
                </Badge>
              </div>
            </button>
          ))}
          {conversations?.length === 0 && (
            <p className="p-4 text-sm text-[var(--muted-foreground)]">No conversations yet.</p>
          )}
        </div>

        <div className="flex flex-1 flex-col">
          {selectedId ? (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages?.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'max-w-[75%] rounded-2xl px-4 py-2 text-sm',
                      m.from === 'customer'
                        ? 'bg-[var(--muted)]'
                        : 'ml-auto bg-[var(--primary)] text-white',
                    )}
                  >
                    {m.from === 'self' && (
                      <span className="mb-1 block text-xs opacity-70">AI / You</span>
                    )}
                    {m.content}
                  </div>
                ))}
              </div>
              <form
                className="flex gap-2 border-t border-[var(--border)] p-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!reply.trim()) return;
                  await sendMessage(token!, businessId, selectedId, reply);
                  setReply('');
                  queryClient.invalidateQueries({ queryKey: ['messages', businessId, selectedId] });
                }}
              >
                <Input
                  placeholder="Type a reply (bypasses AI)..."
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                />
                <Button type="submit">Send</Button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-[var(--muted-foreground)]">
              Select a conversation
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
