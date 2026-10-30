import { eq } from 'drizzle-orm';
import { db } from '@db/client';
import { modelBilling } from '@db/schema';
import type { UpdateModelBillingInput } from '@repo/shared';

export type ModelBillingRow = typeof modelBilling.$inferSelect;

export type TokenPrice = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
};

/** The stored decimals, in the numbers a cost calculation can use. */
export function ratesOf(row: ModelBillingRow): TokenPrice {
  return {
    inputUsdPerMillion: Number(row.inputUsdPerMillion),
    outputUsdPerMillion: Number(row.outputUsdPerMillion),
    cachedInputUsdPerMillion: Number(row.cachedInputUsdPerMillion),
  };
}

/**
 * Cache reads are a subset of input tokens, not an addition: `inputTokens` already counts
 * them. A negative or over-reported cache count is clamped so one bad usage row cannot make
 * a run cost less than zero.
 */
export function tokenCostUsd(
  tokens: { inputTokens: number; outputTokens: number; cacheHitTokens: number },
  rates: TokenPrice,
): number {
  const input = Math.max(0, tokens.inputTokens);
  const cached = Math.min(Math.max(0, tokens.cacheHitTokens), input);
  const uncached = input - cached;
  const output = Math.max(0, tokens.outputTokens);
  const cost =
    (uncached * rates.inputUsdPerMillion +
      cached * rates.cachedInputUsdPerMillion +
      output * rates.outputUsdPerMillion) /
    1_000_000;
  return Number(cost.toFixed(6));
}

/** One row, get-or-created with the defaults the column definitions carry. */
export async function getModelBilling(): Promise<ModelBillingRow> {
  const [existing] = await db.select().from(modelBilling).limit(1);
  if (existing) return existing;

  const [created] = await db.insert(modelBilling).values({}).onConflictDoNothing().returning();
  if (created) return created;

  const [row] = await db.select().from(modelBilling).limit(1);
  if (!row) throw new Error('model billing row could not be created');
  return row;
}

export async function updateModelBilling(input: UpdateModelBillingInput): Promise<ModelBillingRow> {
  const current = await getModelBilling();
  const [updated] = await db
    .update(modelBilling)
    .set({
      provider: input.provider,
      model: input.model,
      inputUsdPerMillion: input.inputUsdPerMillion.toFixed(6),
      outputUsdPerMillion: input.outputUsdPerMillion.toFixed(6),
      cachedInputUsdPerMillion: input.cachedInputUsdPerMillion.toFixed(6),
      updatedAt: new Date(),
    })
    .where(eq(modelBilling.id, current.id))
    .returning();
  return updated ?? current;
}
