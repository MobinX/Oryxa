import { z } from '@hono/zod-openapi';
import { notificationKindSchema, uuidSchema } from '@shared/schemas/base';
import { planSchema } from '@shared/schemas/plan';

/** The two budgets. Messenger replies spend `message`, comment replies spend `comment`. */
export const quotaKindSchema = z.enum(['message', 'comment']).openapi('QuotaKind');

/**
 * A business's 30-day cycle. `period` is the key the counters are stored under — the UTC
 * date this cycle began, as a string, computed in Node rather than by SQL date maths so
 * Neon and PGlite cannot disagree about where a boundary falls.
 */
export const quotaCycleSchema = z.object({
  period: z.string().length(10).openapi({ description: "Cycle key, 'YYYY-MM-DD' (UTC)." }),
  startedAt: z.string().length(10),
  resetsAt: z.string().length(10).openapi({ description: 'The day the counters roll to zero — derived, not scheduled.' }),
  daysLeft: z.number().int().min(0).max(30),
}).openapi('QuotaCycle');

const limitSchema = z.number().int().nonnegative().nullable();

/**
 * The gate's whole input. `messageBlocked` is the only field the webhook needs; the rest
 * exist so the merchant's own pages read the same numbers the agent was shown.
 */
export const quotaStatusSchema = z.object({
  /** False when no plan is assigned — which means unlimited, not zero. */
  assigned: z.boolean(),
  planId: uuidSchema.nullable(),
  planName: z.string().nullable(),
  cycle: quotaCycleSchema,
  messageLimit: limitSchema.openapi({ description: 'null = uncapped, 0 = no replies allowed.' }),
  commentLimit: limitSchema,
  messagesUsed: z.number().int().nonnegative(),
  commentsUsed: z.number().int().nonnegative(),
  messageBlocked: z.boolean().openapi({ description: 'True only when a live plan caps this budget and the cap is reached.' }),
  commentBlocked: z.boolean(),
}).openapi('QuotaStatus');

export const billingOverviewSchema = z.object({
  businessId: uuidSchema,
  quota: quotaStatusSchema,
  /** The plan this business is on right now, or null when the operator revoked it. */
  plan: planSchema.nullable(),
  /** Every plan the merchant may choose, in display order. */
  options: z.array(planSchema),
}).openapi('BillingOverview');

export const notificationItemSchema = z.object({
  id: uuidSchema,
  kind: notificationKindSchema,
  period: z.string().nullable(),
  title: z.string(),
  body: z.string(),
  link: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
}).openapi('NotificationItem');

export const notificationListResponseSchema = z.object({
  notifications: z.array(notificationItemSchema),
  unreadCount: z.number().int().nonnegative(),
}).openapi('NotificationListResponse');

/**
 * Either ids or `all`. Enforced in the handler rather than by `.refine()`: a refined
 * schema cannot carry an `.openapi()` name, and this contract must stay registrable.
 */
export const markNotificationsReadInputSchema = z.object({
  ids: z.array(uuidSchema).min(1).optional(),
  all: z.boolean().optional(),
}).openapi('MarkNotificationsReadInput');

export const markNotificationsReadOutputSchema = z.object({
  updated: z.number().int().nonnegative(),
}).openapi('MarkNotificationsReadOutput');

export type QuotaKind = z.infer<typeof quotaKindSchema>;
export type QuotaCycle = z.infer<typeof quotaCycleSchema>;
export type QuotaStatus = z.infer<typeof quotaStatusSchema>;
export type BillingOverview = z.infer<typeof billingOverviewSchema>;
export type NotificationItem = z.infer<typeof notificationItemSchema>;
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;
export type NotificationKind = z.infer<typeof notificationKindSchema>;
