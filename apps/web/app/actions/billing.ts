'use server';

import { revalidatePath } from 'next/cache';
import { expireBilling, expireNotifications } from '@/app/_cache/tags';
import { requireAuth } from '@/lib/auth';
import { ApiError, markNotificationsRead, switchPlan } from '@/lib/api';

export type PlanSwitchResult = { ok: true; planName: string } | { ok: false; error: string };

/**
 * Self-serve, no payment rail: the change applies immediately and money is agreed
 * off-platform, the same way the storefront already settles. A refusal is the server's
 * answer, not a client-side guess — the 409 text is the merchant-readable reason.
 */
export async function switchPlanAction(businessId: string, planId: string): Promise<PlanSwitchResult> {
  const token = await requireAuth();
  try {
    const plan = await switchPlan(token, businessId, planId);
    revalidatePath(`/b/${businessId}/billing`);
    expireBilling(businessId);
    return { ok: true, planName: plan.name };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof ApiError ? err.message : 'The plan could not be changed',
    };
  }
}

export async function markNotificationsReadAction(
  businessId: string,
  input: { ids?: string[]; all?: boolean },
): Promise<{ updated: number }> {
  const token = await requireAuth();
  const result = await markNotificationsRead(token, businessId, input);
  revalidatePath(`/b/${businessId}/notifications`);
  revalidatePath(`/b/${businessId}/dashboard`);
  expireNotifications(businessId);
  return result;
}
