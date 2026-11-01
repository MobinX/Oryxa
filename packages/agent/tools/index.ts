import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  searchProducts,
  countSearchResults,
  getProductByVariantId,
  getProductById,
  findCategories,
  listCategories,
  matchVariant,
  foldName,
} from '@repo/db/crud/product';
import { createOrder, getOrderById, getOrdersByPlatformId, updateOrder, deleteOrder } from '@repo/db/crud/order';
import { createMessage } from '@repo/db/crud/conversation';
import { createBusinessNotification } from '@repo/db/crud/notification';
import { refundQuotaUnit, spendQuotaUnit } from '@repo/db/crud/billing';
import {
  sendMessage as fbSendMessage,
  sendButtons as fbSendButtons,
  sendQuickReplies as fbSendQuickReplies,
  detailsProductPayload,
  detailsVariantPayload,
  type MessagingPlatform,
  type MessengerCard,
} from '@repo/integrations/facebook';
import { resolveStoredImageUrl } from '@repo/integrations/b2';
import type { SseEmitter } from '@agent/Agent';
import type { ConversationAgentState } from '@repo/shared';

/** A catalog row with its variants, exactly as `searchProducts` hands it back. */
type SearchedProduct = Awaited<ReturnType<typeof searchProducts>>[number];

/** Meta cuts a subtitle on the third line, so the summary is one tight sentence. */
const SUMMARY_LIMIT = 110;

function oneLine(value: string | null | undefined, limit: number): string {
  const flat = (value ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit - 1).trimEnd()}…`;
}

/** Catalog prices arrive as numeric strings; a card shows two decimals and a dollar sign. */
function money(value: string | number | null | undefined): string {
  const amount = typeof value === 'number' ? value : parseFloat(value ?? '');
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : '';
}

/** Meta's generic template holds ten cards; more than that is a page the buyer scrolls past. */
const CARD_LIST_LIMIT = 10;

/**
 * Out of stock is not a product to offer: the buyer would tap Order and be refused. A product
 * with no variants at all is sold as itself, so it stays on the list.
 */
function isSellable(product: SearchedProduct): boolean {
  return (
    product.variants.length === 0 ||
    product.variants.some((variant) => variant.isAvailable && variant.stock > 0)
  );
}

/** The cheapest thing actually on offer — what a buyer reads a "from" price as. */
function displayPrice(product: SearchedProduct): string {
  const prices = product.variants
    .filter((variant) => variant.isAvailable && variant.stock > 0)
    .map((variant) => parseFloat(variant.price ?? ''))
    .filter(Number.isFinite);
  return money(prices.length ? Math.min(...prices) : parseFloat(product.price));
}

/** A card is only as good as its picture, and a sold-out size's photo is the wrong one to show. */
function pickPhoto(product: SearchedProduct) {
  return (
    product.variants.find((variant) => variant.imageUrl && variant.isAvailable && variant.stock > 0)
    ?? product.variants.find((variant) => variant.imageUrl)
    ?? null
  );
}

/**
 * What a card reads as without its picture. The merchant inbox and the agent's own
 * conversation history only ever see text, so a template that went out as buttons has to
 * leave a sentence behind — and a dry-run send (the operator's test panel) puts the cards
 * on this path instead of the wire.
 */
export function cardsAsText(cards: MessengerCard[]): string {
  return cards.map((card) => `${card.title} — ${card.subtitle}`).join('\n');
}

/**
 * What an Order button posts back when it is tapped. The product id alone was enough while an order
 * could be a product; now that every order names the size it sold as, a card that has already picked
 * one says so, and a card that has not (a search result) leaves the choice to the next step.
 */
function orderPayload(productId: string, label: string, variantId?: string | null): string {
  return variantId
    ? `place order with ${productId} and ${label} variant ${variantId}`
    : `place order with ${productId} and ${label}`;
}

/** One line of a card the buyer reads: what it is, what it costs, how many are left. */
function variantLine(productName: string, variantName: string): string {
  return oneLine(`${productName} — ${variantName}`, 60);
}

function variantPriceLine(price: string, stock: number, photo?: { index: number; of: number }): string {
  const parts = [price, `${stock} in stock`];
  // A single-photo size must not read as the plain variant card it also is: saying "the only photo"
  // is what tells the customer nothing further exists to ask for.
  if (photo) parts.push(photo.of === 1 ? 'the only photo' : `photo ${photo.index} of ${photo.of}`);
  return oneLine(parts.join(' · '), 95);
}

/** How many pictures a size actually has, from whatever the caller already holds. */
function photoCount(variant: { imageUrls?: string[] | null; imageUrl?: string | null }): number {
  return variant.imageUrls?.length ?? (variant.imageUrl ? 1 : 0);
}

/**
 * Token-safe color and size extraction from a variant name (e.g. "Black XL", "Navy M", "Crimson").
 */
export function parseVariantAttributes(name: string): { color: string | null; size: string | null } {
  let norm = (name || '').trim();
  // If variant name is formatted as "Product Name - Variant Details", isolate variant details
  if (norm.includes(' - ')) {
    norm = norm.split(' - ').slice(1).join(' - ').trim();
  } else if (norm.includes(' — ')) {
    norm = norm.split(' — ').slice(1).join(' — ').trim();
  }

  const tokens = norm.split(/\s+/);
  const knownSizes = new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', 'SMALL', 'MEDIUM', 'LARGE', 'FREE', 'FREESIZE']);
  let size: string | null = null;
  const colorTokens: string[] = [];
  for (const t of tokens) {
    if (knownSizes.has(t.toUpperCase())) {
      size = t;
    } else {
      colorTokens.push(t);
    }
  }
  const color = colorTokens.length > 0 ? colorTokens.join(' ') : null;
  return { color, size };
}

/**
 * The order's state, said plainly. Every earlier version of this map claimed a time as well as a status
 * — "Just placed" for pending — and a state column that only the merchant can move does not age with the
 * order, so a June sale still read "Just placed" beside its own June date. The word is now the state and
 * nothing else; when is what the date on the card is for.
 */
const STATE_FOR_BUYER: Record<string, string> = {
  pending: 'Pending',
  acknowledged: 'Acknowledged',
  onDelivery: 'On delivery',
  done: 'Done',
};

/**
 * The state word a customer is allowed to hear. Every tool result the model reads is relayed to them in
 * prose, so a raw enum value in one of those results reaches a Bangla reply as English jargon — "pending
 * অবস্থায় আছে" is a stored example, and "onDelivery" is not a word anyone reads. Nothing that hands an
 * order to the model may pass the column through untouched.
 */
function stateWord(state: string): string {
  return STATE_FOR_BUYER[state] ?? state;
}

/** Catalog tools shared by every transport (Messenger, comments, future ones). */
export function createCatalogTools(context: {
  businessId: string;
  /** Optional: links an order to the originating Messenger conversation. */
  conversationId?: string;
  /**
   * Optional: the buyer's page-scoped Messenger id, written on the order so they can ask for their own
   * history later. Absent for a comment thread or a dashboard form, where no such id is in hand.
   */
  customerPlatformId?: string | null;
  customerName?: string | null;
  emitSse?: SseEmitter;
  agentState?: ConversationAgentState;
  persistAgentState?: (state: ConversationAgentState) => Promise<void>;
}, options: {
  includeOrderTools?: boolean;
  onOrderCreated?: (order: { id: string; totalPrice: string | number }) => Promise<void>;
} = {}) {
  const getProductTool = tool(
    async ({ query }) => {
      context.emitSse?.('tool_call', { name: 'get_product', args: { query } });
      console.log(`[agent-tool] get_product called with query="${query}"`);

      const products = await searchProducts(context.businessId, query, 3);
      const result = JSON.stringify(
        products.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          sku: p.sku,
          description: oneLine(p.description, 120),
          variantCount: p.variants.length,
          availableVariantCount: p.variants.filter((v) => v.isAvailable && v.stock > 0).length,
          variants: p.variants.slice(0, 8).map((v) => {
            const attrs = parseVariantAttributes(v.name);
            return {
              id: v.id,
              name: v.name,
              color: attrs.color,
              size: attrs.size,
              price: v.price,
              stock: v.stock,
              available: v.isAvailable && v.stock > 0,
              photos: photoCount(v),
            };
          }),
          remainingVariants: Math.max(0, p.variants.length - 8),
        })),
      );

      console.log(`[agent-tool] get_product result: ${result.slice(0, 200)}${result.length > 200 ? '…' : ''}`);
      context.emitSse?.('tool_result', { name: 'get_product', result });
      return result;
    },
    {
      name: 'get_product',
      description: 'Read-only search by product name or SKU. Use when answering text questions about price, stock, or specs without a productId; do NOT use to send cards.',
      schema: z.object({
        query: z.string().describe('Product name or SKU to search for'),
      }),
    },
  );

  /**
   * The short label a merchant stamps on a variant's photo, read off the picture the customer
   * sent. A label is the one thing in this store that names one size of one product exactly, so
   * a lookup either answers the question outright or says so — and then the model is left with
   * what it can see, which is the second path this tool exists to hand over.
   */
  const getProductByVariantIdTool = tool(
    async ({ variantId }) => {
      // A model quotes the stamp as it reads it: "#AFG23", "afg23", sometimes with the label of
      // the picture beside it. Only the five characters matter.
      const label = variantId.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

      context.emitSse?.('tool_call', { name: 'get_product_by_variant_id', args: { variantId: label } });
      console.log(`[agent-tool] get_product_by_variant_id called with label="${label}"`);

      if (!/^[A-Z0-9]{5}$/.test(label)) {
        const result = JSON.stringify({
          found: false,
          read: variantId,
          instruction:
            'That is not a variant label — a label is five characters of letters and digits, like AFG23. '
            + 'If the customer named the size in words ("Fg", "Black", "Small") instead, that is not a label: '
            + 'call show_variant_photos or show_product_info with the product and that word. '
            + 'Otherwise read the picture again and look for the stamped code, or search the catalog by what you see.',
        });
        context.emitSse?.('tool_result', { name: 'get_product_by_variant_id', result });
        return result;
      }

      const product = await getProductByVariantId(context.businessId, label);
      const variant = product?.variants.find((v) => v.variantId === label) ?? null;

      if (!product || !variant) {
        const result = JSON.stringify({
          found: false,
          variantId: label,
          instruction:
            'Nothing in this store wears that label. Reason from the picture itself and search the '
            + 'catalog with the words that best describe what you see, or say the item is not one of ours.',
        });
        context.emitSse?.('tool_result', { name: 'get_product_by_variant_id', result });
        return result;
      }

      const result = JSON.stringify({
        found: true,
        variantId: label,
        product: {
          id: product.id,
          name: product.name,
          sku: product.sku,
          price: product.price,
          description: product.description,
        },
        variant: {
          id: variant.id,
          name: variant.name,
          price: variant.price,
          stock: variant.stock,
          isAvailable: variant.isAvailable,
        },
        instruction: context.conversationId
          ? `Found matching variant: ${product.name}, variant ${variant.name}. Call show_products(query="${product.name}") to display it. Never mention the 5-character photo code in customer text.`
          : `Found matching variant: ${product.name}, variant ${variant.name}. Answer with it without mentioning the 5-character code.`,
      });
      console.log(`[agent-tool] get_product_by_variant_id result: ${result.slice(0, 200)}${result.length > 200 ? '…' : ''}`);
      context.emitSse?.('tool_result', { name: 'get_product_by_variant_id', result });
      return result;
    },
    {
      name: 'get_product_by_variant_id',
      description: 'Read-only lookup of a 5-character alphanumeric photo stamp (e.g. AFG23). Use first when a photo or message shows a 5-char code; do NOT pass size/color words.',
      schema: z.object({
        variantId: z.string().min(1).max(40).describe('The stamped label, with or without its #'),
      }),
    },
  );

  const getProductOptionsTool = tool(
    async ({ productId }) => {
      const product = await getProductById(context.businessId, productId);
      if (!product) return JSON.stringify({ found: false });
      const variants = product.variants.map((v) => {
        const attrs = parseVariantAttributes(v.name);
        return {
          id: v.id,
          name: v.name,
          color: attrs.color,
          size: attrs.size,
          label: v.variantId ?? null,
          price: v.price ?? product.price,
          stock: v.stock,
          available: v.isAvailable && v.stock > 0,
          photos: photoCount(v),
        };
      });
      const colors = Array.from(new Set(variants.map((v) => v.color).filter((c): c is string => Boolean(c))));
      const sizes = Array.from(new Set(variants.map((v) => v.size).filter((s): s is string => Boolean(s))));
      const totalStock = variants.reduce((acc, v) => acc + (v.stock || 0), 0);
      return JSON.stringify({
        id: product.id,
        name: product.name,
        price: product.price,
        // The declared options and every value they take — the answer to "which colors/sizes does
        // it come in?", carried here so the model never has to ask the customer or guess one.
        options: (product.options ?? []).map((o) => ({ name: o.name, values: o.values.map((v) => v.value) })),
        colors,
        sizes,
        totalStock,
        variantCount: variants.length,
        availableCount: variants.filter((v) => v.available).length,
        variants,
      });
    },
    {
      name: 'get_product_options',
      description: 'Read-only lookup of one productId\u2019s declared options with every value they take, plus parsed colors/sizes, prices, stock and photo counts. Use for \u2018how many colors/sizes?\u2019 or stock questions; do NOT use when customer wants cards.',
      schema: z.object({ productId: z.string().uuid() }),
    },
  );

  /**
   * Pins the one variant a customer means, from the option values they gave. The product's
   * declared options ride in the product details and in get_product_options, so this tool is
   * called once the values are already known — never as a way to discover them.
   */
  const findVariantTool = tool(
    async ({ productId, options }) => {
      context.emitSse?.('tool_call', { name: 'find_variant', args: { productId, options } });
      console.log(`[agent-tool] find_variant called — productId=${productId} options=${JSON.stringify(options)}`);
      const logResult = (result: string) => {
        console.log(`[agent-tool] find_variant result: ${result.slice(0, 200)}${result.length > 200 ? '…' : ''}`);
        context.emitSse?.('tool_result', { name: 'find_variant', result });
        return result;
      };

      const product = await getProductById(context.businessId, productId).catch(() => null);
      if (!product) {
        return logResult(JSON.stringify({
          found: false,
          reason: 'no product with that id in this store',
          instruction: 'Search the catalog with show_products first. Do not invent a product.',
        }));
      }

      const declared = (product.options ?? []).map((o) => ({ name: o.name, values: o.values.map((v) => v.value) }));
      if (declared.length === 0) {
        return logResult(JSON.stringify({
          found: false,
          product: { id: product.id, name: product.name },
          reason: 'this product declares no options — its variants are free-named rows',
          variants: product.variants.map((v) => ({ id: v.id, name: v.name, label: v.variantId ?? null, price: v.price ?? product.price, stock: v.stock })),
          instruction: 'Pick the variant by name with show_variant_photos(productId, variantId="<name>"), or put them all on cards with show_product_info.',
        }));
      }

      // Fold what the model sent onto the declared names and values, so "red" pins "Red" and a
      // misspelled option name still lands on the option it belongs to. What comes back is the
      // store's own spelling, which is what the variant row carries.
      const chosen: Record<string, string> = {};
      const unknown: string[] = [];
      for (const [key, value] of Object.entries(options)) {
        const option = declared.find((o) => foldName(o.name) === foldName(key));
        if (!option) {
          unknown.push(key);
          continue;
        }
        const match = option.values.find((v) => foldName(v) === foldName(String(value)));
        if (!match) {
          return logResult(JSON.stringify({
            found: false,
            product: { id: product.id, name: product.name },
            reason: `"${value}" is not a ${option.name} this product offers`,
            option: { name: option.name, values: option.values },
            instruction: `Offer the ${option.name}s that exist: ${option.values.join(', ')}. Do not invent one, and do not apologize for the store.`,
          }));
        }
        chosen[option.name] = match;
      }
      if (unknown.length > 0) {
        return logResult(JSON.stringify({
          found: false,
          reason: `this product declares no option named ${unknown.map((u) => `"${u}"`).join(' or ')}`,
          options: declared,
          instruction: `The options are: ${declared.map((o) => o.name).join(', ')}. Choose values from those, and tell the customer what exists.`,
        }));
      }

      const matches = product.variants.filter((v) => {
        const row = v.options ?? {};
        return Object.entries(chosen).every(([name, value]) => (row[name] ?? '').toLowerCase() === value.toLowerCase());
      });

      if (matches.length === 0) {
        return logResult(JSON.stringify({
          found: false,
          chosen,
          combinations: product.variants.map((v) => ({ id: v.id, name: v.name, label: v.variantId ?? null, options: v.options ?? {}, stock: v.stock })),
          instruction: 'Nothing matches that combination. Offer the combinations above that are in stock, or say this one is not available.',
        }));
      }

      if (matches.length > 1) {
        return logResult(JSON.stringify({
          found: true,
          multiple: true,
          matches: matches.map((v) => ({ id: v.id, name: v.name, label: v.variantId ?? null, options: v.options ?? {}, price: v.price ?? product.price, stock: v.stock })),
          instruction: 'More than one variant answers that — an option is still undecided. Ask the customer for it, or put the matches on cards with show_product_info.',
        }));
      }

      const variant = matches[0]!;
      return logResult(JSON.stringify({
        found: true,
        variant: {
          id: variant.id,
          name: variant.name,
          label: variant.variantId ?? null,
          options: variant.options ?? {},
          price: variant.price ?? product.price,
          stock: variant.stock,
          available: variant.isAvailable && variant.stock > 0,
        },
        instruction: context.conversationId
          ? `Variant pinned: ${variant.name}. Call show_variant_photos(productId="${product.id}", variantId="${variant.id}") to show its pictures, then offer to order it. Never mention ids in customer text.`
          : `Variant pinned: ${variant.name}. Answer with it without mentioning ids.`,
      }));
    },
    {
      name: 'find_variant',
      description: 'Pins the exact variant of ONE product from option values the customer gave, e.g. {"Color":"Red","Size":"XL"}. Call after the product is known, then show_variant_photos with the returned variant id. The product\u2019s declared options ride in the product details and get_product_options — read them there instead of asking the customer.',
      schema: z.object({
        productId: z.string().uuid().describe('Product UUID'),
        options: z.record(z.string().min(1), z.string().min(1)).describe(
          'Option name to the value the customer chose, e.g. {"Color":"Red","Size":"XL"}',
        ),
      }),
    },
  );

  const createOrderTool = tool(
    async ({ productId, variantId, count, customerAddress, customerPhone, shippingCost, paymentMethod, transactionId, requestedPrice }) => {
      context.emitSse?.('tool_call', { name: 'create_order', args: { productId, variantId, count, customerAddress, customerPhone, shippingCost, paymentMethod, transactionId, requestedPrice } });
      console.log(`[agent-tool] create_order called — productId=${productId} variantId=${variantId ?? 'none'} count=${count ?? 1} requestedPrice=${requestedPrice}`);

      const paymentNeedsTransaction = /bkash|nagad|বিকাশ|নগদ/i.test(paymentMethod ?? '');
      const paidTransactionId = transactionId?.trim() || null;

      /** A payment already moved; a failed order is the owner's problem right now, not later. */
      const notifyPaidOrderFailure = async (reason: string) => {
        if (!paidTransactionId) return;
        try {
          const product = await getProductById(context.businessId, productId).catch(() => null);
          await createBusinessNotification({
            businessId: context.businessId,
            kind: 'payment_order_failed',
            title: 'Payment received but order failed',
            body: `${count ?? 1} × ${product?.name ?? 'an item'} — ${paymentMethod?.trim() || 'mobile payment'} (TrxID ${paidTransactionId}). ${reason}`,
            link: context.conversationId
              ? `/b/${context.businessId}/inbox?c=${context.conversationId}`
              : `/b/${context.businessId}/orders`,
          });
        } catch (err) {
          console.error('[agent-tool] paid order failed but the owner could not be notified:', err);
        }
      };

      // A retry of the SAME order seconds later is a duplicate; anything the customer actually
      // wants next is a new sale. The window is short and the match is product+variant, because
      // the old five-minute, any-product guard turned a second purchase into a refusal and told
      // the model the previous order was "already active" for whatever it asked next.
      if (context.agentState?.lastOrder?.state === 'Pending') {
        const last = context.agentState.lastOrder;
        const timeSince = Date.now() - new Date(last.createdAt).getTime();
        const sameProduct = Boolean(last.productId) && last.productId === productId;
        const sameVariant = !variantId || !last.variantId || last.variantId === variantId;
        if (timeSince < 60 * 1000 && sameProduct && sameVariant && last.productName) {
          const dupResult = JSON.stringify({
            created: false,
            duplicate: true,
            existingOrder: {
              id: last.id,
              productName: last.productName,
              variantName: last.variantName,
              count: last.count,
              totalPrice: last.totalPrice,
              state: 'Pending',
            },
            note: 'This exact order was placed moments ago and is still active, so nothing new was created.',
            instruction:
              'Tell the customer the earlier order is already in place with these numbers. Do not claim a new order was created, and do not retry this one. If they want different items, a different variant, or another quantity, call create_order again for that.',
          });
          context.emitSse?.('tool_result', { name: 'create_order', result: dupResult });
          return dupResult;
        }
      }

      let result: string;

      /**
       * An order that names no variant has no size to price from, no stock to check, no picture to
       * show the customer later, and nothing for the merchant to pick off the shelf. One size left in
       * the store answers itself; several do not, and guessing is the merchant receiving the wrong box.
       */
      if (
        !count ||
        !customerAddress?.trim() ||
        !customerPhone?.trim() ||
        (paymentNeedsTransaction && !paidTransactionId)
      ) {
        const missing = [
          !count ? 'quantity' : null,
          !customerPhone?.trim() ? 'phone' : null,
          !customerAddress?.trim() ? 'delivery address' : null,
          paymentNeedsTransaction && !paidTransactionId ? 'payment transaction id' : null,
        ].filter(Boolean);
        const result = JSON.stringify({
          created: false,
          missing,
          ...(paymentNeedsTransaction && !paidTransactionId
            ? {
                instruction:
                  'The customer chose bKash or Nagad, so a transaction id is required before ordering. Ask them to send the TrxID from their payment SMS, then call create_order again with it. Do not invent or reuse an id.',
              }
            : {}),
        });
        context.emitSse?.('tool_result', { name: 'create_order', result });
        return result;
      }

      const product = await getProductById(context.businessId, productId).catch((err) => {
        console.error('[agent-tool] create_order could not load the product before pricing:', err);
        return null;
      });
      if (!product) {
        result = JSON.stringify({
          created: false,
          error: 'Product not found',
          instruction:
            'Nothing was ordered. Tell the customer this item is not available and offer another product.',
        });
        context.emitSse?.('tool_result', { name: 'create_order', result });
        return result;
      }

      let chosenVariantId = variantId ?? undefined;
      if (!chosenVariantId) {
        const sizes = product.variants ?? [];
        if (sizes.length > 1) {
          result = JSON.stringify({
            error: `${product.name} is sold in ${sizes.length} variants, so the order has to say which one`,
            variants: sizes.map((v) => ({ id: v.id, name: v.name, price: v.price, stock: v.stock })),
            instruction:
              'Nothing was ordered. Call show_product_info for this product — the customer taps the size they want '
              + 'and the tap carries its variant id — then ask them to pick. Do not choose a size for them, and do '
              + 'not call create_order again until one is known.',
          });
          console.log(`[agent-tool] create_order refused — no variant chosen for ${product.name}`);
          await notifyPaidOrderFailure(
            `No variant was chosen for ${product.name}, so the paid order was not created.`,
          );
          context.emitSse?.('tool_result', { name: 'create_order', result });
          return result;
        }
        if (sizes.length === 1) chosenVariantId = sizes[0].id;
      }

      const chosenVariant = chosenVariantId
        ? product.variants.find((variant) => variant.id === chosenVariantId)
        : product.variants.length === 1
          ? product.variants[0]
          : undefined;
      if (chosenVariantId && !chosenVariant) {
        result = JSON.stringify({
          created: false,
          error: 'Variant not found',
          instruction:
            'Nothing was ordered. Reload the product and ask the customer to choose one of its listed variants.',
        });
        context.emitSse?.('tool_result', { name: 'create_order', result });
        return result;
      }

      /**
       * The catalog is the floor. A customer may ask for a lower price, but the agent may never
       * turn that ask into a discounted order: anything below the listed product/variant price
       * is refused here, before stock, totals or a customer record are touched.
       */
      const listedUnitPrice = chosenVariant?.price ?? product.price;
      if (!Number.isFinite(listedUnitPrice) || listedUnitPrice < 0) {
        result = JSON.stringify({
          created: false,
          error: 'The listed price is unavailable, so this order cannot be created.',
          instruction:
            'Nothing was ordered. Ask the customer to try again later or hand the conversation to the merchant.',
        });
        context.emitSse?.('tool_result', { name: 'create_order', result });
        return result;
      }

      const listedCents = Math.round(listedUnitPrice * 100);
      const requestedCents = Math.round(requestedPrice * 100);
      if (requestedCents < listedCents) {
        result = JSON.stringify({
          created: false,
          refused: true,
          reason: 'price_below_listed',
          productName: product.name,
          variantName: chosenVariant?.name ?? null,
          requestedPrice,
          listedPrice: listedUnitPrice,
          instruction:
            `Do not create this order and do not promise the lower price. ${product.name}`
            + `${chosenVariant ? ` (${chosenVariant.name})` : ''} is listed at ${listedUnitPrice} per unit; `
            + `the customer asked for ${requestedPrice}. Tell them the listed price is the lowest available and `
            + `offer another product if needed. Only if they accept ${listedUnitPrice} or more, call create_order `
            + `again with requestedPrice set to ${listedUnitPrice}. Never claim a discount was approved.`,
        });
        console.log(
          `[agent-tool] create_order refused — requested ${requestedPrice} is below the listed ${listedUnitPrice} for ${product.name}`,
        );
        await notifyPaidOrderFailure(
          `The customer requested ${requestedPrice} per unit but the listed price is ${listedUnitPrice}, so no order was created.`,
        );
        context.emitSse?.('tool_result', { name: 'create_order', result });
        return result;
      }

      try {
        const order = await createOrder({
          businessId: context.businessId,
          productId,
          variantId: chosenVariantId,
          count,
          customerName: context.customerName ?? 'Customer',
          customerPhone,
          customerAddress,
          // Only what the buyer actually agreed to: a shipping charge nobody quoted and a payment
          // method nobody named are absences, and the confirmation card says nothing about them.
          shippingCost: typeof shippingCost === 'number' && shippingCost >= 0 ? shippingCost : undefined,
          paymentMethod: paymentMethod?.trim() ? paymentMethod.trim() : undefined,
          transactionId: paidTransactionId ?? undefined,
          conversationId: context.conversationId,
          customerPlatformId: context.customerPlatformId ?? undefined,
        });
        result = JSON.stringify({ ...order, state: stateWord(order.state) });
        await options.onOrderCreated?.({ id: order.id, totalPrice: order.totalPrice }).catch((err) => {
          console.error('[agent-tool] order created but tracking delivery failed:', err);
        });
      } catch (err) {
        result = err instanceof Error ? err.message : 'Failed to create order.';
        await notifyPaidOrderFailure(`The order could not be created: ${result}`);
      }

      console.log(`[agent-tool] create_order result: ${result}`);
      context.emitSse?.('tool_result', { name: 'create_order', result });
      return result;
    },
    {
      name: 'create_order',
      description: 'Creates a new customer order. Use ONLY when productId, variantId, count, requestedPrice, customerPhone, and customerAddress are all known; requestedPrice is the customer-agreed per-unit price and any value below the listed catalog price is refused; do NOT use to edit an existing order.',
      schema: z.object({
        productId: z.string().uuid(),
        variantId: z.string().uuid().nullable().optional().describe(
          'The UUID of the size/variant the customer chose. Required whenever the product has variants; the Order button on a variant card carries it.',
        ),
        count: z.number().int().min(1),
        requestedPrice: z.number().min(0).describe(
          'The per-unit price the customer asked for or agreed to, in the store currency. Pass the listed price when no lower price was discussed. A price below the DB-listed product/variant price is refused and no order is created.',
        ),
        customerAddress: z.string().nullable(),
        customerPhone: z.string().nullable(),
        shippingCost: z.number().min(0).nullable().optional().describe(
          'The delivery charge quoted to the customer and agreed by them, in Taka. Omit when nobody quoted one — the confirmation card then says nothing about shipping.',
        ),
        paymentMethod: z.string().max(40).nullable().optional().describe(
          'How the customer will pay, in their words: "Cash on delivery", "bKash", "Nagad". Ask before ordering when they have not said; omit only if they refuse to answer.',
        ),
        transactionId: z.string().max(120).nullable().optional().describe(
          'The bKash/Nagad transaction id from the customer. Required before ordering when paymentMethod is bKash or Nagad; never invent, guess or reuse one.',
        ),
      }),
    },
  );

  const getOrderTool = tool(
    async ({ orderId }) => {
      const targetOrderId = orderId || context.agentState?.lastOrder?.id;
      if (!targetOrderId) {
        return 'Order not found. Please provide an order ID or tap Track Order.';
      }
      context.emitSse?.('tool_call', { name: 'get_order', args: { orderId: targetOrderId } });
      console.log(`[agent-tool] get_order called — orderId=${targetOrderId}`);

      const order = await getOrderById(context.businessId, targetOrderId);
      const result = order
        ? JSON.stringify({ ...order, state: order.state ? stateWord(order.state) : order.state })
        : 'Order not found.';

      console.log(`[agent-tool] get_order result: ${result}`);
      context.emitSse?.('tool_result', { name: 'get_order', result });
      return result;
    },
    {
      name: 'get_order',
      description: 'Read-only lookup of status and details for one orderId (or latest order in State). Use for Track button taps or status questions; do NOT use for full order history.',
      schema: z.object({
        orderId: z.string().uuid().nullable().optional().describe('Order UUID; omit or null to use State.lastOrder.id'),
      }),
    },
  );

  const updateOrderTool = tool(
    async ({ orderId, count, customerPhone, customerAddress }) => {
      const targetOrderId = orderId || context.agentState?.lastOrder?.id;
      if (!targetOrderId) {
        return 'Order not found. Please specify which order to update.';
      }
      context.emitSse?.('tool_call', { name: 'update_order', args: { orderId: targetOrderId, count, customerPhone, customerAddress } });
      console.log(`[agent-tool] update_order called — orderId=${targetOrderId}`);

      const order = await getOrderById(context.businessId, targetOrderId);
      if (!order) {
        const result = 'Order not found.';
        context.emitSse?.('tool_result', { name: 'update_order', result });
        return result;
      }

      if (order.state !== 'pending') {
        const result = `Cannot update order. It is ${stateWord(order.state)}, and changes are only allowed while it is Pending. Say that to the customer in their own language.`;
        context.emitSse?.('tool_result', { name: 'update_order', result });
        return result;
      }

      let result: string;
      try {
        const updateResult = await updateOrder(context.businessId, targetOrderId, {
          count,
          customerPhone,
          customerAddress,
        });
        result = JSON.stringify(updateResult);
      } catch (err) {
        result = err instanceof Error ? err.message : 'Failed to update order.';
      }

      console.log(`[agent-tool] update_order result: ${result}`);
      context.emitSse?.('tool_result', { name: 'update_order', result });
      return result;
    },
    {
      name: 'update_order',
      description: 'Updates address, phone, or quantity of an existing order. Use when customer wants to change an existing order; do NOT use create_order.',
      schema: z.object({
        orderId: z.string().uuid().nullable().optional().describe('The UUID of the order to update (or null for latest order in State)'),
        count: z.number().int().min(1).optional(),
        customerPhone: z.string().optional(),
        customerAddress: z.string().optional(),
      }),
    },
  );

  const cancelOrderTool = tool(
    async ({ orderId }) => {
      const targetOrderId = orderId || context.agentState?.lastOrder?.id;
      if (!targetOrderId) {
        return 'Order not found. Please specify which order to cancel.';
      }
      context.emitSse?.('tool_call', { name: 'cancel_order', args: { orderId: targetOrderId } });
      console.log(`[agent-tool] cancel_order called — orderId=${targetOrderId}`);

      const order = await getOrderById(context.businessId, targetOrderId);
      if (!order) {
        const result = 'Order not found.';
        context.emitSse?.('tool_result', { name: 'cancel_order', result });
        return result;
      }

      if (order.state === 'done') {
        const result = `Cannot cancel order. It is already ${stateWord(order.state)}, so it can no longer be cancelled. Tell the customer that in their own language.`;
        context.emitSse?.('tool_result', { name: 'cancel_order', result });
        return result;
      }

      await deleteOrder(context.businessId, targetOrderId);
      const result = JSON.stringify({ id: targetOrderId, cancelled: true });
      console.log(`[agent-tool] cancel_order result: ${result}`);
      context.emitSse?.('tool_result', { name: 'cancel_order', result });
      return result;
    },
    {
      name: 'cancel_order',
      description: 'Cancels an existing order in Pending or Acknowledged state. Use when customer asks to cancel; do NOT use to edit an order.',
      schema: z.object({
        orderId: z.string().uuid().nullable().optional().describe('The UUID of the order to cancel (or null for latest order in State)'),
      }),
    },
  );

  const readOnlyTools = [getProductTool, getProductByVariantIdTool, getProductOptionsTool, findVariantTool];
  if (options.includeOrderTools === false) return readOnlyTools;
  return [
    ...readOnlyTools,
    createOrderTool,
    getOrderTool,
    updateOrderTool,
    cancelOrderTool,
  ];
}

export function createAgentTools(
  context: {
    businessId: string;
    conversationId: string;
    pageToken: string;
    customerPlatformId: string;
    customerName?: string | null;
    emitSse?: SseEmitter;
    /** Which inbox the page token sends into. Defaults to Messenger for the existing channels. */
    platform?: MessagingPlatform;
    /** Set for the one turn after a typed reply ignored the previous chips. */
    suppressSuggestions?: boolean;
    /** Override the Facebook send function (e.g. no-op in test mode). */
    sendMessageOverride?: (pageToken: string, psid: string, text: string) => Promise<void>;
    onOrderCreated?: (orderId: string) => Promise<void>;
    agentState?: ConversationAgentState;
    persistAgentState?: (state: ConversationAgentState) => Promise<void>;
  },
  /**
   * Called when something actually reached Messenger, with what kind of send it was: `reply` is text the
   * reply tool wrote, `card` is a product list or a button row. The runner needs the difference — a
   * closing line after a card is a second message the customer should get, while a closing line after
   * the reply tool would be the same words twice.
   */
  onSent?: (text: string, kind: 'reply' | 'card') => void,
) {
  /**
   * One thing that reaches Messenger is one unit of the message budget, whether it arrived
   * as a paragraph or as a row of cards. Claimed before the send and never after: the model
   * can emit two sends in one turn and they run concurrently. A dry-run override pays
   * nothing because nothing is on the wire, and a database that will not answer fails open
   * so a stall never mutes the agent.
   */
  async function takeMessageUnit(
    chargeable: boolean,
  ): Promise<{ allowed: boolean; period: string | null }> {
    if (!chargeable) return { allowed: true, period: null };
    try {
      const budget = await spendQuotaUnit(context.businessId, 'message');
      return budget.spent
        ? { allowed: true, period: budget.period }
        : { allowed: false, period: null };
    } catch (err) {
      console.error('[agent-tool] quota spend failed, sending uncharged:', err);
      return { allowed: true, period: null };
    }
  }

  /** A unit paid for a send that never happened is given straight back. */
  async function returnMessageUnit(period: string | null): Promise<void> {
    if (!period) return;
    try {
      await refundQuotaUnit(context.businessId, 'message', period);
    } catch (err) {
      console.error('[agent-tool] quota refund failed:', err);
    }
  }

  const BUDGET_REFUSED =
    "This cycle's replies are used up and the owner has been notified. Do not try again, and do not send anything else. End the turn.";
  const inbox = context.platform === 'instagram' ? 'Instagram Direct' : 'Messenger';

  /**
   * Cards go out on the same post as text; a dry-run renders them as the text a human
   * would have read, so the operator's test panel still shows something and Meta is
   * never contacted from a test conversation.
   */
  async function sendCards(cards: MessengerCard[]): Promise<void> {
    if (context.sendMessageOverride) {
      await context.sendMessageOverride(
        context.pageToken,
        context.customerPlatformId,
        cardsAsText(cards),
      );
      return;
    }
    await fbSendMessage(context.pageToken, context.customerPlatformId, cards, {
      platform: context.platform,
    });
  }

  async function sendButtonRow(
    text: string,
    buttons: Array<{ title: string; payload: string }>,
  ): Promise<void> {
    if (context.sendMessageOverride) {
      await context.sendMessageOverride(
        context.pageToken,
        context.customerPlatformId,
        `${text} (${buttons.map((button) => button.title).join(' / ')})`,
      );
      return;
    }
    await fbSendButtons(context.pageToken, context.customerPlatformId, text, buttons);
  }

  /**
   * The whole send for a row of cards, in one place: pay for the reply, put the cards on the wire,
   * keep the sentence a human would have read as the record, and hand the unit back if the wire
   * refuses. Says whether it went, because a refused budget is a different answer to the model than
   * a send that threw.
   *
   * `recordNote` is written into the stored line and never onto the wire. It exists because a tool
   * result is not kept between turns while the messages are: without the window the customer actually
   * saw, "and more?" on the NEXT turn has nothing to page from and sends the first ten again.
   */
  async function deliverCards(cards: MessengerCard[], recordNote?: string): Promise<boolean> {
    const budget = await takeMessageUnit(!context.sendMessageOverride);
    if (!budget.allowed) return false;

    const said = cardsAsText(cards);
    const content = recordNote ? `${said}\n${recordNote}` : said;
    try {
      await sendCards(cards);
    } catch (err) {
      await returnMessageUnit(budget.period);
      throw err;
    }
    await createMessage({
      conversationId: context.conversationId,
      from: 'self',
      content,
      state: 'done',
    });
    onSent?.(said, 'card');
    return true;
  }

  /**
   * The receipt the buyer scans right after they confirmed: the variant they chose in its own
   * photo, how many they took, which one by its shelf label, what it costs, what delivery adds
   * and how they are paying. Meta reads about 80 characters of the subtitle, so the parts are
   * ordered by what a buyer asks first and the least important falls off first.
   *
   * A variant without a photo cannot be a card — the generic template requires an image — so that
   * order falls back to the button row, carrying the same numbers in text.
   */
  const trackCreatedOrder = async (order: { id: string; totalPrice: string | number }) => {
    if (!context.conversationId) return;
    const orderDetails = await getOrderById(context.businessId, order.id);
    if (!orderDetails) return;

    const subtitle = oneLine(
      [
        `${orderDetails.count} pcs`,
        orderDetails.variantShortId ? `#${orderDetails.variantShortId}` : null,
        orderDetails.variantName,
        `Total ${money(orderDetails.totalPrice)}`,
        orderDetails.shippingCost > 0 ? `Delivery ${money(orderDetails.shippingCost)}` : null,
        orderDetails.paymentMethod,
        orderDetails.transactionId ? `TrxID ${orderDetails.transactionId}` : null,
      ].filter(Boolean).join(' · '),
      80,
    );
    const buttons = [{ title: 'Track order', payload: `please track order with id ${orderDetails.id}` }];
    const title = oneLine(orderDetails.productName ?? 'Your order', 60);
    const content = `${title} — ${subtitle} (Track order)`;

    const budget = await takeMessageUnit(!context.sendMessageOverride);
    if (!budget.allowed) return;
    try {
      if (orderDetails.variantImageUrl) {
        await sendCards([
          { title, subtitle, imageUrl: orderDetails.variantImageUrl, button: buttons[0]! },
        ]);
      } else {
        await sendButtonRow(`${title} — ${subtitle}`, buttons);
      }
    } catch (err) {
      await returnMessageUnit(budget.period);
      throw err;
    }
    await createMessage({ conversationId: context.conversationId, from: 'self', content, state: 'done' });
    onSent?.(content, 'card');
  };

  const showProductsTool = tool(
    async ({ query, category, startingLimit, endLimit }) => {
      const logResult = (result: string) => {
        console.log(`[agent-tool] show_products result: ${result.slice(0, 200)}${result.length > 200 ? '…' : ''}`);
        context.emitSse?.('tool_result', { name: 'show_products', result });
        return result;
      };

      const word = (query ?? '').trim();
      context.emitSse?.('tool_call', { name: 'show_products', args: { query: word, category, startingLimit, endLimit } });
      console.log(`[agent-tool] show_products called — query="${word}" category="${category ?? ''}"`);

      const from = Math.max(0, Math.trunc(startingLimit ?? 0));
      const to = Math.max(from + 1, Math.trunc(endLimit ?? from + CARD_LIST_LIMIT));
      const size = Math.min(CARD_LIST_LIMIT, to - from);

      // A category is something a merchant types in words and a customer repeats in words, so the word is
      // what gets matched. An id is accepted too, because a card tap or an earlier result may carry one —
      // but it is never something the customer could be asked for. The shelves are read without their
      // product counts, because only the reply that has to list them wants counts, and a filtered turn
      // should pay one round trip for this rather than two.
      let categoryId: string | null = null;
      let categoryHit: { id: string; name: string } | null = null;
      const wantedCategory = (category ?? '').trim();
      if (wantedCategory) {
        const shelves = await findCategories(context.businessId);
        const folded = foldName(wantedCategory);
        categoryHit = shelves.find((c) => c.id === wantedCategory)
          ?? shelves.find((c) => foldName(c.name) === folded)
          ?? shelves.find((c) => {
            const name = foldName(c.name);
            return name.length >= 2 && (name.includes(folded) || folded.includes(name));
          })
          ?? null;
        if (!categoryHit) {
          const withCounts = shelves.length ? await listCategories(context.businessId) : [];
          return logResult(JSON.stringify({
            sent: false,
            reason: shelves.length === 0
              ? 'this store does not group its products into categories'
              : `no category in this store answers to "${wantedCategory}"`,
            ...(withCounts.length ? { categories: withCounts.map((c) => ({ name: c.name, products: c.productCount })) } : {}),
            instruction: withCounts.length
              ? `Nothing was sent. The store's categories are: ${withCounts.map((c) => c.name).join(', ')}. Show the one the customer meant, or drop the category and search by product name. Do not ask the customer for a category id.`
              : 'Nothing was sent. This store does not group products into categories at all, so search by product name (show_products with the name, or no query for the store\'s first page) and answer from what comes back.',
          }));
        }
        categoryId = categoryHit.id;
      }

      // What this page is a page OF, said the way the customer said it. "Matching this search" would be a
      // lie when the customer named a category and no product word at all.
      const scope = categoryHit ? `in ${categoryHit.name}` : word ? `matching "${word}"` : 'on sale';

      // The count is asked for alongside the page because a card list can carry ten and a catalog can hold
      // a hundred and thirty-seven: without the second number, ten shown looks exactly like ten existing.
      // Both go through one predicate, so the window and the total count the same population.
      const [matches, total] = await Promise.all([
        searchProducts(context.businessId, word, size, { categoryId, offset: from }),
        countSearchResults(context.businessId, word, { categoryId }),
      ]);
      const shownThrough = from + matches.length;
      const hasMore = shownThrough < total;
      const nextPageArgs = [
        ...(word ? [`query "${word}"`] : []),
        ...(categoryHit ? [`category "${categoryHit.name}"`] : []),
        `startingLimit=${shownThrough || from}`,
        `endLimit=${(shownThrough || from) + size}`,
      ].join(', ');

      // An empty window now means exactly one thing, because page and total share a filter: with a row
      // still unshown behind the offset, the window would have found it. Every earlier version of this
      // branch guessed "the rest are out of stock" from the same shape, which is a story about inventory
      // the store never said — it is what asking for page fifteen of six products looks like.
      if (matches.length === 0) {
        return logResult(JSON.stringify({
          sent: false,
          matchingProducts: total,
          ...(total === 0 ? {} : { askedFor: `${from + 1}-${from + size}` }),
          hasMore: false,
          reason: total === 0
            ? (word
              ? `no product matches "${word}"${categoryHit ? ` in ${categoryHit.name}` : ''}`
              : categoryHit ? `nothing is on sale in ${categoryHit.name}` : 'this store has no products yet')
            : `every product ${scope} has already been shown — there is nothing at position ${from + 1} to show`,
          instruction: total === 0
            ? 'Do not invent a product and do not blame stock. Say the store has nothing of that kind, and ask what else the customer wants.'
            : 'Do not send the first page again, and never tell the customer the rest is out of stock — there is no rest. Ask which of what they have already seen they want.',
        }));
      }

      const products = matches.filter(isSellable);
      const unavailable = matches.filter((p) => !isSellable(p)).map((p) => p.name);
      const cards: MessengerCard[] = [];
      const photoless: string[] = [];

      for (const product of products) {
        const photo = pickPhoto(product);
        if (!photo?.imageUrl) {
          photoless.push(product.name);
          continue;
        }
        // A private key becomes a URL Messenger can fetch. One object that will not sign
        // loses its own card, not the whole list: a stalled bucket must not mute the catalog.
        const imageUrl = await resolveStoredImageUrl(photo.imageUrl).catch((err) => {
          console.error(`[agent-tool] show_products could not resolve image for "${product.name}":`, err);
          return null;
        });
        if (!imageUrl) {
          photoless.push(product.name);
          continue;
        }

        const summary = oneLine(product.description, SUMMARY_LIMIT);
        const price = displayPrice(product);
        const title = oneLine(product.name, 60);
        cards.push({
          title,
          subtitle: summary ? `${price} — ${summary}` : price,
          imageUrl,
          button: { title: 'Order', payload: orderPayload(product.id, title) },
          extraButtons: [{ title: 'Details', payload: detailsProductPayload(product.id) }],
        });
      }

      if (cards.length === 0) {
        // Nothing on this page can be carded is not nothing left to look at: a catalog whose next ten rows
        // are photoless would otherwise stop the browse here, with the rest of the store unexamined and
        // the model told nothing of it.
        return logResult(JSON.stringify({
          sent: false,
          showing: `${from + 1}-${shownThrough}`,
          matchingProducts: total,
          hasMore,
          products: products.map((p) => ({ id: p.id, name: p.name, price: p.price, description: p.description })),
          ...(unavailable.length ? { notBuyable: unavailable } : {}),
          reason: products.length === 0
            ? `all ${matches.length} products on this page are not available to order`
            : `none of the ${products.length} products on this page has a photo, and a card needs one`,
          instruction: hasMore
            ? `Nothing here could be sent, but ${total - shownThrough} more products ${scope} have not been looked at yet — keep paging with ${nextPageArgs} before you say the store has nothing to show. Do not tell the customer about these ones unless they ask.`
            : products.length === 0
              ? 'Nothing here is buyable and there is no further page. Say the store cannot take an order for that right now, and never that it has no such product.'
              : 'A card needs a photo and none of these has one, so nothing was sent. Describe them in your final reply instead.',
        }));
      }

      // A row of cards the customer sees is one reply, so it costs the cycle what a
      // paragraph would have cost.
      if (!(await deliverCards(
        cards,
        `showing ${from + 1}-${shownThrough} of ${total} ${scope}${hasMore ? ', more not shown' : ', that is all'}`,
      ))) {
        console.log(`[agent-tool] show_products refused — the message allowance is used up`);
        return logResult(BUDGET_REFUSED);
      }

      if (context.agentState) {
        if (products.length === 1) {
          const product = products[0];
          context.agentState.currentProduct = { id: product.id, name: product.name, price: product.price };
        }
        context.agentState.catalogCursor = {
          ...(word ? { query: word } : {}),
          ...(categoryHit ? { category: categoryHit.name } : {}),
          nextOffset: shownThrough,
          total,
        };
      }

      return logResult(JSON.stringify({
        sent: true,
        showing: `${from + 1}-${shownThrough}`,
        matchingProducts: total,
        ...(categoryHit ? { category: categoryHit.name } : {}),
        products: cards.map((card) => card.title),
        items: products.slice(0, cards.length).map((p) => ({
          title: oneLine(p.name, 60),
          price: displayPrice(p),
          stock: p.variants.reduce((acc, v) => acc + (v.isAvailable ? v.stock : 0), 0),
        })),
        ...(photoless.length ? { skippedWithoutPhoto: photoless } : {}),
        ...(unavailable.length ? { notBuyable: unavailable } : {}),
        hasMore,
      }));
    },
    {
      name: 'show_products',
      description: 'Display tool: sends up to 10 product cards with photo, price, and Order button. Use when customer asks to see or browse products; do NOT use for text count/info questions or category lists.',
      schema: z.object({
        query: z.string().optional().describe(
          'Product name or SKU to search for. Leave it out when the customer asks what the store has, or asks for a whole category — then filter with category alone.',
        ),
        category: z.string().max(255).optional().describe(
          'Optional: only products in this category, named as the merchant wrote it ("Saree", "electronics"). Never ask the customer for a category id.',
        ),
        startingLimit: z.number().int().min(0).optional().describe(
          'Index of the first product to show, in stable name order. 0 (the default) is the first page.',
        ),
        endLimit: z.number().int().min(1).optional().describe(
          'Index to stop at, exclusive. Defaults to startingLimit + 10; ten is all one card list can carry, so ask 0..10, then 10..20 for the next page.',
        ),
      }),
    },
  );

  const showOrdersTool = tool(
    async ({ startingLimit, endLimit }) => {
      const from = Math.max(0, Math.trunc(startingLimit ?? 0));
      const to = Math.max(from + 1, Math.trunc(endLimit ?? from + CARD_LIST_LIMIT));
      // One Messenger card list holds ten; wider asks are cut rather than silently truncated later.
      const size = Math.min(CARD_LIST_LIMIT, to - from);

      context.emitSse?.('tool_call', { name: 'show_orders', args: { startingLimit: from, endLimit: from + size } });
      console.log(`[agent-tool] show_orders called — page ${from}..${from + size}`);

      const logResult = (result: string) => {
        console.log(`[agent-tool] show_orders result: ${result.slice(0, 200)}${result.length > 200 ? '…' : ''}`);
        context.emitSse?.('tool_result', { name: 'show_orders', result });
        return result;
      };

      const { orders: page, hasMore } = await getOrdersByPlatformId(
        context.businessId,
        context.customerPlatformId,
        { offset: from, limit: size },
      );

      if (page.length === 0) {
        return logResult(JSON.stringify({
          sent: false,
          orders: [],
          reason: from > 0 ? 'no older orders than the ones already shown' : 'this customer has no orders at this store',
          instruction: 'Say so briefly and offer to help them order something. Do not invent an order.',
        }));
      }

      const cards: MessengerCard[] = [];
      const photoless: string[] = [];
      for (const o of page) {
        if (!o.imageUrl) {
          photoless.push(o.productName ?? 'an order');
        } else {
          const state = stateWord(o.state);
          const what = oneLine(`${o.count} × ${o.productName ?? 'your order'}`, 60);
          cards.push({
            title: what,
            subtitle: oneLine(`${state} · ${money(o.totalPrice)} · ${o.createdAt.toISOString().slice(0, 10)}`, 95),
            imageUrl: o.imageUrl,
            // The tap is the sentence the existing tracking path already understands.
            button: { title: 'Track order', payload: `please track order with id ${o.id}` },
          });
        }
      }

      const summary = page.map((o) => ({
        id: o.id,
        product: o.productName,
        variant: o.variantName,
        count: o.count,
        total: money(o.totalPrice),
        state: stateWord(o.state),
        date: o.createdAt.toISOString().slice(0, 10),
      }));

      if (cards.length === 0) {
        return logResult(JSON.stringify({
          sent: false,
          orders: summary,
          hasMore,
          reason: 'none of these orders has a product photo, and a card needs one',
          instruction: 'Name them briefly by item, date and status — never by an order id, product id or variant id, which a customer cannot read or use.',
        }));
      }

      // A list the customer sees is one reply, so it costs the cycle what a paragraph would have cost.
      if (!(await deliverCards(
        cards,
        `showing ${from + 1}-${from + page.length} orders${hasMore ? ', older ones not shown' : ', that is all of them'}`,
      ))) {
        console.log('[agent-tool] show_orders refused — the message allowance is used up');
        return logResult(BUDGET_REFUSED);
      }

      return logResult(JSON.stringify({
        sent: true,
        // The window is counted in orders, not in cards: a row that lost its photo is still one of
        // the customer's orders, and a range that quietly shrinks with it misreads the next page.
        showing: `${from + 1}-${from + page.length}`,
        cardsSent: cards.length,
        ...(photoless.length ? { skippedWithoutPhoto: photoless } : {}),
        hasMore,
      }));
    },
    {
      name: 'show_orders',
      description: 'Display tool: sends the customer’s past orders as Messenger cards (10 per page, newest first). Use for order history questions; do NOT use for single-order status (use get_order).',
      schema: z.object({
        startingLimit: z.number().int().min(0).optional().describe(
          'Index of the first order to show, newest first. 0 (the default) is the most recent order.',
        ),
        endLimit: z.number().int().min(1).optional().describe(
          'Index to stop at, exclusive. Defaults to startingLimit + 10; a page shows at most 10 cards, so ask for 0..10, then 10..20 for older ones.',
        ),
      }),
    },
  );

  /**
   * Every size an item comes in, one card each. A customer who has been shown a product by name has
   * not been shown what is actually for sale: the variants are the things with prices, stock and a
   * photo, and an order has to name one of them.
   */
  const showProductInfoTool = tool(
    async ({ productId }) => {
      context.emitSse?.('tool_call', { name: 'show_product_info', args: { productId } });
      console.log(`[agent-tool] show_product_info called — productId=${productId}`);

      const logResult = (result: string) => {
        console.log(`[agent-tool] show_product_info result: ${result.slice(0, 200)}${result.length > 200 ? '…' : ''}`);
        context.emitSse?.('tool_result', { name: 'show_product_info', result });
        return result;
      };

      const product = await getProductById(context.businessId, productId).catch((err) => {
        console.error('[agent-tool] show_product_info could not load the product:', err);
        return null;
      });
      if (!product) {
        return logResult(JSON.stringify({
          sent: false,
          reason: 'no product with that id in this store',
          instruction: 'Search the catalog with show_products instead. Do not invent a product.',
        }));
      }

      const line = { id: product.id, name: product.name, price: product.price };
      if (product.variants.length === 0) {
        return logResult(JSON.stringify({
          sent: false,
          product: line,
          reason: 'this product is sold as itself — it has no variants to list',
          instruction: 'Show it with show_products, which cards the product. Do not invent a variant.',
        }));
      }

      // Only what a customer could actually buy: an Order button on a sold-out size is a refusal waiting.
      const onOffer = product.variants.filter((v) => v.isAvailable && v.stock > 0);
      const soldOut = product.variants.filter((v) => !(v.isAvailable && v.stock > 0)).map((v) => v.name);

      if (onOffer.length === 0) {
        return logResult(JSON.stringify({
          sent: false,
          product: { ...line, variants: product.variants.map((v) => v.name) },
          reason: `every variant of ${product.name} is out of stock`,
          instruction: `Say briefly that ${product.name} is sold out in ${product.variants.length} sizes and offer what else the store has. Do not offer an Order button.`,
        }));
      }

      // What the model needs to answer the NEXT question about this product without asking the
      // customer anything: each size's id, its stamped label, and how many pictures it has.
      const listed = onOffer.map((v) => ({
        id: v.id,
        name: v.name,
        label: v.variantId ?? null,
        price: money(v.price ?? product.price),
        stock: v.stock,
        photos: photoCount(v),
      }));

      const cards: MessengerCard[] = [];
      const photoless: string[] = [];
      for (const variant of onOffer) {
        // A card needs a picture. A size with none is left off the cards and named in the result, so
        // the model can tell the customer it exists rather than silently shrinking the list.
        if (!variant.imageUrl) {
          photoless.push(variant.name);
          continue;
        }
        const label = variantLine(product.name, variant.name);
        cards.push({
          title: label,
          subtitle: variantPriceLine(money(variant.price ?? product.price), variant.stock),
          imageUrl: variant.imageUrl,
          button: { title: 'Order', payload: orderPayload(product.id, label, variant.id) },
          extraButtons: [{ title: 'Details', payload: detailsVariantPayload(product.id, variant.id) }],
        });
      }

      if (cards.length === 0) {
        return logResult(JSON.stringify({
          sent: false,
          product: line,
          variants: listed,
          reason: 'none of these sizes has a photo, and a card needs one',
          instruction: 'Name the sizes with their prices briefly and ask which one they want — by name, never by an id, which the customer cannot read.',
        }));
      }

      if (!(await deliverCards(cards))) {
        console.log('[agent-tool] show_product_info refused — the message allowance is used up');
        return logResult(BUDGET_REFUSED);
      }

      if (context.agentState) {
        context.agentState.currentProduct = { ...line, price: String(line.price) };
        context.agentState.currentVariant = null;
        context.agentState.shownVariants = [
          ...context.agentState.shownVariants.filter((v) => !listed.some((item) => item.id === v.id)),
          ...listed.map((v) => ({ id: v.id, name: v.name, price: v.price, stock: v.stock })),
        ].slice(-24);
      }

      return logResult(JSON.stringify({
        sent: true,
        product: line,
        // The declared options ride along: the next "do you have it in blue?" is answerable from
        // this result alone, without another lookup or a question to the customer.
        options: (product.options ?? []).map((o) => ({ name: o.name, values: o.values.map((v) => v.value) })),
        variants: listed,
        ...(photoless.length ? { skippedWithoutPhoto: photoless } : {}),
        ...(soldOut.length ? { hiddenOutOfStock: soldOut } : {}),
      }));
    },
    {
      name: 'show_product_info',
      description: 'Display tool: sends one Messenger card per in-stock variant/size of a product so the customer can pick and tap Order. Use when customer wants to see or choose sizes; do NOT use for text count questions (use get_product_options). The result carries the product\u2019s declared options.',
      schema: z.object({
        productId: z.string().uuid().describe('Product UUID whose variant cards should be displayed'),
      }),
    },
  );

  /**
   * Every photo of ONE size. A merchant hangs several pictures on a size — front, back, the label — and
   * a customer who wants to see the thing itself is asking about that size, not about the other four.
   * The price, the stock and the Order button are the same on every card, because it is one product
   * being looked at from several sides. The size is named the way a customer names it, because a UUID
   * is the one thing in this conversation nobody present can supply: it lives in a card's button, which
   * is never written into the history the next turn reads.
   */
  const showVariantPhotosTool = tool(
    async ({ productId, variantId }) => {
      context.emitSse?.('tool_call', { name: 'show_variant_photos', args: { productId, variantId } });
      console.log(`[agent-tool] show_variant_photos called — productId=${productId} variant="${variantId}"`);

      const logResult = (result: string) => {
        console.log(`[agent-tool] show_variant_photos result: ${result.slice(0, 200)}${result.length > 200 ? '…' : ''}`);
        context.emitSse?.('tool_result', { name: 'show_variant_photos', result });
        return result;
      };

      const product = await getProductById(context.businessId, productId).catch((err) => {
        console.error('[agent-tool] show_variant_photos could not load the product:', err);
        return null;
      });
      if (!product) {
        return logResult(JSON.stringify({
          sent: false,
          reason: 'no product with that id in this store',
          instruction: 'Search the catalog with show_products first. Do not invent a product.',
        }));
      }

      /** What a size answers to, in the order the customer can offer them: its word, then its label. */
      const sizes = product.variants.map((v) => ({
        id: v.id,
        name: v.name,
        label: v.variantId ?? null,
        photos: photoCount(v),
      }));

      const { matches, via } = matchVariant(product.variants, variantId);

      if (matches.length === 0) {
        return logResult(JSON.stringify({
          sent: false,
          product: { id: product.id, name: product.name },
          sizes,
          reason: `no size of ${product.name} answers to "${variantId}"`,
          instruction:
            `This product has ${sizes.length} sizes: ${sizes.map((s) => s.label ? `${s.name} (label ${s.label})` : s.name).join(', ')}. `
            + 'Tell the customer which sizes there are and ask which one they mean, by name, or call show_product_info to put them on cards. '
            + 'Never ask the customer for an id — nobody can read or type one, and the sizes above are already everything they could mean.',
        }));
      }

      if (matches.length > 1) {
        const candidates = matches.map((v) => ({ id: v.id, name: v.name, label: v.variantId ?? null, photos: photoCount(v) }));
        return logResult(JSON.stringify({
          sent: false,
          product: { id: product.id, name: product.name },
          candidates,
          reason: `"${variantId}" matches ${matches.length} sizes of ${product.name}`,
          instruction:
            `Two or more sizes answer to that word: ${candidates.map((c) => c.name).join(', ')}. Nothing was sent. `
            + 'Ask the customer which of those they mean, or call show_product_info to put them on cards. Do not pick one, '
            + 'and do not ask for an id.',
        }));
      }

      const variant = matches[0];
      // The pictures the customer can actually be shown (signed links) against the pictures the store
      // holds on record. A gap between them is a storage fault, and it must never be reported as
      // "this size has no picture" — nor quietly papered over with a promise of more.
      const stored = variant.imageKeys?.length ?? (variant.imageUrl || variant.imageKey ? 1 : 0);
      const photos = (variant.imageUrls?.length ? variant.imageUrls : variant.imageUrl ? [variant.imageUrl] : [])
        .filter((url): url is string => Boolean(url));

      if (photos.length === 0) {
        return logResult(JSON.stringify({
          sent: false,
          variant: { id: variant.id, name: variant.name, label: variant.variantId ?? null, price: money(variant.price ?? product.price), stock: variant.stock },
          photosOnRecord: stored,
          ...(via !== 'id' && via !== 'none' ? { matchedBy: via } : {}),
          ...(stored > 0
            ? {
                reason: `this size has ${stored} pictures on record but none could be shown right now`,
                instruction:
                  `Say that the picture of ${variant.name} cannot be shown at the moment. Do NOT say the store has no picture of it, `
                  + 'do not send, promise or describe a photo you do not have, and offer the written details or another size from show_product_info.',
              }
            : {
                reason: `this size has no picture on record at all`,
                instruction:
                  `Say briefly that we have no picture of ${variant.name}. Do not send, promise, describe or apologise for `
                  + 'a photo the store does not have. Give the written details instead, or offer another size with show_product_info.',
              }),
        }));
      }

      const shown = photos.slice(0, CARD_LIST_LIMIT);
      const last = shown.length;
      const label = variantLine(product.name, variant.name);
      const cards: MessengerCard[] = shown.map((imageUrl, index) => ({
        title: label,
        subtitle: variantPriceLine(
          money(variant.price ?? product.price),
          variant.stock,
          { index: index + 1, of: photos.length },
        ),
        imageUrl,
        button: { title: 'Order', payload: orderPayload(product.id, label, variant.id) },
      }));

      if (!(await deliverCards(cards))) {
        console.log('[agent-tool] show_variant_photos refused — the message allowance is used up');
        return logResult(BUDGET_REFUSED);
      }

      if (context.agentState) {
        context.agentState.currentProduct = { id: product.id, name: product.name, price: String(product.price) };
        context.agentState.currentVariant = {
          id: variant.id,
          name: variant.name,
          price: String(variant.price ?? product.price),
          stock: variant.stock,
        };
        context.agentState.shownVariants = [
          ...context.agentState.shownVariants.filter((v) => v.id !== variant.id),
          { id: variant.id, name: variant.name, price: String(variant.price ?? product.price), stock: variant.stock },
        ].slice(-24);
      }

      return logResult(JSON.stringify({
        sent: true,
        variant: { id: variant.id, name: variant.name, label: variant.variantId ?? null, price: money(variant.price ?? product.price), stock: variant.stock },
        ...(via !== 'id' && via !== 'none' ? { matchedBy: via } : {}),
        photosSent: last,
        photosTotal: photos.length,
        ...(last < photos.length ? { photosNotSent: photos.length - last } : {}),
        ...(stored > photos.length
          ? { photosUndeliverable: stored - photos.length }
          : {}),
      }));
    },
    {
      name: 'show_variant_photos',
      description: 'Display tool: sends all photos of ONE specific variant/size as Messenger cards. Use when customer wants a closer look at one named size/color; NEVER use for "how many colors/sizes?" questions.',
      schema: z.object({
        productId: z.string().uuid().describe('Product UUID'),
        variantId: z.string().min(1).max(120).describe(
          'Variant name (e.g. Black XL), 5-char label (DAA03), or variant UUID',
        ),
      }),
    },
  );

  const suggestAlternativesTool = tool(
    async ({ productId, excludeColors, excludeSizes, inStockOnly }) => {
      const product = await getProductById(context.businessId, productId);
      if (!product) return JSON.stringify({ found: false, variants: [] });
      const excludedColorsNorm = (excludeColors ?? []).map((c) => c.normalize('NFKC').trim().toLocaleLowerCase()).filter(Boolean);
      const excludedSizesNorm = (excludeSizes ?? []).map((s) => s.normalize('NFKC').trim().toLocaleLowerCase()).filter(Boolean);

      const variants = product.variants
        .filter((variant) => !inStockOnly || (variant.isAvailable && variant.stock > 0))
        .filter((variant) => {
          const attrs = parseVariantAttributes(variant.name);
          const colorLower = attrs.color?.toLocaleLowerCase() ?? '';
          const sizeLower = attrs.size?.toLocaleLowerCase() ?? '';
          const nameLower = variant.name.normalize('NFKC').toLocaleLowerCase();

          const colorMatches = excludedColorsNorm.some((c) =>
            colorLower === c || new RegExp(`(^|[\\s_-])${c}([\\s_-]|$)`, 'i').test(nameLower)
          );
          if (colorMatches) return false;

          const sizeMatches = excludedSizesNorm.some((s) =>
            sizeLower === s || new RegExp(`(^|[\\s_-])${s}([\\s_-]|$)`, 'i').test(nameLower)
          );
          if (sizeMatches) return false;

          return true;
        })
        .slice(0, CARD_LIST_LIMIT)
        .map((variant) => {
          const attrs = parseVariantAttributes(variant.name);
          return {
            id: variant.id,
            name: variant.name,
            color: attrs.color,
            size: attrs.size,
            price: variant.price ?? product.price,
            stock: variant.stock,
            photos: photoCount(variant),
          };
        });
      return JSON.stringify({ productId: product.id, productName: product.name, variants });
    },
    {
      name: 'suggest_alternatives',
      description: 'Read-only deterministic selector returning next in-stock variants excluding rejected colors/sizes. Use when customer dislikes current color or size; do NOT use for initial browse.',
      schema: z.object({
        productId: z.string().uuid().describe('Product UUID'),
        excludeColors: z.array(z.string()).describe('Rejected colors'),
        excludeSizes: z.array(z.string()).describe('Rejected sizes'),
        inStockOnly: z.boolean().describe('True to return only in-stock variants'),
      }),
    },
  );

  /**
   * Plain text only. Suggestions are their own tool so a text reply can never
   * accidentally carry a chip row from an earlier question.
   */
  const sendMessageTool = tool(
    async ({ message }) => {
      const logResult = (result: string) => {
        context.emitSse?.('tool_result', { name: 'send_message', result });
        return result;
      };

      const text = message.trim();
      if (!text) {
        return logResult(JSON.stringify({ sent: false, reason: 'the message is empty' }));
      }

      const budget = await takeMessageUnit(!context.sendMessageOverride);
      if (!budget.allowed) {
        return logResult(JSON.stringify({ sent: false, reason: BUDGET_REFUSED }));
      }

      try {
        if (context.sendMessageOverride) {
          await context.sendMessageOverride(context.pageToken, context.customerPlatformId, text);
        } else {
          await fbSendMessage(context.pageToken, context.customerPlatformId, text, {
            platform: context.platform,
          });
        }
      } catch (err) {
        await returnMessageUnit(budget.period);
        throw err;
      }

      await createMessage({
        conversationId: context.conversationId,
        from: 'self',
        content: text,
        state: 'done',
      });
      onSent?.(text, 'reply');

      return logResult(JSON.stringify({
        sent: true,
        instruction:
          'The plain message is delivered. End your turn with the single word SILENT; do not send the same text again. Use send_suggestions instead when you want tappable choices.',
      }));
    },
    {
      name: 'send_message',
      description:
        `Send the customer one plain ${inbox} message. This tool takes no suggestions: when the next answer is one choice from a short list — color, size, quantity, category, yes/no, delivery or payment preference — call send_suggestions instead. After a successful send, end your turn with SILENT so nothing is sent twice.`,
      schema: z.object({
        message: z.string().min(1).max(1000).describe(
          'The message text in the customer’s language, e.g. "Your order is confirmed."',
        ),
      }),
    },
  );

  /**
   * One question and its tappable answers travel together. The question and options land in the
   * conversation record; the model then ends its turn with SILENT so the automatically-delivered
   * final text cannot repeat it.
   */
  const sendSuggestionsTool = tool(
    async ({ message, suggestions }) => {
      const logResult = (result: string) => {
        context.emitSse?.('tool_result', { name: 'send_suggestions', result });
        return result;
      };

      const text = message.trim();
      if (!text) {
        return logResult(JSON.stringify({ sent: false, reason: 'the message is empty' }));
      }
      const cleaned = [
        ...new Set(suggestions.map((option) => option.trim()).filter(Boolean)),
      ].slice(0, 10);
      if (cleaned.length < 2) {
        return logResult(JSON.stringify({
          sent: false,
          reason: 'send_suggestions needs at least two distinct options',
          instruction: 'Use send_message for a plain reply, or pass 2 to 10 real choices.',
        }));
      }

      // Same chips, same set: the second identical row is redundant even when the customer
      // typed something in between. One suppression per repeat, so a third attempt can ask
      // again if the model really needs to.
      const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
      const setKey = (options: string[]) => options.map(normalize).sort().join('\u0000');
      const previous = context.agentState?.lastSentSuggestions ?? [];
      const repeated = previous.length >= 2 && setKey(cleaned) === setKey(previous);
      const suppressRepeated = repeated && !context.agentState?.suggestionRepeatSkipped;
      // A typed answer is how a customer ignores a chip row. Attaching another row here keeps
      // the old one on screen (most visibly in the Android Messenger client), so this turn
      // answers in one plain message with the choices written out instead.
      const withChips = !context.suppressSuggestions && !suppressRepeated;
      const suppressedChips = !withChips && !suppressRepeated;

      const budget = await takeMessageUnit(!context.sendMessageOverride);
      if (!budget.allowed) {
        return logResult(JSON.stringify({ sent: false, reason: BUDGET_REFUSED }));
      }

      const said = suppressRepeated ? text : `${text} (${cleaned.join(' / ')})`;
      try {
        if (context.sendMessageOverride) {
          await context.sendMessageOverride(context.pageToken, context.customerPlatformId, said);
        } else if (withChips) {
          await fbSendQuickReplies(context.pageToken, context.customerPlatformId, text, cleaned, {
            platform: context.platform,
          });
        } else {
          await fbSendMessage(context.pageToken, context.customerPlatformId, text, {
            platform: context.platform,
          });
        }
      } catch (err) {
        await returnMessageUnit(budget.period);
        throw err;
      }

      if (withChips && context.agentState) {
        context.agentState.lastSuggestions = cleaned;
        context.agentState.lastSentSuggestions = cleaned;
        context.agentState.suggestionRepeatSkipped = false;
      } else if (suppressRepeated && context.agentState) {
        context.agentState.suggestionRepeatSkipped = true;
      }

      await createMessage({
        conversationId: context.conversationId,
        from: 'self',
        content: said,
        state: 'done',
      });
      onSent?.(said, withChips ? 'card' : 'reply');

      return logResult(JSON.stringify({
        sent: true,
        ...(withChips ? { suggestions: cleaned } : {}),
        ...(suppressRepeated
          ? { suggestionsSuppressed: true, suggestionsRepeated: true, suggestions: cleaned }
          : {}),
        ...(suppressedChips ? { suggestionsSuppressed: true, suggestions: cleaned } : {}),
        instruction: withChips
          ? 'The message and its tappable chips are on the customer’s screen. End your turn with the single word SILENT; do not repeat the message or the options.'
          : suppressRepeated
            ? 'The same chip row was already offered, so this copy went out without it. End your turn with SILENT; do not send the same choices again in another message.'
            : 'The choices were written in the message text instead of chips, because the customer typed their reply instead of tapping. End your turn with the single word SILENT.',
      }));
    },
    {
      name: 'send_suggestions',
      description:
        `Send one ${inbox} message with 2 to 10 tappable answer chips. Use this instead of send_message whenever the next answer is one choice from a short list you can name — color, size, quantity, category, yes/no, delivery or payment preference — so the customer taps instead of typing. Check the real values first (get_product_options, find_variant, Catalog Summary). Never invent options and never include open answers (name, address, phone, order id) as suggestions. After a successful send, end your turn with SILENT.`,
      schema: z.object({
        message: z.string().min(1).max(1000).describe(
          'The question or sentence shown above the chips, in the customer’s language, e.g. "Which color would you like?"',
        ),
        suggestions: z
          .array(z.string().min(1).max(80))
          .min(2)
          .max(10)
          .describe(
            'Tappable answers, 2 to 10 short options exactly as the customer would say them, e.g. ["Red", "Green", "Blue"]. Only values the store actually offers.',
          ),
      }),
    },
  );

  /**
   * The escape hatch: when the agent genuinely cannot answer — a dispute, a request the store
   * cannot fulfill, a complaint, or anything outside its tools — it reports to the merchant
   * instead of improvising. The owner gets a notification with the reason and a link straight
   * to the conversation; the model then reassures the customer in their own words.
   */
  const reportHumanInterveneTool = tool(
    async ({ reason }) => {
      const logResult = (result: string) => {
        context.emitSse?.('tool_result', { name: 'report_human_intervene', result });
        return result;
      };

      const trimmed = reason.trim();
      if (!trimmed) {
        return logResult(JSON.stringify({
          reported: false,
          reason: 'the reason was empty',
          instruction: 'Say briefly why a human is needed and pass it again.',
        }));
      }

      try {
        await createBusinessNotification({
          businessId: context.businessId,
          kind: 'human_help',
          title: 'The agent needs a human',
          body: `${context.customerName ?? 'A customer'} asked something the agent could not answer: ${trimmed.slice(0, 300)}`,
          link: `/b/${context.businessId}/inbox?c=${context.conversationId}`,
        });
      } catch (err) {
        console.error('[agent-tool] human intervention notice failed:', err);
        return logResult(JSON.stringify({
          reported: false,
          reason: 'the store owner could not be notified',
          instruction:
            'Apologize briefly in the customer’s language, say their request needs attention and to try again or message the page directly. Do not guess an answer.',
        }));
      }

      return logResult(JSON.stringify({
        reported: true,
        instruction:
          'The owner has been notified with your reason and can see this conversation. Now tell the customer, in their language, that a member of the sales team will contact them shortly about this, and ask whether there is anything else you can help with in the meantime. Do not attempt to answer the question you could not answer.',
      }));
    },
    {
      name: 'report_human_intervene',
      description:
        'Escalation tool: reports to the store owner that you cannot answer the customer, so a human takes over. Use when the request is outside your tools and knowledge (disputes, refunds beyond store policy, legal/medical/custom manufacturing, complaints, threats, or an important tool failure), or when the customer is angry and insists on a person. Pass a clear reason describing what was asked and why you cannot answer. After it succeeds, tell the customer a sales team member will contact them soon and ask if there is anything else — never invent an answer to the question you could not answer.',
      schema: z.object({
        reason: z.string().min(1).max(1000).describe(
          'Why a human is needed: what the customer asked and why you cannot answer it, e.g. "Customer wants a full refund for a damaged parcel, which is beyond store policy."',
        ),
      }),
    },
  );

  return [
    ...createCatalogTools(context, {
      onOrderCreated: async ({ id, totalPrice }) => {
        await context.onOrderCreated?.(id).catch((err) => {
          console.error('[agent-tool] order created but conversation state could not be saved:', err);
        });
        await trackCreatedOrder({
          id,
          totalPrice,
        });
      },
    }),
    showProductsTool,
    showOrdersTool,
    showProductInfoTool,
    showVariantPhotosTool,
    suggestAlternativesTool,
    sendMessageTool,
    sendSuggestionsTool,
    reportHumanInterveneTool,
  ];
}
