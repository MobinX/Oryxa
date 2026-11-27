/**
 * Zero-LLM Fast-Path — deterministic handlers for high-confidence template routes.
 * Runs before Agent instantiation to cut LLM cost on routine turns.
 */

import { spendQuotaUnit, refundQuotaUnit } from '@repo/db/crud/billing';

export interface FastPathContext {
  businessId: string;
  conversationId: string;
  customerPlatformId: string;
  pageToken: string;
  platform?: 'facebook' | 'instagram';
  sendMessage?: (token: string, psid: string, text: string) => Promise<void>;
}

export interface FastPathDecision {
  template_route: string;
  confidence: number;
  sales_stage?: string;
  ui_action?: string;
}

export interface FastPathResult {
  handled: boolean;
  fastPath: boolean;
  totalTokens: number;
  chargedPeriod?: string | null;
}

export async function runFastPath(
  decision: FastPathDecision,
  ctx: FastPathContext
): Promise<FastPathResult> {
  const result: FastPathResult = { handled: false, fastPath: false, totalTokens: 0 };

  if (!decision || decision.template_route === 'needs_llm_closer' || (decision.confidence ?? 0) < 0.9) {
    return result;
  }

  // Quota spend
  let chargedPeriod: string | null = null;
  try {
    const budget = await spendQuotaUnit(ctx.businessId, 'message');
    if (budget.spent) chargedPeriod = budget.period;
    else return result; // no quota, fall through
  } catch {
    // fail open
  }

  try {
    // Deterministic handlers would go here per template_route.
    // For now, mark handled only for known routes.
    const handledRoutes = new Set([
      'greeting_with_categories',
      'show_category_products',
      'show_delivery_charges',
      'show_payment_methods',
      'show_order_status',
    ]);
    if (handledRoutes.has(decision.template_route)) {
      result.handled = true;
      result.fastPath = true;
    }
  } catch (err) {
    if (chargedPeriod) {
      try { await refundQuotaUnit(ctx.businessId, 'message', chargedPeriod); } catch { /* ignore */ }
    }
    throw err;
  }

  if (!result.handled && chargedPeriod) {
    try { await refundQuotaUnit(ctx.businessId, 'message', chargedPeriod); } catch { /* ignore */ }
    chargedPeriod = null;
  }

  result.chargedPeriod = chargedPeriod;
  return result;
}

export const executeFastPath = runFastPath;
export const fastPath = runFastPath;
