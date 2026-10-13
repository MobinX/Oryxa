'use client';

import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { updateDefaultAgentAction } from '@/app/actions/default-agent';
import type { PlatformAgent } from '@/lib/api';

/**
 * Every field the default agent answers with, in three boxes that mean different things: the prompt is who
 * the agent is and is required, and the two wording blocks are how it answers — left empty each falls back
 * to Oryxa's reviewed text in code, which is why they start empty here rather than holding a copy of it.
 */
export function DefaultAgentForm({ agent }: { agent: PlatformAgent }) {
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  function save(formData: FormData) {
    startTransition(async () => {
      const result = await updateDefaultAgentAction(formData);
      setNotice(
        result.ok
          ? { tone: 'ok', text: 'Saved. Stores following the default answer with it on the customer’s next message.' }
          : { tone: 'bad', text: result.error },
      );
    });
  }

  return (
    <form action={save} className="space-y-6">
      <Card className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="systemPrompt">
          System prompt
        </label>
        <p className="text-xs text-[var(--muted-foreground)]">
          Who the agent is, and the rules it works by. Required — a store with its own prompt keeps that
          instead, and this box stops speaking for it.
        </p>
        <Textarea
          id="systemPrompt"
          name="systemPrompt"
          rows={22}
          defaultValue={agent.systemPrompt}
          className="font-mono text-xs leading-relaxed"
        />
      </Card>

      <Card className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="replyGuidance">
          Messenger wording
        </label>
        <p className="text-xs text-[var(--muted-foreground)]">
          Appended after the prompt for a DM. Empty right now, so Oryxa's reviewed block is what every store
          is answering with — writing here replaces it for every store still following the default.
        </p>
        <Textarea
          id="replyGuidance"
          name="replyGuidance"
          rows={8}
          defaultValue={agent.replyGuidance ?? ''}
          className="font-mono text-xs leading-relaxed"
        />
      </Card>

      <Card className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="commentReplyGuidance">
          Public comment wording
        </label>
        <p className="text-xs text-[var(--muted-foreground)]">
          The block a comment reply answers with, including which things go to Messenger instead of the
          thread. Empty means Oryxa's reviewed block.
        </p>
        <Textarea
          id="commentReplyGuidance"
          name="commentReplyGuidance"
          rows={8}
          defaultValue={agent.commentReplyGuidance ?? ''}
          className="font-mono text-xs leading-relaxed"
        />
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save default agent'}
        </Button>
        {notice ? (
          <p
            className={
              notice.tone === 'ok'
                ? 'text-sm text-[var(--success)]'
                : 'text-sm text-[var(--destructive)]'
            }
          >
            {notice.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}
