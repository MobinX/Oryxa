import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { testRunInputSchema, commentTestRunInputSchema } from '@repo/shared';
import { runAgentCore } from '@api/lib/agent-runner-core';
import { runCommentTest } from '@api/lib/comment-test-runner';
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
 *   trace               { messages }        ← the whole turn at once, after it ends
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

  const { channelId, businessId, userMessage, imageKeys, testUserId: rawTestUserId } = parsed.data;
  const testUserId = rawTestUserId ?? `test-user-${channelId}`;
  const photos = imageKeys ?? [];

  if (!userMessage.trim() && photos.length === 0) {
    return c.json({ error: 'Send some words, a picture, or both' }, 400);
  }

  console.log(`[test-run] request — channelId=${channelId} businessId=${businessId} testUserId=${testUserId} photos=${photos.length}`);
  console.log(`[test-run] userMessage="${userMessage}"`);

  // ── Open SSE stream ───────────────────────────────────────────────────────
  return streamSSE(c, async (stream) => {
    /** Write one SSE event to the stream. */
    let finalMetrics: unknown = null;
    const emitSse: SseEmitter = (event, data) => {
      console.log(`[test-run][sse] ${event}`, data);
      if (data && typeof data === 'object' && 'metrics' in data && (data as any).metrics) {
        finalMetrics = (data as any).metrics;
      }
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
      // The pictures went straight to storage from the browser, so prove they are this store's
      // own keys before the agent is handed them — the same rule the signed-read route applies.
      const { assertB2KeyForBusiness } = await import('@repo/integrations');
      for (const key of photos) assertB2KeyForBusiness(key, businessId);

      const { processInboundMessage } = await import('@repo/db/crud/conversation');
      const { conversationId, inserted } = await processInboundMessage(
        { id: channelId, businessId },
        testUserId,
        userMessage,
        // No externalId — test messages are never deduplicated on message id
        undefined,
        photos,
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
      const run = await runAgentCore(conversationId, { emitSse, sendMessageOverride });

      // The turn is over, so the whole transcript goes out in one event: every message the model
      // saw or wrote, and the usage each model call charged. The events above told the story as it
      // happened; this is the record a person reads afterwards, and it rides last so it can never
      // interleave with them. Absent on a failed run — the error event already said that.
      await stream.writeSSE({
        event: 'trace',
        data: JSON.stringify({ messages: run?.messages ?? [] }),
      });

      // ── Final event ────────────────────────────────────────────────────────
      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({ conversationId, metrics: finalMetrics }),
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

/**
 * POST /internal/test-comment-run
 *
 * The comment agent's own playground: a made-up public comment, optional earlier lines on
 * that thread, and the store's current system prompt — streamed back so an operator can see
 * which of the two doors the agent chose.
 *
 * `reply_comment` and `send_private_message` are both overridden, so nothing is posted to a
 * real Page and no inbox is opened. The events that replace them are the point of the run:
 *
 *   thread_ready      { commentThreadId, postId, commenterPlatformId }
 *   agent_start       { commentThreadId, historyLen }
 *   tool_call         { name, args }
 *   tool_result       { name, result }
 *   comment_replied   { text }           ← what would be public under the comment
 *   private_message_sent { text }        ← what would land in the commenter's Messenger
 *   no_reply          { text, silent }   ← the agent delivered nothing
 *   reply             { text }           ← the model's final text, whatever it was
 *   done            { commentThreadId }
 */
testRunRouter.post('/test-comment-run', async (c) => {
  const internalKey = c.req.header('x-internal-key');
  if (internalKey !== process.env.INTERNAL_KEY) {
    return c.text('Unauthorized', 401);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.text('Malformed JSON', 400);
  }

  const parsed = commentTestRunInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid payload', issues: parsed.error.issues }, 400);
  }

  const { channelId, businessId, comment, history, commenterName, postId } = parsed.data;
  // Namespaced by channel, so two stores testing at once never share a thread.
  const commenterPlatformId = parsed.data.commenterPlatformId ?? `test-commenter-${channelId}`;

  console.log(`[test-comment] request — channelId=${channelId} postId=${postId} commenter=${commenterPlatformId}`);
  console.log(`[test-comment] comment="${comment}" historyRows=${history?.length ?? 0}`);

  return streamSSE(c, async (stream) => {
    let finalMetrics: unknown = null;
    const emitSse: SseEmitter = (event, data) => {
      console.log(`[test-comment][sse] ${event}`, data);
      if (data && typeof data === 'object' && 'metrics' in data && (data as any).metrics) {
        finalMetrics = (data as any).metrics;
      }
      stream.writeSSE({ event, data: JSON.stringify(data) }).catch((err) =>
        console.error('[test-comment][sse] write error:', err),
      );
    };

    const write = (event: string, data: unknown) =>
      stream.writeSSE({ event, data: JSON.stringify(data) });

    try {
      const { getChannelById } = await import('@repo/db/crud/channel');
      const channel = await getChannelById(channelId);

      if (!channel) {
        await write('error', { message: `Channel ${channelId} not found` });
        return;
      }
      if (channel.businessId !== businessId) {
        await write('error', { message: 'Channel does not belong to the given businessId' });
        return;
      }

      await runCommentTest(
        {
          businessId,
          channelId,
          comment,
          history,
          commenterName,
          commenterPlatformId,
          postId: postId ?? 'TEST_POST',
        },
        emitSse,
      );

      await write('done', { commenterPlatformId, metrics: finalMetrics });
    } catch (err) {
      console.error('[test-comment] unexpected error:', err);
      await write('error', { message: String(err) });
    }
  });
});
