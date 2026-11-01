import { countSearchResults, listCategories, searchProducts } from '@repo/db/crud/product';

/**
 * How many products the prompt may name one at a time. Ten is the number a Messenger card list carries,
 * so a preview longer than this stops being a preview and starts being a second, slower copy of the
 * catalog the tool already shows better.
 */
const NAMED_PRODUCT_LIMIT = 10;

/**
 * The catalog block in front of the agent every turn — written once because three runners each built
 * their own copy of the same five lines, and all three had the same defect: they showed the ten newest
 * products and said nothing about how many there were, so a shop with a hundred and thirty-seven items
 * was described to the model as a shop with ten.
 *
 * The fix is the number, not a bigger list. Under the limit the products are named, because naming them
 * is what lets the agent answer "do you have the blue one" without a round trip. Past it the block
 * becomes the shape of the shop — how many, and which categories — and points at the tool that can
 * actually show them, since a partial list the model believes is complete produces confident lies about
 * what the store sells.
 *
 * It reads the catalog with searchProducts rather than listProducts on purpose: the same rows without
 * signing a storage URL per product, which the prompt never displays and every turn used to pay for.
 */
export type CatalogSummary = { summary: string; total: number };

const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
const catalogCache = new Map<string, { summary: CatalogSummary; expiresAt: number }>();

export function invalidateCatalogSummaryCache(businessId?: string): void {
  if (businessId) {
    for (const key of catalogCache.keys()) {
      if (key.startsWith(`${businessId}:`)) catalogCache.delete(key);
    }
  } else {
    catalogCache.clear();
  }
}

/** The shelves this store groups by, in the one sentence form both branches use. */
function shelfShape(named: Array<{ name: string; count: number }>, unclassified: number): string {
  return named.length
    ? `Categories: ${named.map((c) => `${c.name} (${c.count})`).join(', ')}`
      + (unclassified > 0 ? `; plus ${unclassified} with no category` : '')
    : 'This store does not group its products into categories, so there is no category to offer.';
}

/**
 * How a broad "what do you have" is answered, at every catalog size. Said here because the block is
 * the only place that knows the shelves: a customer asking which kinds the shop carries wants the
 * list of kinds — even when the catalog is small enough to name in full, the categories are the
 * answer, and they are offered as tappable suggestions so the customer picks with one tap.
 */
function answerWithCategories(cards: boolean): string {
  const lead = 'When the customer asks what kinds or categories the shop has, or what you sell, answer'
    + ' from the Categories line above in your own words — that question is about the shelves, never a'
    + ' product card list, and it stays true however small the catalog is (even with fewer than 10'
    + ' products). Offer the category names as tappable suggestions with send_message, then end the'
    + ' turn with SILENT.';
  return cards
    ? lead + ' When the customer taps one, show_products with that category and no query shows its products.'
    : lead + ' You cannot show cards here, so name the shelves and invite the customer to pick one.';
}

/**
 * Whether the agent reading this block can put cards in front of the customer. A comment thread cannot —
 * its toolset has no show_products — so the block must not send it to a tool it does not own.
 */
export async function buildCatalogSummary(
  businessId: string,
  options: { canShowCards?: boolean } = {},
): Promise<CatalogSummary> {
  const canShowCards = options.canShowCards !== false;
  const cacheKey = `${businessId}:${canShowCards}`;
  const cached = catalogCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.summary;
  }

  const [total, firstPage] = await Promise.all([
    countSearchResults(businessId, ''),
    searchProducts(businessId, '', NAMED_PRODUCT_LIMIT),
  ]);

  if (total === 0) {
    const emptyResult = { total, summary: 'Catalog: this store has no products on sale right now. Say so rather than inventing one.' };
    catalogCache.set(cacheKey, { summary: emptyResult, expiresAt: Date.now() + CATALOG_CACHE_TTL_MS });
    return emptyResult;
  }

  if (total <= NAMED_PRODUCT_LIMIT) {
    // Every one of them is named, so the block may say it is the whole catalog — but "whole catalog" is
    // not "all buyable", and an agent that confuses the two tells a customer a sold-out shirt is on sale.
    const buyable = firstPage.filter((p) => (p.variants ?? []).some((v) => v.isAvailable && v.stock > 0)).length;

    // The page IS the catalog at this size, so the shelf counts come out of the rows already in hand —
    // this is the branch every store in the fleet sits in today, and the one that used to return before
    // the categories were read, which is why "which categories do you have" was unanswerable.
    const counts = new Map<string, number>();
    for (const row of firstPage) {
      const name = row.category?.name;
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const named = [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const unclassified = firstPage.length - named.reduce((sum, c) => sum + c.count, 0);

    const lines = firstPage
      .map((p) => `- ${p.name} [id: ${p.id}; variants: ${p.variants.length}] ($${p.price}) SKU: ${p.sku}${p.category?.name ? ` — in ${p.category.name}` : ''}${(p as { paymentStrategyOverride?: string | null }).paymentStrategyOverride ? ` — PAYMENT OVERRIDE: this product follows "${(p as { paymentStrategyOverride?: string | null }).paymentStrategyOverride}" instead of the store default; follow the product tool result for its rule` : ''}`)
      .join('\n');
    const result = {
      total,
      summary: [
        `Catalog (${total} product${total === 1 ? '' : 's'} — this is the store's whole catalog`
          + `${total > buyable ? `, ${buyable} of them available to order now` : ''}):`,
        shelfShape(named, unclassified),
        answerWithCategories(canShowCards),
        lines,
      ].join('\n'),
    };
    catalogCache.set(cacheKey, { summary: result, expiresAt: Date.now() + CATALOG_CACHE_TTL_MS });
    return result;
  }

  const categories = await listCategories(businessId);
  const populated = categories
    .filter((c) => c.productCount > 0)
    .map((c) => ({ name: c.name, count: c.productCount }));
  const unclassified = total - populated.reduce((sum, c) => sum + c.count, 0);

  const howToAnswer = canShowCards
    ? 'To answer what the shop has: name the categories above and offer them as tappable suggestions'
      + ' (send_message, then SILENT). After a category is chosen, show_products with that category.'
      + ' Do not dump the sample list for a casual "what do you have", and never say a customer has seen everything.'
    : 'To answer what the shop has: name the categories above and describe a few in your own words.'
      + ' You cannot show a product list here, so never imply the customer has seen everything the store holds.';

  const result = {
    total,
    summary: [
      `Catalog: this store has ${total} products on sale — far more than one message can show,`
        + ` so the list below is a sample (the ${firstPage.length} that come first by name), NOT the range.`,
      shelfShape(populated, unclassified),
      answerWithCategories(canShowCards),
      howToAnswer,
      ...firstPage.map((p) => `- ${p.name} [id: ${p.id}; variants: ${p.variants.length}] ($${p.price}) SKU: ${p.sku}${p.category?.name ? ` — in ${p.category.name}` : ''}${(p as { paymentStrategyOverride?: string | null }).paymentStrategyOverride ? ` — PAYMENT OVERRIDE: "${(p as { paymentStrategyOverride?: string | null }).paymentStrategyOverride}"` : ''}`),
    ].join('\n'),
  };
  catalogCache.set(cacheKey, { summary: result, expiresAt: Date.now() + CATALOG_CACHE_TTL_MS });
  return result;
}
