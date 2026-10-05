import { z } from '@hono/zod-openapi';

export const uuidSchema = z.string().uuid().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' });
export const timestampSchema = z.string().datetime().or(z.coerce.date().transform((d) => d.toISOString()));

export const platformSchema = z.enum(['facebook', 'instagram', 'whatsapp', 'telegram', 'twitter']);
export const orderStateSchema = z.enum(['pending', 'acknowledged', 'onDelivery', 'done']);
export const messageFromSchema = z.enum(['self', 'customer']);
export const messageStateSchema = z.enum(['pending', 'working', 'done']);
/** Mirrors the pgEnum 'plan_actor_kind' — who moved a business onto or off a plan. */
export const planActorKindSchema = z.enum(['operator', 'merchant', 'system']);
/** Closed at the wire, open in the column: notifications.kind is a varchar(40) so a
 *  new notice does not need a migration, but nothing outside this list may be sent. */
export const notificationKindSchema = z.enum(['quota_80', 'quota_100']);

export const errorSchema = z.object({
  error: z.string(),
}).openapi('Error');

export const successSchema = z.object({
  success: z.boolean(),
}).openapi('Success');

export type PlanActorKind = z.infer<typeof planActorKindSchema>;
