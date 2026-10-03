import { z } from '@hono/zod-openapi';
import { uuidSchema } from '@shared/schemas/base';

export const storeThemeSchema = z.object({
  accentColor: z.string().max(32).optional(),
  font: z.enum(['sans', 'serif', 'mono']).optional(),
  tagline: z.string().max(280).optional(),
  heroImageUrl: z.string().max(1000).optional(),
  logoUrl: z.string().max(1000).optional(),
  layout: z.enum(['grid', 'featured']).optional(),
}).partial();

export const publicStoreVariantSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  price: z.number().nullable().optional(),
  stock: z.number().int(),
  isAvailable: z.boolean(),
  imageUrl: z.string().nullable().optional(),
});

export const publicStoreProductSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  price: z.number(),
  description: z.string().nullable().optional(),
  categoryName: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  inStock: z.boolean().default(true),
  variants: z.array(publicStoreVariantSchema).default([]),
}).openapi('PublicStoreProduct');

export const publicStoreSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  theme: storeThemeSchema.nullable().optional(),
  categories: z.array(z.string()).default([]),
  products: z.array(publicStoreProductSchema),
}).openapi('PublicStore');

export const storeProductsQuerySchema = z.object({
  q: z.string().max(120).optional(),
  category: z.string().max(120).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
  min: z.coerce.number().min(0).optional(),
  max: z.coerce.number().min(0).optional(),
});

export const checkoutItemSchema = z.object({
  productId: uuidSchema,
  variantId: uuidSchema.optional(),
  quantity: z.number().int().positive().max(999).default(1),
});

export const checkoutInputSchema = z.object({
  customerName: z.string().min(1).max(255),
  customerPhone: z.string().max(20).optional(),
  customerAddress: z.string().max(1000).optional(),
  items: z.array(checkoutItemSchema).min(1).max(50),
}).openapi('CheckoutInput');

export const checkoutOutputSchema = z.object({
  orderIds: z.array(uuidSchema),
  total: z.number(),
  status: z.literal('pending'),
}).openapi('CheckoutOutput');
