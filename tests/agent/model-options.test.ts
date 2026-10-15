import { describe, it, expect } from 'vitest';
import { ChatOpenAI } from '@langchain/openai';
import { openAIChatOptions, openAIModel, DEFAULT_OPENAI_MODEL, OPENAI_REASONING_EFFORT } from '@repo/agent/model';

/**
 * What actually goes on the wire.
 *
 * Two shipped commits died on Azure answering 400 Unsupported parameter: 'max_tokens' — first because a
 * temperature was sent, then because LangChain chooses between max_tokens and max_completion_tokens from
 * its own model-name test, which only recognises o\d and gpt-5* and so never recognises gpt-6-luna. The
 * fields named after the settings cannot be trusted here; only the outgoing body can. A credentials-free
 * key is supplied because CI has no Azure secret and this test is about parameters, not calls.
 */
function outgoing(fields: Record<string, unknown>) {
  const llm = new ChatOpenAI({ apiKey: 'test-key', ...fields } as any);
  return (llm as any).invocationParams({}) as Record<string, unknown>;
}

describe('the Azure reasoning deployment request shape', () => {
  it('asks for the reply cap under max_completion_tokens and never the rejected max_tokens', () => {
    const params = outgoing(openAIChatOptions('gpt-6-luna', { maxCompletionTokens: 16384 }));

    expect(params.max_completion_tokens).toBe(16384);
    expect(params.max_tokens).toBeUndefined();
    expect(params.temperature).toBeUndefined();
    expect(params.reasoning_effort).toBe(OPENAI_REASONING_EFFORT);
  });

  it('a call that sets no cap sends neither parameter name', () => {
    const params = outgoing(openAIChatOptions('gpt-6-luna'));

    expect(params.max_tokens).toBeUndefined();
    expect(params.max_completion_tokens).toBeUndefined();
    expect(params.reasoning_effort).toBe(OPENAI_REASONING_EFFORT);
  });

  it('the default deployment is the reasoning model, and OPENAI_MODEL still wins', () => {
    const had = process.env.OPENAI_MODEL;
    process.env.OPENAI_MODEL = 'some-other-deployment';
    try {
      expect(openAIModel()).toBe('some-other-deployment');
    } finally {
      if (had === undefined) delete process.env.OPENAI_MODEL;
      else process.env.OPENAI_MODEL = had;
    }
    expect(openAIModel()).toBe(had ?? DEFAULT_OPENAI_MODEL);
  });
});
