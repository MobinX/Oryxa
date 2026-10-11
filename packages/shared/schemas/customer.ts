import { z } from '@hono/zod-openapi';
import { orderStateSchema, timestampSchema, uuidSchema } from '@shared/schemas/base';

export const createCustomerInputSchema = z.object({
  name: z.string().min(1).max(255).openapi({ example: 'John Doe' }),
  phone: z.string().max(20).optional(),
  email: z.string().email().max(255).optional(),
  address: z.string().optional(),
  avatar: z.string().max(500).optional(),
}).openapi('CreateCustomerInput');

export const updateCustomerInputSchema = createCustomerInputSchema.partial();

export const selectCustomerSchema = z.object({
  id: uuidSchema,
  companyId: uuidSchema,
  name: z.string(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  createdAt: timestampSchema,
}).openapi('Customer');

export const listCustomersOutputSchema = z.object({
  customers: z.array(selectCustomerSchema),
  totalCount: z.number().int(),
});

export const listCustomersQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * One order under a customer's card, named with the store it was placed against: a
 * company runs several, and the same person buying from two of them is the whole point
 * of keeping a card instead of a name per order.
 */
export const customerOrderSchema = z.object({
  id: uuidSchema,
  businessId: uuidSchema,
  storeName: z.string(),
  productId: uuidSchema.nullable(),
  productName: z.string().nullable(),
  variantName: z.string().nullable(),
  count: z.number().int(),
  unitPrice: z.number(),
  totalPrice: z.number(),
  state: orderStateSchema,
  createdAt: timestampSchema,
}).openapi('CustomerOrder');

/** The same product folded across every order it appears in — two of these is a habit. */
export const customerPurchaseSchema = z.object({
  productId: uuidSchema,
  productName: z.string(),
  orders: z.number().int(),
  units: z.number().int(),
  spent: z.number(),
  firstOrderedAt: timestampSchema,
  lastOrderedAt: timestampSchema,
}).openapi('CustomerPurchase');

export const customerHistoryOutputSchema = z.object({
  customer: selectCustomerSchema,
  orders: z.array(customerOrderSchema),
  purchases: z.array(customerPurchaseSchema),
  stats: z.object({
    orders: z.number().int(),
    units: z.number().int(),
    spent: z.number(),
    firstOrderedAt: timestampSchema.nullable(),
    lastOrderedAt: timestampSchema.nullable(),
  }),
}).openapi('CustomerHistory');
