import { z } from '@hono/zod-openapi';
import { planActorKindSchema, timestampSchema, uuidSchema } from '@shared/schemas/base';

/**
 * One allowance. NULL and 0 are different things and always have been:
 * NULL = uncapped (Enterprise), 0 = no replies allowed (the operator's pause switch).
 */
const limitSchema = z.number().int().nonnegative().nullable().openapi({
  description: 'Replies allowed per 30-day cycle. null means uncapped; 0 means none at all.',
});

const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/, 'lowercase letters, numbers and hyphens');

export const planFeaturesSchema = z.array(z.string().max(200)).max(20);

/** What /pricing may show. Never an id: public pricing must not hand out assignable uuids. */
export const publicPlanSchema = z.object({
  name: z.string(),
  slug: slugSchema,
  priceCents: z.number().int().nonnegative(),
  currency: z.string(),
  /** Formatted server-side so no client has to re-implement the NULL-vs-0 rule. */
  priceLabel: z.string(),
  messageLimitLabel: z.string(),
  commentLimitLabel: z.string(),
  features: planFeaturesSchema,
}).openapi('PublicPlan');

export const planSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: slugSchema,
  priceCents: z.number().int().nonnegative(),
  currency: z.string(),
  messageLimit: limitSchema,
  commentLimit: limitSchema,
  features: planFeaturesSchema,
  position: z.number().int(),
  active: z.boolean(),
}).openapi('Plan');

/** An admin row: the plan plus how much blast radius an edit to it has. */
export const adminPlanRowSchema = planSchema.extend({
  businessCount: z.number().int().nonnegative().openapi({
    description: 'Live businesses whose allowance changes the moment this row is saved.',
  }),
}).openapi('AdminPlanRow');

/**
 * What saving a plan did. `notified` is the number of businesses this edit pushed past a
 * threshold: an operator tightening a cap needs to see the blast radius in the response,
 * not discover it when a merchant complains.
 */
export const adminPlanEditResultSchema = z.object({
  plan: adminPlanRowSchema,
  notified: z.number().int().nonnegative(),
}).openapi('AdminPlanEditResult');

/**
 * Why a delete was refused, and who is in the way. Soft-deleting a plan releases its
 * businesses to `plan_id = NULL`, which means unlimited — so deletion would grant
 * allowance. Operators retire plans with `active: false` instead.
 */
export const deletePlanConflictSchema = z.object({
  error: z.string(),
  businesses: z.array(z.object({ id: uuidSchema, name: z.string() })),
}).openapi('DeletePlanConflict');

const planBodySchema = z.object({
  name: z.string().min(1).max(80),
  slug: slugSchema,
  priceCents: z.number().int().nonnegative().default(0),
  currency: z.string().regex(/^[A-Z]{3}$/, 'three-letter currency code').default('USD'),
  messageLimit: limitSchema,
  commentLimit: limitSchema,
  features: planFeaturesSchema.default([]),
  position: z.number().int().default(0),
  active: z.boolean().default(true),
});

export const createPlanInputSchema = planBodySchema.openapi('PlanInput');
export const updatePlanInputSchema = planBodySchema.partial().openapi('UpdatePlanInput');

export const assignPlanInputSchema = z.object({
  planId: uuidSchema.nullable().openapi({
    description: 'null revokes the plan and returns the business to unlimited replies.',
  }),
}).openapi('AssignPlanInput');

export const planAssignmentSchema = z.object({
  id: uuidSchema,
  businessId: uuidSchema,
  planId: uuidSchema.nullable(),
  planName: z.string().nullable(),
  previousPlanId: uuidSchema.nullable(),
  previousPlanName: z.string().nullable(),
  actorKind: planActorKindSchema,
  actorUserId: uuidSchema.nullable(),
  createdAt: timestampSchema,
}).openapi('PlanAssignment');

/** One business as the operator sees it in /admin/plans. */
export const adminBusinessPlanSchema = z.object({
  businessId: uuidSchema,
  businessName: z.string(),
  planId: uuidSchema.nullable(),
  planName: z.string().nullable(),
  /** The 30-day cycle anchor. Never moves when the plan changes, only when it is first set. */
  planStartedAt: timestampSchema.nullable(),
  period: z.string(),
  messagesUsed: z.number().int().nonnegative(),
  commentsUsed: z.number().int().nonnegative(),
  messageLimit: limitSchema,
  commentLimit: limitSchema,
}).openapi('AdminBusinessPlan');

export type PlanFeatures = z.infer<typeof planFeaturesSchema>;
export type PublicPlan = z.infer<typeof publicPlanSchema>;
export type Plan = z.infer<typeof planSchema>;
export type AdminPlanRow = z.infer<typeof adminPlanRowSchema>;
export type AdminPlanEditResult = z.infer<typeof adminPlanEditResultSchema>;
export type DeletePlanConflict = z.infer<typeof deletePlanConflictSchema>;
export type CreatePlanInput = z.infer<typeof createPlanInputSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanInputSchema>;
export type AssignPlanInput = z.infer<typeof assignPlanInputSchema>;
export type PlanAssignment = z.infer<typeof planAssignmentSchema>;
export type AdminBusinessPlan = z.infer<typeof adminBusinessPlanSchema>;
