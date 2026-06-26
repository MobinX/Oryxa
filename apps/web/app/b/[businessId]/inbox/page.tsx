import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { listConversations, listMessages } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { sendMessageAction, deleteConversationAction, deleteConversationsBulkAction } from '@/app/actions/inbox';
import { ConversationList } from '@/components/conversation-list';
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
  const [conversations, messages] = await Promise.all([
    listConversations(token, businessId),
    selectedId ? listMessages(token, businessId, selectedId) : Promise.resolve(null),
  ]);

  return (
    <div className="flex min-h-0 flex-col">
      <h1 className="text-xl font-bold sm:text-2xl">Inbox</h1>
      <div className="mt-4 flex min-h-[min(70vh,600px)] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-white lg:mt-6 lg:min-h-[calc(100vh-12rem)] lg:flex-row">
        <div
          className={cn(
            'border-b border-[var(--border)] lg:w-80 lg:shrink-0 lg:border-b-0 lg:border-r',
            selectedId ? 'hidden lg:block' : '',
          )}
        >
          <ConversationList
            conversations={conversations}
            businessId={businessId}
            selectedId={selectedId}
            bulkDeleteAction={deleteConversationsBulkAction.bind(null, businessId) as unknown as (fd: FormData) => Promise<void>}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {selectedId && messages ? (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] p-3 lg:hidden">
                <Link
                  href={`/b/${businessId}/inbox`}
                  className="text-sm text-[var(--primary)] hover:underline"
                >
                  ← Conversations
                </Link>
              </div>
              <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] p-3">
                <span className="text-sm font-medium">Conversation</span>
                <form action={deleteConversationAction.bind(null, businessId, selectedId)}>
                  <button
                    type="submit"
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete conversation
                  </button>
                </form>
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
