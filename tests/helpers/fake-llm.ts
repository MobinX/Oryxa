import { AIMessage } from '@langchain/core/messages';
import { FakeStreamingChatModel } from '@langchain/core/utils/testing';

/**
 * Builds a fake LLM that first calls send_message, matching the agent's expected tool flow.
 */
export function createSendMessageFakeLlm(replyText = 'Thanks for your message!') {
  return new FakeStreamingChatModel({
    toolStyle: 'google',
    responses: [
      new AIMessage({
        content: '',
        tool_calls: [
          {
            name: 'send_message',
            args: { text: replyText },
            id: 'call_send_1',
            type: 'tool_call',
          },
        ],
      }),
      new AIMessage(replyText),
    ],
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
      new AIMessage({
        content: '',
        tool_calls: [
          {
            name: 'send_message',
            args: { text: 'We have Test T-Shirt in stock!' },
            id: 'call_send_2',
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
              variantId,
              count: 1,
              customerPhone: '555-0100',
              customerAddress: '123 Test St',
            },
            id: 'call_order_1',
            type: 'tool_call',
          },
        ],
      }),
      new AIMessage({
        content: '',
        tool_calls: [
          {
            name: 'send_message',
            args: { text: 'Your order has been placed!' },
            id: 'call_send_3',
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
