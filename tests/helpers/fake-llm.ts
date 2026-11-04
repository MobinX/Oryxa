import { AIMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ChatResult } from '@langchain/core/outputs';
import { FakeStreamingChatModel } from '@langchain/core/utils/testing';

/**
 * Builds a fake LLM whose final reply is `replyText`.
 *
 * Messenger text replies are delivered by the runner after the tool loop, so
 * this model returns a plain final answer.
 */
export function createDefaultReplyFakeLlm(replyText = 'Thanks for your message!') {
  return new FakeStreamingChatModel({
    toolStyle: 'google',
    responses: [new AIMessage(replyText)],
  });
}

/**
 * Fake LLM that searches products then sends a reply.
 */
export function createProductSearchFakeLlm() {
  return new FakeStreamingChatModel({
    toolStyle: 'google',
    responses: [
      new AIMessage({
        content: '',
        tool_calls: [
          {
            name: 'get_product',
            args: { query: 'T-Shirt' },
            id: 'call_get_1',
            type: 'tool_call',
          },
        ],
      }),
      new AIMessage('We have Test T-Shirt in stock!'),
    ],
  });
}

/**
 * Fake LLM that creates an order then sends confirmation.
 */
export function createOrderFakeLlm(productId: string, variantId?: string) {
  return new FakeStreamingChatModel({
    toolStyle: 'google',
    responses: [
      new AIMessage({
        content: '',
        tool_calls: [
          {
            name: 'create_order',
            args: {
              productId,
              variantId: variantId ?? null,
              count: 1,
              customerPhone: '555-0100',
              customerAddress: '123 Test St',
            },
            id: 'call_order_1',
            type: 'tool_call',
          },
        ],
      }),
      new AIMessage('Your order has been placed!'),
    ],
  });
}

export function createErrorFakeLlm(errorMessage = 'rate limit exceeded') {
  return new FakeStreamingChatModel({
    thrownErrorString: errorMessage,
    responses: [],
  });
}

/**
 * A model that answers `firstReply`, then switches to `secondReply` once the conversation carries
 * the duplicate alert — the corrective prompt the guard sends when the agent restates an answer the
 * customer already has. `FakeStreamingChatModel` replays its scripted list from the start of every
 * call and does not expose `_generate`, so the branch is decided from the messages themselves.
 */
export function createRepeatThenCorrectedLlm(firstReply: string, secondReply: string) {
  class ScriptedChatModel extends BaseChatModel {
    _llmType(): string {
      return 'scripted';
    }

    // The graph binds tools it will never be asked to call here; answering needs no binding.
    bindTools(): this {
      return this;
    }

    async _generate(messages: BaseMessage[]): Promise<ChatResult> {
      const alerted = messages.some((message) =>
        String(message.content ?? '').includes('NOT sent'),
      );
      const text = alerted ? secondReply : firstReply;
      return {
        generations: [{ text, message: new AIMessage(text), output: text }],
        llmOutput: {},
      };
    }
  }

  return new ScriptedChatModel({});
}
