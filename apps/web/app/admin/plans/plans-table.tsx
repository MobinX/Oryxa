'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, CreditCard, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  assignPlanAction,
  createPlanAction,
  deletePlanAction,
  resetCycleAction,
  retirePlanAction,
  updatePlanAction,
  type AssignResult,
  type PlanDeleteResult,
  type PlanSaveResult,
} from '@/app/actions/plans';
import type { AdminBusinessPlan, AdminPlanRow, DeletePlanConflict } from '@/lib/api';

/**
 * The operator's plan console. Caps are read from this table at gate time and never copied
 * onto a business, so saving a row changes every business on it at their next inbound
 * message — which is why `businessCount` and the red warning live on the row itself.
 */

type Draft = {
  name: string;
  slug: string;
  price: string;
  currency: string;
  messageLimit: string;
  commentLimit: string;
  features: string;
  position: string;
  active: boolean;
};

const draftOf = (plan: AdminPlanRow): Draft => ({
  name: plan.name,
  slug: plan.slug,
  price: (plan.priceCents / 100).toFixed(2),
  currency: plan.currency,
  messageLimit: plan.messageLimit === null ? '' : String(plan.messageLimit),
  commentLimit: plan.commentLimit === null ? '' : String(plan.commentLimit),
  features: plan.features.join('\n'),
  position: String(plan.position),
  active: plan.active,
});

function toFormData(draft: Draft): FormData {
  const fd = new FormData();
  fd.set('name', draft.name);
  fd.set('slug', draft.slug);
  fd.set('price', draft.price);
  fd.set('currency', draft.currency);
  // An empty field is uncapped, and must not be read as zero.
  fd.set('messageLimit', draft.messageLimit);
  fd.set('commentLimit', draft.commentLimit);
  fd.set('features', draft.features);
  fd.set('position', draft.position || '0');
  fd.set('active', draft.active ? 'true' : 'false');
  return fd;
}

/** NULL is uncapped, 0 is a freeze — the two must never look the same in a table cell. */
function limitLabel(value: number | null): string {
  if (value === null) return 'Uncapped';
  if (value === 0) return 'Frozen (0)';
  return value.toLocaleString();
}

function fieldClass() {
  return 'h-9 w-full rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary';
}

export function PlanRow({ plan }: { plan: AdminPlanRow }) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(plan));
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [conflict, setConflict] = useState<DeletePlanConflict | null>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const typedMessageLimit = draft.messageLimit.trim() === '' ? null : Number(draft.messageLimit);
  const typedCommentLimit = draft.commentLimit.trim() === '' ? null : Number(draft.commentLimit);

  const frozen = typedMessageLimit === 0 || typedCommentLimit === 0;
  const lowered =
    (typedMessageLimit !== null && plan.messageLimit !== null && typedMessageLimit < plan.messageLimit) ||
    (typedCommentLimit !== null && plan.commentLimit !== null && typedCommentLimit < plan.commentLimit);

  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(plan));

  const save = () =>
    startTransition(async () => {
      const result: PlanSaveResult = await updatePlanAction(plan.id, toFormData(draft));
      if (result.ok) {
        setMessage({
          kind: 'ok',
          text:
            result.notified > 0
              ? `Saved. ${result.notified} ${result.notified === 1 ? 'business was' : 'businesses were'} pushed past a threshold and notified.`
              : 'Saved. Every business on this plan picked up the new caps immediately.',
        });
      } else {
        setMessage({ kind: 'error', text: result.error });
      }
    });

  const retire = () =>
    startTransition(async () => {
      const result = await retirePlanAction(plan.id);
      if (result.ok) {
        setDraft((current) => ({ ...current, active: false }));
        setMessage({ kind: 'ok', text: 'Retired. No new business can be put on it; businesses already on it are untouched.' });
      } else {
        setMessage({ kind: 'error', text: result.error });
      }
    });

  const remove = () =>
    startTransition(async () => {
      setConflict(null);
      const result: PlanDeleteResult = await deletePlanAction(plan.id);
      if (result.ok) return;
      if ('conflict' in result) setConflict(result.conflict);
      else setMessage({ kind: 'error', text: result.error });
    });

  return (
    <tr className="border-b border-border/50 align-top">
      <td className="py-3 pr-3">
        <Input value={draft.name} onChange={(e) => set('name', e.target.value)} className="h-9" />
        <div className="mt-1.5 flex items-center gap-1.5">
          <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={draft.slug}
            onChange={(e) => set('slug', e.target.value)}
            aria-label="slug"
            className={`${fieldClass()} h-7 w-32 font-mono text-xs`}
          />
        </div>
      </td>

      <td className="py-3 pr-3">
        <div className="flex items-center gap-1.5">
          <input
            value={draft.price}
            onChange={(e) => set('price', e.target.value)}
            aria-label="price"
            inputMode="decimal"
            className={`${fieldClass()} w-20`}
          />
          <input
            value={draft.currency}
            onChange={(e) => set('currency', e.target.value)}
            aria-label="currency"
            maxLength={3}
            className={`${fieldClass()} w-16 uppercase`}
          />
        </div>
      </td>

      <td className="py-3 pr-3">
        <input
          value={draft.messageLimit}
          onChange={(e) => set('messageLimit', e.target.value)}
          aria-label="message allowance"
          inputMode="numeric"
          placeholder="uncapped"
          className={`${fieldClass()} ${frozen && typedMessageLimit === 0 ? 'border-destructive text-destructive' : ''}`}
        />
        <p className="mt-1 text-xs text-muted-foreground">now: {limitLabel(plan.messageLimit)}</p>
      </td>

      <td className="py-3 pr-3">
        <input
          value={draft.commentLimit}
          onChange={(e) => set('commentLimit', e.target.value)}
          aria-label="comment allowance"
          inputMode="numeric"
          placeholder="uncapped"
          className={`${fieldClass()} ${frozen && typedCommentLimit === 0 ? 'border-destructive text-destructive' : ''}`}
        />
        <p className="mt-1 text-xs text-muted-foreground">now: {limitLabel(plan.commentLimit)}</p>
      </td>

      <td className="py-3 pr-3">
        <textarea
          value={draft.features}
          onChange={(e) => set('features', e.target.value)}
          aria-label="features"
          rows={3}
          placeholder="One per line"
          className="w-full min-w-48 rounded-md border border-border bg-background p-2 text-xs leading-5 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </td>

      <td className="py-3 pr-3">
        <input
          value={draft.position}
          onChange={(e) => set('position', e.target.value)}
          aria-label="display order"
          inputMode="numeric"
          className={`${fieldClass()} w-16`}
        />
        <label className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => set('active', e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          active
        </label>
      </td>

      <td className="py-3 pr-3 text-right">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            plan.businessCount > 0
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {plan.businessCount}
        </span>
      </td>

      <td className="py-3">
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5">
            <Button size="sm" onClick={save} disabled={isPending || !dirty}>
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={retire} disabled={isPending || plan.active === false}>
              Retire
            </Button>
            <Button size="sm" variant="outline" onClick={remove} disabled={isPending}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {frozen && plan.businessCount > 0 && (
            <p className="flex items-start gap-1.5 text-right text-xs font-medium text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              A limit of 0 stops every agent reply for {plan.businessCount}{' '}
              {plan.businessCount === 1 ? 'business' : 'businesses'} from their next inbound message.
            </p>
          )}
          {!frozen && lowered && plan.businessCount > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              This lowers the cap for {plan.businessCount}{' '}
              {plan.businessCount === 1 ? 'business' : 'businesses'} — some may already be over it.
            </p>
          )}
          {message && (
            <p className={`text-xs ${message.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
              {message.text}
            </p>
          )}
          {conflict && (
            <div className="max-w-64 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-left text-xs">
              <p className="font-semibold text-destructive">{conflict.error}</p>
              <ul className="mt-1 list-inside list-disc text-muted-foreground">
                {conflict.businesses.slice(0, 5).map((business) => (
                  <li key={business.id}>{business.name}</li>
                ))}
              </ul>
              {conflict.businesses.length > 5 && (
                <p className="mt-1 text-muted-foreground">
                  and {conflict.businesses.length - 5} more — retire the plan instead.
                </p>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function NewPlanRow({ defaultPosition }: { defaultPosition: number }) {
  const [draft, setDraft] = useState<Draft>({
    name: '',
    slug: '',
    price: '0.00',
    currency: 'USD',
    messageLimit: '',
    commentLimit: '',
    features: '',
    position: String(defaultPosition),
    active: true,
  });
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const create = () =>
    startTransition(async () => {
      const result = await createPlanAction(toFormData(draft));
      if (result.ok) {
        setMessage({ kind: 'ok', text: 'Created.' });
        setDraft((current) => ({ ...current, name: '', slug: '', features: '' }));
      } else {
        setMessage({ kind: 'error', text: result.error });
      }
    });

  // A `<form>` cannot wrap a `<tr>` without the browser hoisting it out of the table, so
  // the add button calls the action directly instead of submitting.
  return (
    <tr className="border-t border-border/50 bg-muted/20">
        <td className="py-3 pr-3">
          <Input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="New plan name"
            className="h-9"
          />
          <input
            value={draft.slug}
            onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
            placeholder="new-slug"
            aria-label="new plan slug"
            className={`${fieldClass()} mt-1.5 h-7 w-32 font-mono text-xs`}
          />
        </td>
        <td className="py-3 pr-3">
          <input
            value={draft.price}
            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            aria-label="new price"
            className={`${fieldClass()} w-20`}
          />
        </td>
        <td className="py-3 pr-3">
          <input
            value={draft.messageLimit}
            onChange={(e) => setDraft({ ...draft, messageLimit: e.target.value })}
            placeholder="uncapped"
            aria-label="new message allowance"
            className={`${fieldClass()}`}
          />
        </td>
        <td className="py-3 pr-3">
          <input
            value={draft.commentLimit}
            onChange={(e) => setDraft({ ...draft, commentLimit: e.target.value })}
            placeholder="uncapped"
            aria-label="new comment allowance"
            className={`${fieldClass()}`}
          />
        </td>
        <td className="py-3 pr-3">
          <input
            value={draft.features}
            onChange={(e) => setDraft({ ...draft, features: e.target.value })}
            placeholder="Feature | Feature"
            aria-label="new features"
            className={fieldClass()}
          />
        </td>
        <td className="py-3 pr-3">
          <input
            value={draft.position}
            onChange={(e) => setDraft({ ...draft, position: e.target.value })}
            aria-label="new display order"
            className={`${fieldClass()} w-16`}
          />
        </td>
        <td className="py-3 pr-3" />
        <td className="py-3">
          <div className="flex flex-col items-end gap-1.5">
            <Button size="sm" type="button" onClick={create} disabled={isPending || !draft.name.trim() || !draft.slug.trim()}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add plan
            </Button>
            {draft.messageLimit.trim() === '0' && (
              <p className="text-xs font-medium text-destructive">0 means no replies at all.</p>
            )}
            {message && (
              <p className={`text-right text-xs ${message.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                {message.text}
              </p>
            )}
          </div>
        </td>
    </tr>
  );
}

/**
 * The roster. A business with no plan is unlimited by definition, so this is both the
 * place to assign one and the place to hand the escape hatch back (`planId: null`).
 */
export function BusinessPlansTable({
  rows,
  plans,
}: {
  rows: AdminBusinessPlan[];
  plans: AdminPlanRow[];
}) {
  const [showAll, setShowAll] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const unassigned = useMemo(() => rows.filter((row) => row.planId === null), [rows]);
  const visible = showAll ? rows : unassigned;

  const assign = (businessId: string, name: string, planId: string | null) =>
    startTransition(async () => {
      const result: AssignResult = await assignPlanAction(businessId, planId);
      setFeedback(
        result.ok
          ? { kind: 'ok', text: `${name} → ${planId ? 'plan applied' : 'unlimited replies'}.` }
          : { kind: 'error', text: result.error },
      );
    });

  const reset = (businessId: string, name: string) =>
    startTransition(async () => {
      const result = await resetCycleAction(businessId);
      setFeedback(
        result.ok
          ? { kind: 'ok', text: `Cycle counters cleared for ${name}. The anchor did not move.` }
          : { kind: 'error', text: result.error },
      );
    });

  return (
    <Card className="hover:shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Businesses</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {unassigned.length} of {rows.length} have no plan — those get unlimited replies until
            they are assigned one.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowAll((current) => !current)}>
          {showAll ? 'Show only unplanned' : `Show all ${rows.length}`}
        </Button>
      </div>

      {feedback && (
        <p
          className={`mt-3 flex items-center gap-2 text-sm ${
            feedback.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
          }`}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {feedback.text}
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border/50">
              <th className="pb-2 pr-3 font-semibold">Business</th>
              <th className="pb-2 pr-3 font-semibold">Plan</th>
              <th className="pb-2 pr-3 font-semibold">Cycle</th>
              <th className="pb-2 pr-3 font-semibold">Messenger</th>
              <th className="pb-2 pr-3 font-semibold">Comments</th>
              <th className="pb-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, 200).map((row) => (
              <tr key={row.businessId} className="border-b border-border/50">
                <td className="py-2.5 pr-3">
                  <p className="font-medium">{row.businessName}</p>
                  <p className="font-mono text-xs text-muted-foreground">{row.businessId.slice(0, 8)}</p>
                </td>
                <td className="py-2.5 pr-3">{row.planName ?? <span className="text-muted-foreground">no plan</span>}</td>
                <td className="py-2.5 pr-3 text-xs text-muted-foreground">{row.period}</td>
                <td className="py-2.5 pr-3 tabular-nums">
                  {row.messagesUsed.toLocaleString()} / {limitLabel(row.messageLimit)}
                </td>
                <td className="py-2.5 pr-3 tabular-nums">
                  {row.commentsUsed.toLocaleString()} / {limitLabel(row.commentLimit)}
                </td>
                <td className="py-2.5">
                  <div className="flex items-center gap-1.5">
                    <select
                      defaultValue={row.planId ?? ''}
                      disabled={isPending}
                      onChange={(event) =>
                        assign(row.businessId, row.businessName, event.target.value || null)
                      }
                      className="h-8 max-w-36 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-60"
                    >
                      <option value="">Unlimited (no plan)</option>
                      {plans.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending || !row.planId}
                      onClick={() => reset(row.businessId, row.businessName)}
                    >
                      Reset cycle
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length > 200 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Showing the first 200 of {visible.length}. Use the plan rows above to move a group at once.
          </p>
        )}
      </div>
    </Card>
  );
}

export function PlansConsole({
  plans,
  businesses,
}: {
  plans: AdminPlanRow[];
  businesses: AdminBusinessPlan[];
}) {
  return (
    <div className="space-y-6">
      <Card className="hover:shadow-card">
        <h2 className="font-semibold">Plans</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border/50">
                <th className="pb-2 pr-3 font-semibold">Plan</th>
                <th className="pb-2 pr-3 font-semibold">Price</th>
                <th className="pb-2 pr-3 font-semibold">Messages / cycle</th>
                <th className="pb-2 pr-3 font-semibold">Comments / cycle</th>
                <th className="pb-2 pr-3 font-semibold">Features</th>
                <th className="pb-2 pr-3 font-semibold">Order</th>
                <th className="pb-2 pr-3 font-semibold">Businesses</th>
                <th className="pb-2 font-semibold">Save</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <PlanRow key={plan.id} plan={plan} />
              ))}
            </tbody>
            <NewPlanRow defaultPosition={plans.length} />
          </table>
        </div>
      </Card>

      <BusinessPlansTable rows={businesses} plans={plans} />
    </div>
  );
}
