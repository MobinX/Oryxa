import { eq, and, desc, sql, or, ilike, isNull } from 'drizzle-orm';
import { db } from '@db/client';
import { products, variants, categories } from '@db/schema';
import { createProductInputSchema, updateProductInputSchema, updateCategoryInputSchema } from '@repo/shared';
import { slugify } from '@repo/utils';
import { resolveStoredImageUrl, isB2ObjectKey } from '@repo/integrations/b2';

async function mapVariantWithSignedImage<T extends { imageUrl: string | null }>(variant: T) {
  return {
    ...variant,
    imageUrl: await resolveStoredImageUrl(variant.imageUrl),
  };
}

export async function createProduct(input: unknown) {
  const parsed = createProductInputSchema.parse(input);

  let categoryId = parsed.categoryId ?? null;
  if (!categoryId && parsed.categoryName) {
    const [cat] = await db
      .insert(categories)
      .values({
        businessId: parsed.businessId,
        name: parsed.categoryName,
        slug: slugify(parsed.categoryName),
      })
      .returning();
    categoryId = cat.id;
  }

  const slug = slugify(parsed.name);
  const [product] = await db
    .insert(products)
    .values({
      businessId: parsed.businessId,
      categoryId,
      name: parsed.name,
      price: parsed.price.toFixed(2),
      slug,
      sku: parsed.sku,
      description: parsed.description,
    })
    .returning();

  if (parsed.variants.length > 0) {
    await db.insert(variants).values(
      parsed.variants.map((v) => ({
        productId: product.id,
        name: v.name,
        imageUrl: v.imageUrl,
        price: v.price?.toFixed(2),
        stock: v.stock,
        isAvailable: v.isAvailable,
        rating: v.rating?.toFixed(2),
      })),
    );
  }

  return {
    id: product.id,
    slug: product.slug,
    variantCount: parsed.variants.length,
  };
}

export async function getProductById(businessId: string, productId: string) {
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.businessId, businessId), isNull(products.deletedAt)),
    with: {
      category: true,
      variants: {
        where: isNull(variants.deletedAt),
      },
    },
  });
  if (!product) return null;

  const mappedVariants = await Promise.all(
    product.variants.map(async (v) => {
      const withImage = await mapVariantWithSignedImage(v);
      return {
        ...withImage,
        imageKey: v.imageUrl,
        price: v.price ? parseFloat(v.price) : undefined,
        rating: v.rating ? parseFloat(v.rating) : undefined,
      };
    }),
  );

  return {
    ...product,
    price: parseFloat(product.price),
    category: product.category
      ? { id: product.category.id, name: product.category.name }
      : null,
    variants: mappedVariants,
  };
}

export async function listProducts(
  businessId: string,
  options: { categoryId?: string; limit?: number; offset?: number } = {},
) {
  const { categoryId, limit = 20, offset = 0 } = options;
  const conditions = [eq(products.businessId, businessId), isNull(products.deletedAt)];
  if (categoryId) conditions.push(eq(products.categoryId, categoryId));

  const items = await db.query.products.findMany({
    where: and(...conditions),
    limit,
    offset,
    orderBy: [desc(products.createdAt)],
    with: {
      category: true,
      variants: true,
    },
  });

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(and(...conditions));

  const mapped = await Promise.all(
    items.map(async (p) => {
      const firstWithImage = p.variants.find((v) => v.imageUrl);
      const thumbnailUrl = firstWithImage?.imageUrl
        ? await resolveStoredImageUrl(firstWithImage.imageUrl)
        : null;

      return {
        id: p.id,
        businessId: p.businessId,
        categoryId: p.categoryId,
        name: p.name,
        price: parseFloat(p.price),
        slug: p.slug,
        sku: p.sku,
        description: p.description,
        createdAt: p.createdAt,
        categoryName: p.category?.name ?? null,
        variantCount: p.variants.length,
        thumbnailUrl,
      };
    }),
  );

  return {
    products: mapped,
    totalCount: countResult?.count ?? 0,
  };
}

export async function updateProduct(businessId: string, productId: string, input: unknown) {
  const parsed = updateProductInputSchema.parse(input);
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.businessId, businessId), isNull(products.deletedAt)),
  });
  if (!product) return null;

  const { variants: variantUpdates, ...productFields } = parsed;

  const hasProductUpdate =
    productFields.name !== undefined ||
    productFields.price !== undefined ||
    productFields.sku !== undefined ||
    productFields.description !== undefined;

  if (hasProductUpdate) {
    await db
      .update(products)
      .set({
        ...productFields,
        price: productFields.price?.toFixed(2),
        slug: productFields.name ? slugify(productFields.name) : undefined,
      })
      .where(eq(products.id, productId));
  }

  if (variantUpdates) {
    const existing = await db.query.variants.findMany({
      where: eq(variants.productId, productId),
    });
    const incomingIds = new Set(
      variantUpdates.filter((v) => v.id).map((v) => v.id as string),
    );

    for (const existingVariant of existing) {
      if (!incomingIds.has(existingVariant.id)) {
        await db
          .update(variants)
          .set({ deletedAt: new Date() })
          .where(eq(variants.id, existingVariant.id));
      }
    }

    for (const variant of variantUpdates) {
      const hasIncomingImage =
        variant.imageUrl && (isB2ObjectKey(variant.imageUrl) || !variant.imageUrl.startsWith('http'));
      const imageUrl = hasIncomingImage ? variant.imageUrl : undefined;
      const clearImage = variant.clearImage === true && !hasIncomingImage;

      if (variant.id) {
        const belongsToProduct = existing.some((v) => v.id === variant.id);
        if (!belongsToProduct) continue;

        await db
          .update(variants)
          .set({
            name: variant.name,
            stock: variant.stock,
            isAvailable: variant.isAvailable,
            price: variant.price?.toFixed(2),
            rating: variant.rating?.toFixed(2),
            ...(imageUrl !== undefined && { imageUrl }),
            ...(clearImage && { imageUrl: null }),
          })
          .where(and(eq(variants.id, variant.id), eq(variants.productId, productId)));
      } else {
        await db.insert(variants).values({
          productId,
          name: variant.name,
          imageUrl,
          price: variant.price?.toFixed(2),
          stock: variant.stock,
          isAvailable: variant.isAvailable,
          rating: variant.rating?.toFixed(2),
        });
      }
    }
  }

  return { updated: true };
}

export async function deleteProduct(businessId: string, productId: string) {
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.businessId, businessId), isNull(products.deletedAt)),
  });
  if (!product) return null;

  await db
    .update(products)
    .set({ deletedAt: new Date() })
    .where(eq(products.id, productId));
  return { deleted: true };
}

export async function createCategory(businessId: string, name: string) {
  const [cat] = await db
    .insert(categories)
    .values({ businessId, name, slug: slugify(name) })
    .returning();
  return cat;
}

export async function getCategoryById(businessId: string, categoryId: string) {
  return db.query.categories.findFirst({
    where: and(eq(categories.id, categoryId), eq(categories.businessId, businessId), isNull(categories.deletedAt)),
  });
}

export async function updateCategory(businessId: string, categoryId: string, input: unknown) {
  const parsed = updateCategoryInputSchema.parse(input);
  const cat = await getCategoryById(businessId, categoryId);
  if (!cat) return null;
  await db
    .update(categories)
    .set({ ...parsed, slug: parsed.name ? slugify(parsed.name) : undefined })
    .where(eq(categories.id, categoryId));
  return { updated: true };
}

export async function deleteCategory(businessId: string, categoryId: string) {
  const cat = await getCategoryById(businessId, categoryId);
  if (!cat) return null;
  await db
    .update(categories)
    .set({ deletedAt: new Date() })
    .where(eq(categories.id, categoryId));
  return { deleted: true };
}

export async function listCategories(businessId: string) {
  return db.query.categories.findMany({
    where: and(eq(categories.businessId, businessId), isNull(categories.deletedAt)),
  });
}

export async function searchProducts(businessId: string, query: string, limit = 5) {
  return db.query.products.findMany({
    where: and(
      eq(products.businessId, businessId),
      isNull(products.deletedAt),
      or(
        ilike(products.name, `%${query}%`),
        ilike(products.sku, `%${query}%`),
      ),
    ),
    limit,
    with: { variants: { where: isNull(variants.deletedAt) } },
  });
}
