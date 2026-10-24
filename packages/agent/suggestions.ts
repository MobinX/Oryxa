import { tool } from '@langchain/core/tools';
import type { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  searchProducts,
  findCategories,
  listCategories,
  matchVariant,
} from '@repo/db/crud/product';
import { getOrdersByPlatformId } from '@repo/db/crud/order';
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
    }
  | {
      id: string;
      kind: 'product_info';
      productId: string;
      title: string;
      price: number;
      imageUrl: string | null;
      variantCount: number;
    }
  | {
      id: string;
      kind: 'variant';
      productId: string;
      variantId: string;
      title: string;
      variantName: string;
      price: number;
      imageUrl: string | null;
      photoCount: number;
    }
  | {
      id: string;
      kind: 'order';
      productId: string;
      variantId: string | null;
      title: string;
      price: number;
      imageUrl: string | null;
      /** Prefills for the merchant's order form; every one stays editable. */
      count: number;
      customerPhone: string;
      customerAddress: string;
    }
  | {
      id: string;
      kind: 'order_card';
      orderId: string;
      title: string;
      subtitle: string;
      imageUrl: string | null;
      state: string;
      total: number;
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
export type SuggestionOrderDefaults = {
  count: number;
  customerPhone: string;
  customerAddress: string;
};

/**
 * The customer has no order form — only the merchant does. Strip the word from anything
 * written for the customer so a model slip never ships advice that cannot be followed.
 */
export function stripDisallowedSuggestionWords(text: string): string {
  return text
    .replace(/\border\s+form\b/gi, 'order')
    .replace(/\bfill(?:ing)?\s+(?:out|in)\s+(?:the\s+)?form\b/gi, 'share the details')
    .replace(/\bform\b/gi, 'details')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function createSuggestionTools(
  businessId: string,
  customerPlatformId: string,
  sink: InboxSuggestion[],
  orderDefaults: SuggestionOrderDefaults = { count: 1, customerPhone: '', customerAddress: '' },
): StructuredTool[] {
  const suggestText = tool(
    async ({ text }) => {
      const clean = stripDisallowedSuggestionWords(text);
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

  const suggestProductInfo = tool(
    async ({ query }) => {
      const product = (await searchProducts(businessId, query, 5)).find(
        (item) => item.variants.length > 0 && sellable(item),
      );
      if (!product) {
        return JSON.stringify({
          recorded: false,
          reason: `no product with variants matches "${query}"`,
          instruction: 'Do not invent a product. Use suggest_text instead.',
        });
      }
      const onOffer = product.variants.filter((v) => v.isAvailable && v.stock > 0);
      if (onOffer.length === 0) {
        return JSON.stringify({
          recorded: false,
          reason: `${product.name} is sold out in every variant`,
          instruction: 'Use suggest_text and offer something else.',
        });
      }
      const imageUrl = await photoUrl(product);
      if (!imageUrl) {
        return JSON.stringify({
          recorded: false,
          reason: `${product.name} has no usable photo`,
          instruction: 'Use suggest_text instead.',
        });
      }
      sink.push({
        id: `product_info:${product.id}`,
        kind: 'product_info',
        productId: product.id,
        title: product.name.slice(0, 60),
        price: fromPrice(product),
        imageUrl,
        variantCount: onOffer.length,
      });
      return JSON.stringify({
        recorded: true,
        kind: 'product_info',
        productName: product.name,
        variants: onOffer.length,
      });
    },
    {
      name: 'suggest_product_info',
      description:
        'Suggest sending every in-stock variant of a product as cards, each with its first photo. Use when the customer wants to see the sizes or choose one.',
      schema: z.object({
        query: z.string().min(1).describe('Product name or the words the customer used.'),
      }),
    },
  );

  const suggestVariant = tool(
    async ({ query, variant }) => {
      const product = (await searchProducts(businessId, query, 5)).find(sellable);
      if (!product) {
        return JSON.stringify({
          recorded: false,
          reason: `no product matches "${query}"`,
          instruction: 'Use suggest_text instead.',
        });
      }
      const { matches } = matchVariant(product.variants, variant);
      if (matches.length !== 1) {
        return JSON.stringify({
          recorded: false,
          reason: matches.length === 0 ? 'no variant answers to that' : 'several variants answer to that',
          variants: product.variants.map((v) => v.name),
          instruction: 'Ask which variant, or use suggest_product_info for all of them.',
        });
      }
      const chosen = matches[0]!;
      const stored = chosen.imageUrls?.length
        ? chosen.imageUrls
        : chosen.imageUrl
          ? [chosen.imageUrl]
          : [];
      const imageUrl = stored.length
        ? await resolveStoredImageUrl(stored[0]!).catch(() => null)
        : null;
      if (!imageUrl) {
        return JSON.stringify({
          recorded: false,
          reason: `the ${chosen.name} variant has no usable photo`,
          instruction: 'Use suggest_product_info or suggest_text instead.',
        });
      }
      const price = Number.isFinite(parseFloat(String(chosen.price ?? '')))
        ? parseFloat(String(chosen.price))
        : fromPrice(product);
      sink.push({
        id: `variant:${chosen.id}`,
        kind: 'variant',
        productId: product.id,
        variantId: chosen.id,
        title: product.name.slice(0, 60),
        variantName: chosen.name,
        price,
        imageUrl,
        photoCount: stored.length,
      });
      return JSON.stringify({
        recorded: true,
        kind: 'variant',
        productName: product.name,
        variantName: chosen.name,
        photos: stored.length,
      });
    },
    {
      name: 'suggest_variant_photos',
      description:
        'Suggest sending every photo of one chosen variant. Use when the customer asks to see a particular size/colour from all sides.',
      schema: z.object({
        query: z.string().min(1).describe('Product name or the words the customer used.'),
        variant: z.string().min(1).describe('The variant word, e.g. "Red XL" or its label.'),
      }),
    },
  );

  const suggestOrder = tool(
    async ({ query, variant, count, customerPhone, customerAddress }) => {
      const product = (await searchProducts(businessId, query, 5)).find(sellable);
      if (!product) {
        return JSON.stringify({
          recorded: false,
          reason: `no product matches "${query}"`,
          instruction: 'Use suggest_text instead.',
        });
      }
      let variantId: string | null = null;
      let variantName: string | null = null;
      if (variant) {
        const { matches } = matchVariant(product.variants, variant);
        if (matches.length !== 1) {
          return JSON.stringify({
            recorded: false,
            reason: 'the variant is missing or ambiguous',
            variants: product.variants.map((v) => v.name),
            instruction: 'Ask which variant, or use suggest_product_info first.',
          });
        }
        variantId = matches[0]!.id;
        variantName = matches[0]!.name;
      } else if (product.variants.length === 1) {
        variantId = product.variants[0]!.id;
        variantName = product.variants[0]!.name;
      } else if (product.variants.length > 1) {
        return JSON.stringify({
          recorded: false,
          reason: `${product.name} needs a variant before an order`,
          variants: product.variants.map((v) => v.name),
          instruction: 'Use suggest_product_info so the customer picks a variant, or ask which one.',
        });
      }
      const imageUrl = await photoUrl(product);
      const chosen = product.variants.find((v) => v.id === variantId);
      const price = chosen
        ? Number.isFinite(parseFloat(String(chosen.price ?? '')))
          ? parseFloat(String(chosen.price))
          : fromPrice(product)
        : fromPrice(product);
      sink.push({
        id: `order:${product.id}:${variantId ?? ''}`,
        kind: 'order',
        productId: product.id,
        variantId,
        title: product.name.slice(0, 60),
        price,
        imageUrl,
        count: count && count > 0 ? count : orderDefaults.count,
        customerPhone: customerPhone?.trim() || orderDefaults.customerPhone,
        customerAddress: customerAddress?.trim() || orderDefaults.customerAddress,
      });
      return JSON.stringify({
        recorded: true,
        kind: 'order',
        productName: product.name,
        variantName,
      });
    },
    {
      name: 'suggest_order',
      description:
        'Suggest creating an order for a product (and a variant when the product has them). The merchant confirms it in their own order form. Never tell the customer to use an order form; the suggested text asks for missing details in chat.',
      schema: z.object({
        query: z.string().min(1).describe('Product name or the words the customer used.'),
        variant: z.string().min(1).optional().describe('Variant word when the customer named one.'),
        count: z.number().int().positive().optional().describe('Quantity the customer asked for.'),
        customerPhone: z.string().optional().describe('Phone the customer gave in the thread.'),
        customerAddress: z.string().optional().describe('Address the customer gave in the thread.'),
      }),
    },
  );

  const suggestOrderCard = tool(
    async () => {
      const { orders } = await getOrdersByPlatformId(businessId, customerPlatformId, { limit: 1 });
      const order = orders[0];
      if (!order) {
        return JSON.stringify({
          recorded: false,
          reason: 'this customer has no orders at this store',
          instruction: 'Do not invent an order. Use suggest_text.',
        });
      }
      if (!order.imageUrl) {
        return JSON.stringify({
          recorded: false,
          reason: 'the order has no product photo, so it cannot be sent as a card',
          instruction: 'Use suggest_text to describe the order instead.',
        });
      }
      const stateLabel =
        order.state === 'onDelivery'
          ? 'On delivery'
          : order.state.charAt(0).toUpperCase() + order.state.slice(1);
      sink.push({
        id: `order_card:${order.id}`,
        kind: 'order_card',
        orderId: order.id,
        title: `${order.count} × ${order.productName ?? 'order'}`.slice(0, 60),
        subtitle: `${stateLabel} · ৳${order.totalPrice.toFixed(0)} · ${order.createdAt.toISOString().slice(0, 10)}`,
        imageUrl: order.imageUrl,
        state: stateLabel,
        total: order.totalPrice,
      });
      return JSON.stringify({ recorded: true, kind: 'order_card', orderId: order.id });
    },
    {
      name: 'suggest_order_card',
      description:
        'Suggest sending the customer’s latest order as a card (status, total, date). Use for order-status or tracking questions.',
      schema: z.object({}),
    },
  );

  return [
    suggestText,
    suggestProduct,
    suggestCategory,
    suggestProductInfo,
    suggestVariant,
    suggestOrder,
    suggestOrderCard,
  ];
}

/**
 * Appended after the store’s normal system prompt. The suggestion turn runs on the same
 * prompt, history and catalog facts as a real reply; only the outcome differs — it is
 * written for the merchant to approve, never delivered.
 */
export const SUGGESTION_GUIDANCE = `
You are preparing suggestions for the merchant, not answering the customer. Nothing you write is sent.
- Read the thread, then call suggest_text with the reply the merchant could send now, in the customer's language.
- If the customer asks about a product, call suggest_product_card. If they ask for a kind of product or collection, call suggest_category.
- If they want to see the sizes or choose one, call suggest_product_info (all in-stock variants with their first photo).
- If they ask to see one particular size/colour from all sides, call suggest_variant_photos.
- If they want to buy, call suggest_order so the merchant can open the order form prefilled. Pass the quantity, phone and address the customer stated. The order form belongs to the merchant only: never tell the customer to fill, use, or give details "for the order form" — the suggested text asks for missing details naturally in the chat.
- If they ask about an existing order or tracking, call suggest_order_card for their latest order.
- You may combine a text reply with one or two cards. Never use quick replies or chips.
- Never use the word "form" in a suggestion; the customer orders by chatting, not by filling anything.
- Do not call the same tool twice. End your turn with the single word SILENT.
`.trim();
