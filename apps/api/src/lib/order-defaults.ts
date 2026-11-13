import { getConversationWithHistory } from '@repo/db/crud/conversation';
import { getOrdersByPlatformId, getOrderById } from '@repo/db/crud/order';
import { parseConversationAgentState } from '@repo/shared';

export type ConversationOrderDefaults = {
  count: number;
  customerPhone: string;
  customerAddress: string;
  shippingCost?: number;
  transactionId?: string;
};

const EMPTY: ConversationOrderDefaults = { count: 1, customerPhone: '', customerAddress: '' };

/**
 * What the merchant already knows about this buyer when the order form opens: the facts the
 * agent captured before auto-pilot was switched off, else the last order this buyer placed,
 * else facts (phone number, TrxID, delivery charge) they typed in the thread. Only suggestions — every field stays editable.
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
  let shippingCost = state.pendingOrder?.shippingCost;
  let transactionId = state.pendingOrder?.transactionId?.trim();

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

  // Scan customer messages for phone number, transaction ID, and delivery charge
  for (const message of conv.messages) {
    if (message.from !== 'customer') continue;
    const content = message.content;

    if (!customerPhone) {
      const foundPhone = content.match(/(?:\+?88)?01[3-9]\d{8}/)?.[0];
      if (foundPhone) customerPhone = foundPhone;
    }

    if (!transactionId) {
      // Matches TrxID / Transaction ID / TxnId / Trx etc.
      const foundTrx = content.match(
        /(?:trx\s*id|transaction\s*id|txnid|trx|txn|টিএক্সএন)[\s:#=-]*([A-Za-z0-9]{6,18})/i,
      )?.[1];
      if (foundTrx) {
        transactionId = foundTrx.toUpperCase();
      } else {
        // If message mentions payment terms and contains an 8-12 char alphanumeric token
        if (/(?:bkash|nagad|rocket|advance|delivery|paid|sent|দিলাম|পাঠা)/i.test(content)) {
          const tokenMatch = content.match(/\b([A-Za-z0-9]{8,14})\b/);
          if (tokenMatch && !tokenMatch[1].startsWith('01') && !/^\d+$/.test(tokenMatch[1])) {
            transactionId = tokenMatch[1].toUpperCase();
          }
        }
      }
    }

    if (shippingCost == null || shippingCost === 0) {
      // Matches delivery charge / shipping cost / advance delivery fee
      const matchCharge =
        content.match(/(?:delivery|shipping|charge|advance|cost|ভাড়া|ডেলিভারি|চার্জ)[\s:#=-]*(\d{2,4})/i) ||
        content.match(/(\d{2,4})\s*(?:tk|টাকা|taka)[\s]*(?:delivery|shipping|charge|advance|ভাড়া|ডেলিভারি|চার্জ)?/i);
      if (matchCharge && matchCharge[1]) {
        const val = parseInt(matchCharge[1], 10);
        if (val >= 40 && val <= 1000) {
          shippingCost = val;
        }
      }
    }
  }

  return {
    count: count > 0 ? count : 1,
    customerPhone,
    customerAddress,
    ...(shippingCost != null && shippingCost > 0 ? { shippingCost } : {}),
    ...(transactionId ? { transactionId } : {}),
  };
}
