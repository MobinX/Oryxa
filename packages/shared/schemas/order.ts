import { z } from '@hono/zod-openapi';
import { orderStateSchema, timestampSchema, uuidSchema } from './base';

export const createOrderInputSchema = z.object({
  businessId: uuidSchema,
  productId: uuidSchema,
  variantId: uuidSchema.optional(),
  count: z.number().int().positive().default(1),
  customerName: z.string().min(1).max(255),
  customerPhone: z.string().max(20).optional(),
  customerAddress: z.string().optional(),
  conversationId: uuidSchema.optional(),
});

export const createOrderBodySchema = createOrderInputSchema.omit({ businessId: true });

export const createOrderOutputSchema = z.object({
  id: uuidSchema,
  totalPrice: z.number(),
  state: orderStateSchema,
});

export const listOrdersQuerySchema = z.object({
  state: orderStateSchema.optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const orderListItemSchema = z.object({
  id: uuidSchema,
  customerName: z.string(),
  totalPrice: z.number(),
  state: orderStateSchema,
  createdAt: timestampSchema,
});

export const updateOrderStateInputSchema = z.object({
  state: orderStateSchema,
});

export const updateOrderStateOutputSchema = z.object({
  id: uuidSchema,
  newState: orderStateSchema,
});
