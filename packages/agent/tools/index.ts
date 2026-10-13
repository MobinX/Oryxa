import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { searchProducts, getProductByVariantId } from '@repo/db/crud/product';
import { createOrder, getOrderById, getOrdersByPlatformId, updateOrder, deleteOrder } from '@repo/db/crud/order';
import { createMessage } from '@repo/db/crud/conversation';
import { refundQuotaUnit, spendQuotaUnit } from '@repo/db/crud/billing';
import {
  sendMessage as fbSendMessage,
  sendButtons as fbSendButtons,
  type MessengerCard,
} from '@repo/integrations/facebook';
import { resolveStoredImageUrl } from '@repo/integrations/b2';
import type { SseEmitter } from '@agent/Agent';

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

const STATE_FOR_BUYER: Record<string, string> = {
  pending: 'Just placed',
  acknowledged: 'Confirmed with the store',
  onDelivery: 'On its way',
  done: 'Delivered',
};

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
}) {
  const getProductTool = tool(
    async ({ query }) => {
      context.emitSse?.('tool_call', { name: 'get_product', args: { query } });
      console.log(`[agent-tool] get_product called with query="${query}"`);

      const products = await searchProducts(context.businessId, query, 5);
      const result = JSON.stringify(
        products.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          sku: p.sku,
          description: p.description,
          variants: p.variants.map((v) => ({
            id: v.id,
            name: v.name,
            price: v.price,
            stock: v.stock,
            isAvailable: v.isAvailable,
          })),
        })),
      );

      console.log(`[agent-tool] get_product result: ${result.slice(0, 200)}${result.length > 200 ? '…' : ''}`);
      context.emitSse?.('tool_result', { name: 'get_product', result });
      return result;
    },
    {
      name: 'get_product',
      description: 'Search the product catalog by name or SKU. Returns matching products with variants.',
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
            'That is not a variant label — a label is exactly three letters and two digits. '
            + 'Read the picture again and look for the stamped code, or search the catalog by what you see.',
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
          ? `This is the exact item the stamped label belongs to: ${product.name}, variant ${variant.name}. `
            + 'Show it with show_products (query the product name) so the customer gets the card, and name that variant in one line.'
          : `This is the exact item the stamped label belongs to: ${product.name}, variant ${variant.name}. Answer with it.`,
      });
      console.log(`[agent-tool] get_product_by_variant_id result: ${result.slice(0, 200)}${result.length > 200 ? '…' : ''}`);
      context.emitSse?.('tool_result', { name: 'get_product_by_variant_id', result });
      return result;
    },
    {
      name: 'get_product_by_variant_id',
      description: 'Find the exact product and variant a customer means from the short label stamped on a photo they sent — five characters, three letters and two digits, often written with a # in front ("#AFG23"). USE THIS FIRST whenever a message contains such a code, whether the customer typed it or it is printed on a picture. Only when this finds nothing should you describe the photo and search by words instead.',
      schema: z.object({
        variantId: z.string().min(1).max(40).describe('The stamped label, with or without its #'),
      }),
    },
  );

  const createOrderTool = tool(
    async ({ productId, variantId, count, customerAddress, customerPhone }) => {
      context.emitSse?.('tool_call', { name: 'create_order', args: { productId, variantId, count, customerAddress, customerPhone } });
      console.log(`[agent-tool] create_order called — productId=${productId} variantId=${variantId ?? 'none'} count=${count ?? 1}`);

      let result: string;
      try {
        const order = await createOrder({
          businessId: context.businessId,
          productId,
          variantId,
          count: count ?? 1,
          customerName: context.customerName ?? 'Customer',
          customerPhone,
          customerAddress,
          conversationId: context.conversationId,
          customerPlatformId: context.customerPlatformId ?? undefined,
        });
        result = JSON.stringify(order);
      } catch (err) {
        result = err instanceof Error ? err.message : 'Failed to create order.';
      }

      console.log(`[agent-tool] create_order result: ${result}`);
      context.emitSse?.('tool_result', { name: 'create_order', result });
      return result;
    },
    {
      name: 'create_order',
      description: 'Create a NEW customer order. If this tool returns an error (product not found, insufficient stock), tell the customer that message. Do NOT use this tool to modify an existing order — use update_order instead.',
      schema: z.object({
        productId: z.string().uuid(),
        variantId: z.string().uuid().optional(),
        count: z.number().int().min(1).optional(),
        customerAddress: z.string().optional(),
        customerPhone: z.string().optional(),
      }),
    },
  );

  const getOrderTool = tool(
    async ({ orderId }) => {
      context.emitSse?.('tool_call', { name: 'get_order', args: { orderId } });
      console.log(`[agent-tool] get_order called — orderId=${orderId}`);

      const order = await getOrderById(context.businessId, orderId);
      const result = order ? JSON.stringify(order) : 'Order not found.';

      console.log(`[agent-tool] get_order result: ${result}`);
      context.emitSse?.('tool_result', { name: 'get_order', result });
      return result;
    },
    {
      name: 'get_order',
      description: 'Retrieve order details (like status, shipping address, and items) by order ID.',
      schema: z.object({
        orderId: z.string().uuid().describe('The UUID of the order to retrieve'),
      }),
    },
  );

  const updateOrderTool = tool(
    async ({ orderId, count, customerPhone, customerAddress }) => {
      context.emitSse?.('tool_call', { name: 'update_order', args: { orderId, count, customerPhone, customerAddress } });
      console.log(`[agent-tool] update_order called — orderId=${orderId}`);

      const order = await getOrderById(context.businessId, orderId);
      if (!order) {
        const result = 'Order not found.';
        context.emitSse?.('tool_result', { name: 'update_order', result });
        return result;
      }

      if (order.state !== 'pending') {
        const result = `Cannot update order. Order is currently in '${order.state}' status. Updates are only allowed for pending orders.`;
        context.emitSse?.('tool_result', { name: 'update_order', result });
        return result;
      }

      let result: string;
      try {
        const updateResult = await updateOrder(context.businessId, orderId, {
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
      description: 'Update a pending order (quantity, phone, or address). If this tool returns an error (order not found, not pending, or insufficient stock), tell the customer that message. Do NOT call create_order first. If the customer did not give an order ID, look it up in conversation history.',
      schema: z.object({
        orderId: z.string().uuid().describe('The UUID of the order to update'),
        count: z.number().int().min(1).optional(),
        customerPhone: z.string().optional(),
        customerAddress: z.string().optional(),
      }),
    },
  );

  const cancelOrderTool = tool(
    async ({ orderId }) => {
      context.emitSse?.('tool_call', { name: 'cancel_order', args: { orderId } });
      console.log(`[agent-tool] cancel_order called — orderId=${orderId}`);

      const order = await getOrderById(context.businessId, orderId);
      if (!order) {
        const result = 'Order not found.';
        context.emitSse?.('tool_result', { name: 'cancel_order', result });
        return result;
      }

      if (order.state === 'done') {
        const result = `Cannot cancel order. Order is already fulfilled ('done'). Tell the customer it can no longer be cancelled.`;
        context.emitSse?.('tool_result', { name: 'cancel_order', result });
        return result;
      }

      await deleteOrder(context.businessId, orderId);
      const result = JSON.stringify({ id: orderId, cancelled: true });
      console.log(`[agent-tool] cancel_order result: ${result}`);
      context.emitSse?.('tool_result', { name: 'cancel_order', result });
      return result;
    },
    {
      name: 'cancel_order',
      description: 'Cancel an unfulfilled order. If this tool returns an error (not found or already fulfilled), tell the customer that message. Search conversation history for the order ID if the customer did not provide one.',
      schema: z.object({
        orderId: z.string().uuid().describe('The UUID of the order to cancel'),
      }),
    },
  );

  return [
    getProductTool,
    getProductByVariantIdTool,
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
    /** Override the Facebook send function (e.g. no-op in test mode). */
    sendMessageOverride?: (pageToken: string, psid: string, text: string) => Promise<void>;
  },
  /**
   * Called when something actually reached Messenger, with what kind of send it was: `reply` is text the
   * reply tool wrote, `card` is a product list or a button row. The runner needs the difference — a
   * closing line after a card is a second message the customer should get, while a closing line after
   * the reply tool would be the same words twice.
   */
  onSent?: (text: string, kind: 'reply' | 'card') => void,
) {
  const sendFn = context.sendMessageOverride ?? fbSendMessage;
  let sentCount = 0;

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
    await fbSendMessage(context.pageToken, context.customerPlatformId, cards);
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

  const sendMessageTool = tool(
    async ({ text }) => {
      if (sentCount > 0) {
        console.log(`[agent-tool] send_message rejected — already sent in this turn`);
        return 'Error: You have already sent a message to the customer in this turn. You are not allowed to call send_message again. You must stop calling tools and end the turn now.';
      }

      context.emitSse?.('tool_call', { name: 'send_message', args: { text } });
      console.log(`[agent-tool] send_message called — text="${text}"`);

      // Claimed before the first await: the model can emit two send_message
      // calls in one turn, and they run concurrently — counting after the send
      // let both pass the guard above and post the same reply twice.
      sentCount++;

      // One reply that actually reaches Messenger is one unit of the message budget.
      // Never charged for the test override — it persists a row but puts nothing on the
      // wire — and never for SILENT, which is not a reply. A merchant typing in the inbox
      // is not this code path at all.
      const chargeable = !context.sendMessageOverride && text.trim() !== 'SILENT';
      const budget = await takeMessageUnit(chargeable);
      if (!budget.allowed) {
        console.log(`[agent-tool] send_message refused — the message allowance is used up`);
        context.emitSse?.('tool_result', { name: 'send_message', result: BUDGET_REFUSED });
        return BUDGET_REFUSED;
      }

      // Send to Messenger (or test override), then persist the EXACT text that
      // was sent as the self message. This is the single source of truth for
      // what the customer received.
      try {
        await sendFn(context.pageToken, context.customerPlatformId, text);
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

      console.log(`[agent-tool] send_message done — message persisted`);
      const result = 'Message successfully sent to the customer. You have completed your turn. Do not call send_message again or call any other tools. Stop and finish now.';
      context.emitSse?.('tool_result', { name: 'send_message', result });
      return result;
    },
    {
      name: 'send_message',
      description: 'Send a reply message to the customer on Facebook Messenger. Always use this tool for your final response.',
      schema: z.object({
        text: z.string().describe('The message text to send to the customer'),
      }),
    },
  );

  const showProductsTool = tool(
    async ({ query }) => {
      context.emitSse?.('tool_call', { name: 'show_products', args: { query } });
      console.log(`[agent-tool] show_products called — query="${query}"`);

      const matches = await searchProducts(context.businessId, query, CARD_LIST_LIMIT);
      const products = matches.filter(isSellable);
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
          button: { title: 'Order', payload: `place order with ${product.id} and ${title}` },
        });
      }

      const logResult = (result: string) => {
        console.log(`[agent-tool] show_products result: ${result.slice(0, 200)}${result.length > 200 ? '…' : ''}`);
        context.emitSse?.('tool_result', { name: 'show_products', result });
        return result;
      };

      if (cards.length === 0) {
        return logResult(JSON.stringify({
          sent: false,
          reason: products.length === 0
            ? (matches.length === 0 ? 'no product matches that search' : 'every match is out of stock')
            : 'none of the matches has a photo',
          products: products.map((p) => ({ id: p.id, name: p.name, price: p.price, description: p.description })),
          instruction: products.length === 0
            ? 'Do not invent a product. Say it is unavailable and ask what else the customer wants.'
            : 'A card needs a photo and none of these has one, so nothing was sent. Describe them in one send_message instead.',
        }));
      }

      // A row of cards the customer sees is one reply, so it costs the cycle what a
      // paragraph would have cost.
      const budget = await takeMessageUnit(!context.sendMessageOverride);
      if (!budget.allowed) {
        console.log(`[agent-tool] show_products refused — the message allowance is used up`);
        return logResult(BUDGET_REFUSED);
      }

      const content = cardsAsText(cards);
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
      onSent?.(content, 'card');

      return logResult(JSON.stringify({
        sent: true,
        products: cards.map((card) => card.title),
        ...(photoless.length ? { skippedWithoutPhoto: photoless } : {}),
        instruction: 'The customer can now see these products with a photo, price and an Order button each. '
          + 'Do NOT repeat their names, prices or descriptions. Any send_message from here is one short '
          + 'question at most, such as asking which one they want.',
      }));
    },
    {
      name: 'show_products',
      description: 'Show products to the customer as Messenger cards — photo, name, price, short summary and an Order button each, stacked as a vertical list in one message. USE THIS INSTEAD OF describing products in text whenever the customer asks what is available, wants to see or buy something, or asks about a product.',
      schema: z.object({
        query: z.string().describe('Product name or SKU to search for; an empty string lists the whole catalog'),
      }),
    },
  );

  const offerTrackingTool = tool(
    async ({ orderId }) => {
      context.emitSse?.('tool_call', { name: 'offer_tracking', args: { orderId } });
      console.log(`[agent-tool] offer_tracking called — orderId=${orderId}`);

      const order = await getOrderById(context.businessId, orderId);
      if (!order) {
        const missing = 'Order not found.';
        context.emitSse?.('tool_result', { name: 'offer_tracking', result: missing });
        return missing;
      }

      const state = STATE_FOR_BUYER[order.state] ?? order.state;
      const text = oneLine(
        `${state} — ${order.count} × ${order.productName ?? 'your order'}, ${money(order.totalPrice)}`,
        160,
      );
      const buttons = [{ title: 'Track order', payload: `please track order with id ${order.id}` }];

      const budget = await takeMessageUnit(!context.sendMessageOverride);
      if (!budget.allowed) {
        console.log(`[agent-tool] offer_tracking refused — the message allowance is used up`);
        context.emitSse?.('tool_result', { name: 'offer_tracking', result: BUDGET_REFUSED });
        return BUDGET_REFUSED;
      }

      const content = `${text} (${buttons[0].title})`;
      try {
        await sendButtonRow(text, buttons);
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
      onSent?.(content, 'card');

      const result = JSON.stringify({
        sent: true,
        orderId: order.id,
        instruction: 'The customer has a Track order button now. Do not describe the order again, and end the turn.',
      });
      console.log(`[agent-tool] offer_tracking result: ${result}`);
      context.emitSse?.('tool_result', { name: 'offer_tracking', result });
      return result;
    },
    {
      name: 'offer_tracking',
      description: 'Once an order is created and confirmed, send the customer a Track order button for it. Call with the order ID from create_order or update_order.',
      schema: z.object({
        orderId: z.string().uuid().describe('The UUID of the order the customer just placed'),
      }),
    },
  );

  const showOrdersTool = tool(
    async ({ startingLimit, endLimit, messengerId }) => {
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

      // The customer id comes from the conversation the run belongs to. An argument may name one, but it
      // is checked against that id and refused, because a model told "look up 1234567" must not be able to
      // read somebody else's order history out of another person's chat.
      const askedFor = messengerId?.trim();
      if (askedFor && askedFor !== context.customerPlatformId) {
        return logResult(JSON.stringify({
          sent: false,
          reason: 'that Messenger id belongs to a different customer than the one in this conversation',
          instruction: 'Do not send any id back to the customer. Say you can only see the orders in this chat, and offer to look those up.',
        }));
      }

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
          instruction: 'Say so in one short send_message and offer to help them order something. Do not invent an order.',
        }));
      }

      const cards: MessengerCard[] = [];
      const photoless: string[] = [];
      for (const o of page) {
        if (!o.imageUrl) {
          photoless.push(o.productName ?? 'an order');
        } else {
          const state = STATE_FOR_BUYER[o.state] ?? o.state;
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
        state: STATE_FOR_BUYER[o.state] ?? o.state,
        date: o.createdAt.toISOString().slice(0, 10),
      }));

      if (cards.length === 0) {
        return logResult(JSON.stringify({
          sent: false,
          orders: summary,
          hasMore,
          reason: 'none of these orders has a product photo, and a card needs one',
          instruction: 'List them in one short send_message instead — date, item, and status.',
        }));
      }

      // A list the customer sees is one reply, so it costs the cycle what a paragraph would have cost.
      const budget = await takeMessageUnit(!context.sendMessageOverride);
      if (!budget.allowed) {
        console.log('[agent-tool] show_orders refused — the message allowance is used up');
        return logResult(BUDGET_REFUSED);
      }

      const content = cardsAsText(cards);
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
      onSent?.(content, 'card');

      return logResult(JSON.stringify({
        sent: true,
        showing: `${from + 1}-${from + cards.length}`,
        orders: summary,
        ...(photoless.length ? { skippedWithoutPhoto: photoless } : {}),
        hasMore,
        instruction: hasMore
          ? `These are the ${cards.length} most recent of at least ${from + cards.length + 1} orders. Ask in your closing line whether they want the older ones; if they say yes, call show_orders again with startingLimit=${from + size} and endLimit=${from + size * 2}.`
          : 'That is every order they have. Your closing line can ask which one they want to track.',
      }));
    },
    {
      name: 'show_orders',
      description:
        'Show the customer their OWN previous orders with this store, as a vertical list of Messenger cards (item, status, price, date, and a Track order button each). USE THIS whenever they ask about their order history — "what did I order", "my previous orders", "can you show my past purchases" — instead of guessing an order id. It needs no arguments: the customer is whoever this conversation belongs to. Do not use it to look up one known order (get_order does that) and never call it to create or change anything.',
      schema: z.object({
        startingLimit: z.number().int().min(0).optional().describe(
          'Index of the first order to show, newest first. 0 (the default) is the most recent order.',
        ),
        endLimit: z.number().int().min(1).optional().describe(
          'Index to stop at, exclusive. Defaults to startingLimit + 10; a page shows at most 10 cards, so ask for 0..10, then 10..20 for older ones.',
        ),
        messengerId: z.string().max(120).optional().describe(
          'Leave empty. Only ever the id of the customer in THIS conversation; any other id is refused.',
        ),
      }),
    },
  );

  return [...createCatalogTools(context), sendMessageTool, showProductsTool, offerTrackingTool, showOrdersTool];
}
