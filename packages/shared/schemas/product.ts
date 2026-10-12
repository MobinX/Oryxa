import { z } from '@hono/zod-openapi';
import { timestampSchema, uuidSchema } from '@shared/schemas/base';

export const baseProductSchema = z.object({
  businessId: uuidSchema,
  categoryId: uuidSchema.nullable().optional(),
  customerId: uuidSchema.nullable().optional(),
  name: z.string().min(1).max(255).openapi({ example: 'Premium Cotton T-Shirt' }),
  price: z.coerce.number().positive().openapi({ example: 29.99 }),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  sku: z.string().max(100).openapi({ example: 'TS-COT-001' }),
  description: z.string().optional(),
}).openapi('Product');

export const baseVariantSchema = z.object({
  productId: uuidSchema,
  name: z.string().min(1).max(255).openapi({ example: 'Red XL' }),
  imageUrl: z.string().min(1).optional().openapi({
    description: 'B2 object key (private bucket) or legacy public URL',
    example: 'businesses/uuid/images/photo.png',
  }),
  /**
   * The whole photo set, first shot first. `imageUrl` is the cover and is kept in step with
   * the first entry, so a reader that only ever shows one image does not have to know this
   * field exists.
   */
  imageUrls: z.array(z.string().min(1)).max(10).optional().openapi({
    description: 'B2 object keys (private bucket) or legacy public URLs, in display order',
    example: ['businesses/uuid/images/photo.png', 'businesses/uuid/images/side.png'],
  }),
  price: z.coerce.number().positive().optional(),
  stock: z.number().int().min(0).default(0),
  isAvailable: z.boolean().default(true),
  rating: z.coerce.number().min(0).max(5).optional(),
}).openapi('Variant');

export const variantInputSchema = baseVariantSchema
  .omit({ productId: true })
  .extend({
    /**
     * The short label to keep for this variant, sent by a form that already stamped it on the
     * pictures. Only a suggestion: the catalog hands out a freshly rolled label instead when this
     * business already uses it.
     */
    variantId: z.string().regex(/^[A-Z0-9]{5}$/).optional(),
  });

export const insertProductSchema = baseProductSchema.omit({ slug: true });

export const createProductInputSchema = insertProductSchema.extend({
  categoryName: z.string().optional(),
  variants: z.array(variantInputSchema).default([]),
});

export const createProductBodySchema = createProductInputSchema.omit({ businessId: true });

export const selectProductSchema = baseProductSchema.extend({
  id: uuidSchema,
  createdAt: timestampSchema,
});

export const createProductOutputSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  variantCount: z.number().int(),
});

export const variantOutputSchema = baseVariantSchema.extend({
  id: uuidSchema,
  /**
   * The short label this variant is read by — three letters and two digits, unique inside the
   * business and nowhere else. Null on a row that predates labels.
   */
  variantId: z
    .string()
    .regex(/^[A-Z0-9]{5}$/)
    .nullable()
    .optional(),
  imageKey: z.string().nullable().optional(),
  /** The stored keys behind `imageUrls`, so a form can resubmit the pictures it did not change. */
  imageKeys: z.array(z.string()).optional(),
});

export const getProductByIdOutputSchema = selectProductSchema.extend({
  category: z.object({ id: uuidSchema, name: z.string() }).nullable(),
  customer: z.object({ id: uuidSchema, name: z.string() }).nullable(),
  variants: z.array(variantOutputSchema),
});

export const listProductsQuerySchema = z.object({
  categoryId: uuidSchema.optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const listProductItemSchema = selectProductSchema.extend({
  categoryName: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  variantCount: z.number().int().optional(),
  thumbnailUrl: z.string().nullable().optional(),
});

export const listProductsOutputSchema = z.object({
  products: z.array(listProductItemSchema),
  totalCount: z.number().int(),
});

export const updateVariantInputSchema = variantInputSchema.extend({
  id: uuidSchema.optional(),
  /** When true, clears any existing variant image (overrides imageUrl). */
  clearImage: z.boolean().optional(),
});

export const updateProductInputSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  price: z.coerce.number().positive().optional(),
  sku: z.string().max(100).optional(),
  description: z.string().optional(),
  categoryId: uuidSchema.optional(),
  categoryName: z.string().min(1).max(255).optional(),
  customerId: uuidSchema.nullable().optional(),
  variants: z.array(updateVariantInputSchema).optional(),
});

export const updateProductOutputSchema = z.object({ updated: z.boolean() });
export const deleteProductOutputSchema = z.object({ deleted: z.boolean() });

export const createCategoryInputSchema = z.object({
  name: z.string().min(1).max(255),
});

export const updateCategoryInputSchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

export const selectCategorySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  productCount: z.number().int().optional(),
});

export const deleteCategoryOutputSchema = z.object({ deleted: z.boolean() });
