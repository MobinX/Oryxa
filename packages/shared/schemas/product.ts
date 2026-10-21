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
  /** The merchant marking the default price down; the percent is what comes off it. */
  hasDiscount: z.boolean().default(false),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  showInStorefront: z.boolean().default(true),
}).openapi('Product');

/** One knob a product is sold in — "Color", "Size" — and the values it may take. */
export const productOptionInputSchema = z.object({
  name: z.string().min(1).max(80),
  values: z.array(z.string().min(1).max(80)).min(1).max(50),
}).openapi('ProductOption');

/** What one variant is, read off the product's options: `{"Color":"Red","Size":"XL"}`. */
export const variantOptionsSchema = z.record(z.string().min(1), z.string().min(1));

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
    /** The combination this variant is. Required (complete and allowed) whenever the product declares options. */
    options: variantOptionsSchema.optional(),
  });

export const insertProductSchema = baseProductSchema.omit({ slug: true });

export const createProductInputSchema = insertProductSchema.extend({
  categoryName: z.string().optional(),
  /** A slug the merchant typed; the name is folded into one when they did not. */
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  /** At most three knobs — Color, Size, Material — declared for this product. */
  options: z.array(productOptionInputSchema).max(3).default([]),
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
  options: variantOptionsSchema.optional(),
});

export const productOptionOutputSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  position: z.number().int(),
  values: z.array(z.object({ id: uuidSchema, value: z.string(), position: z.number().int() })),
});

export const getProductByIdOutputSchema = selectProductSchema.extend({
  category: z.object({ id: uuidSchema, name: z.string() }).nullable(),
  customer: z.object({ id: uuidSchema, name: z.string() }).nullable(),
  variants: z.array(variantOutputSchema),
  options: z.array(productOptionOutputSchema).optional(),
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
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  hasDiscount: z.boolean().optional(),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  showInStorefront: z.boolean().optional(),
  /** Present means replace the product's options wholesale; absent leaves them alone. */
  options: z.array(productOptionInputSchema).max(3).optional(),
  variants: z.array(updateVariantInputSchema).optional(),
});

export const updateProductOutputSchema = z.object({ updated: z.boolean() });
export const deleteProductOutputSchema = z.object({ deleted: z.boolean() });

/**
 * One product arriving from a browser-side catalog import (e.g. a Shopify CSV). Images were
 * already pushed to B2 by the browser; only the object keys cross the wire.
 */
export const bulkImportProductSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(100000).optional(),
  price: z.coerce.number().min(0).optional(),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  sku: z.string().max(100).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  showInStorefront: z.boolean().default(true),
  /** A shelf to find or create for this business, e.g. the CSV's product type. */
  categoryName: z.string().min(1).max(255).optional(),
  /** Percent off the listed price; zero means no discount. */
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  variants: z.array(variantInputSchema).min(1).max(100).default([]),
});

export type BulkImportProduct = z.infer<typeof bulkImportProductSchema>;

export const bulkCreateProductsBodySchema = z.object({
  products: z.array(bulkImportProductSchema).min(1).max(25),
});

export const bulkCreateProductsOutputSchema = z.object({
  created: z.array(
    z.object({
      id: uuidSchema,
      name: z.string(),
      slug: z.string(),
      variantLabels: z.array(z.string()),
    }),
  ),
  failed: z.array(
    z.object({ name: z.string(), slug: z.string().nullable(), error: z.string() }),
  ),
  /** Labels the import wanted but the business already hands out — re-rolled server-side. */
  relabeledCount: z.number().int(),
});

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
