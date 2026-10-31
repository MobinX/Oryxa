import { z } from '@hono/zod-openapi';
import { timestampSchema, uuidSchema } from '@shared/schemas/base';
import { storeThemeSchema } from '@shared/schemas/store';

export const createBusinessInputSchema = z.object({
  name: z.string().min(1).max(255).openapi({ example: 'Acme Store' }),
  description: z.string().optional(),
  /** Added to the Messenger/Instagram agent prompt: how to answer product questions. */
  agentProductGuidance: z.string().max(4000).nullable().optional(),
  /** Added to the Messenger/Instagram agent prompt: what to do when a customer bargains. */
  agentBargainGuidance: z.string().max(4000).nullable().optional(),
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

export const updateBusinessInputSchema = createBusinessInputSchema.partial().extend({
  /** The business-wide agent kill switch edited from the dashboard. */
  agentState: z.boolean().optional(),
});

export const selectBusinessSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  companyId: uuidSchema.nullable().optional(),
  name: z.string(),
  slug: z.string().nullable().optional(),
  storePublished: z.boolean().default(false),
  storeTheme: storeThemeSchema.nullable().optional(),
  description: z.string().nullable().optional(),
  agentProductGuidance: z.string().nullable().optional(),
  agentBargainGuidance: z.string().nullable().optional(),
  employeeCount: z.number().nullable().optional(),
  type: z.string().nullable().optional(),
  foundedDate: timestampSchema.nullable().optional(),
  // has_trade_license / has_tax_license are nullable columns, so the API can
  // return null for a business created before the defaults were added.
  hasTradeLicense: z.boolean().nullable(),
  hasTaxLicense: z.boolean().nullable(),
  /** False when the merchant turned the answering agent off for the whole business. */
  agentState: z.boolean().default(true),
  facebookPageLink: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  createdAt: timestampSchema,
}).openapi('Business');

export const updateBusinessOutputSchema = z.object({
  success: z.boolean(),
});

export const deleteBusinessOutputSchema = z.object({ deleted: z.boolean() });
