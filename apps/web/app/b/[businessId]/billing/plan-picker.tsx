'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { switchPlanAction } from '@/app/actions/billing';
import type { Plan, QuotaStatus } from '@/lib/api';

/**
 * The merchant's own plan switch. Self-serve and instant: there is no payment step here,
 * because money is agreed off-platform exactly as the storefront already settles it.
 */

function allowance(limit: number | null, unit: string): string {
  if (limit === null) return `Uncapped ${unit}`;
  if (limit === 0) return `No ${unit}`;
  return `${limit.toLocaleString()} ${unit}${limit === 1 ? '' : 's'}`;
}

/**
 * Upgrading mid-cycle is honest: the replies already spent count against the new plan, so
 * what you gain is the difference. Saying it in the button's own row is the point — an
 * "unlimited" plan chosen right after running out would otherwise look like a way to keep
 * going for free, and the cycle anchor never moves to let that happen.
 */
function inheritedUsage(plan: Plan, quota: QuotaStatus): string | null {
  const parts: string[] = [];
  if (quota.messagesUsed > 0 && plan.messageLimit !== null) {
    const left = plan.messageLimit - quota.messagesUsed;
    parts.push(
      left > 0
        ? `${plan.name} leaves you ${left.toLocaleString()} more messenger ${left === 1 ? 'reply' : 'replies'} this cycle`
        : `you have already used all ${quota.messagesUsed.toLocaleString()} messenger replies this cycle`,
    );
  }
  if (quota.commentsUsed > 0 && plan.commentLimit !== null) {
    const left = plan.commentLimit - quota.commentsUsed;
    parts.push(
      left > 0
        ? `${left.toLocaleString()} more comment ${left === 1 ? 'reply' : 'replies'}`
        : `all ${quota.commentsUsed.toLocaleString()} comment replies used`,
    );
  }
  if (parts.length === 0) return null;
  return `You have already used ${quota.messagesUsed.toLocaleString()} messenger and ${quota.commentsUsed.toLocaleString()} comment ${
    quota.messagesUsed + quota.commentsUsed === 1 ? 'reply' : 'replies'
  } in this cycle, so ${parts.join(' and ')}. The reset date does not move.`;
}

export function PlanPicker({
  businessId,
  quota,
  options,
}: {
  businessId: string;
  quota: QuotaStatus;
  options: Plan[];
}) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  if (options.length === 0) {
    return (
      <p className="flex items-start gap-2 rounded-element border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        No plans are on sale right now. Ask the operator to publish one in the plans console — until
        then this business keeps unlimited replies.
      </p>
    );
  }

  const choose = (plan: Plan) =>
    startTransition(async () => {
      setFeedback(null);
      const result = await switchPlanAction(businessId, plan.id);
      setFeedback(
        result.ok
          ? { kind: 'ok', text: `You are on ${result.planName}. The new caps apply from the next inbound message.` }
          : { kind: 'error', text: result.error },
      );
    });

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-semibold">Change plan</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Applies immediately. Nothing is charged here — the amount is agreed with the team, the
          same way payment on delivery works for orders.
        </p>
      </div>

      {feedback && (
        <p
          className={`flex items-start gap-2 text-sm ${
            feedback.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'font-medium text-destructive'
          }`}
        >
          {feedback.kind === 'ok' ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          {feedback.text}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {options.map((plan) => {
          const current = plan.id === quota.planId;
          const usage = inheritedUsage(plan, quota);

          return (
            <div
              key={plan.id}
              className={`flex flex-col justify-between gap-4 rounded-element border p-5 transition-colors ${
                current ? 'border-primary bg-primary/5' : 'border-border/60 bg-card'
              }`}
            >
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold">{plan.name}</h3>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {plan.priceCents === 0
                      ? 'Free'
                      : `${plan.currency === 'USD' ? '$' : `${plan.currency} `}${(plan.priceCents / 100).toLocaleString('en-US')}`}
                    <span className="text-xs"> / 30 days</span>
                  </span>
                </div>

                <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  <li>{allowance(plan.messageLimit, 'messenger reply')}</li>
                  <li>{allowance(plan.commentLimit, 'comment reply')}</li>
                </ul>

                {plan.features.map((feature) => (
                  <p key={feature} className="mt-1.5 text-xs text-muted-foreground">
                    {feature}
                  </p>
                ))}

                {usage && !current && <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">{usage}</p>}
              </div>

              <Button
                size="sm"
                variant={current ? 'outline' : 'default'}
                disabled={current || isPending}
                onClick={() => choose(plan)}
              >
                {current ? 'Current plan' : 'Switch to this plan'}
              </Button>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        A plan smaller than what this cycle has already used is refused rather than applied — it would
        stop the agent until{' '}
        <span className="font-medium text-foreground">
          {new Date(`${quota.cycle.resetsAt}T00:00:00Z`).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            timeZone: 'UTC',
          })}
        </span>
        . The cycle counter resets on its own at that boundary; nobody has to restart it.
      </p>
    </section>
  );
}
