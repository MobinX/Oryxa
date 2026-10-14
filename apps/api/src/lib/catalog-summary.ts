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

/**
 * Whether the agent reading this block can put cards in front of the customer. A comment thread cannot —
 * its toolset has no show_products — so the block must not send it to a tool it does not own.
 */
export async function buildCatalogSummary(
  businessId: string,
  options: { canShowCards?: boolean } = {},
): Promise<CatalogSummary> {
  const canShowCards = options.canShowCards !== false;
  const [total, firstPage] = await Promise.all([
    countSearchResults(businessId, ''),
    searchProducts(businessId, '', NAMED_PRODUCT_LIMIT),
  ]);

  if (total === 0) {
    return { total, summary: 'Catalog: this store has no products on sale right now. Say so rather than inventing one.' };
  }

  if (total <= NAMED_PRODUCT_LIMIT) {
    // Every one of them is named, so the block may say it is the whole catalog — but "whole catalog" is
    // not "all buyable", and an agent that confuses the two tells a customer a sold-out shirt is on sale.
    const buyable = firstPage.filter((p) => (p.variants ?? []).some((v) => v.isAvailable && v.stock > 0)).length;
    const lines = firstPage
      .map((p) => `- ${p.name} ($${p.price}) SKU: ${p.sku}`)
      .join('\n');
    return {
      total,
      summary: `Catalog (${total} product${total === 1 ? '' : 's'} — this is the store's whole catalog`
        + `${total > buyable ? `, ${buyable} of them available to order now` : ''}):\n${lines}`,
    };
  }

  const categories = await listCategories(businessId);
  const named = categories.filter((c) => c.productCount > 0);
  const unclassified = total - named.reduce((sum, c) => sum + c.productCount, 0);

  const shape = named.length
    ? `Categories: ${named.map((c) => `${c.name} (${c.productCount})`).join(', ')}`
      + (unclassified > 0 ? `; plus ${unclassified} with no category` : '')
    : 'None of them are grouped into categories, so there is no category to offer.';

  const howToAnswer = canShowCards
    ? 'To answer what the shop has: name the categories above, or call show_products with no query'
      + ' for the first page and offer the next one. Never say a customer has seen everything.'
    : 'To answer what the shop has: name the categories above and describe a few in your own words.'
      + ' You cannot show a product list here, so never imply the customer has seen everything the store holds.';

  return {
    total,
    summary: [
      `Catalog: this store has ${total} products on sale — far more than one message can show,`
        + ` so the list below is a sample (the ${firstPage.length} that come first by name), NOT the range.`,
      shape,
      howToAnswer,
      ...firstPage.map((p) => `- ${p.name} ($${p.price}) SKU: ${p.sku}`),
    ].join('\n'),
  };
}
