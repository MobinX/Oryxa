import { eq, and, desc, sql, or, ilike } from 'drizzle-orm';
import { db } from '@db/client';
import { products, variants, categories } from '@db/schema';
import { createProductInputSchema, updateProductInputSchema } from '@repo/shared';
import { slugify } from '@repo/utils';
import { resolveStoredImageUrl } from '@repo/integrations/b2';

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
    where: and(eq(products.id, productId), eq(products.businessId, businessId)),
    with: {
      category: true,
      variants: true,
    },
  });
  if (!product) return null;

  const mappedVariants = await Promise.all(
    product.variants.map(async (v) => {
      const withImage = await mapVariantWithSignedImage(v);
      return {
        ...withImage,
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
  const conditions = [eq(products.businessId, businessId)];
  if (categoryId) conditions.push(eq(products.categoryId, categoryId));

  const items = await db.query.products.findMany({
    where: and(...conditions),
    limit,
    offset,
    orderBy: [desc(products.createdAt)],
  });

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(and(...conditions));

  return {
    products: items.map((p) => ({ ...p, price: parseFloat(p.price) })),
    totalCount: countResult?.count ?? 0,
  };
}

export async function updateProduct(businessId: string, productId: string, input: unknown) {
  const parsed = updateProductInputSchema.parse(input);
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.businessId, businessId)),
  });
  if (!product) return null;

  await db
    .update(products)
    .set({
      ...parsed,
      price: parsed.price?.toFixed(2),
      slug: parsed.name ? slugify(parsed.name) : undefined,
    })
    .where(eq(products.id, productId));

  return { updated: true };
}

export async function deleteProduct(businessId: string, productId: string) {
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.businessId, businessId)),
  });
  if (!product) return null;

  await db.delete(products).where(eq(products.id, productId));
  return { deleted: true };
}

export async function createCategory(businessId: string, name: string) {
  const [cat] = await db
    .insert(categories)
    .values({ businessId, name, slug: slugify(name) })
    .returning();
  return cat;
}

export async function listCategories(businessId: string) {
  return db.query.categories.findMany({
    where: eq(categories.businessId, businessId),
  });
}

export async function searchProducts(businessId: string, query: string, limit = 5) {
  return db.query.products.findMany({
    where: and(
      eq(products.businessId, businessId),
      or(
        ilike(products.name, `%${query}%`),
        ilike(products.sku, `%${query}%`),
      ),
    ),
    limit,
    with: { variants: true },
  });
}
