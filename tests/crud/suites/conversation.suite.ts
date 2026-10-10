import { it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedTestWorld } from '../../helpers/seed';
import { db } from '@db/client';
import { conversations, messages } from '@db/schema';
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

  it('listMessages returns the newest page, oldest message first', async () => {
    const seed = await seedTestWorld();
    const base = Date.now() - 10_000;
    for (let i = 0; i < 4; i++) {
      await db.insert(messages).values({
        conversationId: seed.conversation.id,
        from: i % 2 === 0 ? 'customer' : 'self',
        content: `msg-${i}`,
        state: 'done',
        time: new Date(base + i * 1000),
      });
    }

    // A page of 2 out of 4 must be the last 2, still reading downwards. Taking the first N
    // rows in time order instead means a thread longer than the page never shows its newest
    // reply, and there is no offset on the route to reach it with.
    const page = await listMessages(seed.conversation.id, seed.business.id, 2);
    expect(page?.map((m) => m.content)).toEqual(['msg-2', 'msg-3']);
  });

  it('listConversations ranks by last activity, not by creation', async () => {
    const seed = await seedTestWorld();
    const quiet = await getOrCreateConversation(seed.business.id, seed.channel.id, 'cust-quiet', 'Quiet');
    const busy = await getOrCreateConversation(seed.business.id, seed.channel.id, 'cust-busy', 'Busy');
    const now = Date.now();
    await db
      .update(conversations)
      .set({ createdAt: new Date(now - 60 * 60_000), lastStateAt: new Date(now - 60 * 60_000) })
      .where(eq(conversations.id, busy.id));
    await db
      .update(conversations)
      .set({ createdAt: new Date(now - 5 * 24 * 60 * 60_000), lastStateAt: new Date(now - 60_000) })
      .where(eq(conversations.id, quiet.id));

    // `quiet` is the older thread but a customer just wrote in; `busy` was created an hour ago
    // and has been idle since. Ranking by createdAt hides the thread that needs attention.
    const ids = (await listConversations(seed.business.id)).map((c) => c.id);
    expect(ids.indexOf(quiet.id)).toBeLessThan(ids.indexOf(busy.id));
  });
}
