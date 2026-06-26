import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { listConversations, listMessages } from '@/lib/api';
import { Badge } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { sendMessageAction } from '@/app/actions/inbox';
import { cn } from '@/lib/utils';

export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { businessId } = await params;
  const { c: selectedId } = await searchParams;
  const token = await requireAuth();
  const conversations = await listConversations(token, businessId);
  const messages = selectedId ? await listMessages(token, businessId, selectedId) : null;

  return (
    <div>
      <h1 className="text-2xl font-bold">Inbox</h1>
      <div className="mt-6 flex h-[calc(100vh-12rem)] overflow-hidden rounded-xl border border-[var(--border)] bg-white">
        <div className="w-80 overflow-y-auto border-r border-[var(--border)]">
          {conversations.map((conv) => (
            <Link
              key={conv.id}
              href={`/b/${businessId}/inbox?c=${conv.id}`}
              className={cn(
                'block w-full border-b border-[var(--border)] p-4 text-left hover:bg-[var(--muted)]',
                selectedId === conv.id && 'bg-[var(--primary)]/5',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{conv.customerName ?? 'Customer'}</span>
                <Badge variant={conv.lastMessageState === 'pending' ? 'warning' : 'default'}>
                  {conv.lastMessageState}
                </Badge>
              </div>
            </Link>
          ))}
          {conversations.length === 0 && (
            <p className="p-4 text-sm text-[var(--muted-foreground)]">No conversations yet.</p>
          )}
        </div>

        <div className="flex flex-1 flex-col">
          {selectedId && messages ? (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.map((m) => (
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
                action={sendMessageAction.bind(null, businessId, selectedId)}
                className="flex gap-2 border-t border-[var(--border)] p-4"
              >
                <Input name="content" placeholder="Type a reply (bypasses AI)…" required />
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
