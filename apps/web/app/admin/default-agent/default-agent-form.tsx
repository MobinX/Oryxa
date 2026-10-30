'use client';

import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { updateDefaultAgentAction } from '@/app/actions/default-agent';
import type { PlatformAgent } from '@/lib/api';
import { useBrand } from '@/components/brand-provider';

/** The limits `updatePlatformAgentInputSchema` enforces, spelled here so a long paste fails in the browser, not as a 400. */
const PROMPT_LIMIT = 40_000;
const WORDING_LIMIT = 12_000;

/**
 * What a wording box is answering with, read off the row instead of assumed by the caption. The caption that
 * shipped first said "empty right now" unconditionally, which told an operator who had already written here
 * that nothing was written.
 */
function wordingState(
  written: string | null,
  reviewed: string | undefined,
  companyName: string,
) {
  const reviewedChars = reviewed?.trim().length ?? 0;
  if (written?.trim()) {
    return `Answering with this text (${written.trim().length} chars) for every store still following the default. Emptying the box hands the wording back to ${companyName}'s reviewed block.`;
  }
  return `Empty, so every following store answers with ${companyName}'s reviewed block (${reviewedChars} chars, shown greyed below) — it carries the rule that keeps replies in শুদ্ধ বাংলা and the send-message-once rule. Anything typed here replaces that whole block for every one of them.`;
}

/**
 * Every field the default agent answers with, in three boxes that mean different things: the prompt is who
 * the agent is and is required, and the two wording blocks are how it answers — left empty each falls back
 * to Oryxa's reviewed text in code, which is why each box shows that text as its placeholder.
 */
export function DefaultAgentForm({ agent }: { agent: PlatformAgent }) {
  const { companyName } = useBrand();
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
          maxLength={PROMPT_LIMIT}
          defaultValue={agent.systemPrompt}
          className="font-mono text-xs leading-relaxed"
        />
        <p className="text-[11px] text-[var(--muted-foreground)]">
          {agent.systemPrompt.length.toLocaleString()} characters, limit {PROMPT_LIMIT.toLocaleString()}.
        </p>
      </Card>

      <Card className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="replyGuidance">
          Messenger wording
        </label>
        <p className="text-xs text-[var(--muted-foreground)]">{wordingState(agent.replyGuidance, agent.guidanceDefaults?.replyGuidance, companyName)}</p>
        <Textarea
          id="replyGuidance"
          name="replyGuidance"
          rows={8}
          maxLength={WORDING_LIMIT}
          defaultValue={agent.replyGuidance ?? ''}
          placeholder={agent.guidanceDefaults?.replyGuidance ?? ''}
          className="font-mono text-xs leading-relaxed placeholder:text-slate-500/60"
        />
      </Card>

      <Card className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="commentReplyGuidance">
          Public comment wording
        </label>
        <p className="text-xs text-[var(--muted-foreground)]">
          The block a comment reply answers with, including which things go to Messenger instead of the
          thread. {wordingState(agent.commentReplyGuidance, agent.guidanceDefaults?.commentReplyGuidance, companyName)}
        </p>
        <Textarea
          id="commentReplyGuidance"
          name="commentReplyGuidance"
          rows={8}
          maxLength={WORDING_LIMIT}
          defaultValue={agent.commentReplyGuidance ?? ''}
          placeholder={agent.guidanceDefaults?.commentReplyGuidance ?? ''}
          className="font-mono text-xs leading-relaxed placeholder:text-slate-500/60"
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
