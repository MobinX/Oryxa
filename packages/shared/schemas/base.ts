import { z } from '@hono/zod-openapi';

export const uuidSchema = z.string().uuid().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' });
export const timestampSchema = z.string().datetime().or(z.coerce.date().transform((d) => d.toISOString()));

export const platformSchema = z.enum(['facebook', 'instagram', 'whatsapp', 'telegram', 'twitter']);
export const orderStateSchema = z.enum(['pending', 'acknowledged', 'onDelivery', 'done']);
export const messageFromSchema = z.enum(['self', 'customer']);
export const messageStateSchema = z.enum(['pending', 'working', 'done']);

export const errorSchema = z.object({
  error: z.string(),
}).openapi('Error');

export const successSchema = z.object({
  success: z.boolean(),
}).openapi('Success');
