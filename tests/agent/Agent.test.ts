import { describe, it, expect, vi } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { Agent } from '@repo/agent';
import { createDefaultReplyFakeLlm, createRepeatThenCorrectedLlm } from '../helpers/fake-llm';

const sendMessageMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@repo/integrations/facebook', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
}));

describe('Agent', () => {
  withPglite({ timeoutMs: 120_000 });

  it('runs with injected fake LLM and completes', async () => {
    const seed = await seedTestWorld();

    const agent = new Agent({
      systemPrompt: 'You are helpful.',
      business: { id: seed.business.id, name: seed.business.name, description: 'A test store' },
      history: [{ from: 'customer', content: 'Do you have shirts?' }],
      conversationId: seed.conversation.id,
      pageToken: 'page-tok',
      customerPlatformId: 'fb-customer',
      customerName: 'Buyer',
      catalogSummary: '- Test T-Shirt ($29.99) SKU: TSH-01',
      llm: createDefaultReplyFakeLlm('Yes, we have shirts in stock!'),
    });

    const { replyText, metrics } = await agent.run();
    expect(typeof replyText).toBe('string');
    expect(metrics).toBeDefined();
    expect(metrics.totalTokens).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it('maps self messages to AI history role', async () => {
    const seed = await seedTestWorld();
    const agent = new Agent({
      systemPrompt: 'Reply briefly.',
      business: { id: seed.business.id, name: seed.business.name },
      history: [
        { from: 'customer', content: 'Hi' },
        { from: 'self', content: 'Hello there' },
      ],
      conversationId: seed.conversation.id,
      pageToken: 'tok',
      customerPlatformId: 'cust',
      llm: createDefaultReplyFakeLlm('How can I help?'),
    });

    const result = await agent.run();
    expect(typeof result.replyText).toBe('string');
  }, 30_000);

  it('injects the merchant product and bargaining guidance into the system context', async () => {
    const seed = await seedTestWorld();
    const agent = new Agent({
      systemPrompt: 'Reply briefly.',
      business: {
        id: seed.business.id,
        name: seed.business.name,
        description: 'A test store',
        agentProductGuidance: 'Mention the fabric and wash care.',
        agentBargainGuidance: 'Prices are fixed; offer free delivery above 2000 Taka.',
      },
      history: [{ from: 'customer', content: 'Discount?' }],
      conversationId: seed.conversation.id,
      pageToken: 'tok',
      customerPlatformId: 'cust',
      llm: createDefaultReplyFakeLlm('Let me help.'),
    });

    const result = await agent.run();
    const system = result.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n');
    expect(system).toContain('Mention the fabric and wash care.');
    expect(system).toContain('Prices are fixed; offer free delivery above 2000 Taka.');
  }, 30_000);

  it('refuses a restated answer, tells the model, and takes the new one', async () => {
    const seed = await seedTestWorld();
    const previous = 'We have these categories. Which would you like to browse?';
    const better = 'Electronics has the Bluetooth Speaker at BDT 59.99 with 168 in stock. Want to see it?';
    const agent = new Agent({
      systemPrompt: 'Reply briefly.',
      business: { id: seed.business.id, name: seed.business.name },
      // The customer fragmented their own question, which is what triggers the repeat.
      history: [
        { from: 'self', content: previous },
        { from: 'customer', content: 'Have' },
      ],
      lastSelfReply: { content: previous, secondsAgo: 8 },
      conversationId: seed.conversation.id,
      pageToken: 'tok',
      customerPlatformId: 'cust',
      llm: createRepeatThenCorrectedLlm(previous, better),
    });

    const result = await agent.run();
    expect(result.replyText).toBe(better);
    const system = result.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n');
    expect(system).toContain('Your previous reply to this customer (8 seconds ago)');
    expect(system).toContain('do NOT restate that reply');
  }, 30_000);

  it('still answers a customer rather than sending them nothing', async () => {
    const seed = await seedTestWorld();
    const previous = 'We have these categories. Which would you like to browse?';
    const agent = new Agent({
      systemPrompt: 'Reply briefly.',
      business: { id: seed.business.id, name: seed.business.name },
      history: [{ from: 'self', content: previous }, { from: 'customer', content: 'what u have' }],
      lastSelfReply: { content: previous, secondsAgo: 5 },
      conversationId: seed.conversation.id,
      pageToken: 'tok',
      customerPlatformId: 'cust',
      // The model will not change its mind, and nothing else went out this turn: an imperfect
      // answer beats a customer left on read.
      llm: createRepeatThenCorrectedLlm(previous, `${previous} (Accessories / Apparel)`),
    });

    const result = await agent.run();
    expect(result.replyText).toContain('We have these categories');
  }, 30_000);
});
