import { z } from '@hono/zod-openapi';
import { uuidSchema } from '@shared/schemas/base';
import { quotaCycleSchema } from '@shared/schemas/billing';

/**
 * Site assistant wire contract. Two doors, one brain:
 * - public: anonymous landing-page visitors, capped per IP per day.
 * - assistant: signed-in merchants, capped per business per 30-day cycle.
 */

/** One turn of client-kept history. The server re-validates every turn. */
export const chatHistoryTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(1000),
}).openapi('ChatHistoryTurn');

/** Landing brand, passed by the widget that already knows it — never invented server-side. */
const brandSchema = z.string().min(1).max(40).openapi({
  description: 'Request brand display name (e.g. from useBrand), echoed back in replies.',
});

const langSchema = z.enum(['en', 'bn']).openapi({ description: 'Reply language.' });

export const publicChatInputSchema = z.object({
  message: z.string().min(1).max(500).openapi({ description: 'The visitor question. 500 chars keeps one turn cheap.' }),
  history: z.array(chatHistoryTurnSchema).max(8).default([]),
  lang: langSchema,
  brand: brandSchema,
}).openapi('PublicChatInput');

export const assistantChatInputSchema = z.object({
  message: z.string().min(1).max(1000),
  history: z.array(chatHistoryTurnSchema).max(10).default([]),
  lang: langSchema,
  brand: brandSchema,
}).openapi('AssistantChatInput');

export const chatReplySchema = z.object({
  reply: z.string().min(1),
  /** Turns left before the cap hits — daily for public, this cycle for assistant. */
  remaining: z.number().int().nonnegative().nullable().openapi({
    description: 'null = uncapped.',
  }),
}).openapi('ChatReply');

export const publicChatReplySchema = chatReplySchema.extend({
  /** UTC date the daily cap resets, so the widget can say "come back tomorrow". */
  resetsAt: z.string().length(10),
}).openapi('PublicChatReply');

/**
 * The assistant gate's whole input. Mirrors QuotaStatus on purpose: one budget,
 * one counter, same 30-day cycle key as the reply caps.
 */
export const assistantQuotaStatusSchema = z.object({
  /** False when no plan is assigned — which means unlimited, not zero. */
  assigned: z.boolean(),
  planId: uuidSchema.nullable(),
  planName: z.string().nullable(),
  cycle: quotaCycleSchema,
  assistantLimit: z.number().int().nonnegative().nullable().openapi({ description: 'null = uncapped, 0 = no chats allowed.' }),
  used: z.number().int().nonnegative(),
  blocked: z.boolean().openapi({ description: 'True only when a live plan caps this budget and the cap is reached.' }),
}).openapi('AssistantQuotaStatus');

export const assistantQuotaResponseSchema = z.object({
  businessId: uuidSchema,
  quota: assistantQuotaStatusSchema,
}).openapi('AssistantQuotaResponse');

export type ChatHistoryTurn = z.infer<typeof chatHistoryTurnSchema>;
export type PublicChatInput = z.infer<typeof publicChatInputSchema>;
export type AssistantChatInput = z.infer<typeof assistantChatInputSchema>;
export type ChatReply = z.infer<typeof chatReplySchema>;
export type PublicChatReply = z.infer<typeof publicChatReplySchema>;
export type AssistantQuotaStatus = z.infer<typeof assistantQuotaStatusSchema>;
export type AssistantQuotaResponse = z.infer<typeof assistantQuotaResponseSchema>;
