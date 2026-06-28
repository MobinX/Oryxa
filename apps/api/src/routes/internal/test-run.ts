import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { testRunInputSchema } from '@repo/shared';
import { runAgentCore } from '@api/lib/agent-runner-core';
import type { SseEmitter } from '@repo/agent';

export const testRunRouter = new Hono();

/**
 * POST /internal/test-run
 *
 * Simulates a customer sending a message on a real channel, runs the agent
 * end-to-end, and streams every agent event (tool calls, tool results, reply)
 * as Server-Sent Events so the caller can observe exactly what the agent did.
 *
 * Requires the same `x-internal-key` header as `/internal/run`.
 *
 * The test user is created as a conversation row with a deterministic PSID
 * (`test-user-{channelId}` by default), so repeated calls continue the same
 * conversation — exactly like a returning Facebook customer.
 *
 * The Facebook `sendMessage` call is replaced by an SSE `message_sent` event,
 * so no real message is delivered to Meta. The message IS persisted to the DB,
 * so the conversation appears in the dashboard inbox normally.
 *
 * SSE event stream:
 *   conversation_ready  { conversationId, testUserId }
 *   agent_start         { conversationId, business, historyLen }
 *   runner_start        { conversationId }
 *   tool_call           { name, args }
 *   tool_result         { name, result }
 *   message_sent        { text, fallback? }
 *   reply               { text }
 *   runner_done         { conversationId }
 *   runner_error        { conversationId, error }
 *   done                { conversationId }   ← final event, stream closes after this
 *   error               { message }           ← replaces done when setup fails
 */
testRunRouter.post('/test-run', async (c) => {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const internalKey = c.req.header('x-internal-key');
  if (internalKey !== process.env.INTERNAL_KEY) {
    return c.text('Unauthorized', 401);
  }

  // ── Parse & validate body ─────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.text('Malformed JSON', 400);
  }

  const parsed = testRunInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid payload', issues: parsed.error.issues }, 400);
  }

  const { channelId, businessId, userMessage, testUserId: rawTestUserId } = parsed.data;
  const testUserId = rawTestUserId ?? `test-user-${channelId}`;

  console.log(`[test-run] request — channelId=${channelId} businessId=${businessId} testUserId=${testUserId}`);
  console.log(`[test-run] userMessage="${userMessage}"`);

  // ── Open SSE stream ───────────────────────────────────────────────────────
  return streamSSE(c, async (stream) => {
    /** Write one SSE event to the stream. */
    const emitSse: SseEmitter = (event, data) => {
      console.log(`[test-run][sse] ${event}`, data);
      // streamSSE.writeSSE is async but we intentionally do not await it inside
      // the synchronous emitSse callback to keep the agent loop non-blocking.
      // Any write errors are surfaced by the SSE framework.
      stream.writeSSE({ event, data: JSON.stringify(data) }).catch((err) =>
        console.error('[test-run][sse] write error:', err),
      );
    };

    try {
      // ── Load channel ───────────────────────────────────────────────────────
      const { getChannelById } = await import('@repo/db/crud/channel');
      const channel = await getChannelById(channelId);

      if (!channel) {
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: `Channel ${channelId} not found` }) });
        return;
      }
      if (channel.businessId !== businessId) {
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: 'Channel does not belong to the given businessId' }) });
        return;
      }
      if (!channel.agentId) {
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: 'Channel has no agent assigned — connect an agent in the dashboard first' }) });
        return;
      }

      // ── Get or create conversation for the test user ───────────────────────
      const { processInboundMessage } = await import('@repo/db/crud/conversation');
      const { conversationId, inserted } = await processInboundMessage(
        { id: channelId, businessId },
        testUserId,
        userMessage,
        // No externalId — test messages are never deduplicated on message id
        undefined,
      );

      console.log(`[test-run] conversation ready — conversationId=${conversationId} inserted=${inserted}`);

      await stream.writeSSE({
        event: 'conversation_ready',
        data: JSON.stringify({ conversationId, testUserId, isNewMessage: inserted }),
      });

      // ── Build the sendMessageOverride ──────────────────────────────────────
      // Instead of calling the real Facebook Send API, emit an SSE event.
      // The message is still persisted to the DB by the send_message tool.
      const sendMessageOverride = async (_pageToken: string, _psid: string, text: string) => {
        console.log(`[test-run] message_sent (override) — text="${text}"`);
        emitSse('message_sent', { text });
      };

      // ── Run the agent ──────────────────────────────────────────────────────
      await runAgentCore(conversationId, { emitSse, sendMessageOverride });

      // ── Final event ────────────────────────────────────────────────────────
      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({ conversationId }),
      });

      console.log(`[test-run] done — conversationId=${conversationId}`);
    } catch (err) {
      console.error('[test-run] unexpected error:', err);
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ message: String(err) }),
      });
    }
  });
});
