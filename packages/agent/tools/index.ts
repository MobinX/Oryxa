import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { searchProducts } from '@repo/db/crud/product';
import { createOrder } from '@repo/db/crud/order';
import { createMessage } from '@repo/db/crud/conversation';
import { sendMessage } from '@repo/integrations/facebook';

/** Catalog tools shared by every transport (Messenger, comments, future ones). */
export function createCatalogTools(context: {
  businessId: string;
  /** Optional: links an order to the originating Messenger conversation. */
  conversationId?: string;
  customerName?: string | null;
}) {
  const getProductTool = tool(
    async ({ query }) => {
      const products = await searchProducts(context.businessId, query, 5);
      return JSON.stringify(
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
      return JSON.stringify(order);
    },
    {
      name: 'create_order',
      description: 'Create a customer order for a product. Use after confirming product, variant, quantity, and delivery details.',
      schema: z.object({
        productId: z.string().uuid(),
        variantId: z.string().uuid().optional(),
        count: z.number().int().positive().optional(),
        customerAddress: z.string().optional(),
        customerPhone: z.string().optional(),
      }),
    },
  );

  return [getProductTool, createOrderTool];
}

export function createAgentTools(
  context: {
    businessId: string;
    conversationId: string;
    pageToken: string;
    customerPlatformId: string;
    customerName?: string | null;
  },
  /** Called when the agent actually sends a reply via send_message. */
  onSent?: (text: string) => void,
) {
  const sendMessageTool = tool(
    async ({ text }) => {
      // Send to Messenger, then persist the EXACT text that was sent as the
      // self message. This is the single source of truth for what the customer
      // received, so the conversation history in the DB always matches
      // Messenger (previously the runner saved the LLM's final summary, which
      // often differed from the tool's text).
      await sendMessage(context.pageToken, context.customerPlatformId, text);
      await createMessage({
        conversationId: context.conversationId,
        from: 'self',
        content: text,
        state: 'done',
      });
      onSent?.(text);
      return 'Message sent to customer.';
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
