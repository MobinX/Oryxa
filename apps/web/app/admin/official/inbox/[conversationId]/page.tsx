import Link from 'next/link';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { requireConsoleBearer } from '@/lib/admin-access';
import { adminOfficialThread } from '@/lib/api';
import { officialReplyAction, officialTakeoverAction } from '@/app/actions/admin-official';

export const instant = false;

export default async function OfficialThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const bearer = await requireConsoleBearer();
  const { conversationId } = await params;
  const { error } = await searchParams;

  let thread: Awaited<ReturnType<typeof adminOfficialThread>> | null = null;
  let loadError: string | null = null;
  try {
    thread = await adminOfficialThread(bearer, conversationId);
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'The thread could not be read.';
  }

  if (loadError || !thread) {
    return (
      <div className="space-y-4">
        <Link href="/admin/official/inbox" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to inbox
        </Link>
        <Card className="border-destructive/40 p-4 text-sm text-destructive">{loadError}</Card>
      </div>
    );
  }

  const { conversation, messages, tickets } = thread;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/official/inbox"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to inbox
        </Link>
        <h1 className="mt-2 flex flex-wrap items-center gap-3 text-xl font-bold sm:text-2xl">
          {conversation.customerName || 'Unknown customer'}
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {conversation.platform}
          </span>
          {conversation.aiPaused ? (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600">
              AI taken over
            </span>
          ) : (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
              AI active
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              conversation.status === 'pending'
                ? 'bg-amber-500/15 text-amber-600'
                : 'bg-emerald-500/15 text-emerald-600'
            }`}
          >
            {conversation.status}
          </span>
        </h1>
      </div>

      {error && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">
          {error === 'empty' ? 'A reply needs text.' : `Reply failed: ${error}`}
        </Card>
      )}

      <Card className="p-4">
        <ul className="space-y-3">
          {messages.map((message) => (
            <li
              key={message.id}
              className={message.from === 'customer' ? 'flex' : 'flex justify-end'}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                  message.from === 'customer'
                    ? 'bg-muted'
                    : 'bg-primary text-primary-foreground'
                }`}
              >
                {message.content}
                <p className="mt-1 text-[10px] opacity-70">
                  {message.from === 'customer'
                    ? new Date(message.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                    : `you via ${message.sentBy === 'ai' ? 'AI' : 'console'} · ${
                        new Date(message.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                      }`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-6">
        <form action={officialReplyAction} className="space-y-3">
          <input type="hidden" name="conversationId" value={conversation.id} />
          <Textarea
            name="content"
            rows={3}
            maxLength={4000}
            required
            placeholder="Answer as OnlyOrders…"
          />
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit">Send reply</Button>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" name="pauseAi" />
              Take over — stop the AI replies on this thread
            </label>
          </div>
        </form>
        <form action={officialTakeoverAction} className="mt-4 flex items-center gap-3 border-t pt-4">
          <input type="hidden" name="conversationId" value={conversation.id} />
          <input type="hidden" name="paused" value={conversation.aiPaused ? '0' : '1'} />
          <Button type="submit" variant="outline" className="h-8 px-3 text-xs">
            <ShieldAlert className="mr-2 h-3.5 w-3.5" />
            {conversation.aiPaused ? 'Resume AI' : 'Take over (no reply this time)'}
          </Button>
          <p className="text-xs text-muted-foreground">
            After a takeover the AI never writes in this thread again until you resume it.
          </p>
        </form>
      </Card>

      {tickets.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-3 text-base font-semibold">Tickets from this thread</h2>
          <ul className="space-y-2 text-sm">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  {ticket.type}
                </span>
                <span className="font-medium">{ticket.subject || '(no subject)'}</span>
                <span className="text-xs text-muted-foreground">({ticket.status}, {ticket.priority})</span>
                <Link
                  href={`/admin/official/tickets/${ticket.id}`}
                  className="ml-auto text-xs text-primary hover:underline"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
