'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  replyAdminInbox,
  setAdminInboxAi,
  type AdminInboxThread,
} from '@/lib/api';

export function ThreadPanel({
  bearer,
  thread,
  platformFilter,
}: {
  bearer: string;
  thread: AdminInboxThread;
  platformFilter?: string;
}) {
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiPaused, setAiPaused] = useState(thread.conversation.aiPaused);

  const { conversation, lead, messages } = thread;

  const backHref = platformFilter ? `/admin/inbox?platform=${platformFilter}` : '/admin/inbox';

  const send = async (pauseAi: boolean) => {
    const content = reply.trim();
    if (!content) return;
    setBusy(true);
    try {
      await replyAdminInbox(bearer, conversation.id, { content, pauseAi });
      setReply('');
      if (pauseAi) setAiPaused(true);
      setStatus('Sent — reload to see it in the thread.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Reply failed.');
    } finally {
      setBusy(false);
    }
  };

  const takeover = async (paused: boolean) => {
    setBusy(true);
    try {
      const result = await setAdminInboxAi(bearer, conversation.id, paused);
      setAiPaused(result.aiPaused);
      setStatus(paused ? 'AI paused on this thread.' : 'AI resumed on this thread.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">
            {conversation.customerName ?? conversation.customerPlatformId}
          </h2>
          {conversation.aiPaused || aiPaused ? (
            <Badge variant="outline">AI paused</Badge>
          ) : (
            <Badge variant="secondary">AI active</Badge>
          )}
        </div>
        <a href={backHref} className="text-sm text-muted-foreground underline hover:text-foreground">
          Close thread
        </a>
      </div>

      <p className="text-sm text-muted-foreground">
        {conversation.businessName ?? 'Unassigned business'} · {conversation.platform ?? 'channel'} ·
        last state: {conversation.lastMessageState}
      </p>

      {lead && (
        <div className="rounded-md border border-border/50 p-3 text-sm">
          <p className="font-medium">Lead — {lead.status}</p>
          <p className="text-muted-foreground">
            {lead.name ?? 'no name'} · {lead.phone ?? 'no phone'} · {lead.email ?? 'no email'}
          </p>
          {lead.requirements && <p className="mt-1 text-muted-foreground">Wants: {lead.requirements}</p>}
          {lead.consent === false && <p className="text-destructive">Customer asked not to be contacted.</p>}
        </div>
      )}

      <div className="space-y-2">
        {messages.map((message) => {
          if (message.from === 'self') {
            return (
              <div key={message.id} className="ml-auto max-w-[85%] rounded-lg bg-primary/10 px-3 py-2">
                <p className="whitespace-pre-line text-sm">{message.content}</p>
                <p className="mt-1 text-right text-xs text-muted-foreground">
                  {sentByLabel(message.sentBy)} · {new Date(message.time).toLocaleString()}
                </p>
              </div>
            );
          }
          return (
            <div key={message.id} className="max-w-[85%] rounded-lg border border-border/50 bg-card px-3 py-2">
              <p className="whitespace-pre-line text-sm">{message.content}</p>
              <p className="mt-1 text-right text-xs text-muted-foreground">
                {new Date(message.time).toLocaleString()}
              </p>
            </div>
          );
        })}
        {messages.length === 0 && <p className="text-sm text-muted-foreground">No messages.</p>}
      </div>

      <div className="space-y-2 border-t border-border/50 pt-4">
        <Textarea
          rows={3}
          placeholder="Write as the business — marked as human, not AI"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => send(false)} disabled={busy || !reply.trim()}>
            Send
          </Button>
          <Button type="button" variant="outline" onClick={() => send(true)} disabled={busy || !reply.trim()}>
            Send &amp; pause AI
          </Button>
          {aiPaused ? (
            <Button type="button" variant="ghost" onClick={() => takeover(false)} disabled={busy}>
              Resume AI on this thread
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={() => takeover(true)} disabled={busy}>
              Pause AI on this thread
            </Button>
          )}
          {status && <span className="text-sm text-muted-foreground">{status}</span>}
        </div>
      </div>
    </Card>
  );
}

function sentByLabel(sentBy: 'ai' | 'human' | null): string {
  if (sentBy === 'human') return 'human';
  if (sentBy === 'ai') return 'AI';
  return 'unlabeled';
}
