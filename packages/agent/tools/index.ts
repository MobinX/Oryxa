import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { searchProducts } from '@repo/db/crud/product';
import { createOrder, getOrderById, updateOrder, deleteOrder } from '@repo/db/crud/order';
import { createMessage } from '@repo/db/crud/conversation';
import { sendMessage as fbSendMessage } from '@repo/integrations/facebook';
import type { SseEmitter } from '@agent/Agent';

/** Catalog tools shared by every transport (Messenger, comments, future ones). */
export function createCatalogTools(context: {
  businessId: string;
  /** Optional: links an order to the originating Messenger conversation. */
  conversationId?: string;
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

  const createOrderTool = tool(
    async ({ productId, variantId, count, customerAddress, customerPhone }) => {
      context.emitSse?.('tool_call', { name: 'create_order', args: { productId, variantId, count, customerAddress, customerPhone } });
      console.log(`[agent-tool] create_order called — productId=${productId} variantId=${variantId ?? 'none'} count=${count ?? 1}`);

      const order = await createOrder({
        businessId: context.businessId,
        productId,
        variantId,
        count: count ?? 1,
        customerName: context.customerName ?? 'Customer',
        customerPhone,
        customerAddress,
        conversationId: context.conversationId,
      });
      const result = JSON.stringify(order);

      console.log(`[agent-tool] create_order result: ${result}`);
      context.emitSse?.('tool_result', { name: 'create_order', result });
      return result;
    },
    {
      name: 'create_order',
      description: 'Create a NEW customer order. Do NOT use this tool if the customer is attempting to modify/change details (like phone or address) of an order that was already placed in the conversation. For modifications, use update_order instead.',
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

      const updateResult = await updateOrder(context.businessId, orderId, {
        count,
        customerPhone,
        customerAddress,
      });

      const result = JSON.stringify(updateResult);
      console.log(`[agent-tool] update_order result: ${result}`);
      context.emitSse?.('tool_result', { name: 'update_order', result });
      return result;
    },
    {
      name: 'update_order',
      description: 'Update details of a previously placed order. If the customer asks to modify details but did not specify the order ID, look up the order ID in the prior conversation history and use it here. Do NOT call create_order first.',
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

      await deleteOrder(context.businessId, orderId);
      const result = JSON.stringify({ id: orderId, cancelled: true });
      console.log(`[agent-tool] cancel_order result: ${result}`);
      context.emitSse?.('tool_result', { name: 'cancel_order', result });
      return result;
    },
    {
      name: 'cancel_order',
      description: 'Cancel a previously placed order. If the customer asks to cancel the order, search the history for the order ID, and call this tool to delete/cancel the order in the database.',
      schema: z.object({
        orderId: z.string().uuid().describe('The UUID of the order to cancel'),
      }),
    },
  );

  return [getProductTool, createOrderTool, getOrderTool, updateOrderTool, cancelOrderTool];
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
  /** Called when the agent actually sends a reply via send_message. */
  onSent?: (text: string) => void,
) {
  const sendFn = context.sendMessageOverride ?? fbSendMessage;
  let sentCount = 0;

  const sendMessageTool = tool(
    async ({ text }) => {
      if (sentCount > 0) {
        console.log(`[agent-tool] send_message rejected — already sent in this turn`);
        return 'Error: You have already sent a message to the customer in this turn. You are not allowed to call send_message again. You must stop calling tools and end the turn now.';
      }

      context.emitSse?.('tool_call', { name: 'send_message', args: { text } });
      console.log(`[agent-tool] send_message called — text="${text}"`);

      // Send to Messenger (or test override), then persist the EXACT text that
      // was sent as the self message. This is the single source of truth for
      // what the customer received.
      await sendFn(context.pageToken, context.customerPlatformId, text);
      await createMessage({
        conversationId: context.conversationId,
        from: 'self',
        content: text,
        state: 'done',
      });
      sentCount++;
      onSent?.(text);

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

  return [...createCatalogTools(context), sendMessageTool];
}
