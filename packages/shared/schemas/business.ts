import { z } from '@hono/zod-openapi';
import { timestampSchema, uuidSchema } from '@shared/schemas/base';
import { storeThemeSchema } from '@shared/schemas/store';

export const createBusinessInputSchema = z.object({
  name: z.string().min(1).max(255).openapi({ example: 'Acme Store' }),
  description: z.string().optional(),
  employeeCount: z.number().int().positive().optional(),
  type: z.string().max(100).optional(),
  hasTradeLicense: z.boolean().default(false),
  hasTaxLicense: z.boolean().default(false),
  phone: z.string().max(20).optional(),
  facebookPageLink: z.string().max(500).optional(),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,253}[a-z0-9]$/, 'lowercase letters, numbers and hyphens').optional(),
  storePublished: z.boolean().optional(),
  storeTheme: storeThemeSchema.nullable().optional(),
}).openapi('CreateBusinessInput');

export const updateBusinessInputSchema = createBusinessInputSchema.partial();

export const selectBusinessSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  name: z.string(),
  slug: z.string().nullable().optional(),
  storePublished: z.boolean().default(false),
  storeTheme: storeThemeSchema.nullable().optional(),
  description: z.string().nullable().optional(),
  employeeCount: z.number().nullable().optional(),
  type: z.string().nullable().optional(),
  foundedDate: timestampSchema.nullable().optional(),
  // has_trade_license / has_tax_license are nullable columns, so the API can
  // return null for a business created before the defaults were added.
  hasTradeLicense: z.boolean().nullable(),
  hasTaxLicense: z.boolean().nullable(),
  facebookPageLink: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  createdAt: timestampSchema,
}).openapi('Business');

export const updateBusinessOutputSchema = z.object({
  success: z.boolean(),
});

export const deleteBusinessOutputSchema = z.object({ deleted: z.boolean() });
