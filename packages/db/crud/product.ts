import { eq, and, desc, sql, or, ilike, isNull, inArray } from 'drizzle-orm';
import { db } from '@db/client';
import { products, variants, categories } from '@db/schema';
import { createProductInputSchema, updateProductInputSchema, updateCategoryInputSchema } from '@repo/shared';
import { slugify, makeVariantId } from '@repo/utils';
import { resolveStoredImageUrl, isB2ObjectKey } from '@repo/integrations/b2';

async function mapVariantWithSignedImage<T extends { imageUrl: string | null; imageUrls: string[] | null }>(variant: T) {
  return {
    ...variant,
    imageUrl: await resolveStoredImageUrl(variant.imageUrl),
    imageUrls: (
      await Promise.all((variant.imageUrls ?? []).map((key) => resolveStoredImageUrl(key)))
    ).filter((url): url is string => Boolean(url)),
  };
}

/**
 * The photo set a write should leave behind: the list the merchant sent, or the single cover
 * when they only sent one. Both fields come back because `imageUrl` stays the first shot, and
 * every surface that shows one image still reads it.
 */
function photoSetFor(variant: { imageUrl?: string; imageUrls?: string[] }) {
  const urls = variant.imageUrls?.length
    ? variant.imageUrls
    : variant.imageUrl
      ? [variant.imageUrl]
      : [];
  return { imageUrls: urls, imageUrl: variant.imageUrl ?? urls[0] ?? null };
}

/**
 * Which of these labels this business already hands out. A label is only unique per business, and
 * the variant row does not know its business — the product does — so the question is asked through
 * the product.
 */
async function variantIdsTakenInBusiness(businessId: string, candidates: string[]) {
  if (candidates.length === 0) return new Set<string>();
  const rows = await db
    .select({ variantId: variants.variantId })
    .from(variants)
    .innerJoin(products, eq(variants.productId, products.id))
    .where(
      and(
        eq(products.businessId, businessId),
        isNull(variants.deletedAt),
        inArray(variants.variantId, candidates),
      ),
    );
  return new Set(rows.map((r) => r.variantId).filter((id): id is string => id !== null));
}

/**
 * Labels for `count` new variants of one business: roll, ask the business which of them it already
 * holds, re-roll those, keep going until every slot has a label the shop has never used. About 1.7
 * million shapes against a few thousand live variants, so a collision is rare and the loop almost
 * always ends after one query.
 */
export async function rollVariantIds(businessId: string, count: number): Promise<string[]> {
  const chosen: string[] = [];

  for (let round = 0; chosen.length < count && round < 12; round++) {
    const candidates = [
      ...new Set(
        Array.from({ length: count - chosen.length + 2 }, () => makeVariantId()).filter(
          (id) => !chosen.includes(id),
        ),
      ),
    ];
    if (candidates.length === 0) continue;

    const taken = await variantIdsTakenInBusiness(businessId, candidates);
    for (const id of candidates) {
      if (chosen.length >= count) break;
      if (!taken.has(id)) chosen.push(id);
    }
  }

  return chosen;
}

/** The shape of a short label: three letters and two digits, in any order. */
const LABEL = /^[A-Z0-9]{5}$/;

/**
 * Labels for a batch of new variant rows. A label the merchant's own form already stamped on the
 * row's pictures is kept, so the photo and the row agree; anything malformed, already handed out
 * by this business, or missing gets a freshly rolled one instead, which is what keeps the column
 * unique per business whatever a caller sends.
 */
async function assignVariantLabels(
  businessId: string,
  wanted: Array<string | null | undefined>,
): Promise<Array<string | null>> {
  const asked = wanted.filter((label): label is string => typeof label === 'string' && LABEL.test(label));
  const held = await variantIdsTakenInBusiness(businessId, asked);
  const rolled = await rollVariantIds(businessId, wanted.length);

  const used = new Set<string>();
  const labels: Array<string | null> = [];
  let next = 0;

  for (const want of wanted) {
    if (want && LABEL.test(want) && !held.has(want) && !used.has(want)) {
      used.add(want);
      labels.push(want);
      continue;
    }
    while (next < rolled.length && used.has(rolled[next])) next++;
    const label = next < rolled.length ? rolled[next++] : null;
    if (label) used.add(label);
    labels.push(label);
  }

  return labels;
}

export async function createProduct(input: unknown) {
  const parsed = createProductInputSchema.parse(input);

  let categoryId = parsed.categoryId ?? null;
  // Typed categoryName takes priority over categoryId.
  if (parsed.categoryName) {
    const categorySlug = slugify(parsed.categoryName);
    const existingCategory = await db.query.categories.findFirst({
      where: and(
        eq(categories.businessId, parsed.businessId),
        eq(categories.slug, categorySlug),
        isNull(categories.deletedAt),
      ),
    });
    if (existingCategory) {
      categoryId = existingCategory.id;
    } else {
      const cat = await createCategory(parsed.businessId, parsed.categoryName);
      categoryId = cat.id;
    }
  }

  const slug = slugify(parsed.name);
  const [product] = await db
    .insert(products)
    .values({
      businessId: parsed.businessId,
      categoryId,
      customerId: parsed.customerId ?? null,
      name: parsed.name,
      price: parsed.price.toFixed(2),
      slug,
      sku: parsed.sku,
      description: parsed.description,
    })
    .returning();

  if (parsed.variants.length > 0) {
    const labels = await assignVariantLabels(
      parsed.businessId,
      parsed.variants.map((v) => v.variantId),
    );
    await db.insert(variants).values(
      parsed.variants.map((v, i) => {
        const photos = photoSetFor(v);
        return {
          productId: product.id,
          variantId: labels[i] ?? null,
          name: v.name,
          imageUrl: photos.imageUrl,
          imageUrls: photos.imageUrls,
          price: v.price?.toFixed(2),
          stock: v.stock,
          isAvailable: v.isAvailable,
          rating: v.rating?.toFixed(2),
        };
      }),
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
      customer: true,
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
        imageKeys: v.imageUrls ?? [],
        price: v.price ? parseFloat(v.price) : undefined,
        rating: v.rating ? parseFloat(v.rating) : undefined,
      };
    }),
  );

  return {
    ...product,
    price: parseFloat(product.price),
    category:
      product.category && !product.category.deletedAt
        ? { id: product.category.id, name: product.category.name }
        : null,
    customer: product.customer
      ? { id: product.customer.id, name: product.customer.name }
      : null,
    variants: mappedVariants,
  };
}

/**
 * The product a short label belongs to. The label is only unique inside one business, so the
 * business is part of the question: the same label in another shop's catalogue returns nothing.
 */
export async function getProductByVariantId(businessId: string, variantId: string) {
  const [row] = await db
    .select({ productId: variants.productId })
    .from(variants)
    .innerJoin(products, eq(variants.productId, products.id))
    .where(
      and(
        eq(products.businessId, businessId),
        isNull(products.deletedAt),
        isNull(variants.deletedAt),
        eq(variants.variantId, variantId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return getProductById(businessId, row.productId);
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
      customer: true,
      variants: {
        where: isNull(variants.deletedAt),
      },
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
        customerId: p.customerId,
        name: p.name,
        price: parseFloat(p.price),
        slug: p.slug,
        sku: p.sku,
        description: p.description,
        createdAt: p.createdAt,
        categoryName: p.category && !p.category.deletedAt ? p.category.name : null,
        customerName: p.customer?.name ?? null,
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

  const { variants: variantUpdates, categoryId: inputCategoryId, categoryName, ...productFields } = parsed;

  let categoryId: string | undefined;
  // Typed categoryName takes priority over categoryId.
  if (categoryName) {
    const categorySlug = slugify(categoryName);
    const existingCategory = await db.query.categories.findFirst({
      where: and(
        eq(categories.businessId, businessId),
        eq(categories.slug, categorySlug),
        isNull(categories.deletedAt),
      ),
    });
    if (existingCategory) {
      categoryId = existingCategory.id;
    } else {
      const cat = await createCategory(businessId, categoryName);
      categoryId = cat.id;
    }
  } else if (inputCategoryId) {
    const cat = await getCategoryById(businessId, inputCategoryId);
    if (!cat) throw new Error('Category not found');
    categoryId = cat.id;
  }

  const hasProductUpdate =
    productFields.name !== undefined ||
    productFields.price !== undefined ||
    productFields.sku !== undefined ||
    productFields.description !== undefined ||
    categoryId !== undefined ||
    productFields.customerId !== undefined;

  if (hasProductUpdate) {
    await db
      .update(products)
      .set({
        ...productFields,
        ...(categoryId !== undefined && { categoryId }),
        price: productFields.price?.toFixed(2),
        slug: productFields.name ? slugify(productFields.name) : undefined,
      })
      .where(eq(products.id, productId));
  }

  if (variantUpdates) {
    const existing = await db.query.variants.findMany({
      where: and(eq(variants.productId, productId), isNull(variants.deletedAt)),
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
      // Only keys are writes. A signed URL arriving in a payload is the same picture already
      // stored, and saving the signature as the key would take the object down as soon as it
      // expired — so anything that looks like a URL is dropped, and an empty result means the
      // merchant changed nothing rather than cleared everything.
      const incoming = [
        ...(variant.imageUrls ?? []),
        ...(variant.imageUrl ? [variant.imageUrl] : []),
      ].filter((value) => isB2ObjectKey(value));
      const photos = [...new Set(incoming)];
      const clearImage = variant.clearImage === true && photos.length === 0;

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
            ...(photos.length > 0 && { imageUrls: photos, imageUrl: photos[0] }),
            ...(clearImage && { imageUrls: [], imageUrl: null }),
          })
          .where(and(eq(variants.id, variant.id), eq(variants.productId, productId)));
      } else {
        const [label] = await assignVariantLabels(businessId, [variant.variantId]);
        await db.insert(variants).values({
          productId,
          variantId: label ?? null,
          name: variant.name,
          imageUrl: photos[0] ?? null,
          imageUrls: photos,
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

  const now = new Date();
  await db
    .update(variants)
    .set({ deletedAt: now })
    .where(and(eq(variants.productId, productId), isNull(variants.deletedAt)));
  await db
    .update(products)
    .set({ deletedAt: now })
    .where(eq(products.id, productId));
  return { deleted: true };
}

export async function createCategory(businessId: string, name: string) {
  const slug = slugify(name);

  const existing = await db.query.categories.findFirst({
    where: and(eq(categories.businessId, businessId), eq(categories.slug, slug)),
  });

  if (existing && !existing.deletedAt) {
    throw new Error('A category with this name already exists');
  }

  if (existing?.deletedAt) {
    const [restored] = await db
      .update(categories)
      .set({ name, deletedAt: null })
      .where(eq(categories.id, existing.id))
      .returning();
    return restored;
  }

  const [cat] = await db
    .insert(categories)
    .values({ businessId, name, slug })
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

  const now = new Date();

  const related = await db.query.products.findMany({
    where: and(
      eq(products.businessId, businessId),
      eq(products.categoryId, categoryId),
      isNull(products.deletedAt),
    ),
    columns: { id: true },
  });
  const productIds = related.map((p) => p.id);

  if (productIds.length > 0) {
    await db
      .update(variants)
      .set({ deletedAt: now })
      .where(and(inArray(variants.productId, productIds), isNull(variants.deletedAt)));
    await db
      .update(products)
      .set({ deletedAt: now })
      .where(inArray(products.id, productIds));
  }

  await db
    .update(categories)
    .set({ deletedAt: now })
    .where(eq(categories.id, categoryId));

  return { deleted: true };
}

export async function listCategories(businessId: string) {
  const cats = await db.query.categories.findMany({
    where: and(eq(categories.businessId, businessId), isNull(categories.deletedAt)),
  });

  const countRows = await db
    .select({
      categoryId: products.categoryId,
      count: sql<number>`count(*)::int`,
    })
    .from(products)
    .where(and(eq(products.businessId, businessId), isNull(products.deletedAt)))
    .groupBy(products.categoryId);

  const countById = new Map(
    countRows.filter((r) => r.categoryId).map((r) => [r.categoryId as string, r.count]),
  );

  return cats.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    productCount: countById.get(c.id) ?? 0,
  }));
}

export async function searchProducts(businessId: string, query: string, limit = 5) {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
      sku: products.sku,
      description: products.description,
      categoryId: products.categoryId,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        eq(products.businessId, businessId),
        isNull(products.deletedAt),
        or(isNull(products.categoryId), isNull(categories.deletedAt)),
        or(
          ilike(products.name, `%${query}%`),
          ilike(products.sku, `%${query}%`),
        ),
      ),
    )
    .limit(limit);

  const results = await Promise.all(
    rows.map(async (p) => {
      const productVariants = await db.query.variants.findMany({
        where: and(eq(variants.productId, p.id), isNull(variants.deletedAt)),
      });
      return { ...p, variants: productVariants };
    }),
  );

  return results;
}
