import { z } from '@hono/zod-openapi';
import { SUBAGENT_KEYS } from '@shared/prompts/subagent';
import { timestampSchema } from '@shared/schemas/base';

/** A hidden helper agent whose instructions the operator console edits. */
export const subagentKeySchema = z.enum(SUBAGENT_KEYS);

export const subagentSchema = z.object({
  key: subagentKeySchema,
  name: z.string(),
  description: z.string(),
  /** What a run reads today. */
  systemPrompt: z.string(),
  /** The reviewed text this key was seeded from, so the console can offer a restore. */
  defaultPrompt: z.string(),
  /** True while the row still carries the reviewed text untouched. */
  isDefault: z.boolean(),
  updatedAt: timestampSchema,
});

export const subagentListSchema = z.object({
  subagents: z.array(subagentSchema),
});

export const updateSubagentPromptInputSchema = z.object({
  // The helper's whole brief is a few hundred characters in practice; the cap is a paste guard, not
  // a target. Empty is a real answer here (a broken prompt must be replaceable), but not a valid one.
  systemPrompt: z.string().min(1).max(20_000),
});

/** One playground run of the product-answer writer against a real catalog row. */
export const productInfoPreviewInputSchema = z.object({
  productId: z.string().uuid(),
  userQuery: z.string().min(1).max(1_000),
  /** The editor's current text, so an unsaved draft can be tried before it is saved. */
  systemPrompt: z.string().min(1).max(20_000).optional(),
});

export const productInfoPreviewSchema = z.object({
  answer: z.string(),
  /** Which prompt actually ran: the draft the browser sent, or the stored one. */
  usedStoredPrompt: z.boolean(),
  provider: z.string(),
  model: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
  cacheHitTokens: z.number(),
  estimatedCostUsd: z.number(),
  latencyMs: z.number(),
});

export type Subagent = z.infer<typeof subagentSchema>;
export type ProductInfoPreview = z.infer<typeof productInfoPreviewSchema>;
