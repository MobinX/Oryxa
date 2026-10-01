import { z } from '@hono/zod-openapi';
import { timestampSchema, uuidSchema } from '@shared/schemas/base';

export const createCompanyInputSchema = z.object({
  name: z.string().min(1).max(255).openapi({ example: 'Acme Group' }),
  description: z.string().optional(),
  phone: z.string().max(20).optional(),
}).openapi('CreateCompanyInput');

export const updateCompanyInputSchema = createCompanyInputSchema.partial();

export const selectCompanySchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  name: z.string(),
  description: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  createdAt: timestampSchema,
}).openapi('Company');

export const listCompaniesOutputSchema = z.object({
  companies: z.array(selectCompanySchema),
  totalCount: z.number().int(),
});

export const assignBusinessInputSchema = z.object({
  businessId: uuidSchema,
});

export const listCompanyBusinessesOutputSchema = z.object({
  businesses: z.array(uuidSchema),
});
