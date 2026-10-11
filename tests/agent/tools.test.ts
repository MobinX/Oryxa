import { describe, it, expect, vi } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { createAgentTools } from '@repo/agent/tools';
import { updateOrderState } from '@repo/db/crud/order';
import { createProduct } from '@repo/db/crud/product';
import { listMessages } from '@repo/db/crud/conversation';
import type { MessengerCard } from '@repo/integrations/facebook';

// Rest-arg signatures, so a recorded call can be read back as its real arguments.
const sendMessageMock = vi.fn(async (..._args: unknown[]) => undefined);
const sendButtonsMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@repo/integrations/facebook', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
  sendButtons: (...args: unknown[]) => sendButtonsMock(...args),
}));

/** The arguments a mocked send was called with. */
function lastSend(mock: typeof sendMessageMock | typeof sendButtonsMock): unknown[] {
  return mock.mock.calls[mock.mock.calls.length - 1] ?? [];
}

/** The context every Messenger tool needs; a dry-run test adds the send override. */
function agentContext(
  seed: Awaited<ReturnType<typeof seedTestWorld>>,
  sendMessageOverride?: (pageToken: string, psid: string, text: string) => Promise<void>,
) {
  return {
    businessId: seed.business.id,
    conversationId: seed.conversation.id,
    pageToken: 'page-tok',
    customerPlatformId: 'fb-user-1',
    customerName: 'Tool Buyer',
    ...(sendMessageOverride ? { sendMessageOverride } : {}),
  };
}

describe('Agent Tools', () => {
  withPglite();

  it('get_product tool searches catalog', async () => {
    const seed = await seedTestWorld();
    const tools = createAgentTools({
      businessId: seed.business.id,
      conversationId: seed.conversation.id,
      pageToken: 'tok',
      customerPlatformId: 'cust',
    });
    const getProductTool = tools.find((t) => t.name === 'get_product')!;

    const result = await getProductTool.invoke({ query: 'T-Shirt' });
    expect(result).toContain('Test T-Shirt');
  });

  it('create_order tool writes to database', async () => {
    const seed = await seedTestWorld();
    const tools = createAgentTools({
      businessId: seed.business.id,
      conversationId: seed.conversation.id,
      pageToken: 'tok',
      customerPlatformId: 'cust',
      customerName: 'Tool Buyer',
    });
    const createOrderTool = tools.find((t) => t.name === 'create_order')!;

    const result = await createOrderTool.invoke({
      productId: seed.productDetail.id,
      variantId: seed.productDetail.variants[0]?.id,
      count: 1,
      customerPhone: '555-0001',
    });
    expect(result).toContain('"id"');
  });

  it('update_order tool tells the agent when the order is not pending', async () => {
    const seed = await seedTestWorld();
    const tools = createAgentTools({
      businessId: seed.business.id,
      conversationId: seed.conversation.id,
      pageToken: 'tok',
      customerPlatformId: 'cust',
      customerName: 'Tool Buyer',
    });
    const createOrderTool = tools.find((t) => t.name === 'create_order')!;
    const updateOrderTool = tools.find((t) => t.name === 'update_order')!;

    const created = JSON.parse(
      await createOrderTool.invoke({
        productId: seed.productDetail.id,
        variantId: seed.productDetail.variants[0]?.id,
        count: 1,
      }),
    );
    await updateOrderState(seed.business.id, created.id, { state: 'done' });

    const result = await updateOrderTool.invoke({ orderId: created.id, count: 3 });
    expect(result).toContain("Updates are only allowed for pending orders");
    expect(result).toContain('done');
  });

  it('update_order tool tells the agent when stock is insufficient', async () => {
    const seed = await seedTestWorld();
    const tools = createAgentTools({
      businessId: seed.business.id,
      conversationId: seed.conversation.id,
      pageToken: 'tok',
      customerPlatformId: 'cust',
      customerName: 'Tool Buyer',
    });
    const createOrderTool = tools.find((t) => t.name === 'create_order')!;
    const updateOrderTool = tools.find((t) => t.name === 'update_order')!;

    const created = JSON.parse(
      await createOrderTool.invoke({
        productId: seed.productDetail.id,
        variantId: seed.productDetail.variants[0]?.id,
        count: 1,
      }),
    );

    const result = await updateOrderTool.invoke({ orderId: created.id, count: 99 });
    expect(result).toMatch(/Insufficient stock/i);
  });

  it('cancel_order tool tells the agent when the order is already fulfilled', async () => {
    const seed = await seedTestWorld();
    const tools = createAgentTools({
      businessId: seed.business.id,
      conversationId: seed.conversation.id,
      pageToken: 'tok',
      customerPlatformId: 'cust',
      customerName: 'Tool Buyer',
    });
    const createOrderTool = tools.find((t) => t.name === 'create_order')!;
    const cancelOrderTool = tools.find((t) => t.name === 'cancel_order')!;

    const created = JSON.parse(
      await createOrderTool.invoke({
        productId: seed.productDetail.id,
        variantId: seed.productDetail.variants[0]?.id,
        count: 1,
      }),
    );
    await updateOrderState(seed.business.id, created.id, { state: 'done' });

    const result = await cancelOrderTool.invoke({ orderId: created.id });
    expect(result).toContain('already fulfilled');
  });

  it('send_message tool calls Facebook API', async () => {
    const seed = await seedTestWorld();
    sendMessageMock.mockClear();
    const tools = createAgentTools({
      businessId: seed.business.id,
      conversationId: seed.conversation.id,
      pageToken: 'page-tok',
      customerPlatformId: 'fb-user-1',
    });
    const sendMessageTool = tools.find((t) => t.name === 'send_message')!;

    const result = await sendMessageTool.invoke({ text: 'Hello from tool' });
    expect(result).toContain('sent');
    expect(sendMessageMock).toHaveBeenCalledWith('page-tok', 'fb-user-1', 'Hello from tool');
  });

  it('show_products sends a card per product, with the Order button carrying its id', async () => {
    const seed = await seedTestWorld();
    await createProduct({
      businessId: seed.business.id,
      name: 'Photo Hoodie',
      price: 59,
      sku: `HOODIE-${Date.now()}`,
      description: 'Warm fleece lining,\nwith a roomy pocket',
      variants: [
        { name: 'M', stock: 4, isAvailable: true, price: 59, imageUrl: 'https://cdn.test/hoodie.jpg' },
      ],
    });

    sendMessageMock.mockClear();
    const sent: string[] = [];
    const tools = createAgentTools(agentContext(seed), (text) => sent.push(text));
    const showProductsTool = tools.find((t) => t.name === 'show_products')!;

    const result = JSON.parse(await showProductsTool.invoke({ query: 'Hoodie' }));
    expect(result.sent).toBe(true);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);

    const [pageToken, recipient, content] = lastSend(sendMessageMock);
    const cards = content as MessengerCard[];
    expect({ pageToken, recipient }).toEqual({ pageToken: 'page-tok', recipient: 'fb-user-1' });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      title: 'Photo Hoodie',
      subtitle: '$59.00 — Warm fleece lining, with a roomy pocket',
      imageUrl: 'https://cdn.test/hoodie.jpg',
    });
    expect(cards[0]!.button.title).toBe('Order');
    expect(cards[0]!.button.payload).toMatch(/^place order with [0-9a-f-]{36} and Photo Hoodie$/);

    // The thread keeps what the cards said, so the merchant inbox and the next
    // turn of history are not left reading an empty bubble.
    expect(sent).toEqual(['Photo Hoodie — $59.00 — Warm fleece lining, with a roomy pocket']);
    const messages = await listMessages(seed.conversation.id, seed.business.id);
    expect(messages?.at(-1)).toMatchObject({ from: 'self', content: sent[0] });
  });

  it('show_products keeps a photoless product out of the cards and says so', async () => {
    const seed = await seedTestWorld();
    sendMessageMock.mockClear();

    const tools = createAgentTools(agentContext(seed));
    const showProductsTool = tools.find((t) => t.name === 'show_products')!;
    const result = JSON.parse(await showProductsTool.invoke({ query: 'T-Shirt' }));

    expect(result.sent).toBe(false);
    expect(result.reason).toMatch(/photo/i);
    expect(result.instruction).toMatch(/send_message/);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('show_products renders as text for a dry-run send and puts nothing on the wire', async () => {
    const seed = await seedTestWorld();
    await createProduct({
      businessId: seed.business.id,
      name: 'Dry Hoodie',
      price: 44,
      sku: `DRY-${Date.now()}`,
      description: 'For the test panel',
      variants: [
        { name: 'L', stock: 2, isAvailable: true, price: 44, imageUrl: 'https://cdn.test/dry.jpg' },
      ],
    });

    sendMessageMock.mockClear();
    const delivered: string[] = [];
    const tools = createAgentTools(
      agentContext(seed, async (_token, _psid, text) => {
        delivered.push(text);
      }),
    );
    const showProductsTool = tools.find((t) => t.name === 'show_products')!;
    const result = JSON.parse(await showProductsTool.invoke({ query: 'Dry Hoodie' }));

    expect(result.sent).toBe(true);
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(delivered).toEqual(['Dry Hoodie — $44.00 — For the test panel']);
  });

  it('offer_tracking sends the Track order button for the order it was given', async () => {
    const seed = await seedTestWorld();
    sendButtonsMock.mockClear();

    const tools = createAgentTools(agentContext(seed));
    const createOrderTool = tools.find((t) => t.name === 'create_order')!;
    const offerTrackingTool = tools.find((t) => t.name === 'offer_tracking')!;

    const order = JSON.parse(
      await createOrderTool.invoke({
        productId: seed.productDetail.id,
        variantId: seed.productDetail.variants[0]?.id,
        count: 2,
        customerPhone: '555-0002',
      }),
    );
    const result = JSON.parse(await offerTrackingTool.invoke({ orderId: order.id }));

    expect(result.sent).toBe(true);
    // The payload is what the webhook turns back into a message, so the order id
    // has to be in it — a button that only says "Track order" tells the agent nothing.
    expect(sendButtonsMock).toHaveBeenCalledWith(
      'page-tok',
      'fb-user-1',
      expect.stringMatching(/^Just placed — 2 × Test T-Shirt, \$59\.98$/),
      [{ title: 'Track order', payload: `please track order with id ${order.id}` }],
    );
    const messages = await listMessages(seed.conversation.id, seed.business.id);
    expect(messages?.at(-1)?.content).toContain(`Just placed — 2 × Test T-Shirt, $59.98`);
  });
});
