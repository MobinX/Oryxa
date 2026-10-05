import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CreditCard, Info } from 'lucide-react';
import { requireAuth } from '@/lib/auth';
import { cachedBilling } from '@/app/_cache/queries';
import { Card } from '@/components/ui/card';
import { ApiError, type QuotaStatus } from '@/lib/api';
import { PlanPicker } from './plan-picker';

/** 'YYYY-MM-DD' cycle keys are UTC dates, so the label is built from a UTC-anchored Date. */
function cycleDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function limitText(limit: number | null): string {
  if (limit === null) return 'uncapped';
  if (limit === 0) return 'none allowed';
  return limit.toLocaleString();
}

/**
 * One budget, drawn three ways: the bar, the remaining number, and the words that explain
 * what an empty bar means — which is never the same sentence for uncapped, frozen and used up.
 */
function Meter({
  label,
  used,
  limit,
  blocked,
}: {
  label: string;
  used: number;
  limit: number | null;
  blocked: boolean;
}) {
  const ratio = limit === null || limit === 0 ? 0 : Math.min(1, used / limit);
  const remaining = limit === null ? null : Math.max(0, limit - used);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="tabular-nums text-sm font-medium">
          {used.toLocaleString()} / {limitText(limit)}
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${
            blocked ? 'bg-destructive' : ratio >= 0.8 ? 'bg-amber-500' : 'bg-primary'
          }`}
          style={{ width: `${limit === null ? 4 : Math.max(ratio * 100, 2)}%` }}
        />
      </div>

      <p
        className={`text-xs ${
          blocked ? 'font-medium text-destructive' : ratio >= 0.8 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
        }`}
      >
        {limit === null
          ? 'No cap on this budget.'
          : limit === 0
            ? 'This plan allows none — the agent is stopped for every inbound message.'
            : blocked
              ? `Used up. The agent will not start for a new message until the cycle resets.`
              : `${remaining?.toLocaleString()} left this cycle`}
      </p>
    </div>
  );
}

function UnassignedNotice({ quota }: { quota: QuotaStatus }) {
  return (
    <Card className="border-amber-500/40 hover:shadow-card">
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        No plan — unlimited replies
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        This business has no plan assigned, so nothing is counted against it and the agent answers
        every message. {quota.messagesUsed.toLocaleString()} messenger replies and{' '}
        {quota.commentsUsed.toLocaleString()} comment replies have already been recorded this cycle —
        picking a plan below shows how much of that a plan would have charged.
      </p>
    </Card>
  );
}

export default async function BillingPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const token = await requireAuth();

  let overview;
  try {
    overview = await cachedBilling(token, businessId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) redirect('/businesses');
    return (
      <div className="space-y-6">
        <Link
          href={`/b/${businessId}/dashboard`}
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
        <Card className="border-destructive/40 hover:shadow-card">
          <p className="flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" />
            The billing page could not load
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {err instanceof ApiError ? err.message : 'The API could not be reached.'} This page reads{' '}
            <code>/api/v1/{businessId}/billing</code> — a 403 here means the signed-in account does
            not own this business.
          </p>
        </Card>
      </div>
    );
  }

  const { quota, plan, options } = overview;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-geist text-2xl font-bold tracking-tight">Billing & allowance</h1>
            <p className="text-sm text-muted-foreground">
              What the agent may answer this cycle, and what it has already answered.
            </p>
          </div>
        </div>
        <Link
          href="/pricing"
          className="rounded-element border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          Compare plans
        </Link>
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        These counters move when the agent replies, from outside this page, so they can be a few
        minutes behind. The real limit is enforced on the server the moment a message arrives — a
        stale number here can never buy more replies than the plan allows.
      </p>

      <Card className="hover:shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-semibold">
            {quota.assigned ? (
              <>
                {quota.planName}
                {plan && plan.priceCents > 0 && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ${plan.currency === 'USD' ? '' : `${plan.currency} `}
                    {(plan.priceCents / 100).toLocaleString('en-US')} per 30 days
                  </span>
                )}
              </>
            ) : (
              'No plan assigned'
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            cycle {cycleDay(quota.cycle.period)} → {cycleDay(quota.cycle.resetsAt)} ·{' '}
            {quota.cycle.daysLeft === 0
              ? 'resets today'
              : `resets in ${quota.cycle.daysLeft} ${quota.cycle.daysLeft === 1 ? 'day' : 'days'}`}
          </p>
        </div>

        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <Meter
            label="Messenger replies"
            used={quota.messagesUsed}
            limit={quota.messageLimit}
            blocked={quota.messageBlocked}
          />
          <Meter
            label="Comment replies"
            used={quota.commentsUsed}
            limit={quota.commentLimit}
            blocked={quota.commentBlocked}
          />
        </div>
      </Card>

      {!quota.assigned && <UnassignedNotice quota={quota} />}

      <PlanPicker businessId={businessId} quota={quota} options={options} />
    </div>
  );
}
