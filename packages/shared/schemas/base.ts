import { z } from '@hono/zod-openapi';

export const uuidSchema = z.string().uuid().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' });
export const timestampSchema = z.string().datetime().or(z.coerce.date().transform((d) => d.toISOString()));

export const platformSchema = z.enum(['facebook', 'instagram', 'whatsapp', 'telegram', 'twitter']);
export const orderStateSchema = z.enum(['pending', 'acknowledged', 'onDelivery', 'done']);
export const messageFromSchema = z.enum(['self', 'customer']);
export const messageStateSchema = z.enum(['pending', 'working', 'done']);
/** Mirrors the pgEnum 'plan_actor_kind' — who moved a business onto or off a plan. */
export const planActorKindSchema = z.enum(['operator', 'merchant', 'system']);
/** The two lines a budget crosses, named by the threshold rather than by the budget. */
export const quotaThresholdSchema = z.enum(['quota_80', 'quota_100']);
/**
 * Closed at the wire, open in the column: notifications.kind is a varchar(40) so a new
 * notice is one INSERT away instead of a migration, but nothing outside this list may be sent.
 *
 * The budget is part of the key, not just the threshold, because messenger and comment
 * allowances run out on their own schedule. `(business, kind, period)` is what makes a bell
 * ring once per cycle, so a kind of plain `quota_100` would let the first budget to expire
 * swallow the other one's notice for the whole cycle — the merchant would read "your
 * messenger replies are used up" while the agent had also gone quiet on comments.
 */
export const notificationKindSchema = z.enum([
  'message_quota_80',
  'message_quota_100',
  'comment_quota_80',
  'comment_quota_100',
  // Written before the budget was part of the key. Readers still accept them, writers
  // never produce them: dropping these would fail validation on rows that already exist,
  // and a notifications page that cannot parse its own history is worse than a stale label.
  'quota_80',
  'quota_100',
]);

export const errorSchema = z.object({
  error: z.string(),
}).openapi('Error');

export const successSchema = z.object({
  success: z.boolean(),
}).openapi('Success');

export type PlanActorKind = z.infer<typeof planActorKindSchema>;
