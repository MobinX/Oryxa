import { describe, it, expect, vi } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { createAgentTools } from '@repo/agent/tools';
import { updateOrderState } from '@repo/db/crud/order';

const sendMessageMock = vi.fn(async () => undefined);
vi.mock('@repo/integrations/facebook', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
}));

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
});
