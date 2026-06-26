import { z } from '@hono/zod-openapi';
import { orderStateSchema, timestampSchema, uuidSchema } from '@shared/schemas/base';

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

export const updateOrderInputSchema = z.object({
  count: z.number().int().positive().optional(),
  customerName: z.string().min(1).max(255).optional(),
  customerPhone: z.string().max(20).nullable().optional(),
  customerAddress: z.string().nullable().optional(),
  state: orderStateSchema.optional(),
});

export const updateOrderOutputSchema = z.object({
  id: uuidSchema,
  updated: z.boolean(),
});

export const deleteOrderOutputSchema = z.object({ deleted: z.boolean() });

export const getOrderOutputSchema = z.object({
  id: uuidSchema,
  businessId: uuidSchema,
  productId: uuidSchema.nullable(),
  variantId: uuidSchema.nullable(),
  count: z.number().int(),
  variantPrice: z.number(),
  customerName: z.string(),
  customerPhone: z.string().nullable().optional(),
  customerAddress: z.string().nullable().optional(),
  state: orderStateSchema,
  totalPrice: z.number(),
  conversationId: uuidSchema.nullable().optional(),
  createdAt: timestampSchema,
});
