import { z } from '@hono/zod-openapi';

const rate = z.number().min(0).max(100_000);

export const modelBillingSchema = z
  .object({
    provider: z.string(),
    model: z.string(),
    inputUsdPerMillion: rate,
    outputUsdPerMillion: rate,
    cachedInputUsdPerMillion: rate,
    updatedAt: z.string(),
  })
  .openapi('ModelBilling');

export const updateModelBillingInputSchema = z
  .object({
    provider: z.string().min(1).max(50),
    model: z.string().min(1).max(100),
    inputUsdPerMillion: rate,
    outputUsdPerMillion: rate,
    cachedInputUsdPerMillion: rate,
  })
  .openapi('UpdateModelBillingInput');

export type ModelBilling = z.infer<typeof modelBillingSchema>;
export type UpdateModelBillingInput = z.infer<typeof updateModelBillingInputSchema>;
