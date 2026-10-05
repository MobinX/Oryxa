import { businessForRun, ensureQuotaNotice, getQuotaStatus } from '@repo/db/crud/billing';
import type { QuotaKind, QuotaStatus } from '@repo/shared';
import { emit, emitAnomaly, errorFields } from '@api/lib/log';

/**
 * The gate: the decision taken *before* a run is started, so an exhausted allowance buys
 * no LLM tokens.
 *
 * This is not the enforcement. Enforcement is `spendQuotaUnit`, which increments and
 * checks in one statement at the moment a reply is actually sent — the only place a race
 * can be lost. The gate is the cheap read in front of it: an agent run costs real money
 * and produces nothing when the budget is already gone, so a business that has used up
 * its allowance should not have one started per inbound message.
 *
 * Everything here fails open. A gate that cannot read the budget starts the run, because
 * muting customers on a slow query would be a worse outage than one wasted agent turn.
 */

/** One budget read, shared by every trigger decision in the same request. */
export type QuotaRead = { status: QuotaStatus | null; failed: boolean };

/**
 * `getQuotaStatus` throws on a database failure, and a throw here would take a webhook
 * delivery down with it — Meta would retry, and the customer would wait. So the failure
 * becomes a value: `failed` means "we do not know", and the caller decides what not
 * knowing is worth.
 */
export async function readQuota(businessId: string): Promise<QuotaRead> {
  try {
    return { status: await getQuotaStatus(businessId), failed: false };
  } catch (err) {
    console.error('[quota] budget read failed, failing open:', err);
    emitAnomaly('quota_gate_failed', { detail: err });
    emit('error', errorFields(err), { dedupe: null });
    return { status: null, failed: true };
  }
}

export type TriggerOptions = {
  /** The business whose allowance pays for this run. Looked up when it is not given. */
  businessId?: string;
  /** A read taken earlier in the same request, so N triggers cost one query, not N. */
  quota?: QuotaRead | Promise<QuotaRead>;
};

export type TriggerVerdict = 'fired' | 'blocked' | 'fail_open';

function spent(status: QuotaStatus, kind: QuotaKind): { used: number; limit: number | null } {
  return kind === 'message'
    ? { used: status.messagesUsed, limit: status.messageLimit }
    : { used: status.commentsUsed, limit: status.commentLimit };
}

function blocked(status: QuotaStatus, kind: QuotaKind): boolean {
  return kind === 'message' ? status.messageBlocked : status.commentBlocked;
}

/**
 * May this run start?
 *
 * `blocked` is the only answer that stops a run. `fail_open` means the run starts anyway
 * and nobody could confirm the budget — it exists so a caller can tell "there was room"
 * from "we were blind", because the second one is the case that silently over-serves.
 *
 * A business on no plan (or on a plan the operator deleted) is unlimited: `assigned` is
 * false, and the run fires.
 */
export async function quotaGate(
  kind: QuotaKind,
  runId: string,
  options: TriggerOptions = {},
): Promise<TriggerVerdict> {
  let businessId: string;
  let read: QuotaRead;
  try {
    const known = options.businessId ?? (await businessForRun(kind, runId));
    if (!known) {
      // The row this run is about is gone, so there is no allowance to charge against it.
      // Nothing was enforced here, and saying so is what makes a new caller that forgot to
      // pass a business findable rather than quietly unlimited.
      emitAnomaly('quota_gate_failed', { detail: `${kind}:${runId}` });
      return 'fail_open';
    }
    businessId = known;
    read = options.quota === undefined ? await readQuota(businessId) : await options.quota;
  } catch (err) {
    console.error('[quota] gate failed, failing open:', err);
    emitAnomaly('quota_gate_failed', { detail: err });
    emit('error', errorFields(err), { dedupe: null });
    return 'fail_open';
  }

  if (read.failed || !read.status) return 'fail_open';
  const status = read.status;
  if (!status.assigned || !blocked(status, kind)) return 'fired';

  // The merchant hears about it here as well as from the spend that crossed the line,
  // because that spend may have crashed before it wrote the notice and there is no cron
  // anywhere that would ever tell them later. The unique index makes the repeat free.
  const { used, limit } = spent(status, kind);
  if (limit !== null) {
    try {
      await ensureQuotaNotice(businessId, kind, status.cycle.period, used, limit, status.cycle.resetsAt);
    } catch (err) {
      // Still blocked: a notice that would not write is not a reason to answer customers
      // off a budget that is demonstrably gone.
      console.error('[quota] exhausted-budget notice failed:', err);
      emit('error', errorFields(err), { dedupe: null });
    }
  }
  emitAnomaly('quota_exhausted', { detail: `${businessId} ${kind} ${used}/${limit ?? 'uncapped'}` });
  return 'blocked';
}
