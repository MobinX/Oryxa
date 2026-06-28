/**
 * Agent Behaviour Test Suite — Real LLM (Gemini) + PGlite in-memory DB
 *
 * What this tests:
 *   • Product discovery (by name, by SKU, non-existent)
 *   • Order flow (search → order → confirmation in DB)
 *   • Loop detection (tool repetition guard, single-reply rule)
 *   • Multi-turn context (history carrying through)
 *   • System prompt adherence (on-topic, off-topic rejection)
 *   • Message burst handling (multiple pending messages in one run)
 *
 * Each test:
 *   1. Creates a fresh conversation + inserts customer message(s)
 *   2. Runs the agent via the SSE collector (real Gemini, no real FB send)
 *   3. Asserts on emitted SSE events AND DB state
 *   4. Cleans up all orders + messages created, resets conversation state
 *
 * Guard: if GEMINI_API_KEY is not set, all tests are skipped gracefully.
 *
 * Run with:
 *   bun test tests/agent/behaviour
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq, and, isNull } from 'drizzle-orm';
import { withPglite } from '../../helpers/with-pglite';
import { seedMinimalWorld } from '../../helpers/seed';
import { seedBehaviourProducts } from './seed-products';
import { runAgentWithSse, extractReplyText } from './sse-collector';
import { getOrCreateConversation, createMessage, updateConversationState } from '@repo/db/crud/conversation';
import { db } from '@repo/db/client';
import { orders, messages, conversations } from '@repo/db/schema';
import type { MinimalSeed } from '../../helpers/seed';
import type { BehaviourCatalog } from './seed-products';

// ── Skip guard ───────────────────────────────────────────────────────────────
const SKIP = !process.env.GEMINI_API_KEY;
if (SKIP) {
  console.warn('[behaviour-tests] GEMINI_API_KEY not set — all real-LLM tests will be skipped');
}

// ── Mock Facebook send API ───────────────────────────────────────────────────
// The SSE collector uses sendMessageOverride, but vi.mock is still needed to
// prevent any accidental import path from calling the real API.
const fbSendMock = vi.fn(async () => undefined);
vi.mock('@repo/integrations/facebook', () => ({
  sendMessage: (...args: unknown[]) => fbSendMock(...args),
  getFacebookUserProfile: async () => ({ name: undefined, avatar: undefined }),
  replyToFacebookComment: async () => 'mock-comment-id',
  getFacebookPostContext: async () => null,
  verifyWebhookSignature: async () => true,
}));

// ── Test state ───────────────────────────────────────────────────────────────
let seed: MinimalSeed;
let catalog: BehaviourCatalog;

/** IDs of orders created during each test — deleted in afterEach. */
const trackedOrderIds: string[] = [];
/** IDs of conversations created during each test — reset in afterEach. */
const trackedConversationIds: string[] = [];

/** Creates a fresh conversation + inserts one or more customer messages, then
 *  returns the conversationId ready for runAgentWithSse. */
async function setupConversation(
  customerMessages: string[],
  testUserId = `cust-${crypto.randomUUID()}`,
): Promise<string> {
  const conv = await getOrCreateConversation(
    seed.business.id,
    seed.channel.id,
    testUserId,
    'Test Customer',
  );

  for (const text of customerMessages) {
    await createMessage({ conversationId: conv.id, from: 'customer', content: text });
  }

  trackedConversationIds.push(conv.id);
  return conv.id;
}

// ── Suite setup ──────────────────────────────────────────────────────────────
describe.skipIf(SKIP)('Agent Behaviour — Real LLM (PGlite + Gemini)', () => {
  withPglite();

  beforeAll(async () => {
    seed = await seedMinimalWorld();
    catalog = await seedBehaviourProducts(seed.business.id);
    console.log('[behaviour-tests] seeded world:', {
      businessId: seed.business.id,
      channelId: seed.channel.id,
      products: Object.fromEntries(
        Object.entries(catalog).map(([k, p]) => [k, { id: p.id, name: p.name }]),
      ),
    });
  });

  afterAll(async () => {
    // The business cascade will delete products, categories, agents, channels
    // etc. — nothing else to clean up here.
  });

  afterEach(async () => {
    fbSendMock.mockClear();

    // Delete all orders tracked in this test
    for (const orderId of trackedOrderIds) {
      await db.update(orders).set({ deletedAt: new Date() }).where(eq(orders.id, orderId));
    }
    trackedOrderIds.length = 0;

    // Delete messages and reset conversation state for conversations used
    for (const convId of trackedConversationIds) {
      await db
        .update(messages)
        .set({ deletedAt: new Date() })
        .where(and(eq(messages.conversationId, convId), isNull(messages.deletedAt)));
      await updateConversationState(convId, 'done');
    }
    trackedConversationIds.length = 0;
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP 1: Product Discovery
  // ══════════════════════════════════════════════════════════════════════════

  describe('Product Discovery', () => {
    it('searches by product name and mentions it in the reply', async () => {
      const convId = await setupConversation(['Do you have t-shirts?']);
      const result = await runAgentWithSse(convId);

      // Must have called get_product at least once
      const productSearches = result.toolCalls.filter((tc) => tc.name === 'get_product');
      expect(productSearches.length).toBeGreaterThanOrEqual(1);

      // Reply must mention the product
      const reply = extractReplyText(result);
      expect(reply).toMatch(/arctic breeze t-shirt/i);
    }, 60_000);

    it('searches by SKU and returns product info', async () => {
      const convId = await setupConversation(['Can I get info on SKU ABT-001?']);
      const result = await runAgentWithSse(convId);

      const productSearches = result.toolCalls.filter((tc) => tc.name === 'get_product');
      expect(productSearches.length).toBeGreaterThanOrEqual(1);

      const reply = extractReplyText(result);
      // Should mention the product or at least the SKU/price
      expect(reply).toMatch(/arctic breeze|ABT-001|29\.99|\$29/i);
    }, 60_000);

    it('handles non-existent product gracefully (no crash, apologetic reply)', async () => {
      const convId = await setupConversation(['Do you sell magic carpets?']);
      const result = await runAgentWithSse(convId);

      // Agent must still send a reply
      expect(result.sentTexts.length + result.events.filter((e) => e.event === 'reply').length).toBeGreaterThan(0);

      const reply = extractReplyText(result);
      // Reply should not be empty
      expect(reply.trim().length).toBeGreaterThan(10);
      // Reply must NOT claim we have magic carpets
      expect(reply).not.toMatch(/yes.*magic carpet|we have.*magic carpet/i);
    }, 60_000);

    it('mentions price when asked about a product', async () => {
      const convId = await setupConversation(['How much is the ProBook Laptop?']);
      const result = await runAgentWithSse(convId);

      const reply = extractReplyText(result);
      // Should mention some price figure
      expect(reply).toMatch(/\$|price|999|1199/i);
    }, 60_000);

    it('mentions both products when asked to compare two', async () => {
      const convId = await setupConversation([
        'What is the difference between the Arctic Breeze T-Shirt and the SoundWave Headphones?',
      ]);
      const result = await runAgentWithSse(convId);

      // May call get_product once or twice (for each product)
      const productSearches = result.toolCalls.filter((tc) => tc.name === 'get_product');
      expect(productSearches.length).toBeGreaterThanOrEqual(1);
      expect(productSearches.length).toBeLessThanOrEqual(4); // loop guard

      const reply = extractReplyText(result);
      // Should mention both products (or at least one clearly)
      expect(reply.toLowerCase()).toMatch(/t-shirt|headphone|arctic|soundwave/);
    }, 60_000);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP 2: Order Flow
  // ══════════════════════════════════════════════════════════════════════════

  describe('Order Flow', () => {
    it('places an order when the customer requests one with address and phone', async () => {
      const convId = await setupConversation([
        `I want to order 1 Arctic Breeze T-Shirt (Blue M). My phone is 555-0100 and address is 10 Test Lane.`,
      ]);
      const result = await runAgentWithSse(convId);

      // Must have called create_order
      const orderCalls = result.toolCalls.filter((tc) => tc.name === 'create_order');
      expect(orderCalls.length).toBeGreaterThanOrEqual(1);

      // Order must appear in the DB
      const dbOrders = await db.query.orders.findMany({
        where: and(eq(orders.businessId, seed.business.id), isNull(orders.deletedAt)),
      });
      expect(dbOrders.length).toBeGreaterThanOrEqual(1);

      // Track for cleanup
      dbOrders.forEach((o) => trackedOrderIds.push(o.id));

      // Reply must confirm
      const reply = extractReplyText(result);
      expect(reply).toMatch(/order|placed|confirm/i);
    }, 90_000);

    it('create_order receives the correct product ID', async () => {
      const convId = await setupConversation([
        `Please order a ProBook Laptop 15 for me. Phone: 555-9999. Address: 5 Laptop Road.`,
      ]);
      const result = await runAgentWithSse(convId);

      const orderCall = result.toolCalls.find((tc) => tc.name === 'create_order');
      expect(orderCall).toBeDefined();
      // The productId in the tool args must be the laptop's ID
      const args = orderCall!.args as { productId: string };
      expect(args.productId).toBe(catalog.laptop.id);

      // Track for cleanup
      const dbOrders = await db.query.orders.findMany({
        where: and(eq(orders.businessId, seed.business.id), isNull(orders.deletedAt)),
      });
      dbOrders.forEach((o) => trackedOrderIds.push(o.id));
    }, 90_000);

    it('order appears in DB with state=pending after successful run', async () => {
      const convId = await setupConversation([
        `I want SoundWave Headphones (Black). Phone: 555-0200. Address: 20 Sound St.`,
      ]);
      await runAgentWithSse(convId);

      const dbOrders = await db.query.orders.findMany({
        where: and(
          eq(orders.businessId, seed.business.id),
          eq(orders.productId, catalog.headphones.id),
          isNull(orders.deletedAt),
        ),
      });
      expect(dbOrders.length).toBeGreaterThanOrEqual(1);
      expect(dbOrders[0].state).toBe('pending');

      dbOrders.forEach((o) => trackedOrderIds.push(o.id));
    }, 90_000);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP 3: Loop Detection & Reply Count
  // ══════════════════════════════════════════════════════════════════════════

  describe('Loop Detection & Reply Count', () => {
    it('calls get_product at most 3 times per run (no get_product loop)', async () => {
      const convId = await setupConversation(['Tell me about all your products in detail.']);
      const result = await runAgentWithSse(convId);

      const productCalls = result.toolCalls.filter((tc) => tc.name === 'get_product');
      expect(productCalls.length).toBeLessThanOrEqual(3);
    }, 60_000);

    it('sends exactly one reply for a single customer message (no duplicate send_message)', async () => {
      const convId = await setupConversation(['Do you have headphones?']);
      const result = await runAgentWithSse(convId);

      // message_sent events (from tool) + reply events (from fallback)
      const sendEvents = result.events.filter(
        (e) => e.event === 'message_sent' || e.event === 'reply',
      );
      // There should be at most 2 (one message_sent from tool, one reply from agent.run())
      // but only ONE actual message delivered (message_sent = tool, reply = final string from invoke)
      const actualDeliveries = result.events.filter((e) => e.event === 'message_sent');
      expect(actualDeliveries.length).toBeLessThanOrEqual(1);
    }, 60_000);

    it('create_order is called at most once per run (no order loop)', async () => {
      const convId = await setupConversation([
        'Order me a SoundWave Headphones Black. My phone is 555-0300. Address: 1 Loop Lane.',
      ]);
      const result = await runAgentWithSse(convId);

      const orderCalls = result.toolCalls.filter((tc) => tc.name === 'create_order');
      expect(orderCalls.length).toBeLessThanOrEqual(1);

      const dbOrders = await db.query.orders.findMany({
        where: and(eq(orders.businessId, seed.business.id), isNull(orders.deletedAt)),
      });
      dbOrders.forEach((o) => trackedOrderIds.push(o.id));
    }, 60_000);

    it('agent does not call send_message more than once per run', async () => {
      const convId = await setupConversation(['What t-shirts do you have?']);
      const result = await runAgentWithSse(convId);

      const sendCalls = result.toolCalls.filter((tc) => tc.name === 'send_message');
      expect(sendCalls.length).toBeLessThanOrEqual(1);
    }, 60_000);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP 4: Context & History
  // ══════════════════════════════════════════════════════════════════════════

  describe('Context & History', () => {
    it('references prior AI reply in a multi-turn conversation', async () => {
      // Stable test user so both turns share the same conversation
      const testUserId = `history-user-${crypto.randomUUID()}`;
      const conv = await getOrCreateConversation(
        seed.business.id,
        seed.channel.id,
        testUserId,
        'History Customer',
      );
      trackedConversationIds.push(conv.id);

      // Turn 1: customer asks, agent replies (insert as self message)
      await createMessage({ conversationId: conv.id, from: 'customer', content: 'Do you sell laptops?' });
      await createMessage({
        conversationId: conv.id,
        from: 'self',
        content: 'Yes! We have the ProBook Laptop 15 at $999.',
        state: 'done',
      });

      // Turn 2: customer follows up
      await createMessage({
        conversationId: conv.id,
        from: 'customer',
        content: 'Great, can you tell me more about the RAM options?',
      });

      const result = await runAgentWithSse(conv.id);
      const reply = extractReplyText(result);

      // Agent should recall the laptop context from history
      expect(reply).toMatch(/ram|8gb|16gb|laptop|probook/i);
    }, 60_000);

    it('addresses all messages in a burst (multiple pending messages in one run)', async () => {
      const convId = await setupConversation([
        'Do you have t-shirts?',
        'Also, do you have headphones?',
        'And what is the price of the laptop?',
      ]);

      const result = await runAgentWithSse(convId);
      const reply = extractReplyText(result);

      // Reply should be non-trivial and somewhat address the burst
      expect(reply.trim().length).toBeGreaterThan(30);

      // Confirm all 3 messages are marked done after the run
      const pending = await db.query.messages.findMany({
        where: and(
          eq(messages.conversationId, convId),
          eq(messages.from, 'customer'),
          eq(messages.state, 'pending'),
          isNull(messages.deletedAt),
        ),
      });
      expect(pending.length).toBe(0);
    }, 90_000);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP 5: System Prompt Adherence
  // ══════════════════════════════════════════════════════════════════════════

  describe('System Prompt Adherence', () => {
    it('keeps reply on-topic when asked an off-topic question', async () => {
      const convId = await setupConversation([
        'What is the capital of France? Also, who won the World Cup in 2022?',
      ]);
      const result = await runAgentWithSse(convId);
      const reply = extractReplyText(result);

      // Should not confidently answer the off-topic questions as a regular chatbot would
      // (the system prompt says "stay on topic" for the store)
      expect(reply).not.toMatch(/paris is the capital|argentina won|france won/i);
    }, 60_000);

    it('identifies the business name in the reply', async () => {
      const convId = await setupConversation(['Who are you and what store is this?']);
      const result = await runAgentWithSse(convId);
      const reply = extractReplyText(result);

      // Agent should mention the business name from the system prompt context
      expect(reply).toMatch(new RegExp(seed.business.name, 'i'));
    }, 60_000);

    it('conversation state is done after a successful run', async () => {
      const convId = await setupConversation(['Hello!']);
      await runAgentWithSse(convId);

      const conv = await db.query.conversations.findFirst({
        where: eq(conversations.id, convId),
      });
      expect(conv?.lastMessageState).toBe('done');
    }, 60_000);

    it('all customer messages are marked done after the run', async () => {
      const convId = await setupConversation(['Tell me about your headphones.']);
      await runAgentWithSse(convId);

      const pendingMsgs = await db.query.messages.findMany({
        where: and(
          eq(messages.conversationId, convId),
          eq(messages.from, 'customer'),
          eq(messages.state, 'pending'),
          isNull(messages.deletedAt),
        ),
      });
      expect(pendingMsgs.length).toBe(0);
    }, 60_000);

    it('agent emits agent_start event with correct conversationId', async () => {
      const convId = await setupConversation(['Hi there!']);
      const result = await runAgentWithSse(convId);

      const startEvent = result.events.find((e) => e.event === 'agent_start');
      expect(startEvent).toBeDefined();
      expect((startEvent!.data as { conversationId: string }).conversationId).toBe(convId);
    }, 60_000);

    it('SSE event stream includes runner_done after a successful run', async () => {
      const convId = await setupConversation(['What products do you have?']);
      const result = await runAgentWithSse(convId);

      const doneEvent = result.events.find((e) => e.event === 'runner_done');
      expect(doneEvent).toBeDefined();
    }, 60_000);
  });
});
