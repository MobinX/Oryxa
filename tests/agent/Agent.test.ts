import { describe, it, expect, vi } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { Agent } from '@repo/agent';
import { createDefaultReplyFakeLlm } from '../helpers/fake-llm';

const sendMessageMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@repo/integrations/facebook', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
}));

describe('Agent', () => {
  withPglite();

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
});
