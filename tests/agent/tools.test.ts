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

  it('show_orders cards the customer\'s own past orders and stamps them at creation', async () => {
    const seed = await seedTestWorld();
    await createProduct({
      businessId: seed.business.id,
      name: 'History Hoodie',
      price: 50,
      sku: `HIST-${Date.now()}`,
      description: 'For the order history test',
      variants: [{ name: 'M', stock: 5, isAvailable: true, price: 50, imageUrl: 'https://cdn.test/hist.jpg' }],
    });

    sendMessageMock.mockClear();
    const tools = createAgentTools(agentContext(seed));
    const createOrderTool = tools.find((t) => t.name === 'create_order')!;
    const showOrdersTool = tools.find((t) => t.name === 'show_orders')!;

    const order = JSON.parse(
      await createOrderTool.invoke({
        productId: (await searchProductsForTest(seed.business.id, 'History Hoodie'))[0]!.id,
        count: 1,
        customerPhone: '555-0077',
      }),
    );

    const result = JSON.parse(await showOrdersTool.invoke({}));
    expect(result.sent).toBe(true);
    expect(result.orders.map((o: { id: string }) => o.id)).toEqual([order.id]);

    // The card carries the payload the webhook already knows how to read, so a tap on it is a
    // tracking question and needs no new plumbing anywhere in the app.
    const cards = lastSend(sendMessageMock)[2] as MessengerCard[];
    expect(cards[0]!.button.payload).toBe(`please track order with id ${order.id}`);
    expect(cards[0]!.title).toContain('History Hoodie');

    const messages = await listMessages(seed.conversation.id, seed.business.id);
    expect(messages?.at(-1)).toMatchObject({ from: 'self' });
    expect(messages?.at(-1)?.content).toContain('History Hoodie');
  });

  it('show_orders refuses another customer\'s id and sends nothing while refusing', async () => {
    const seed = await seedTestWorld();
    sendMessageMock.mockClear();

    const tools = createAgentTools(agentContext(seed));
    const showOrdersTool = tools.find((t) => t.name === 'show_orders')!;

    const result = JSON.parse(await showOrdersTool.invoke({ messengerId: 'psid-of-somebody-else' }));
    expect(result.sent).toBe(false);
    expect(JSON.stringify(result)).not.toContain('psid-of-somebody-else');
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('show_orders says so when there is no history, and hands the model the next page', async () => {
    const seed = await seedTestWorld();
    const tools = createAgentTools(agentContext(seed));
    const showOrdersTool = tools.find((t) => t.name === 'show_orders')!;

    const empty = JSON.parse(await showOrdersTool.invoke({}));
    expect(empty.sent).toBe(false);
    expect(empty.orders).toEqual([]);
    expect(empty.instruction).toContain('Do not invent an order');

    // Two orders, asked for one page of one: the answer must say older ones exist and give the
    // arguments that fetch them, or the paging hint is decoration rather than instruction.
    await createProduct({
      businessId: seed.business.id,
      name: 'Paging Jacket',
      price: 70,
      sku: `PAGE-${Date.now()}`,
      description: 'Two of these exist',
      variants: [{ name: 'M', stock: 5, isAvailable: true, price: 70, imageUrl: 'https://cdn.test/p.jpg' }],
    });
    const createOrderTool = tools.find((t) => t.name === 'create_order')!;
    const productId = (await searchProductsForTest(seed.business.id, 'Paging Jacket'))[0]!.id;
    for (let i = 0; i < 2; i++) {
      await createOrderTool.invoke({ productId, count: 1, customerPhone: '555-0088' });
    }

    const page = JSON.parse(await showOrdersTool.invoke({ startingLimit: 0, endLimit: 1 }));
    expect(page.sent).toBe(true);
    expect(page.showing).toBe('1-1');
    expect(page.hasMore).toBe(true);
    expect(page.instruction).toContain('startingLimit=1');
  });
  it('show_product_info cards every size that is actually on offer', async () => {
    const seed = await seedTestWorld();
    await createProduct({
      businessId: seed.business.id,
      name: 'Sizing Shirt',
      price: 40,
      sku: `SIZE-${Date.now()}`,
      description: 'Three sizes',
      variants: [
        { name: 'S', stock: 3, isAvailable: true, price: 38, imageUrl: 'https://cdn.test/s.jpg' },
        { name: 'M', stock: 5, isAvailable: true, price: 42, imageUrl: 'https://cdn.test/m.jpg' },
        { name: 'XL', stock: 0, isAvailable: true, price: 46, imageUrl: 'https://cdn.test/xl.jpg' },
      ],
    });

    sendMessageMock.mockClear();
    const tools = createAgentTools(agentContext(seed));
    const productId = (await searchProductsForTest(seed.business.id, 'Sizing Shirt'))[0]!.id;

    const result = JSON.parse(await tools.find((t) => t.name === 'show_product_info')!.invoke({ productId }));
    expect(result.sent).toBe(true);

    const cards = lastSend(sendMessageMock)[2] as MessengerCard[];
    // A sold-out size gets no button: the customer would tap Order and be refused.
    expect(cards.map((c) => c.title)).toEqual(['Sizing Shirt — S', 'Sizing Shirt — M']);
    expect(cards.map((c) => c.subtitle)).toEqual(['$38.00 · 3 in stock', '$42.00 · 5 in stock']);
    expect(cards[1]!.imageUrl).toBe('https://cdn.test/m.jpg');
    expect(result.hiddenOutOfStock).toEqual(['XL']);

    // Each tap names the size it came from, in the sentence the order path already reads.
    const variantIds = (await getProductByIdForTest(seed.business.id, productId)).variants.map((v) => v.id);
    expect(cards[0]!.button.payload).toBe(`place order with ${productId} and Sizing Shirt — S variant ${variantIds[0]}`);
    expect(cards[1]!.button.payload).toBe(`place order with ${productId} and Sizing Shirt — M variant ${variantIds[1]}`);
  });

  it('show_variant_photos sends every picture of one size, each orderable', async () => {
    const seed = await seedTestWorld();
    await createProduct({
      businessId: seed.business.id,
      name: 'Gallery Jacket',
      price: 80,
      sku: `GAL-${Date.now()}`,
      description: 'Shot three times',
      variants: [{
        name: 'M',
        stock: 4,
        isAvailable: true,
        price: 80,
        imageUrl: 'https://cdn.test/g1.jpg',
        imageUrls: ['https://cdn.test/g1.jpg', 'https://cdn.test/g2.jpg', 'https://cdn.test/g3.jpg'],
      }],
    });

    sendMessageMock.mockClear();
    const tools = createAgentTools(agentContext(seed));
    const productId = (await searchProductsForTest(seed.business.id, 'Gallery Jacket'))[0]!.id;
    const variantId = (await getProductByIdForTest(seed.business.id, productId)).variants[0]!.id;

    const result = JSON.parse(
      await tools.find((t) => t.name === 'show_variant_photos')!.invoke({ productId, variantId }),
    );
    expect(result.sent).toBe(true);

    const cards = lastSend(sendMessageMock)[2] as MessengerCard[];
    expect(cards.map((c) => c.imageUrl)).toEqual([
      'https://cdn.test/g1.jpg',
      'https://cdn.test/g2.jpg',
      'https://cdn.test/g3.jpg',
    ]);
    // One item seen from three sides: the price and the count are common to every card, and only the
    // photo position differs — otherwise the list reads as three identical messages.
    expect([...new Set(cards.map((c) => c.title))]).toEqual(['Gallery Jacket — M']);
    expect(cards.map((c) => c.subtitle)).toEqual([
      '$80.00 · 4 in stock · photo 1 of 3',
      '$80.00 · 4 in stock · photo 2 of 3',
      '$80.00 · 4 in stock · photo 3 of 3',
    ]);
    expect(new Set(cards.map((c) => c.button.payload))).toEqual(
      new Set([`place order with ${productId} and Gallery Jacket — M variant ${variantId}`]),
    );
  });

  it('show_variant_photos refuses a variant that is not one of the product\'s sizes', async () => {
    const seed = await seedTestWorld();
    sendMessageMock.mockClear();
    const tools = createAgentTools(agentContext(seed));

    const result = JSON.parse(
      await tools.find((t) => t.name === 'show_variant_photos')!
        .invoke({ productId: seed.productDetail.id, variantId: '00000000-0000-0000-0000-000000000000' }),
    );
    expect(result.sent).toBe(false);
    expect(result.instruction).toContain('show_product_info');
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('create_order refuses to guess a size when the product has several', async () => {
    const seed = await seedTestWorld();
    await createProduct({
      businessId: seed.business.id,
      name: 'Choice Shirt',
      price: 40,
      sku: `CHOICE-${Date.now()}`,
      description: 'Two sizes',
      variants: [
        { name: 'S', stock: 3, isAvailable: true, price: 38 },
        { name: 'M', stock: 3, isAvailable: true, price: 42 },
      ],
    });
    const productId = (await searchProductsForTest(seed.business.id, 'Choice Shirt'))[0]!.id;

    const tools = createAgentTools(agentContext(seed));
    const result = JSON.parse(
      await tools.find((t) => t.name === 'create_order')!.invoke({ productId, count: 1, customerPhone: '555-0099' }),
    );

    expect(result.error).toMatch(/variants/);
    expect(result.instruction).toContain('show_product_info');
    expect(result.variants.map((v: { name: string }) => v.name)).toEqual(['S', 'M']);

    // Nothing was written, so the customer keeps one question instead of a wrong parcel.
    const history = JSON.parse(await tools.find((t) => t.name === 'show_orders')!.invoke({}));
    expect(history.orders).toEqual([]);
  });

  it('create_order stamps the variant, whether the tap gave it or the product had only one', async () => {
    const seed = await seedTestWorld();
    const tools = createAgentTools(agentContext(seed));
    const createOrderTool = tools.find((t) => t.name === 'create_order')!;

    const chosen = seed.productDetail.variants[0]!;
    const byTap = JSON.parse(
      await createOrderTool.invoke({
        productId: seed.productDetail.id,
        variantId: chosen.id,
        count: 1,
        customerPhone: '555-0100',
      }),
    );
    // The single size answers the question the customer never had to ask.
    const byDefault = JSON.parse(
      await createOrderTool.invoke({
        productId: seed.productDetail.id,
        count: 1,
        customerPhone: '555-0101',
      }),
    );

    const { getOrderById } = await import('@repo/db/crud/order');
    for (const order of [byTap, byDefault]) {
      const row = await getOrderById(seed.business.id, order.id);
      expect(row?.variantId).toBe(chosen.id);
      expect(row?.variantName).toBe(chosen.name);
    }
  });
});

/** The catalog row with its variants, read the way the card tools read it. */
async function getProductByIdForTest(businessId: string, productId: string) {
  const { getProductById } = await import('@repo/db/crud/product');
  return (await getProductById(businessId, productId))!;
}

/** The catalog row the order tests need, looked up the way the agent tools look it up. */
async function searchProductsForTest(businessId: string, query: string) {
  const { searchProducts } = await import('@repo/db/crud/product');
  return searchProducts(businessId, query, 5);
}
