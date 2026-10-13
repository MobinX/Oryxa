'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { followDefaultAgentAction } from '@/app/actions/default-agent';
import type { AgentOverrideReport } from '@/lib/api';

/**
 * Who is NOT answering with the default, with the click that puts a store back.
 *
 * Rows stack rather than lining up as a table: five columns is how the console pages started
 * overflowing sideways on a phone, and this list is read on a phone.
 */
export function DefaultAgentOverrides({ report }: { report: AgentOverrideReport }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  function followAgain(agentId: string, businessName: string) {
    startTransition(async () => {
      const form = new FormData();
      form.set('agentId', agentId);
      const result = await followDefaultAgentAction(form);
      setNotice(
        result.ok
          ? { tone: 'ok', text: `${businessName} answers with the default again.` }
          : { tone: 'bad', text: result.error },
      );
      // The action revalidates the page, but this list arrives as props — so ask for them again.
      if (result.ok) router.refresh();
    });
  }

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">
          {report.following.toLocaleString()} stores follow the default
        </h2>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Everything below answers with its own words instead. Those stores are not touched by edits on
          this page, and one click puts any of them back — its own text is kept in its row, not deleted.
        </p>
      </div>

      {report.overrides.length === 0 ? (
        <p className="text-sm">Nobody. Every store on the platform is answering with the text above.</p>
      ) : (
        <ul className="space-y-2">
          {report.overrides.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-3 py-2"
            >
              <span className="min-w-0 break-words text-sm">
                <span className="font-medium">{row.businessName}</span>
                <span className="text-[var(--muted-foreground)]">
                  {' · '}
                  {row.agentName} · {row.systemPromptChars.toLocaleString()} chars ·{' '}
                  {row.pages} {row.pages === 1 ? 'page' : 'pages'}
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => followAgain(row.id, row.businessName)}
              >
                Follow the default
              </Button>
            </li>
          ))}
        </ul>
      )}

      {notice ? (
        <p
          className={
            notice.tone === 'ok' ? 'text-xs text-[var(--success)]' : 'text-xs text-[var(--destructive)]'
          }
        >
          {notice.text}
        </p>
      ) : null}
    </Card>
  );
}
