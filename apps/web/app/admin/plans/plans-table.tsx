'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, CreditCard, Plus, RefreshCw, Trash2, X } from 'lucide-react';
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
 * message — which is why the business count and the red warning live on the card itself.
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

/** NULL is uncapped, 0 is a freeze — the two must never look the same in a cell. */
function limitLabel(value: number | null): string {
  if (value === null) return 'Uncapped';
  if (value === 0) return 'Frozen (0)';
  return value.toLocaleString();
}

const inputClass = 'mt-1.5 h-12 text-base sm:h-11';
const textareaClass =
  'mt-1.5 min-h-24 w-full rounded-element border border-border bg-card p-3 text-sm leading-6 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20';

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

export function PlanCard({ plan }: { plan: AdminPlanRow }) {
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
        setMessage({
          kind: 'ok',
          text: 'Retired. No new business can be put on it; businesses already on it are untouched.',
        });
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
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
              {plan.businessCount} {plan.businessCount === 1 ? 'business' : 'businesses'}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                draft.active
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {draft.active ? 'Active' : 'Retired'}
            </span>
          </div>
          <label className="mt-3 block">
            <Label>Plan name</Label>
            <Input
              value={draft.name}
              onChange={(event) => set('name', event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="mt-2 flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Input
              value={draft.slug}
              onChange={(event) => set('slug', event.target.value)}
              aria-label="slug"
              className="h-10 max-w-64 font-mono text-sm"
            />
          </label>
        </div>
        <label className="flex shrink-0 items-center gap-2 rounded-element border border-border/70 px-3 py-2 text-xs font-semibold">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(event) => set('active', event.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Active
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Price</Label>
          <div className="mt-1.5 flex gap-2">
            <Input
              value={draft.price}
              onChange={(event) => set('price', event.target.value)}
              aria-label="price"
              inputMode="decimal"
              className="h-12 flex-1 text-base tabular-nums sm:h-11"
            />
            <Input
              value={draft.currency}
              onChange={(event) => set('currency', event.target.value)}
              aria-label="currency"
              maxLength={3}
              className="h-12 w-20 text-base uppercase sm:h-11"
            />
          </div>
        </div>
        <div>
          <Label>Display order</Label>
          <Input
            value={draft.position}
            onChange={(event) => set('position', event.target.value)}
            aria-label="display order"
            inputMode="numeric"
            className={inputClass}
          />
        </div>

        <div>
          <Label>Messages / cycle</Label>
          <Input
            value={draft.messageLimit}
            onChange={(event) => set('messageLimit', event.target.value)}
            aria-label="message allowance"
            inputMode="numeric"
            placeholder="Uncapped"
            className={`${inputClass} ${
              frozen && typedMessageLimit === 0 ? 'border-destructive text-destructive' : ''
            }`}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">now {limitLabel(plan.messageLimit)}</p>
        </div>
        <div>
          <Label>Comments / cycle</Label>
          <Input
            value={draft.commentLimit}
            onChange={(event) => set('commentLimit', event.target.value)}
            aria-label="comment allowance"
            inputMode="numeric"
            placeholder="Uncapped"
            className={`${inputClass} ${
              frozen && typedCommentLimit === 0 ? 'border-destructive text-destructive' : ''
            }`}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">now {limitLabel(plan.commentLimit)}</p>
        </div>

        <label className="block sm:col-span-2">
          <Label>Features</Label>
          <textarea
            value={draft.features}
            onChange={(event) => set('features', event.target.value)}
            aria-label="features"
            rows={3}
            placeholder="One per line"
            className={textareaClass}
          />
        </label>
      </div>

      {frozen && plan.businessCount > 0 && (
        <p className="mt-4 flex items-start gap-2 rounded-element border border-destructive/30 bg-destructive/5 p-3 text-xs font-medium text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          A limit of 0 stops every agent reply for {plan.businessCount}{' '}
          {plan.businessCount === 1 ? 'business' : 'businesses'} from their next inbound message.
        </p>
      )}
      {!frozen && lowered && plan.businessCount > 0 && (
        <p className="mt-4 rounded-element border border-amber-500/30 bg-amber-500/5 p-3 text-xs font-medium text-amber-700 dark:text-amber-400">
          This lowers the cap for {plan.businessCount}{' '}
          {plan.businessCount === 1 ? 'business' : 'businesses'} — some may already be over it.
        </p>
      )}
      {message && (
        <p
          className={`mt-3 text-xs ${
            message.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
          }`}
        >
          {message.text}
        </p>
      )}
      {conflict && (
        <div className="mt-3 rounded-element border border-destructive/40 bg-destructive/5 p-3 text-xs">
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

      <div className="mt-4 flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:justify-end">
        <Button
          type="button"
          onClick={save}
          disabled={isPending || !dirty}
          className="h-12 w-full sm:h-10 sm:w-auto"
        >
          {isPending ? 'Saving…' : 'Save plan'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={retire}
          disabled={isPending || plan.active === false}
          className="h-12 w-full sm:h-10 sm:w-auto"
        >
          Retire
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={remove}
          disabled={isPending}
          className="h-12 w-full border-red-500/30 text-red-600 hover:bg-red-500/10 sm:h-10 sm:w-auto dark:text-red-400"
        >
          <Trash2 className="mr-1.5 h-4 w-4" />
          Delete
        </Button>
      </div>
    </Card>
  );
}

function NewPlanCard({ defaultPosition }: { defaultPosition: number }) {
  const [open, setOpen] = useState(false);
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

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const create = () =>
    startTransition(async () => {
      const result = await createPlanAction(toFormData(draft));
      if (result.ok) {
        setMessage({ kind: 'ok', text: 'Plan created.' });
        setDraft((current) => ({ ...current, name: '', slug: '', features: '' }));
        setOpen(false);
      } else {
        setMessage({ kind: 'error', text: result.error });
      }
    });

  if (!open) {
    return (
      <Card className="border-dashed p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">New plan</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Add a tier without touching the existing ones.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setOpen(true)}
            className="h-12 w-full sm:h-10 sm:w-auto"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add a plan
          </Button>
        </div>
        {message && (
          <p
            className={`mt-3 text-xs ${
              message.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
            }`}
          >
            {message.text}
          </p>
        )}
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">New plan</h2>
        <button
          type="button"
          aria-label="Cancel new plan"
          onClick={() => setOpen(false)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <Label>Plan name</Label>
          <Input
            value={draft.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder="Growth"
            className={inputClass}
          />
        </label>
        <label className="block">
          <Label>Slug</Label>
          <Input
            value={draft.slug}
            onChange={(event) => set('slug', event.target.value)}
            placeholder="growth"
            className={`${inputClass} font-mono text-sm`}
          />
        </label>
        <div>
          <Label>Price</Label>
          <div className="mt-1.5 flex gap-2">
            <Input
              value={draft.price}
              onChange={(event) => set('price', event.target.value)}
              inputMode="decimal"
              aria-label="new price"
              className="h-12 flex-1 text-base tabular-nums sm:h-11"
            />
            <Input
              value={draft.currency}
              onChange={(event) => set('currency', event.target.value)}
              maxLength={3}
              aria-label="new currency"
              className="h-12 w-20 text-base uppercase sm:h-11"
            />
          </div>
        </div>
        <div>
          <Label>Display order</Label>
          <Input
            value={draft.position}
            onChange={(event) => set('position', event.target.value)}
            inputMode="numeric"
            aria-label="new display order"
            className={inputClass}
          />
        </div>
        <div>
          <Label>Messages / cycle</Label>
          <Input
            value={draft.messageLimit}
            onChange={(event) => set('messageLimit', event.target.value)}
            placeholder="Uncapped"
            inputMode="numeric"
            aria-label="new message allowance"
            className={inputClass}
          />
        </div>
        <div>
          <Label>Comments / cycle</Label>
          <Input
            value={draft.commentLimit}
            onChange={(event) => set('commentLimit', event.target.value)}
            placeholder="Uncapped"
            inputMode="numeric"
            aria-label="new comment allowance"
            className={inputClass}
          />
        </div>
        <label className="block sm:col-span-2">
          <Label>Features</Label>
          <textarea
            value={draft.features}
            onChange={(event) => set('features', event.target.value)}
            rows={3}
            placeholder="One per line"
            aria-label="new features"
            className={textareaClass}
          />
        </label>
      </div>

      {draft.messageLimit.trim() === '0' && (
        <p className="mt-3 text-xs font-medium text-destructive">0 means no replies at all.</p>
      )}
      {message && (
        <p
          className={`mt-3 text-xs ${
            message.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:justify-end">
        <Button
          type="button"
          onClick={create}
          disabled={isPending || !draft.name.trim() || !draft.slug.trim()}
          className="h-12 w-full sm:h-10 sm:w-auto"
        >
          {isPending ? 'Creating…' : 'Create plan'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(false)}
          className="h-12 w-full sm:h-10 sm:w-auto"
        >
          Cancel
        </Button>
      </div>
    </Card>
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
  const visible = (showAll ? rows : unassigned).slice(0, 200);

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
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Businesses</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {unassigned.length} of {rows.length} have no plan — those get unlimited replies until
            they are assigned one.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowAll((current) => !current)}
          className="h-11 w-full sm:h-9 sm:w-auto"
        >
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

      {/* Phones get one card per business; the six-column table returns from md up. */}
      <div className="mt-4 space-y-3 md:hidden">
        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No businesses to show.</p>
        ) : (
          visible.map((row) => (
            <div key={row.businessId} className="rounded-element border border-border/70 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{row.businessName}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {row.businessId.slice(0, 8)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold">
                  {row.planName ?? 'No plan'}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <dt className="text-muted-foreground">Cycle</dt>
                  <dd className="font-medium">{row.period}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Messenger</dt>
                  <dd className="font-medium tabular-nums">
                    {row.messagesUsed.toLocaleString()} / {limitLabel(row.messageLimit)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Comments</dt>
                  <dd className="font-medium tabular-nums">
                    {row.commentsUsed.toLocaleString()} / {limitLabel(row.commentLimit)}
                  </dd>
                </div>
              </dl>
              <label className="mt-3 block">
                <Label>Assign plan</Label>
                <select
                  defaultValue={row.planId ?? ''}
                  disabled={isPending}
                  onChange={(event) =>
                    assign(row.businessId, row.businessName, event.target.value || null)
                  }
                  className="mt-1.5 h-12 w-full rounded-element border border-border bg-background px-3 text-base disabled:opacity-60"
                >
                  <option value="">Unlimited (no plan)</option>
                  {plans.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={isPending || !row.planId}
                onClick={() => reset(row.businessId, row.businessName)}
                className="mt-2 h-11 w-full"
              >
                Reset cycle
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 hidden overflow-x-auto md:block">
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
            {visible.map((row) => (
              <tr key={row.businessId} className="border-b border-border/50">
                <td className="py-2.5 pr-3">
                  <p className="font-medium">{row.businessName}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {row.businessId.slice(0, 8)}
                  </p>
                </td>
                <td className="py-2.5 pr-3">
                  {row.planName ?? <span className="text-muted-foreground">no plan</span>}
                </td>
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
                      className="h-9 max-w-36 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-60"
                    >
                      <option value="">Unlimited (no plan)</option>
                      {plans.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
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
      </div>

      {(showAll ? rows : unassigned).length > 200 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing the first 200 of {(showAll ? rows : unassigned).length}. Use the plan cards above to
          move a group at once.
        </p>
      )}
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
    <div className="space-y-5 sm:space-y-6">
      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Plans</h2>
            <p className="text-sm text-muted-foreground">
              {plans.length} {plans.length === 1 ? 'tier' : 'tiers'} · {plans.filter((plan) => plan.active).length}{' '}
              active
            </p>
          </div>
        </div>
        {plans.length === 0 ? (
          <Card className="border-dashed p-6 text-center text-sm text-muted-foreground">
            No plans yet. Add the first tier below.
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        )}
      </div>

      <NewPlanCard defaultPosition={plans.length} />

      <BusinessPlansTable rows={businesses} plans={plans} />
    </div>
  );
}
