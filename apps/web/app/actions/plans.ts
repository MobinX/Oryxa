'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { expirePlans } from '@/app/_cache/tags';
import { getAuthToken } from '@/lib/auth';
import { logsBearer } from '@/lib/logs-session';
import {
  ApiError,
  adminAssignPlan,
  adminCreatePlan,
  adminDeletePlan,
  adminListBusinessPlans,
  adminResetCycle,
  adminUpdatePlan,
  type DeletePlanConflict,
  type PlanInput,
} from '@/lib/api';

/**
 * The console bearer, exactly as `/admin` resolves it. `signInPath: null` on every call
 * below means a plan edit can never bounce a reader to the merchant sign-in page — this is
 * the operator surface, and its own login is `/admin/login`.
 */
async function operatorBearer(): Promise<string> {
  const bearer = (await logsBearer()) ?? (await getAuthToken());
  if (!bearer) redirect('/admin/login');
  return bearer;
}

/** `null` is uncapped and `0` is a freeze, so an empty field must not become a zero. */
function parseLimit(raw: FormDataEntryValue | null): number | null {
  const text = String(raw ?? '').trim();
  if (text === '') return null;
  const value = Number(text.replace(/[,\s]/g, ''));
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function planFromFormData(formData: FormData): PlanInput {
  return {
    name: String(formData.get('name') ?? '').trim(),
    slug: String(formData.get('slug') ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-'),
    priceCents: Math.round((Number(String(formData.get('price') ?? '0').replace(/[^\d.]/g, '')) || 0) * 100),
    currency: String(formData.get('currency') ?? 'USD').trim().toUpperCase() || 'USD',
    messageLimit: parseLimit(formData.get('messageLimit')),
    commentLimit: parseLimit(formData.get('commentLimit')),
    // Newline or pipe, never a comma: "1,000 agent replies per 30 days" is one feature.
    features: String(formData.get('features') ?? '')
      .split(/[\n|]/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 20),
    position: Number(String(formData.get('position') ?? '0')) || 0,
    active: formData.get('active') !== 'false',
  };
}

/**
 * A plan edit changes the remaining allowance of every business sitting on it, and those
 * numbers are cached on their own pages. The roster is read after the write so the right
 * tags expire — this is the one place a plan edit is not instant for the merchant's view.
 */
async function expireAroundPlan(bearer: string, planId: string | null) {
  if (!planId) return expirePlans();
  const roster = await adminListBusinessPlans(bearer).catch(() => []);
  expirePlans(roster.filter((row) => row.planId === planId).map((row) => row.businessId));
}

export type PlanSaveResult =
  | { ok: true; notified: number }
  | { ok: false; error: string };

export async function createPlanAction(formData: FormData): Promise<PlanSaveResult> {
  const bearer = await operatorBearer();
  try {
    await adminCreatePlan(bearer, planFromFormData(formData));
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : 'The plan could not be saved' };
  }
  revalidatePath('/admin/plans');
  expirePlans();
  return { ok: true, notified: 0 };
}

export async function updatePlanAction(id: string, formData: FormData): Promise<PlanSaveResult> {
  const bearer = await operatorBearer();
  let notified = 0;
  try {
    const result = await adminUpdatePlan(bearer, id, planFromFormData(formData));
    notified = result.notified;
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : 'The plan could not be saved' };
  }
  revalidatePath('/admin/plans');
  await expireAroundPlan(bearer, id);
  return { ok: true, notified };
}

export type PlanDeleteResult =
  | { ok: true }
  | { ok: false; conflict: DeletePlanConflict }
  | { ok: false; error: string };

/**
 * A refusal is the expected answer: deleting a plan releases its businesses to
 * `plan_id = NULL`, which means unlimited. The caller shows who is in the way and offers
 * to retire the plan instead.
 */
export async function deletePlanAction(id: string): Promise<PlanDeleteResult> {
  const bearer = await operatorBearer();
  let conflict: DeletePlanConflict | undefined;
  try {
    // 204 answers `undefined`; a refusal answers the 409 body, which is the row list.
    conflict = await adminDeletePlan(bearer, id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409 && Array.isArray((err.body as DeletePlanConflict)?.businesses)) {
      conflict = err.body as DeletePlanConflict;
    } else {
      return { ok: false, error: err instanceof ApiError ? err.message : 'The plan could not be deleted' };
    }
  }
  if (conflict) return { ok: false, conflict };
  revalidatePath('/admin/plans');
  expirePlans();
  return { ok: true };
}

export type AssignResult = { ok: true } | { ok: false; error: string };

/** `null` revokes the plan: the business goes back to unlimited replies. */
export async function assignPlanAction(businessId: string, planId: string | null): Promise<AssignResult> {
  const bearer = await operatorBearer();
  try {
    await adminAssignPlan(bearer, businessId, planId);
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : 'The plan could not be assigned' };
  }
  revalidatePath('/admin/plans');
  expirePlans([businessId]);
  return { ok: true };
}

/** The manual top-up: zero this business's counters for the current cycle. */
export async function resetCycleAction(businessId: string): Promise<AssignResult> {
  const bearer = await operatorBearer();
  try {
    await adminResetCycle(bearer, businessId);
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : 'The cycle could not be reset' };
  }
  revalidatePath('/admin/plans');
  expirePlans([businessId]);
  return { ok: true };
}

export async function retirePlanAction(id: string): Promise<PlanSaveResult> {
  const bearer = await operatorBearer();
  let notified = 0;
  try {
    const result = await adminUpdatePlan(bearer, id, { active: false });
    notified = result.notified;
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : 'The plan could not be retired' };
  }
  revalidatePath('/admin/plans');
  await expireAroundPlan(bearer, id);
  return { ok: true, notified };
}
