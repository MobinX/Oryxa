import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { streamSSE } from 'hono/streaming';
import { authMiddleware } from '@api/middleware/auth';
import { businessAccessMiddleware } from '@api/middleware/business';
import { runAgentCore } from '@api/lib/agent-runner-core';
import { runCommentTest } from '@api/lib/comment-test-runner';
import type { SseEmitter } from '@repo/agent';
import { getChannelById, listChannels, createChannel, updateChannel } from '@repo/db/crud/channel';
import { ensureDefaultAgent } from '@repo/db/crud/default-agent';
import { processInboundMessage } from '@repo/db/crud/conversation';
import { assertB2KeyForBusiness } from '@repo/integrations';
import { testRunInputSchema, commentTestRunInputSchema } from '@repo/shared';

export const playgroundRouter = new OpenAPIHono();
playgroundRouter.use('/:businessId/*', authMiddleware, businessAccessMiddleware);

/**
 * Resolves or seeds the merchant's sandbox channel (mock-channel-${businessId})
 * and ensures an active agent is attached.
 */
async function resolveOrCreateSandboxChannel(businessId: string, channelId?: string) {
  let channel = channelId ? await getChannelById(channelId) : null;
  if (!channel || channel.businessId !== businessId) {
    const pageId = `mock-channel-${businessId}`;
    const channels = await listChannels(businessId);
    channel = channels.find((ch) => ch.platformChannelId === pageId) || null;

    if (!channel) {
      const defaultAgent = await ensureDefaultAgent(businessId);
      channel = await createChannel(businessId, {
        platform: 'facebook',
        apiToken: 'mock-test-token',
        platformChannelId: pageId,
        agentId: defaultAgent.id,
        extraInfo: JSON.stringify({ pageName: 'Sandbox Testing Page' }),
      });
    }
  }

  if (channel && !channel.agentId) {
    const defaultAgent = await ensureDefaultAgent(businessId);
    const updated = await updateChannel(businessId, channel.id, { agentId: defaultAgent.id });
    if (updated) channel = updated;
  }

  return channel;
}

const chatRoute = createRoute({
  method: 'post',
  path: '/{businessId}/playground/chat',
  tags: ['Playground'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            message: z.string().min(1),
            persona: z.string().optional(),
            channelId: z.string().uuid().optional(),
            imageKeys: z.array(z.string()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            reply: z.string(),
            toolCalls: z.array(z.object({ name: z.string(), args: z.any().optional(), result: z.any().optional() })).optional(),
            conversationId: z.string().optional(),
            channelId: z.string().optional(),
          }),
        },
      },
      description: 'Reply with tool execution details',
    },
    500: {
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      description: 'Server error',
    },
  },
});

/**
 * POST /:businessId/playground/chat
 * Full merchant agent endpoint with tool execution (categories, catalog search, order creation).
 */
playgroundRouter.openapi(chatRoute, async (c) => {
  const { businessId } = c.req.param();
  const { message, persona, channelId: requestedChannelId, imageKeys } = c.req.valid('json');
  const photos = imageKeys ?? [];

  for (const key of photos) assertB2KeyForBusiness(key, businessId);

  const channel = await resolveOrCreateSandboxChannel(businessId, requestedChannelId);
  if (!channel) {
    return c.json({ error: 'Could not provision sandbox channel for this store.' }, 500);
  }

  const testUserId = persona
    ? `test-user-${persona.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
    : `test-user-${channel.id}`;

  const { conversationId } = await processInboundMessage(
    { id: channel.id, businessId },
    testUserId,
    message,
    undefined,
    photos,
  );

  const toolCalls: Array<{ name: string; args: any; result?: any }> = [];
  let replyText = '';

  const emitSse: SseEmitter = (event, data) => {
    if (event === 'tool_call' && data) {
      toolCalls.push({ name: (data as any).name, args: (data as any).args });
    } else if (event === 'tool_result' && data) {
      const last = toolCalls[toolCalls.length - 1];
      if (last && last.name === (data as any).name) {
        last.result = (data as any).result;
      }
    } else if ((event === 'message_sent' || event === 'reply') && data && (data as any).text) {
      const text = String((data as any).text).trim();
      if (text.toUpperCase() !== 'SILENT') {
        replyText = text;
      }
    }
  };

  const sendMessageOverride = async (_pageToken: string, _psid: string, text: string) => {
    const trimmed = text.trim();
    if (trimmed.toUpperCase() !== 'SILENT') {
      replyText = trimmed;
    }
  };

  try {
    const run = await runAgentCore(conversationId, { emitSse, sendMessageOverride });

    if (!replyText && run?.messages?.length) {
      const aiMsgs = run.messages.filter((m: any) => m.role === 'ai' || m._getType?.() === 'ai');
      const lastAi = aiMsgs[aiMsgs.length - 1];
      if (lastAi) {
        const candidate = (typeof lastAi.content === 'string' ? lastAi.content : JSON.stringify(lastAi.content)).trim();
        if (candidate.toUpperCase() !== 'SILENT') {
          replyText = candidate;
        }
      }
    }

    if (!replyText) {
      const { listMessages } = await import('@repo/db/crud/conversation');
      const msgs = await listMessages(conversationId, 5);
      const selfMsgs = msgs.filter((m) => m.from === 'self' && m.content.trim().toUpperCase() !== 'SILENT');
      if (selfMsgs.length > 0) {
        replyText = selfMsgs[selfMsgs.length - 1].content;
      }
    }

    return c.json({
      reply: replyText || 'I have processed your request.',
      toolCalls,
      conversationId,
      channelId: channel.id,
    }, 200);
  } catch (err) {
    console.error('[playground-chat] agent execution error:', err);
    return c.json({
      reply: `Error running agent: ${err instanceof Error ? err.message : String(err)}`,
      toolCalls,
      conversationId,
      channelId: channel.id,
    }, 200);
  }
});

/**
 * POST /:businessId/playground/test-run
 * Real-time SSE streaming agent runner for playground.
 */
playgroundRouter.post('/:businessId/playground/test-run', async (c) => {
  const businessId = c.req.param('businessId');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.text('Malformed JSON', 400);
  }

  const parsed = testRunInputSchema.safeParse({ ...(body as object), businessId });
  if (!parsed.success) {
    return c.json({ error: 'Invalid payload', issues: parsed.error.issues }, 400);
  }

  const { channelId, userMessage, imageKeys, testUserId: rawTestUserId } = parsed.data;
  const testUserId = rawTestUserId ?? `test-user-${channelId}`;
  const photos = imageKeys ?? [];

  if (!userMessage.trim() && photos.length === 0) {
    return c.json({ error: 'Send some words, a picture, or both' }, 400);
  }

  return streamSSE(c, async (stream) => {
    let finalMetrics: unknown = null;
    const emitSse: SseEmitter = (event, data) => {
      if (data && typeof data === 'object' && 'metrics' in data && (data as any).metrics) {
        finalMetrics = (data as any).metrics;
      }
      if ((event === 'reply' || event === 'message_sent') && (data as any)?.text?.toString().trim().toUpperCase() === 'SILENT') {
        return;
      }
      stream.writeSSE({ event, data: JSON.stringify(data) }).catch((err) =>
        console.error('[playground-test-run][sse] write error:', err),
      );
    };

    try {
      let channel = await getChannelById(channelId);
      if (!channel) {
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: `Channel ${channelId} not found` }) });
        return;
      }
      if (channel.businessId !== businessId) {
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: 'Channel does not belong to this business' }) });
        return;
      }
      if (!channel.agentId) {
        const defaultAgent = await ensureDefaultAgent(businessId);
        const updated = await updateChannel(businessId, channel.id, { agentId: defaultAgent.id });
        if (updated) channel = updated;
      }

      for (const key of photos) assertB2KeyForBusiness(key, businessId);

      const { conversationId, inserted } = await processInboundMessage(
        { id: channelId, businessId },
        testUserId,
        userMessage,
        undefined,
        photos,
      );

      await stream.writeSSE({
        event: 'conversation_ready',
        data: JSON.stringify({ conversationId, testUserId, isNewMessage: inserted }),
      });

      const sendMessageOverride = async (_pageToken: string, _psid: string, text: string) => {
        if (text.trim().toUpperCase() !== 'SILENT') {
          emitSse('message_sent', { text });
        }
      };

      const run = await runAgentCore(conversationId, { emitSse, sendMessageOverride });

      await stream.writeSSE({
        event: 'trace',
        data: JSON.stringify({ messages: run?.messages ?? [] }),
      });

      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({ conversationId, metrics: finalMetrics }),
      });
    } catch (err) {
      console.error('[playground-test-run] error:', err);
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ message: String(err) }),
      });
    }
  });
});

/**
 * POST /:businessId/playground/comment-test-run
 * Real-time SSE streaming comment agent runner for playground.
 */
playgroundRouter.post('/:businessId/playground/comment-test-run', async (c) => {
  const businessId = c.req.param('businessId');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.text('Malformed JSON', 400);
  }

  const parsed = commentTestRunInputSchema.safeParse({ ...(body as object), businessId });
  if (!parsed.success) {
    return c.json({ error: 'Invalid payload', issues: parsed.error.issues }, 400);
  }

  const { channelId, comment, history, commenterName, postId } = parsed.data;
  const commenterPlatformId = parsed.data.commenterPlatformId ?? `test-commenter-${channelId}`;

  return streamSSE(c, async (stream) => {
    let finalMetrics: unknown = null;
    const emitSse: SseEmitter = (event, data) => {
      if (data && typeof data === 'object' && 'metrics' in data && (data as any).metrics) {
        finalMetrics = (data as any).metrics;
      }
      stream.writeSSE({ event, data: JSON.stringify(data) }).catch((err) =>
        console.error('[playground-comment-run][sse] write error:', err),
      );
    };

    const write = (event: string, data: unknown) =>
      stream.writeSSE({ event, data: JSON.stringify(data) });

    try {
      let channel = await getChannelById(channelId);
      if (!channel) {
        await write('error', { message: `Channel ${channelId} not found` });
        return;
      }
      if (channel.businessId !== businessId) {
        await write('error', { message: 'Channel does not belong to this business' });
        return;
      }
      if (!channel.agentId) {
        const defaultAgent = await ensureDefaultAgent(businessId);
        const updated = await updateChannel(businessId, channel.id, { agentId: defaultAgent.id });
        if (updated) channel = updated;
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
      console.error('[playground-comment-run] error:', err);
      await write('error', { message: String(err) });
    }
  });
});
