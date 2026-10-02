import { z } from '@hono/zod-openapi';
import { uuidSchema } from '@shared/schemas/base';

export const publicStoreProductSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  price: z.number(),
  description: z.string().nullable().optional(),
  categoryName: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  variants: z.array(
    z.object({
      id: uuidSchema,
      name: z.string(),
      price: z.number().nullable().optional(),
      stock: z.number().int(),
      isAvailable: z.boolean(),
      imageUrl: z.string().nullable().optional(),
    }),
  ).default([]),
}).openapi('PublicStoreProduct');

export const publicStoreSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  products: z.array(publicStoreProductSchema),
}).openapi('PublicStore');
