import { it, expect } from 'vitest';
import { seedTestWorld } from '../../helpers/seed';
import {
  getOrCreateConversation,
  getConversationWithHistory,
  createMessage,
  updateConversationState,
  checkPendingMessages,
  markCustomerMessagesDone,
  listConversations,
  listMessages,
  getConversationForBusiness,
  processInboundMessage,
} from '@repo/db/crud/conversation';

export function registerConversationCrudTests() {
  it('getOrCreateConversation is idempotent', async () => {
    const { business, channel } = await seedTestWorld();
    const custId = `cust-${Date.now()}`;
    const c1 = await getOrCreateConversation(business.id, channel.id, custId, 'Alice');
    const c2 = await getOrCreateConversation(business.id, channel.id, custId, 'Alice');
    expect(c1.id).toBe(c2.id);
  });

  it('createMessage saves customer message as pending', async () => {
    const { conversation } = await seedTestWorld();
    const msg = await createMessage({
      conversationId: conversation.id,
      from: 'customer',
      content: 'Hello',
    });
    expect(msg.state).toBe('pending');
    expect(await checkPendingMessages(conversation.id)).toBe(true);
  });

  it('getConversationWithHistory loads messages and channel', async () => {
    const { conversation } = await seedTestWorld();
    await createMessage({ conversationId: conversation.id, from: 'customer', content: 'Hi' });
    const conv = await getConversationWithHistory(conversation.id);
    expect(conv?.messages.length).toBeGreaterThan(0);
    expect(conv?.channel?.agent).toBeDefined();
  });

  it('updateConversationState changes state', async () => {
    const { conversation } = await seedTestWorld();
    await updateConversationState(conversation.id, 'working');
    const conv = await getConversationForBusiness(conversation.id, conversation.businessId);
    expect(conv?.lastMessageState).toBe('working');
  });

  it('markCustomerMessagesDone clears pending', async () => {
    const { conversation } = await seedTestWorld();
    await createMessage({ conversationId: conversation.id, from: 'customer', content: 'Pending' });
    await markCustomerMessagesDone(conversation.id);
    expect(await checkPendingMessages(conversation.id)).toBe(false);
  });

  it('listConversations and listMessages', async () => {
    const seed = await seedTestWorld();
    await createMessage({ conversationId: seed.conversation.id, from: 'customer', content: 'Test' });
    const convs = await listConversations(seed.business.id);
    expect(convs.length).toBeGreaterThan(0);
    const msgs = await listMessages(seed.conversation.id, seed.business.id);
    expect(msgs?.length).toBeGreaterThan(0);
  });

  it('processInboundMessage creates conversation and message', async () => {
    const { business, channel } = await seedTestWorld();
    const result = await processInboundMessage(
      { id: channel.id, businessId: business.id },
      `new-customer-${Date.now()}`,
      'I want to buy',
    );
    expect(result.conversationId).toBeDefined();
    expect(result.priorStatus).toBeDefined();
  });
}
