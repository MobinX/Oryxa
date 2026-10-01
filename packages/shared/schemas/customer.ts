import { z } from '@hono/zod-openapi';
import { timestampSchema, uuidSchema } from '@shared/schemas/base';

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
