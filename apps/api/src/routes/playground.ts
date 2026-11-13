import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { streamSSE } from 'hono/streaming';
import { authMiddleware } from '@api/middleware/auth';
import { businessAccessMiddleware } from '@api/middleware/business';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { runAgentCore } from '@api/lib/agent-runner-core';
import { runCommentTest } from '@api/lib/comment-test-runner';
import type { SseEmitter } from '@repo/agent';
import { getChannelById } from '@repo/db/crud/channel';
import { processInboundMessage } from '@repo/db/crud/conversation';
import { assertB2KeyForBusiness } from '@repo/integrations';
import { testRunInputSchema, commentTestRunInputSchema } from '@repo/shared';

export const playgroundRouter = new OpenAPIHono();
playgroundRouter.use('/:businessId/*', authMiddleware, businessAccessMiddleware);

function getLlm() {
  const provider = process.env.OPENAI_API_KEY || process.env.AZURE_API_KEY ? 'openai' : 'gemini';
  if (provider === 'openai') {
    return new ChatOpenAI({
      model: process.env.OPENAI_MODEL || 'gpt-6-luna',
      apiKey: process.env.AZURE_API_KEY || process.env.OPENAI_API_KEY,
      configuration: { baseURL: process.env.OPENAI_BASE_URL || 'https://oryxa.openai.azure.com/openai/v1' },
    });
  }
  return new ChatGoogleGenerativeAI({
    model: 'gemini-flash-lite-latest',
    apiKey: process.env.GEMINI_API_KEY || 'fake-key',
    temperature: 0.7,
  });
}

const chatRoute = createRoute({
  method: 'post',
  path: '/{businessId}/playground/chat',
  tags: ['Playground'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: z.object({ message: z.string().min(1), persona: z.string().optional() }) } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ reply: z.string() }) } }, description: 'Reply' },
  },
});

playgroundRouter.openapi(chatRoute, async (c) => {
  const { businessId } = c.req.param();
  const { message, persona } = c.req.valid('json');
  const llm = getLlm();
  const res = await llm.invoke([
    { role: 'system', content: `You are an OnlyOrders AI sales agent for business ${businessId}. Customer persona: ${persona ?? 'Oliver Queen'}. Reply helpfully and concisely.` },
    { role: 'user', content: message },
  ]);
  const reply = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
  return c.json({ reply }, 200);
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
      stream.writeSSE({ event, data: JSON.stringify(data) }).catch((err) =>
        console.error('[playground-test-run][sse] write error:', err),
      );
    };

    try {
      const channel = await getChannelById(channelId);
      if (!channel) {
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: `Channel ${channelId} not found` }) });
        return;
      }
      if (channel.businessId !== businessId) {
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: 'Channel does not belong to this business' }) });
        return;
      }
      if (!channel.agentId) {
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: 'Channel has no agent assigned — connect an agent first' }) });
        return;
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
        emitSse('message_sent', { text });
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
      const channel = await getChannelById(channelId);
      if (!channel) {
        await write('error', { message: `Channel ${channelId} not found` });
        return;
      }
      if (channel.businessId !== businessId) {
        await write('error', { message: 'Channel does not belong to this business' });
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
      console.error('[playground-comment-run] error:', err);
      await write('error', { message: String(err) });
    }
  });
});
