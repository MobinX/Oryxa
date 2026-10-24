import { tool } from '@langchain/core/tools';
import type { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  searchProducts,
  findCategories,
  listCategories,
} from '@repo/db/crud/product';
import { resolveStoredImageUrl } from '@repo/integrations/b2';

/** One thing the merchant can send from the suggestion panel. */
export type SuggestionProduct = {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
};

export type InboxSuggestion =
  | { id: string; kind: 'text'; text: string }
  | {
      id: string;
      kind: 'product';
      productId: string;
      variantId: string | null;
      title: string;
      price: number;
      imageUrl: string | null;
      subtitle: string | null;
    }
  | {
      id: string;
      kind: 'category';
      categoryId: string;
      name: string;
      productCount: number;
      products: SuggestionProduct[];
    };

type SearchedProduct = Awaited<ReturnType<typeof searchProducts>>[number];

function sellable(product: SearchedProduct): boolean {
  return (
    product.variants.length === 0 ||
    product.variants.some((variant) => variant.isAvailable && variant.stock > 0)
  );
}

function fromPrice(product: SearchedProduct): number {
  const prices = product.variants
    .filter((variant) => variant.isAvailable && variant.stock > 0)
    .map((variant) => parseFloat(variant.price ?? ''))
    .filter(Number.isFinite);
  return prices.length ? Math.min(...prices) : parseFloat(product.price) || 0;
}

function pickPhoto(product: SearchedProduct) {
  return (
    product.variants.find(
      (variant) => variant.imageUrl && variant.isAvailable && variant.stock > 0,
    ) ??
    product.variants.find((variant) => variant.imageUrl) ??
    null
  );
}

async function photoUrl(product: SearchedProduct): Promise<string | null> {
  const photo = pickPhoto(product);
  if (!photo?.imageUrl) return null;
  const url = await resolveStoredImageUrl(photo.imageUrl).catch(() => null);
  return url ?? null;
}

function subtitle(product: SearchedProduct): string | null {
  const description = (product.description ?? '').replace(/\s+/g, ' ').trim();
  return description ? description.slice(0, 110) : null;
}

/**
 * The tools the suggestion agent may call. They record what the merchant could send;
 * nothing here talks to Meta, so a suggestion turn can never message the customer.
 */
export function createSuggestionTools(
  businessId: string,
  sink: InboxSuggestion[],
): StructuredTool[] {
  const suggestText = tool(
    async ({ text }) => {
      const clean = text.trim();
      if (!clean) return JSON.stringify({ recorded: false, reason: 'the reply is empty' });
      sink.push({ id: `text:${sink.length}`, kind: 'text', text: clean });
      return JSON.stringify({ recorded: true, kind: 'text' });
    },
    {
      name: 'suggest_text',
      description:
        'Record one ready-to-send text reply for the merchant. Write it as the merchant would say it to the customer, in the customer’s language. Call it once with your best reply.',
      schema: z.object({
        text: z.string().min(1).max(1000).describe('The suggested reply text.'),
      }),
    },
  );

  const suggestProduct = tool(
    async ({ query, variantId }) => {
      const matches = await searchProducts(businessId, query, 5);
      const product = matches.find(sellable);
      if (!product) {
        return JSON.stringify({
          recorded: false,
          reason: `no product in this store matches "${query}"`,
          instruction: 'Do not invent a product. Use suggest_text and say the store has nothing of that kind.',
        });
      }
      const imageUrl = await photoUrl(product);
      if (!imageUrl) {
        return JSON.stringify({
          recorded: false,
          reason: `"${product.name}" has no picture, so it cannot be sent as a card`,
          instruction: 'Suggest a text reply instead, or try another product from the catalog.',
        });
      }
      const chosenVariant =
        (variantId ? product.variants.find((v) => v.id === variantId) : null) ??
        product.variants.find((v) => v.isAvailable && v.stock > 0) ??
        null;
      sink.push({
        id: `product:${product.id}`,
        kind: 'product',
        productId: product.id,
        variantId: chosenVariant?.id ?? null,
        title: product.name.slice(0, 60),
        price: fromPrice(product),
        imageUrl,
        subtitle: subtitle(product),
      });
      return JSON.stringify({
        recorded: true,
        kind: 'product',
        productId: product.id,
        productName: product.name,
      });
    },
    {
      name: 'suggest_product_card',
      description:
        'Suggest one product card the merchant can send. Search the catalog with the customer’s words; the best sellable match with a photo is recorded. Never invent products.',
      schema: z.object({
        query: z.string().min(1).describe('Product name or words the customer used.'),
        variantId: z.string().uuid().nullable().optional().describe('Only when the customer named a specific variant.'),
      }),
    },
  );

  const suggestCategory = tool(
    async ({ category }) => {
      const wanted = category.trim();
      const shelves = await findCategories(businessId);
      const folded = wanted.toLowerCase();
      const hit =
        shelves.find((c) => c.id === wanted) ??
        shelves.find((c) => c.name.toLowerCase() === folded) ??
        shelves.find((c) => {
          const name = c.name.toLowerCase();
          return name.length >= 2 && (name.includes(folded) || folded.includes(name));
        });
      if (!hit) {
        const all = await listCategories(businessId);
        return JSON.stringify({
          recorded: false,
          reason: `no category in this store answers to "${wanted}"`,
          categories: all.map((c) => ({ name: c.name, products: c.productCount })),
          instruction: 'Do not invent a category. Pick one from the list or use suggest_text.',
        });
      }
      const withCounts = await listCategories(businessId);
      const count = withCounts.find((c) => c.id === hit.id)?.productCount ?? 0;
      const rows = await searchProducts(businessId, '', 6, { categoryId: hit.id });
      const products: SuggestionProduct[] = [];
      for (const product of rows) {
        if (!sellable(product)) continue;
        const imageUrl = await photoUrl(product);
        if (!imageUrl) continue;
        products.push({
          id: product.id,
          name: product.name,
          price: fromPrice(product),
          imageUrl,
        });
        if (products.length === 4) break;
      }
      sink.push({
        id: `category:${hit.id}`,
        kind: 'category',
        categoryId: hit.id,
        name: hit.name,
        productCount: count,
        products,
      });
      return JSON.stringify({
        recorded: true,
        kind: 'category',
        categoryId: hit.id,
        name: hit.name,
        products: products.length,
      });
    },
    {
      name: 'suggest_category',
      description:
        'Suggest sending one category with its product cards. Use when the customer asks for a kind of product or a collection. Never invent a category; the store’s real shelves are matched by name.',
      schema: z.object({
        category: z.string().min(1).describe('Category name the customer used, e.g. "shirts".'),
      }),
    },
  );

  return [suggestText, suggestProduct, suggestCategory];
}

/**
 * Appended after the store’s normal system prompt. The suggestion turn runs on the same
 * prompt, history and catalog facts as a real reply; only the outcome differs — it is
 * written for the merchant to approve, never delivered.
 */
export const SUGGESTION_GUIDANCE = `
You are preparing suggestions for the merchant, not answering the customer. Nothing you write is sent.
- Read the thread, then call suggest_text with the reply the merchant could send now, in the customer's language.
- If the customer asks about a product, also call suggest_product_card with the product name. If they ask for a kind of product, call suggest_category.
- You may combine a text reply with one product or category card.
- Never mention or suggest order cards, and never use quick replies or chips.
- Do not call the same tool twice. End your turn with the single word SILENT.
`.trim();
