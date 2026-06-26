import { Hono } from 'hono';
import { internalRunInputSchema } from '@repo/shared';
import { runAgentForConversation } from '@api/lib/agent-runner';
import { runInBackground } from '@api/lib/background';

export const internalRouter = new Hono();

internalRouter.post('/run', async (c) => {
  const internalKey = c.req.header('x-internal-key');
  if (internalKey !== process.env.INTERNAL_KEY) {
    return c.text('Unauthorized', 401);
  }

  const body = await c.req.json();
  const parsed = internalRunInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.text('Invalid payload', 400);
  }

  // Run after the response is sent; on edge kept alive via waitUntil, on Node
  // fire-and-forget, in tests drained via flushBackground.
  runInBackground(c, runAgentForConversation(parsed.data.conversationId));
  return c.text('accepted', 202);
});
