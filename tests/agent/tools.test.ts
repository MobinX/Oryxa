import { describe, it, expect, vi } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { createAgentTools } from '@repo/agent/tools';

const sendMessageMock = vi.fn(async () => undefined);
vi.mock('@repo/integrations/facebook', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
}));

describe('Agent Tools', () => {
  withPglite();

  it('get_product tool searches catalog', async () => {
    const seed = await seedTestWorld();
    const [getProductTool] = createAgentTools({
      businessId: seed.business.id,
      conversationId: seed.conversation.id,
      pageToken: 'tok',
      customerPlatformId: 'cust',
    });

    const result = await getProductTool.invoke({ query: 'T-Shirt' });
    expect(result).toContain('Test T-Shirt');
  });

  it('create_order tool writes to database', async () => {
    const seed = await seedTestWorld();
    const [, createOrderTool] = createAgentTools({
      businessId: seed.business.id,
      conversationId: seed.conversation.id,
      pageToken: 'tok',
      customerPlatformId: 'cust',
      customerName: 'Tool Buyer',
    });

    const result = await createOrderTool.invoke({
      productId: seed.productDetail.id,
      variantId: seed.productDetail.variants[0]?.id,
      count: 1,
      customerPhone: '555-0001',
    });
    expect(result).toContain('"id"');
  });

  it('send_message tool calls Facebook API', async () => {
    const seed = await seedTestWorld();
    sendMessageMock.mockClear();
    const [, , sendMessageTool] = createAgentTools({
      businessId: seed.business.id,
      conversationId: seed.conversation.id,
      pageToken: 'page-tok',
      customerPlatformId: 'fb-user-1',
    });

    const result = await sendMessageTool.invoke({ text: 'Hello from tool' });
    expect(result).toContain('sent');
    expect(sendMessageMock).toHaveBeenCalledWith('page-tok', 'fb-user-1', 'Hello from tool');
  });
});
