import { getConversationWithHistory } from '@repo/db/crud/conversation';
import { getOrdersByPlatformId, getOrderById } from '@repo/db/crud/order';
import { parseConversationAgentState } from '@repo/shared';

export type ConversationOrderDefaults = {
  count: number;
  customerPhone: string;
  customerAddress: string;
};

const EMPTY: ConversationOrderDefaults = { count: 1, customerPhone: '', customerAddress: '' };

/**
 * What the merchant already knows about this buyer when the order form opens: the facts the
 * agent captured before auto-pilot was switched off, else the last order this buyer placed,
 * else a phone number they typed in the thread. Only suggestions — every field stays editable.
 */
export async function getConversationOrderDefaults(
  businessId: string,
  conversationId: string,
): Promise<ConversationOrderDefaults> {
  const conv = await getConversationWithHistory(conversationId);
  if (!conv) return EMPTY;

  const state = parseConversationAgentState(conv.agentState);
  let customerPhone = state.pendingOrder?.customerPhone?.trim() ?? '';
  let customerAddress = state.pendingOrder?.customerAddress?.trim() ?? '';
  let count = state.pendingOrder?.count ?? 0;

  if (conv.businessId) {
    const history = await getOrdersByPlatformId(conv.businessId, conv.customerPlatformId, {
      limit: 1,
    }).catch(() => ({ orders: [] }));
    const latest = history.orders[0];
    if (latest) {
      const detail = await getOrderById(conv.businessId, latest.id).catch(() => null);
      if (detail) {
        if (!customerPhone) customerPhone = detail.customerPhone?.trim() ?? '';
        if (!customerAddress) customerAddress = detail.customerAddress?.trim() ?? '';
        if (!count) count = detail.count;
      }
    }
  }

  if (!customerPhone) {
    for (const message of conv.messages) {
      if (message.from !== 'customer') continue;
      const found = message.content.match(/(?:\+?88)?01[3-9]\d{8}/)?.[0];
      if (found) {
        customerPhone = found;
        break;
      }
    }
  }

  return {
    count: count > 0 ? count : 1,
    customerPhone,
    customerAddress,
  };
}
