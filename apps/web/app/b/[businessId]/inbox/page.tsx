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
    <div className="flex min-h-0 flex-col">
      <h1 className="text-xl font-bold sm:text-2xl">Inbox</h1>
      <div className="mt-4 flex min-h-[min(70vh,600px)] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-white lg:mt-6 lg:min-h-[calc(100vh-12rem)] lg:flex-row">
        <div
          className={cn(
            'border-b border-[var(--border)] lg:w-80 lg:shrink-0 lg:border-b-0 lg:border-r',
            selectedId ? 'hidden lg:block' : 'max-h-64 overflow-y-auto lg:max-h-none',
          )}
        >
          {conversations.map((conv) => (
            <Link
              key={conv.id}
              href={`/b/${businessId}/inbox?c=${conv.id}`}
              className={cn(
                'block w-full border-b border-[var(--border)] p-4 text-left hover:bg-[var(--muted)]',
                selectedId === conv.id && 'bg-[var(--primary)]/5',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{conv.customerName ?? 'Customer'}</span>
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

        <div className="flex min-h-0 flex-1 flex-col">
          {selectedId && messages ? (
            <>
              <div className="flex items-center gap-2 border-b border-[var(--border)] p-3 lg:hidden">
                <Link
                  href={`/b/${businessId}/inbox`}
                  className="text-sm text-[var(--primary)] hover:underline"
                >
                  ← Conversations
                </Link>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'max-w-[85%] rounded-2xl px-4 py-2 text-sm sm:max-w-[75%]',
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
                className="flex flex-col gap-2 border-t border-[var(--border)] p-4 sm:flex-row"
              >
                <Input name="content" placeholder="Type a reply (bypasses AI)…" required className="flex-1" />
                <Button type="submit" className="w-full sm:w-auto">
                  Send
                </Button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-[var(--muted-foreground)]">
              Select a conversation
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
