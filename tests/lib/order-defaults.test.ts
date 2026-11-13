import { describe, it, expect, vi } from 'vitest';
import { getConversationOrderDefaults } from '@api/lib/order-defaults';

vi.mock('@repo/db/crud/conversation', () => ({
  getConversationWithHistory: vi.fn(),
}));

vi.mock('@repo/db/crud/order', () => ({
  getOrdersByPlatformId: vi.fn().mockResolvedValue({ orders: [] }),
  getOrderById: vi.fn().mockResolvedValue(null),
}));

import { getConversationWithHistory } from '@repo/db/crud/conversation';

describe('getConversationOrderDefaults', () => {
  it('extracts transaction id and shipping cost from customer message', async () => {
    vi.mocked(getConversationWithHistory).mockResolvedValueOnce({
      id: 'conv-1',
      businessId: 'biz-1',
      customerPlatformId: 'cust-1',
      agentState: null,
      messages: [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          from: 'customer',
          content: 'Delivary charge 120 tk pathiyechi, TrxID: BL92KA819Q. Call me 01712345678.',
          createdAt: new Date(),
        },
      ],
    } as any);

    const defaults = await getConversationOrderDefaults('biz-1', 'conv-1');

    expect(defaults.customerPhone).toBe('01712345678');
    expect(defaults.transactionId).toBe('BL92KA819Q');
    expect(defaults.shippingCost).toBe(120);
  });

  it('prefers agent state pendingOrder if already profiled', async () => {
    vi.mocked(getConversationWithHistory).mockResolvedValueOnce({
      id: 'conv-2',
      businessId: 'biz-1',
      customerPlatformId: 'cust-2',
      agentState: {
        pendingOrder: {
          customerPhone: '01811122233',
          customerAddress: 'Dhanmondi, Dhaka',
          count: 2,
          shippingCost: 80,
          transactionId: 'TXN12345',
        },
      },
      messages: [],
    } as any);

    const defaults = await getConversationOrderDefaults('biz-1', 'conv-2');

    expect(defaults.customerPhone).toBe('01811122233');
    expect(defaults.customerAddress).toBe('Dhanmondi, Dhaka');
    expect(defaults.count).toBe(2);
    expect(defaults.shippingCost).toBe(80);
    expect(defaults.transactionId).toBe('TXN12345');
  });
});
