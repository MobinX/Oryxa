import { z } from '@hono/zod-openapi';
import { orderStateSchema, timestampSchema, uuidSchema } from '@shared/schemas/base';

export const createOrderInputSchema = z.object({
  businessId: uuidSchema,
  productId: uuidSchema,
  variantId: uuidSchema.optional(),
  count: z.number().int().positive().max(999).default(1),
  customerName: z.string().min(1).max(255),
  customerPhone: z.string().max(20).optional(),
  customerAddress: z.string().optional(),
  /**
   * What delivery adds on top of the items, as quoted to the buyer before they confirmed. Absent
   * means nobody quoted one, and the confirmation card simply says nothing about shipping.
   */
  shippingCost: z.number().min(0).optional(),
  /** In the buyer's own words — "Cash on delivery", "bKash" — not a code, so the card reads as speech. */
  paymentMethod: z.string().min(1).max(40).optional(),
  conversationId: uuidSchema.optional(),
  /**
   * The Messenger id of the buyer, so their own order history is findable later. Optional because an
   * order can arrive from the dashboard or a comment, where nobody has a page-scoped id at hand.
   */
  customerPlatformId: z.string().max(120).optional(),
});

export const createOrderBodySchema = createOrderInputSchema.omit({ businessId: true });

export const createOrderOutputSchema = z.object({
  id: uuidSchema,
  totalPrice: z.number(),
  shippingCost: z.number().optional(),
  paymentMethod: z.string().nullable().optional(),
  state: orderStateSchema,
  /** The card this order matched by phone; null when the buyer gave no number to match. */
  customerId: uuidSchema.nullable(),
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
  /** The card the order now points at, which changes when the number on it is retyped. */
  customerId: uuidSchema.nullable(),
  previousCustomerId: uuidSchema.nullable(),
});

export const deleteOrderOutputSchema = z.object({ deleted: z.boolean() });

export const getOrderOutputSchema = z.object({
  id: uuidSchema,
  businessId: uuidSchema,
  productId: uuidSchema.nullable(),
  variantId: uuidSchema.nullable(),
  productName: z.string().nullable().optional(),
  variantName: z.string().nullable().optional(),
  variantImageUrl: z.string().nullable().optional(),
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
