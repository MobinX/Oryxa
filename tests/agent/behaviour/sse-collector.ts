import { runAgentCore } from '@api/lib/agent-runner-core';
import type { SseEmitter } from '@repo/agent';

/** One SSE event captured during an agent run. */
export type SseEvent = {
  event: string;
  data: unknown;
};

export type SseRunResult = {
  events: SseEvent[];
  toolCalls: Array<{ name: string; args: unknown }>;
  toolResults: Array<{ name: string; result: unknown }>;
  sentTexts: string[];
};

/**
 * Runs the agent core in-process and collects all SSE events into an array.
 *
 * The Facebook `sendMessage` call is replaced by a no-op that emits a
 * `message_sent` event into the collector — no real HTTP call is made.
 * The reply IS persisted to the DB (via createMessage inside the tool).
 *
 * Usage in tests:
 *   const { events, toolCalls, sentTexts } = await runAgentWithSse(conversationId, businessId);
 *   const productSearch = toolCalls.find(tc => tc.name === 'get_product');
 *   expect(productSearch?.args).toMatchObject({ query: expect.stringContaining('laptop') });
 */
export async function runAgentWithSse(
  conversationId: string,
): Promise<SseRunResult> {
  const events: SseEvent[] = [];

  const emitSse: SseEmitter = (event, data) => {
    events.push({ event, data });
  };

  // No-op override: skip real Facebook API call. The send_message tool still
  // persists the message to the DB.
  const sendMessageOverride = async (_pageToken: string, _psid: string, _text: string) => {
    // intentionally empty — SSE event is emitted by the tool before this call
  };

  await runAgentCore(conversationId, { emitSse, sendMessageOverride });

  // Derived convenience views of the event stream
  const toolCalls = events
    .filter((e) => e.event === 'tool_call')
    .map((e) => e.data as { name: string; args: unknown });

  const toolResults = events
    .filter((e) => e.event === 'tool_result')
    .map((e) => e.data as { name: string; result: unknown });

  const sentTexts = events
    .filter((e) => e.event === 'message_sent')
    .map((e) => (e.data as { text: string }).text);

  return { events, toolCalls, toolResults, sentTexts };
}

/**
 * Returns the text of the customer-facing reply the agent sent.
 * Prefers the `message_sent` event (tool path); falls back to the
 * final `reply` event (fallback path).
 */
export function extractReplyText(result: SseRunResult): string {
  const sent = result.events.find((e) => e.event === 'message_sent');
  if (sent) return (sent.data as { text: string }).text;
  const reply = result.events.find((e) => e.event === 'reply');
  if (reply) return (reply.data as { text: string }).text;
  return '';
}
