import { eq, and, asc, desc, sql, or, ilike, isNull, inArray } from 'drizzle-orm';
import { db } from '@db/client';
import { products, variants, categories, productOptions, productOptionValues } from '@db/schema';
import { createProductInputSchema, updateProductInputSchema, updateCategoryInputSchema, type BulkImportProduct } from '@repo/shared';
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

/** One declared option of one product, with the values it may take, in display order. */
export interface LoadedProductOption {
  id: string;
  name: string;
  position: number;
  values: Array<{ id: string; value: string; position: number }>;
}

/** Reads a product's declared options with their values, in the order the merchant hung them. */
export async function loadProductOptions(productId: string): Promise<LoadedProductOption[]> {
  const options = await db
    .select()
    .from(productOptions)
    .where(eq(productOptions.productId, productId))
    .orderBy(asc(productOptions.position), asc(productOptions.id));
  if (options.length === 0) return [];

  const values = await db
    .select()
    .from(productOptionValues)
    .where(inArray(productOptionValues.optionId, options.map((o) => o.id)))
    .orderBy(asc(productOptionValues.position), asc(productOptionValues.id));

  return options.map((option) => ({
    id: option.id,
    name: option.name,
    position: option.position,
    values: values
      .filter((v) => v.optionId === option.id)
      .map((v) => ({ id: v.id, value: v.value, position: v.position })),
  }));
}

/**
 * Writes a product's options wholesale: the declared set replaces whatever was there, values and
 * all. The merchant's step-one form is the only writer, so wholesale replacement is the whole
 * contract — a rename is a delete and a re-add under this model, which the positions preserve.
 */
async function writeProductOptions(
  productId: string,
  options: Array<{ name: string; values: string[] }>,
): Promise<void> {
  await db.delete(productOptions).where(eq(productOptions.productId, productId));
  for (const [position, option] of options.entries()) {
    const [row] = await db
      .insert(productOptions)
      .values({ productId, name: option.name, position })
      .returning();
    await db.insert(productOptionValues).values(
      option.values.map((value, valuePosition) => ({
        optionId: row!.id,
        value,
        position: valuePosition,
      })),
    );
  }
}

/**
 * Declaring options obliges every variant to be a full combination of them: each declared option
 * answered, each answer one of the values the option actually offers, and no two variants the
 * same combination — two rows that differ in nothing are one size ordered twice by accident.
 */
function validateVariantCombinations(
  options: Array<{ name: string; values: string[] }>,
  variants: Array<{ options?: Record<string, string>; name?: string }>,
): void {
  if (options.length === 0) return;

  const seen = new Set<string>();
  for (const variant of variants) {
    const chosen = variant.options ?? {};
    for (const option of options) {
      const value = chosen[option.name];
      if (!value) {
        throw new Error(
          `Variant "${variant.name ?? '?'}" must choose a ${option.name} — every declared option has to be answered`,
        );
      }
      if (!option.values.includes(value)) {
        throw new Error(
          `"${value}" is not a ${option.name} this product offers — pick from: ${option.values.join(', ')}`,
        );
      }
    }
    const unknown = Object.keys(chosen).find((key) => !options.some((o) => o.name === key));
    if (unknown) {
      throw new Error(`"${unknown}" is not an option this product declares`);
    }
    const combination = options.map((o) => chosen[o.name]).join(' / ');
    if (seen.has(combination)) {
      throw new Error(`Two variants carry the same combination: ${combination}`);
    }
    seen.add(combination);
  }
}

/** The row's name when the product is sold in combinations: the values, in declared order. */
function nameFromCombination(
  options: Array<{ name: string }>,
  chosen: Record<string, string>,
): string {
  return options.map((o) => chosen[o.name]).join(' / ');
}

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

  const slug = slugify(parsed.slug || parsed.name);
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
      hasDiscount: parsed.hasDiscount,
      discountPercent: parsed.discountPercent.toFixed(2),
      tags: parsed.tags,
      showInStorefront: parsed.showInStorefront,
    })
    .returning();

  if (parsed.options.length > 0) {
    await writeProductOptions(product.id, parsed.options);
  }

  // Declaring options turns every variant into a combination of them, and the combination names
  // the row — a merchant typing names by hand beside a Color/Size matrix is how the two disagree.
  validateVariantCombinations(parsed.options, parsed.variants);

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
          name: parsed.options.length > 0 ? nameFromCombination(parsed.options, v.options ?? {}) : v.name,
          options: v.options ?? {},
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

/**
 * The option set an imported product seems to declare, read off the combinations its variants
 * carry: knobs in first-seen order, each with the distinct values seen for it. Derived, not
 * trusted — the caller still measures it against the house rule before writing it.
 */
function deriveImportedOptions(
  variants: Array<{ options?: Record<string, string> }>,
): Array<{ name: string; values: string[] }> {
  const names: string[] = [];
  const valuesByName = new Map<string, Set<string>>();
  for (const variant of variants) {
    for (const [name, value] of Object.entries(variant.options ?? {})) {
      if (!name || !value) continue;
      if (!valuesByName.has(name)) {
        valuesByName.set(name, new Set());
        names.push(name);
      }
      valuesByName.get(name)!.add(value);
    }
  }
  return names.slice(0, 3).map((name) => ({
    name: name.slice(0, 80),
    values: [...valuesByName.get(name)!].slice(0, 50).map((value) => value.slice(0, 80)),
  }));
}

/**
 * A whole page of products from a client-side catalog import, in one call. The browser already
 * pushed the pictures to B2 and stamped each variant's wanted label on them, so labels are kept
 * wherever they are legal — only a label this business already hands out (or a malformed one)
 * gets re-rolled, and the caller learns how many of those happened.
 *
 * When an export's combinations happen to be complete and unique — every variant answering every
 * knob with a seen value, no two rows the same — the derived option set is declared too, so the
 * edit form shows the matrix the shop actually sells in. A looser export imports fine with the
 * combinations still riding on each variant.
 *
 * Products are written one at a time, outside a shared transaction, so one bad row (say, a slug
 * the shop already sells under) fails alone and lands in `failed` instead of sinking the page.
 */
export async function bulkCreateProducts(businessId: string, items: BulkImportProduct[]) {
  const wanted = items.flatMap((p) => p.variants.map((v) => v.variantId ?? null));
  const held = await variantIdsTakenInBusiness(businessId, wanted.filter((w): w is string => !!w && LABEL.test(w)));
  const needed = wanted.filter((w) => !w || !LABEL.test(w) || held.has(w)).length;
  const rolled = await rollVariantIds(businessId, needed);
  let next = 0;
  let relabeledCount = 0;

  const usedInBatch = new Set<string>();
  const usedLabels = new Set<string>();
  const slugFor = (item: BulkImportProduct): string => {
    const base = slugify(item.slug || item.name) || 'product';
    let candidate = base;
    for (let n = 2; usedInBatch.has(candidate); n++) candidate = `${base}-${n}`;
    usedInBatch.add(candidate);
    return candidate;
  };

  const created: Array<{ id: string; name: string; slug: string; variantLabels: string[] }> = [];
  const failed: Array<{ name: string; slug: string | null; error: string }> = [];

  // One page of an import usually repeats a handful of shelves, so each is resolved once.
  const categoryCache = new Map<string, string | null>();
  const categoryIdFor = async (name: string): Promise<string | null> => {
    const trimmed = name.trim().slice(0, 255);
    const categorySlug = slugify(trimmed);
    if (!trimmed || !categorySlug) return null;
    if (categoryCache.has(categorySlug)) return categoryCache.get(categorySlug)!;

    let id: string | null = null;
    try {
      const existing = await db.query.categories.findFirst({
        where: and(eq(categories.businessId, businessId), eq(categories.slug, categorySlug)),
      });
      id = existing && !existing.deletedAt ? existing.id : (await createCategory(businessId, trimmed)).id;
    } catch {
      // A shelf that cannot be written is not worth sinking the product over.
    }
    categoryCache.set(categorySlug, id);
    return id;
  };

  for (const item of items) {
    const slug = slugFor(item);
    try {
      const price = item.price ?? item.variants.find((v) => v.price)?.price ?? 0;
      const sku = (item.sku ?? '').slice(0, 100);
      const categoryId = item.categoryName ? await categoryIdFor(item.categoryName) : null;
      const [product] = await db
        .insert(products)
        .values({
          businessId,
          categoryId,
          customerId: null,
          name: item.name,
          price: price.toFixed(2),
          slug,
          sku,
          description: item.description,
          hasDiscount: false,
          discountPercent: '0',
          tags: item.tags,
          showInStorefront: item.showInStorefront,
        })
        .returning();

      // Declare the knobs only when the export's combinations pass the same rule the merchant's
      // own form is held to; a partial or duplicated set stays as per-variant data alone.
      const derived = deriveImportedOptions(item.variants);
      let declared: Array<{ name: string; values: string[] }> = [];
      if (derived.length > 0) {
        try {
          validateVariantCombinations(derived, item.variants);
          declared = derived;
          await writeProductOptions(product.id, derived);
        } catch {
          // Not declareable — the import proceeds with the combinations on the variants only.
        }
      }

      const labels = item.variants.map((v) => {
        const want = v.variantId;
        if (want && LABEL.test(want) && !held.has(want) && !usedLabels.has(want)) {
          usedLabels.add(want);
          return want;
        }
        relabeledCount++;
        while (next < rolled.length && usedLabels.has(rolled[next])) next++;
        const label = next < rolled.length ? rolled[next++] : null;
        if (label) usedLabels.add(label);
        return label;
      });

      const rows = await db
        .insert(variants)
        .values(
          item.variants.map((v, i) => {
            const photos = photoSetFor(v);
            return {
              productId: product!.id,
              variantId: labels[i] ?? null,
              name: declared.length > 0 ? nameFromCombination(declared, v.options ?? {}) : v.name,
              options: v.options ?? {},
              imageUrl: photos.imageUrl,
              imageUrls: photos.imageUrls,
              price: v.price?.toFixed(2),
              stock: v.stock,
              isAvailable: v.isAvailable,
              rating: v.rating?.toFixed(2),
            };
          }),
        )
        .returning();

      created.push({
        id: product!.id,
        name: product!.name,
        slug: product!.slug,
        variantLabels: rows.map((r) => r.variantId).filter((l): l is string => !!l),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create product';
      failed.push({ name: item.name, slug, error: message.slice(0, 300) });
    }
  }

  return { created, failed, relabeledCount };
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

  const options = await loadProductOptions(productId);

  return {
    ...product,
    price: parseFloat(product.price),
    discountPercent: parseFloat(product.discountPercent),
    category:
      product.category && !product.category.deletedAt
        ? { id: product.category.id, name: product.category.name }
        : null,
    customer: product.customer
      ? { id: product.customer.id, name: product.customer.name }
      : null,
    variants: mappedVariants,
    options,
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

/**
 * A name folded to what another name can be compared against: trimmed, lower-cased, inner runs of
 * whitespace collapsed, and the punctuation a customer types around a word removed ("#DAA03", "Fg.",
 * "the  wool  one"). Used for a size and for a category alike, because a word is a word.
 */
export function foldName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '');
}

export type VariantMatchVia = 'id' | 'name' | 'word' | 'label' | 'none';

/**
 * Which of these sizes a customer's word means.
 *
 * The word arrives exactly as it was said: "Fg", "fg variant ta", "#DAA03", or the UUID a card tap
 * carried. Of those, only the words survive between turns — the history the model reads next time is
 * the text on the cards, and a card never shows an id — so a lookup by what the customer called the
 * size is the one route that works twice. Names are tried before the label shape on purpose: a size
 * called Black is five letters long and would otherwise be read as a code the merchant never stamped.
 */
export function matchVariant<T extends { id: string; name: string; variantId?: string | null }>(
  rows: T[],
  raw: string,
): { matches: T[]; via: VariantMatchVia } {
  const wanted = raw.trim();
  const byId = rows.filter((row) => row.id === wanted);
  if (byId.length) return { matches: byId, via: 'id' };

  const folded = foldName(wanted);
  if (!folded) return { matches: [], via: 'none' };

  const byName = rows.filter((row) => foldName(row.name) === folded);
  if (byName.length) return { matches: byName, via: 'name' };

  // A word inside a name, or a name inside a word: "Fg" answers "fg variant ta dekhao", and "black"
  // answers "the black one". Both sides need two characters or any single letter matches everything.
  const byWord = folded.length >= 2
    ? rows.filter((row) => {
        const name = foldName(row.name);
        return name.length >= 2 && (name.includes(folded) || folded.includes(name));
      })
    : [];
  if (byWord.length) return { matches: byWord, via: 'word' };

  const label = wanted.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const byLabel = label.length === 5 ? rows.filter((row) => row.variantId === label) : [];
  if (byLabel.length) return { matches: byLabel, via: 'label' };

  return { matches: [], via: 'none' };
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

  const { variants: variantUpdates, categoryId: inputCategoryId, categoryName, options: declaredOptions, ...productFields } = parsed;

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
    productFields.hasDiscount !== undefined ||
    productFields.discountPercent !== undefined ||
    productFields.tags !== undefined ||
    productFields.showInStorefront !== undefined ||
    productFields.slug !== undefined ||
    categoryId !== undefined ||
    productFields.customerId !== undefined;

  if (hasProductUpdate) {
    await db
      .update(products)
      .set({
        ...productFields,
        ...(categoryId !== undefined && { categoryId }),
        price: productFields.price?.toFixed(2),
        discountPercent: productFields.discountPercent?.toFixed(2),
        // The merchant's typed slug wins; a renamed product without one keeps folding from the name.
        slug: productFields.slug ? slugify(productFields.slug) : productFields.name ? slugify(productFields.name) : undefined,
      })
      .where(eq(products.id, productId));
  }

  // The declared set arrives only when the edit form carried it; then it replaces wholesale and
  // every variant row is measured against the new knobs, not the ones being replaced.
  const activeOptions: Array<{ name: string; values: string[] }> = declaredOptions
    ? declaredOptions
    : (await loadProductOptions(productId)).map((o) => ({
        name: o.name,
        values: o.values.map((v) => v.value),
      }));

  if (variantUpdates) {
    if (declaredOptions) {
      await writeProductOptions(productId, declaredOptions);
    }
    if (declaredOptions || variantUpdates.some((v) => v.options)) {
      validateVariantCombinations(activeOptions, variantUpdates);
    }

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
      // On a product sold in combinations the combination names the row, whatever the form's own
      // name field might have carried.
      const name =
        declaredOptions && declaredOptions.length > 0
          ? nameFromCombination(declaredOptions, variant.options ?? {})
          : variant.name;

      if (variant.id) {
        const belongsToProduct = existing.some((v) => v.id === variant.id);
        if (!belongsToProduct) continue;

        await db
          .update(variants)
          .set({
            name,
            ...(variant.options !== undefined && { options: variant.options }),
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
          name,
          options: variant.options ?? {},
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
    orderBy: [asc(categories.name), asc(categories.id)],
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

/**
 * The shelves this store groups by, in name order, for matching a customer's word against them.
 *
 * Kept apart from listCategories because that one also counts the products on each shelf, and the only
 * reader that wants those counts is the reply that says "this store has no shelf called that". A catalog
 * tool that resolves a word should pay one round trip, not two, on every turn it filters.
 */
export async function findCategories(businessId: string) {
  return db.query.categories.findMany({
    where: and(eq(categories.businessId, businessId), isNull(categories.deletedAt)),
    orderBy: [asc(categories.name), asc(categories.id)],
    columns: { id: true, name: true },
  });
}

/**
 * A window over the catalog, in a stable order.
 *
 * Two things this had to fix. Without an ORDER BY, an empty query — which is what "what do you have?"
 * becomes — returned ten rows in whatever order Postgres felt like, so a customer asking for the next
 * page could be shown the same shirt twice and never the one they wanted; and variants were fetched with
 * one query per product, eleven HTTPS round trips on a serverless driver for a single card list, which is
 * latency the customer pays before the cards exist.
 */
export async function searchProducts(
  businessId: string,
  query: string,
  limit = 5,
  options: { categoryId?: string | null; offset?: number } = {},
) {
  const rows = await db.query.products.findMany({
    where: catalogMatch(businessId, query, options.categoryId),
    with: {
      variants: { where: isNull(variants.deletedAt) },
      // The shelf name rides the read the page already performs — one primary-key probe per row in the
      // same statement — because telling a customer what kinds a shop groups by is a question about the
      // catalog as a whole, and a window that arrives without its shelves cannot answer it.
      category: { columns: { id: true, name: true } },
    },
    orderBy: [asc(products.name), asc(products.id)],
    limit,
    offset: Math.max(0, Math.trunc(options.offset ?? 0)),
  });

  return rows;
}

/**
 * The one predicate that decides what a catalog search matches.
 *
 * Page and total read through it together, because two hand-written copies of the same rule drift: a
 * window filtered one way and a count filtered another is how "these are all 12 products" ends up said
 * about a page of ten that quietly dropped two, and the numbers the model is told to trust stop being
 * the same population.
 *
 * A product under a deleted category is not for sale, so it is excluded here rather than at each caller
 * that remembered to check. Said as a subquery rather than a join because the relational read above owns
 * its own joins and the count above owns none.
 */
function catalogMatch(businessId: string, query: string, categoryId?: string | null) {
  const trimmed = query.trim();
  // Written with the query builder rather than one sql fragment because AND binds tighter than OR: an
  // unparenthesised "category is null or category is live" swallowed every condition in front of it and
  // matched the whole store. The tests caught it as a page that ignored its own filter.
  const liveShelves = db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.businessId, businessId), isNull(categories.deletedAt)));

  return and(
    eq(products.businessId, businessId),
    isNull(products.deletedAt),
    categoryId ? eq(products.categoryId, categoryId) : undefined,
    or(isNull(products.categoryId), inArray(products.categoryId, liveShelves)),
    trimmed
      ? or(ilike(products.name, `%${trimmed}%`), ilike(products.sku, `%${trimmed}%`))
      : undefined,
  );
}

/**
 * How many live products the same search would match, counting past the page.
 *
 * A card list can only carry ten, so the number a customer is told cannot come from the list itself —
 * that is how "here is everything" ends up said about ten of a hundred and thirty-seven. Kept separate
 * from searchProducts because only the customer-facing tool needs it; a lookup that just wants a match
 * should not pay for a second round trip.
 */
export async function countSearchResults(
  businessId: string,
  query: string,
  options: { categoryId?: string | null } = {},
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(catalogMatch(businessId, query, options.categoryId));

  return row?.count ?? 0;
}

