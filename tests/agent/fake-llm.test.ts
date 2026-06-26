import { describe, it, expect } from 'vitest';
import {
  createSendMessageFakeLlm,
  createProductSearchFakeLlm,
  createOrderFakeLlm,
  createErrorFakeLlm,
} from '../helpers/fake-llm';

describe('Fake LLM helpers', () => {
  it('createSendMessageFakeLlm returns a bindable chat model', () => {
    const llm = createSendMessageFakeLlm('Hello!');
    expect(typeof llm.bindTools).toBe('function');
    expect(typeof llm.invoke).toBe('function');
  });

  it('createProductSearchFakeLlm returns a bindable chat model', () => {
    const llm = createProductSearchFakeLlm();
    expect(typeof llm.bindTools).toBe('function');
  });

  it('createOrderFakeLlm returns a bindable chat model', () => {
    const productId = '123e4567-e89b-12d3-a456-426614174000';
    const llm = createOrderFakeLlm(productId);
    expect(typeof llm.bindTools).toBe('function');
  });

  it('createErrorFakeLlm throws on invoke', async () => {
    const llm = createErrorFakeLlm('rate limit');
    const { HumanMessage } = await import('@langchain/core/messages');
    await expect(llm.invoke([new HumanMessage('test')])).rejects.toThrow('rate limit');
  });
});
