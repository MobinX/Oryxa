import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { Agent } from '@repo/agent';
import { createSendMessageFakeLlm } from '../helpers/fake-llm';

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
      llm: createSendMessageFakeLlm('Yes, we have shirts in stock!'),
    });

    const reply = await agent.run();
    expect(typeof reply).toBe('string');
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
      llm: createSendMessageFakeLlm('How can I help?'),
    });

    await expect(agent.run()).resolves.toEqual(expect.any(String));
  }, 30_000);
});
