import { describe, it, expect, vi } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { createAgentTools } from '@repo/agent/tools';
import { updateOrderState } from '@repo/db/crud/order';
import { createProduct } from '@repo/db/crud/product';
import { listMessages } from '@repo/db/crud/conversation';
import type { MessengerCard } from '@repo/integrations/facebook';

const orderDefaults = {
  variantId: null,
  count: 1,
  customerPhone: '555-0000',
  customerAddress: '1 Test Street',
};

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

  it('get_product_options answers variant questions without sending cards', async () => {
    const seed = await seedTestWorld();
    sendMessageMock.mockClear();
    const tool = createAgentTools(agentContext(seed)).find((item) => item.name === 'get_product_options')!;
    const result = JSON.parse(await tool.invoke({ productId: seed.productDetail.id }));
    expect(result.name).toBe('Test T-Shirt');
    expect(result.variants[0]).toMatchObject({ name: 'Red M', stock: 10, available: true });
    expect(sendMessageMock).not.toHaveBeenCalled();
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

    const result = await createOrderTool.invoke({ ...orderDefaults,
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
      await createOrderTool.invoke({ ...orderDefaults,
        productId: seed.productDetail.id,
        variantId: seed.productDetail.variants[0]?.id,
        count: 1,
      }),
    );
    await updateOrderState(seed.business.id, created.id, { state: 'done' });

    const result = await updateOrderTool.invoke({ orderId: created.id, count: 3 });
    expect(result).toContain('only allowed while it is Pending');
    // The customer-facing word, never the column value: 'done' is a database token, 'Done' is what the
    // map says and the only form that should reach a reply.
    expect(result).toContain('Done');
    expect(result).not.toMatch(/'done'/);
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
      await createOrderTool.invoke({ ...orderDefaults,
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
      await createOrderTool.invoke({ ...orderDefaults,
        productId: seed.productDetail.id,
        variantId: seed.productDetail.variants[0]?.id,
        count: 1,
      }),
    );
    await updateOrderState(seed.business.id, created.id, { state: 'done' });

    const result = await cancelOrderTool.invoke({ orderId: created.id });
    expect(result).toContain('can no longer be cancelled');
    expect(result).toContain('Done');
    expect(result).not.toMatch(/'done'/);
  });

  it('does not expose a send tool for the final text reply', async () => {
    const seed = await seedTestWorld();
    sendMessageMock.mockClear();
    const tools = createAgentTools({
      businessId: seed.business.id,
      conversationId: seed.conversation.id,
      pageToken: 'page-tok',
      customerPlatformId: 'fb-user-1',
    });
    expect(tools.some((tool) => String(tool.name) === 'send_message')).toBe(false);
    expect(sendMessageMock).not.toHaveBeenCalled();
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
    // The stored line also keeps the window that went out, because a tool result does not survive the
    // turn: without it, "and the rest?" in a later message has nothing to page from and sends page one.
    expect(messages?.at(-1)).toMatchObject({ from: 'self' });
    expect(messages?.at(-1)?.content).toContain(sent[0]!);
    expect(messages?.at(-1)?.content).toMatch(/showing 1-1 of 1 matching "Hoodie"/);
  });

  it('show_products keeps a photoless product out of the cards and says so', async () => {
    const seed = await seedTestWorld();
    sendMessageMock.mockClear();

    const tools = createAgentTools(agentContext(seed));
    const showProductsTool = tools.find((t) => t.name === 'show_products')!;
    const result = JSON.parse(await showProductsTool.invoke({ query: 'T-Shirt' }));

    expect(result.sent).toBe(false);
    expect(result.reason).toMatch(/photo/i);
    expect(result.instruction).toMatch(/final reply/);
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

  it('create_order automatically sends the Track order button', async () => {
    const seed = await seedTestWorld();
    sendButtonsMock.mockClear();

    const tools = createAgentTools(agentContext(seed));
    const createOrderTool = tools.find((t) => t.name === 'create_order')!;

    const order = JSON.parse(
      await createOrderTool.invoke({ ...orderDefaults,
        productId: seed.productDetail.id,
        variantId: seed.productDetail.variants[0]?.id,
        count: 2,
        customerPhone: '555-0002',
      }),
    );
    expect(order.id).toMatch(/[0-9a-f-]{36}/i);
    // The payload is what the webhook turns back into a message, so the order id
    // has to be in it — a button that only says "Track order" tells the agent nothing.
    // The row carries the receipt: quantity, the variant's shelf label and its name, the total.
    expect(sendButtonsMock).toHaveBeenCalledWith(
      'page-tok',
      'fb-user-1',
      expect.stringMatching(/^Test T-Shirt — 2 pcs · #[A-Z0-9]{5} · Red M · Total \$59\.98$/),
      [{ title: 'Track order', payload: `please track order with id ${order.id}` }],
    );
    const messages = await listMessages(seed.conversation.id, seed.business.id);
    expect(messages?.at(-1)?.content).toMatch(/Test T-Shirt — 2 pcs · #[A-Z0-9]{5} · Red M · Total \$59\.98 \(Track order\)/);
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
      await createOrderTool.invoke({ ...orderDefaults,
        productId: (await searchProductsForTest(seed.business.id, 'History Hoodie'))[0]!.id,
        count: 1,
        customerPhone: '555-0077',
      }),
    );

    const result = JSON.parse(await showOrdersTool.invoke({}));
    expect(result.sent).toBe(true);
    expect(result.cardsSent).toBe(1);
    expect(result.showing).toBe('1-1');

    // The card carries the payload the webhook already knows how to read, so a tap on it is a
    // tracking question and needs no new plumbing anywhere in the app.
    const cards = lastSend(sendMessageMock)[2] as MessengerCard[];
    expect(cards[0]!.button.payload).toBe(`please track order with id ${order.id}`);
    expect(cards[0]!.title).toContain('History Hoodie');

    const messages = await listMessages(seed.conversation.id, seed.business.id);
    expect(messages?.at(-1)).toMatchObject({ from: 'self' });
    expect(messages?.at(-1)?.content).toContain('History Hoodie');
  });

  it('a past order is named by its state, and never by how long ago it was placed', async () => {
    const seed = await seedTestWorld();
    await createProduct({
      businessId: seed.business.id,
      name: 'State Coat',
      price: 50,
      sku: `STATE-${Date.now()}`,
      description: 'One order in each state',
      variants: [{ name: 'M', stock: 8, isAvailable: true, price: 50, imageUrl: 'https://cdn.test/state.jpg' }],
    });
    const productId = (await searchProductsForTest(seed.business.id, 'State Coat'))[0]!.id;

    const tools = createAgentTools(agentContext(seed));
    const createOrderTool = tools.find((t) => t.name === 'create_order')!;
    const showOrdersTool = tools.find((t) => t.name === 'show_orders')!;

    const wanted = ['pending', 'acknowledged', 'onDelivery', 'done'];
    for (const state of wanted) {
      const order = JSON.parse(
        await createOrderTool.invoke({ ...orderDefaults, productId, count: 1, customerPhone: '555-0120' }),
      );
      await updateOrderState(seed.business.id, order.id, { state });
    }

    sendMessageMock.mockClear();
    const result = JSON.parse(await showOrdersTool.invoke({}));
    expect(result.sent).toBe(true);

    const cards = lastSend(sendMessageMock)[2] as MessengerCard[];
    expect(cards).toHaveLength(4);
    // Each card is the state word and the date, and nothing in it claims a time the state cannot know.
    expect(cards.map((c) => c.subtitle.split(' · ')[0]).sort()).toEqual(
      ['Acknowledged', 'Done', 'On delivery', 'Pending'],
    );
    for (const card of cards) {
      expect(card.subtitle).toMatch(/^(Pending|Acknowledged|On delivery|Done) · \$50\.00 · \d{4}-\d{2}-\d{2}$/);
    }
    expect(JSON.stringify(cards).toLowerCase()).not.toMatch(/just placed|recently|today|hours ago/);
    // The prose the model writes comes from this same field, so a card cannot be honest beside a lie.
    expect(result.cardsSent).toBe(4);
  });

  it('show_orders never accepts a customer id from the model', async () => {
    const seed = await seedTestWorld();
    sendMessageMock.mockClear();

    const tools = createAgentTools(agentContext(seed));
    const showOrdersTool = tools.find((t) => t.name === 'show_orders')!;

    const result = JSON.parse(String(await showOrdersTool.invoke({ messengerId: 'psid-of-somebody-else' } as any)));
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
      await createOrderTool.invoke({ ...orderDefaults, productId, count: 1, customerPhone: '555-0088' });
    }

    const page = JSON.parse(await showOrdersTool.invoke({ startingLimit: 0, endLimit: 1 }));
    expect(page.sent).toBe(true);
    expect(page.showing).toBe('1-1');
    expect(page.hasMore).toBe(true);
    expect(page.cardsSent).toBe(1);
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

  it('find_variant pins a variant from folded option values and offers what exists when nothing matches', async () => {
    const seed = await seedTestWorld();
    const created = await createProduct({
        businessId: seed.business.id,
        name: 'Optioned Saree',
        price: 4600,
        sku: `OPT-${Date.now()}`,
        options: [
          { name: 'Color', values: ['Red', 'Blue'] },
          { name: 'Size', values: ['M', 'XL'] },
        ],
        variants: [
          { name: 'Red / M', stock: 3, options: { Color: 'Red', Size: 'M' } },
          { name: 'Blue / XL', stock: 1, options: { Color: 'Blue', Size: 'XL' } },
        ],
      });
    const tools = createAgentTools(agentContext(seed));
    const findVariantTool = tools.find((t) => t.name === 'find_variant')!;

    // Lower-case, partial: the tool folds what the model sent onto the declared names and values,
    // and one variant answers — pinned, with the show-photos instruction carrying its id.
    const pinned = JSON.parse(
      await findVariantTool.invoke({ productId: created.id, options: { color: 'red' } }),
    );
    expect(pinned.found).toBe(true);
    expect(pinned.variant).toMatchObject({
      name: 'Red / M',
      options: { Color: 'Red', Size: 'M' },
      available: true,
    });
    expect(pinned.instruction).toContain('show_variant_photos');

    // A value the option does not offer is refused with the values that exist, never invented.
    const refused = JSON.parse(
      await findVariantTool.invoke({ productId: created.id, options: { Color: 'Green' } }),
    );
    expect(refused.found).toBe(false);
    expect(refused.option).toEqual({ name: 'Color', values: ['Red', 'Blue'] });

    // A real value with no matching row hands the model every combination that does exist.
    const empty = JSON.parse(
      await findVariantTool.invoke({ productId: created.id, options: { Color: 'Red', Size: 'XL' } }),
    );
    expect(empty.found).toBe(false);
    expect(empty.combinations).toHaveLength(2);
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
      await tools.find((t) => t.name === 'create_order')!.invoke({ ...orderDefaults, productId, count: 1, customerPhone: '555-0099' }),
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
      await createOrderTool.invoke({ ...orderDefaults,
        productId: seed.productDetail.id,
        variantId: chosen.id,
        count: 1,
        customerPhone: '555-0100',
      }),
    );
    // The single size answers the question the customer never had to ask.
    const byDefault = JSON.parse(
      await createOrderTool.invoke({ ...orderDefaults,
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

  it('get_order and create_order hand the model the customer word, never the column value', async () => {
    const seed = await seedTestWorld();
    const tools = createAgentTools(agentContext(seed));
    const createOrderTool = tools.find((t) => t.name === 'create_order')!;
    const getOrderTool = tools.find((t) => t.name === 'get_order')!;

    // Guidance tells the model to relay these results, so an enum token here becomes English jargon
    // inside a শুদ্ধ বাংলা reply — the exact thing that happened on the virsys page.
    const order = JSON.parse(await createOrderTool.invoke({ ...orderDefaults,
      productId: seed.productDetail.id,
      count: 1,
      customerPhone: '555-0130',
    }));
    expect(order.state).toBe('Pending');

    const looked = JSON.parse(await getOrderTool.invoke({ orderId: order.id }));
    expect(looked.state).toBe('Pending');

    await updateOrderState(seed.business.id, order.id, { state: 'onDelivery' });
    const moved = JSON.parse(await getOrderTool.invoke({ orderId: order.id }));
    expect(moved.state).toBe('On delivery');
    expect(JSON.stringify(moved)).not.toContain('onDelivery');
  });

  it('show_products pages a catalog one message cannot hold, and says how big it is', async () => {
    const seed = await seedTestWorld();
    for (const name of ['Aaa Hat', 'Bbb Hat', 'Ccc Hat']) {
      await createProduct({
        businessId: seed.business.id,
        name,
        price: 20,
        sku: `PAGE-${name}-${Date.now()}`,
        description: 'Paged across two messages',
        variants: [{ name: 'One', stock: 3, isAvailable: true, price: 20, imageUrl: `https://cdn.test/${name}.jpg` }],
      });
    }

    sendMessageMock.mockClear();
    const tools = createAgentTools(agentContext(seed));
    const showProductsTool = tools.find((t) => t.name === 'show_products')!;

    const first = JSON.parse(await showProductsTool.invoke({ query: 'Hat', startingLimit: 0, endLimit: 2 }));
    expect(first.sent).toBe(true);
    // A card list of two out of three has to say it is two out of three, or the model tells the customer
    // they have seen the shop.
    expect({ showing: first.showing, matchingProducts: first.matchingProducts, hasMore: first.hasMore })
      .toEqual({ showing: '1-2', matchingProducts: 3, hasMore: true });
    expect((lastSend(sendMessageMock)[2] as MessengerCard[]).map((c) => c.title)).toEqual(['Aaa Hat', 'Bbb Hat']);
    expect(first.hasMore).toBe(true);
    expect(first.matchingProducts).toBe(3);
    expect(first.showing).toBe('1-2');

    const second = JSON.parse(await showProductsTool.invoke({ query: 'Hat', startingLimit: 2, endLimit: 4 }));
    expect({ showing: second.showing, matchingProducts: second.matchingProducts, hasMore: second.hasMore })
      .toEqual({ showing: '3-3', matchingProducts: 3, hasMore: false });
    expect((lastSend(sendMessageMock)[2] as MessengerCard[]).map((c) => c.title)).toEqual(['Ccc Hat']);
    expect(second.hasMore).toBe(false);
    expect(second.matchingProducts).toBe(3);

    // Stable order is what makes the two pages a page and not a reshuffle.
    const titles = [
      ...(first.products as string[]),
      ...(second.products as string[]),
    ];
    expect(new Set(titles).size).toBe(3);
  });

  it('show_products keeps its honesty when a page runs out or has no pictures', async () => {
    const seed = await seedTestWorld();
    // Two products the customer cannot be shown, then one they can, so a page of the first two is a page
    // with nothing to send — and the rest of the store is still behind it.
    for (const [name, photo] of [['Aaa Hat', null], ['Bbb Hat', null], ['Ccc Hat', 'https://cdn.test/ccc.jpg']]) {
      await createProduct({
        businessId: seed.business.id,
        name,
        price: 20,
        sku: `EDGE-${name}-${Date.now()}`,
        description: 'Paging edge cases',
        variants: [{ name: 'One', stock: 3, isAvailable: true, price: 20, ...(photo ? { imageUrl: photo } : {}) }],
      });
    }

    sendMessageMock.mockClear();
    const tools = createAgentTools(agentContext(seed));
    const showProductsTool = tools.find((t) => t.name === 'show_products')!;

    // A page whose every product lacks a photo is not an empty store: the browse has to stay open.
    const stalled = JSON.parse(await showProductsTool.invoke({ query: 'Hat', startingLimit: 0, endLimit: 2 }));
    expect(stalled.sent).toBe(false);
    expect({ showing: stalled.showing, matchingProducts: stalled.matchingProducts, hasMore: stalled.hasMore })
      .toEqual({ showing: '1-2', matchingProducts: 3, hasMore: true });
    expect(stalled.reason).toMatch(/photo/i);
    expect(stalled.instruction).toMatch(/keep paging/i);
    expect(stalled.instruction).toContain('startingLimit=2');

    // Asking past the end is the customer saying "more" once too often. It used to answer "the rest of the
    // matches are out of stock" — a claim about inventory the store never made.
    const pastEnd = JSON.parse(await showProductsTool.invoke({ query: 'Hat', startingLimit: 5, endLimit: 7 }));
    expect(pastEnd.sent).toBe(false);
    expect(pastEnd.hasMore).toBe(false);
    expect(pastEnd.reason).toMatch(/already been shown/);
    expect(pastEnd.reason).not.toMatch(/stock/);
    expect(pastEnd.instruction).toMatch(/do not send the first page again/i);

    // The page that does carry a picture still says it is the last of them.
    const last = JSON.parse(await showProductsTool.invoke({ query: 'Hat', startingLimit: 2, endLimit: 4 }));
    expect(last.sent).toBe(true);
    expect({ showing: last.showing, matchingProducts: last.matchingProducts, hasMore: last.hasMore })
      .toEqual({ showing: '3-3', matchingProducts: 3, hasMore: false });
  });

  it('show_products filters by the category a customer names, never by an id', async () => {
    const seed = await seedTestWorld();
    await createProduct({
      businessId: seed.business.id,
      name: 'Red Saree',
      price: 100,
      sku: `CAT1-${Date.now()}`,
      description: 'One kind',
      categoryName: 'Saree',
      variants: [{ name: 'One', stock: 2, isAvailable: true, price: 100, imageUrl: 'https://cdn.test/saree.jpg' }],
    });
    await createProduct({
      businessId: seed.business.id,
      name: 'Blue Cap',
      price: 50,
      sku: `CAT2-${Date.now()}`,
      description: 'Another kind',
      categoryName: 'Caps',
      variants: [{ name: 'One', stock: 2, isAvailable: true, price: 50, imageUrl: 'https://cdn.test/cap.jpg' }],
    });

    sendMessageMock.mockClear();
    const tools = createAgentTools(agentContext(seed));
    const showProductsTool = tools.find((t) => t.name === 'show_products')!;

    const byWord = JSON.parse(await showProductsTool.invoke({ category: ' saree ' }));
    expect(byWord.sent).toBe(true);
    expect(byWord.category).toBe('Saree');
    expect(byWord.matchingProducts).toBe(1);
    expect((lastSend(sendMessageMock)[2] as MessengerCard[]).map((c) => c.title)).toEqual(['Red Saree']);

    const miss = JSON.parse(await showProductsTool.invoke({ category: 'Watches' }));
    expect(miss.sent).toBe(false);
    const names = miss.categories.map((c: { name: string }) => c.name);
    expect(names).toContain('Saree');
    expect(names).toContain('Caps');
    expect(miss.instruction).toMatch(/do not ask the customer for a category id/i);
  });

  it('show_variant_photos answers to the size word, not only to an id', async () => {
    const seed = await seedTestWorld();
    await createProduct({
      businessId: seed.business.id,
      name: 'Word Jacket',
      price: 90,
      sku: `WORD-${Date.now()}`,
      description: 'Two sizes, one word each',
      variants: [
        { name: 'Fg', stock: 4, isAvailable: true, price: 90, imageUrl: 'https://cdn.test/w-fg.jpg' },
        { name: 'Black', stock: 2, isAvailable: true, price: 95, imageUrl: 'https://cdn.test/w-black.jpg' },
      ],
    });
    const productId = (await searchProductsForTest(seed.business.id, 'Word Jacket'))[0]!.id;
    const variants = (await getProductByIdForTest(seed.business.id, productId)).variants;

    const tool = createAgentTools(agentContext(seed)).find((t) => t.name === 'show_variant_photos')!;

    // The customer's own words, in the shapes they arrive in, reach the same size the id reaches.
    sendMessageMock.mockClear();
    const byId = JSON.parse(await tool.invoke({ productId, variantId: variants[0]!.id }));
    const byIdCards = lastSend(sendMessageMock)[2] as MessengerCard[];
    expect(byId.matchedBy).toBeUndefined();

    sendMessageMock.mockClear();
    const byWord = JSON.parse(await tool.invoke({ productId, variantId: ' fg ' }));
    const byWordCards = lastSend(sendMessageMock)[2] as MessengerCard[];
    expect(byWord.sent).toBe(true);
    expect(byWord.matchedBy).toBe('name');
    expect(byWordCards).toEqual(byIdCards);

    // A five-letter word is a name, not a label: 'Black' must not be read as a code the merchant never issued.
    sendMessageMock.mockClear();
    const black = JSON.parse(await tool.invoke({ productId, variantId: 'Black' }));
    expect(black.matchedBy).toBe('name');
    expect((lastSend(sendMessageMock)[2] as MessengerCard[])[0]!.title).toBe('Word Jacket — Black');

    // The stamped label still works, because that is how a picture is identified.
    sendMessageMock.mockClear();
    const byLabel = JSON.parse(await tool.invoke({ productId, variantId: variants[1]!.variantId ?? '' }));
    expect(byLabel.matchedBy).toBe('label');
    expect(byLabel.variant.name).toBe('Black');
  });

  it('show_variant_photos calls a single picture the only one there is', async () => {
    const seed = await seedTestWorld();
    await createProduct({
      businessId: seed.business.id,
      name: 'One Shot Shirt',
      price: 25,
      sku: `ONE-${Date.now()}`,
      description: 'Photographed once',
      variants: [{ name: 'M', stock: 7, isAvailable: true, price: 25, imageUrl: 'https://cdn.test/one.jpg' }],
    });
    const productId = (await searchProductsForTest(seed.business.id, 'One Shot Shirt'))[0]!.id;

    sendMessageMock.mockClear();
    const tools = createAgentTools(agentContext(seed));
    const result = JSON.parse(
      await tools.find((t) => t.name === 'show_variant_photos')!.invoke({ productId, variantId: 'M' }),
    );

    expect({ sent: result.sent, photosSent: result.photosSent, photosTotal: result.photosTotal })
      .toEqual({ sent: true, photosSent: 1, photosTotal: 1 });

    // This is the sentence that must differ from a plain size card, and the rule that must differ from
    // "all the pictures": the customer asked twice for more and was promised a set that does not exist.
    const cards = lastSend(sendMessageMock)[2] as MessengerCard[];
    expect(cards).toHaveLength(1);
    expect(cards[0]!.subtitle).toBe('$25.00 · 7 in stock · the only photo');
    expect(result.photosTotal).toBe(1);
  });

  it('show_variant_photos tells the truth when the store holds no picture', async () => {
    const seed = await seedTestWorld();
    // The seeded product's one size has never been photographed.
    const tools = createAgentTools(agentContext(seed));
    sendMessageMock.mockClear();

    const result = JSON.parse(
      await tools.find((t) => t.name === 'show_variant_photos')!.invoke({
        productId: seed.productDetail.id,
        variantId: 'Red M',
      }),
    );
    expect(result.sent).toBe(false);
    expect(result.photosOnRecord).toBe(0);
    expect(result.reason).toMatch(/no picture on record/);
    expect(result.instruction).toMatch(/do not send, promise/i);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('show_variant_photos asks which size when a word answers to two, and sends nothing', async () => {
    const seed = await seedTestWorld();
    await createProduct({
      businessId: seed.business.id,
      name: 'Twin Hoodie',
      price: 60,
      sku: `TWIN-${Date.now()}`,
      description: 'Two sizes a customer cannot tell apart by word',
      variants: [
        { name: 'Fg', stock: 3, isAvailable: true, price: 60, imageUrl: 'https://cdn.test/t1.jpg' },
        { name: 'fg', stock: 2, isAvailable: true, price: 65, imageUrl: 'https://cdn.test/t2.jpg' },
      ],
    });
    const productId = (await searchProductsForTest(seed.business.id, 'Twin Hoodie'))[0]!.id;

    sendMessageMock.mockClear();
    const tools = createAgentTools(agentContext(seed));
    const result = JSON.parse(
      await tools.find((t) => t.name === 'show_variant_photos')!.invoke({ productId, variantId: 'Fg' }),
    );

    expect(result.sent).toBe(false);
    expect(result.candidates.map((c: { name: string }) => c.name)).toEqual(['Fg', 'fg']);
    expect(result.instruction).toMatch(/which of those/i);
    expect(result.instruction).toMatch(/do not ask for an id/i);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('show_variant_photos lists the sizes rather than demanding a code when the word matches none', async () => {
    const seed = await seedTestWorld();
    await createProduct({
      businessId: seed.business.id,
      name: 'Narrow Cap',
      price: 20,
      sku: `NAR-${Date.now()}`,
      description: 'One size only',
      variants: [{ name: 'Small', stock: 6, isAvailable: true, price: 20, imageUrl: 'https://cdn.test/cap.jpg' }],
    });
    const productId = (await searchProductsForTest(seed.business.id, 'Narrow Cap'))[0]!.id;

    sendMessageMock.mockClear();
    const tools = createAgentTools(agentContext(seed));
    const result = JSON.parse(
      await tools.find((t) => t.name === 'show_variant_photos')!.invoke({ productId, variantId: 'purple' }),
    );

    expect(result.sent).toBe(false);
    expect(result.sizes.map((s: { name: string }) => s.name)).toEqual(['Small']);
    expect(result.instruction).toMatch(/never ask the customer for an id/i);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('show_product_info hands back the ids and picture counts that make asking unnecessary', async () => {
    const seed = await seedTestWorld();
    const tools = createAgentTools(agentContext(seed));
    const productId = seed.productDetail.id;

    const result = JSON.parse(
      await tools.find((t) => t.name === 'show_product_info')!.invoke({ productId }),
    );
    // It cannot card a size with no picture, but it still tells the model what that size is called and
    // that there is nothing to show — which is what the next turn needs to answer instead of asking.
    expect(result.sent).toBe(false);
    expect(result.variants).toEqual([
      { id: seed.productDetail.variants[0]!.id, name: 'Red M', label: seed.productDetail.variants[0]!.variantId ?? null, price: '$29.99', stock: 10, photos: 0 },
    ]);
  });

  it('get_product_options tells the model how many pictures each size actually has', async () => {
    const seed = await seedTestWorld();
    await createProduct({
      businessId: seed.business.id,
      name: 'Counted Scarf',
      price: 18,
      sku: `COUNT-${Date.now()}`,
      description: 'Three pictures on one size, none on the other',
      variants: [
        {
          name: 'Wool', stock: 3, isAvailable: true, price: 18, imageUrl: 'https://cdn.test/s1.jpg',
          imageUrls: ['https://cdn.test/s1.jpg', 'https://cdn.test/s2.jpg', 'https://cdn.test/s3.jpg'],
        },
        { name: 'Silk', stock: 1, isAvailable: true, price: 22 },
      ],
    });

    const tools = createAgentTools(agentContext(seed));
    const productId = (await searchProductsForTest(seed.business.id, 'Counted Scarf'))[0]!.id;
    const scarf = JSON.parse(
      await tools.find((t) => t.name === 'get_product_options')!.invoke({ productId }),
    );
    expect(scarf.variants.map((v: { name: string; photos: number }) => [v.name, v.photos]))
      .toEqual([['Wool', 3], ['Silk', 0]]);
    expect(scarf.variants[0].label).toMatch(/^[A-Z0-9]{5}$/);
    // The counts and the label are the point; the picture bytes are not something a model needs.
    expect(JSON.stringify(scarf)).not.toContain('cdn.test');
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
