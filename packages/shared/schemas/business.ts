import { z } from '@hono/zod-openapi';
import { timestampSchema, uuidSchema } from './base';

export const createBusinessInputSchema = z.object({
  name: z.string().min(1).max(255).openapi({ example: 'Acme Store' }),
  description: z.string().optional(),
  employeeCount: z.number().int().positive().optional(),
  type: z.string().max(100).optional(),
  hasTradeLicense: z.boolean().default(false),
  hasTaxLicense: z.boolean().default(false),
  phone: z.string().max(20).optional(),
  facebookPageLink: z.string().max(500).optional(),
}).openapi('CreateBusinessInput');

export const updateBusinessInputSchema = createBusinessInputSchema.partial();

export const selectBusinessSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  name: z.string(),
  description: z.string().nullable().optional(),
  employeeCount: z.number().nullable().optional(),
  type: z.string().nullable().optional(),
  foundedDate: timestampSchema.nullable().optional(),
  hasTradeLicense: z.boolean(),
  hasTaxLicense: z.boolean(),
  facebookPageLink: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  createdAt: timestampSchema,
}).openapi('Business');

export const updateBusinessOutputSchema = z.object({
  success: z.boolean(),
});
