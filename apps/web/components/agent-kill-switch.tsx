'use client';

import { useState, useTransition } from 'react';
import { Bot, Loader2, Power } from 'lucide-react';
import { setBusinessAgentStateAction } from '@/app/actions/business';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * The business-wide kill switch. Off stops every automatic reply for this store while
 * customer messages keep arriving in the inbox; the inbox auto-pilot control is disabled
 * until it is back on.
 */
export function AgentKillSwitch({
  businessId,
  initialOn,
}: {
  businessId: string;
  initialOn: boolean;
}) {
  const [on, setOn] = useState(initialOn);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !on;
    setError(null);
    startTransition(async () => {
      try {
        const result = await setBusinessAgentStateAction(businessId, next);
        setOn(result.agentState);
      } catch {
        setError('Could not change the agent. Please try again.');
      }
    });
  };

  return (
    <Card
      className={cn(
        'flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5',
        on
          ? 'border-emerald-500/25 bg-emerald-500/[0.03]'
          : 'border-rose-500/30 bg-rose-500/[0.04]',
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
            on
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
          )}
        >
          <Bot className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-geist text-sm font-bold text-foreground">AI agent</h3>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                on
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                  : 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  on ? 'bg-emerald-500' : 'bg-rose-500',
                  !on && 'animate-pulse',
                )}
              />
              {on ? 'On' : 'Off'}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {on
              ? 'Answers Messenger, Instagram and comments automatically.'
              : 'No automatic replies. New messages still land in this inbox for you to answer.'}
          </p>
          {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={on ? 'Turn the AI agent off' : 'Turn the AI agent on'}
        onClick={toggle}
        disabled={pending}
        className={cn(
          'inline-flex h-11 w-full shrink-0 items-center justify-center gap-2.5 rounded-xl px-4 text-xs font-semibold transition-colors disabled:opacity-60 sm:w-auto',
          on
            ? 'border border-rose-500/30 bg-card text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30'
            : 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/25 hover:bg-emerald-700',
        )}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
        {on ? 'Turn off agent' : 'Turn on agent'}
        <span
          className={cn(
            'relative ml-1 h-5 w-9 shrink-0 rounded-full transition-colors',
            on ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
          )}
          aria-hidden
        >
          <span
            className={cn(
              'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all',
              on ? 'left-[18px]' : 'left-0.5',
            )}
          />
        </span>
      </button>
    </Card>
  );
}
