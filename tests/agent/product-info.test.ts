import { describe, it, expect } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import { FakeStreamingChatModel } from '@langchain/core/utils/testing';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ChatResult } from '@langchain/core/outputs';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { createAgentTools } from '@repo/agent/tools';
import { createCommentAgentTools } from '@repo/agent/tools/comment';
import {
  buildProductInfoData,
  cleanProductAnswer,
  createProductInfoTool,
  PRODUCT_INFO_UNAVAILABLE,
} from '@repo/agent/tools/product-info';
import { setAgentLogSink } from '@repo/agent/log';
import { Agent } from '@repo/agent';
import { createAgentUsageCollector } from '@repo/agent/usage';
import {
  COMMENT_AGENT_GUIDANCE,
  MESSENGER_AGENT_GUIDANCE,
} from '@repo/shared';

const ANSWER = 'Yes, the Test T-Shirt is cotton.\n• Red M is available.';

/** A model that answers with fixed text — the helper agent is tool-less, so one reply is enough. */
function fakeAnswer(text = ANSWER) {
  return new FakeStreamingChatModel({ responses: [new AIMessage(text)] });
}

/** The same answer, with the usage numbers a provider reports — the part the run must bill. */
function answerWithUsage(inputTokens = 100, outputTokens = 20, cacheHitTokens = 40) {
  return scripted([
    {
      content: ANSWER,
      usage_metadata: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        input_token_details: { cache_read: cacheHitTokens },
      },
    },
  ]);
}

/**
 * A model that returns one scripted message per call, usage included. `FakeStreamingChatModel`
 * drops both tool calls and usage metadata in `_generate`, which is the whole point here.
 */
function scripted(messages: Array<ConstructorParameters<typeof AIMessage>[0]>) {
  class ScriptedModel extends BaseChatModel {
    private index = 0;

    constructor() {
      super({});
    }

    _llmType(): string {
      return 'scripted-product-info';
    }

    bindTools(): this {
      return this;
    }

    async _generate(): Promise<ChatResult> {
      const fields = messages[Math.min(this.index, messages.length - 1)];
      this.index += 1;
      const message = new AIMessage(fields);
      return {
        generations: [{ text: typeof message.content === 'string' ? message.content : '', message }],
        llmOutput: {},
      };
    }
  }

  return new ScriptedModel();
}

describe('getProductInfoWithQuery', () => {
  withPglite({ timeoutMs: 120_000 });

  it('is present in both the Messenger and the comment tool sets', () => {
    const messenger = createAgentTools({
      businessId: 'prompt-test',
      conversationId: 'prompt-test',
      pageToken: 'prompt-test',
      customerPlatformId: 'prompt-test',
    });
    const comment = createCommentAgentTools({
      businessId: 'prompt-test',
      commentThreadId: 'prompt-test',
      pageToken: 'prompt-test',
      parentCommentExternalId: 'prompt-test',
    });

    expect(messenger.map((tool) => tool.name)).toContain('getProductInfoWithQuery');
    expect(comment.map((tool) => tool.name)).toContain('getProductInfoWithQuery');
  });

  it('runs the helper model over the real product row and returns its answer', async () => {
    const seed = await seedTestWorld();
    const events: Array<{ evt: string; fields: Record<string, unknown> }> = [];
    setAgentLogSink((evt, fields) => events.push({ evt, fields }));

    try {
      const tool = createAgentTools({
        businessId: seed.business.id,
        conversationId: seed.conversation.id,
        pageToken: 'tok',
        customerPlatformId: 'cust',
        businessName: seed.business.name,
        productInfoLlm: fakeAnswer(),
      }).find((item) => item.name === 'getProductInfoWithQuery')!;

      const result = await tool.invoke({
        productId: seed.productDetail.id,
        userQuery: 'Is the red one cotton?',
      });

      expect(result).toBe(ANSWER);
      expect(result).not.toContain(seed.productDetail.id);

      const logged = events.find((event) => event.evt === 'product_info');
      expect(logged).toBeDefined();
      expect(logged!.fields).toMatchObject({
        productId: seed.productDetail.id,
        ok: true,
        found: true,
        provider: expect.any(String),
        model: expect.any(String),
        variantCount: seed.productDetail.variants.length,
      });
      expect(logged!.fields.responseChars).toBe(ANSWER.length);
    } finally {
      setAgentLogSink(undefined);
    }
  });

  it('reports the helper call’s tokens to the run that will be billed', async () => {
    const seed = await seedTestWorld();
    const collector = createAgentUsageCollector();
    const tool = createProductInfoTool({
      businessId: seed.business.id,
      llm: answerWithUsage(),
      onTokenUsage: (usage) => collector.add(usage),
    });

    await tool.invoke({
      productId: seed.productDetail.id,
      userQuery: 'Is it cotton?',
    });

    expect(collector).toMatchObject({
      inputTokens: 100,
      outputTokens: 20,
      cacheHitTokens: 40,
      calls: 1,
    });
  });

  it('folds helper tokens into the Messenger run metrics', async () => {
    const seed = await seedTestWorld();
    const main = scripted([
      {
        content: '',
        tool_calls: [
          {
            name: 'getProductInfoWithQuery',
            args: { productId: seed.productDetail.id, userQuery: 'Is it cotton?' },
            id: 'call_product_info',
            type: 'tool_call',
          },
        ],
      },
      { content: 'Yes, it is made of cotton.' },
    ]);

    const agent = new Agent({
      systemPrompt: 'Answer briefly.',
      business: { id: seed.business.id, name: seed.business.name },
      history: [{ from: 'customer', content: 'Is the red one cotton?' }],
      conversationId: seed.conversation.id,
      pageToken: 'tok',
      customerPlatformId: 'cust',
      llm: main,
      productInfoLlm: answerWithUsage(),
    });

    const { metrics } = await agent.run();

    expect(metrics.inputTokens).toBeGreaterThanOrEqual(100);
    expect(metrics.outputTokens).toBeGreaterThanOrEqual(20);
    expect(metrics.cacheHitTokens).toBeGreaterThanOrEqual(40);
  });

  it('refuses instead of letting the sales agent answer an unknown product', async () => {
    const seed = await seedTestWorld();
    const tool = createProductInfoTool({
      businessId: seed.business.id,
      llm: fakeAnswer('this text must never be produced'),
    });

    const result = await tool.invoke({
      productId: '00000000-0000-4000-8000-000000000000',
      userQuery: 'How much is it?',
    });

    expect(result).toBe(PRODUCT_INFO_UNAVAILABLE);
    expect(result.startsWith('ERROR:')).toBe(true);
  });

  it('maps a catalog row to the facts the helper may quote', async () => {
    const seed = await seedTestWorld();
    const data = buildProductInfoData(seed.productDetail);

    expect(data).toMatchObject({
      name: 'Test T-Shirt',
      price: String(seed.productDetail.price),
      currency: 'BDT',
    });
    expect(data.variants).toHaveLength(seed.productDetail.variants.length);
    expect(JSON.stringify(data)).not.toContain(seed.productDetail.id);
  });

  it('keeps a customer-ready answer plain: no markdown headings, em dashes or stray markup', () => {
    const cleaned = cleanProductAnswer('## Details — cotton\n**Yes**\n- Red M\n* Blue L');
    expect(cleaned).toBe('Details, cotton\nYes\n• Red M\n• Blue L');
    expect(cleanProductAnswer('x'.repeat(2000))).toHaveLength(1200);
  });

  it('makes the mandatory route explicit in both channel prompts', () => {
    for (const guidance of [MESSENGER_AGENT_GUIDANCE, COMMENT_AGENT_GUIDANCE]) {
      expect(guidance).toContain('getProductInfoWithQuery');
      expect(guidance).toContain('NEVER answer a product question yourself');
    }
  });
});
