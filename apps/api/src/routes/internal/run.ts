import { Hono } from 'hono';
import { internalRunInputSchema } from '@repo/shared';
import { runAgentForConversation } from '../../lib/agent-runner';

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

  const { conversationId } = parsed.data;

  const executionCtx = (c.env as { executionCtx?: { waitUntil: (p: Promise<unknown>) => void } })?.executionCtx
    ?? (c as unknown as { executionCtx?: { waitUntil: (p: Promise<unknown>) => void } }).executionCtx;

  const runPromise = runAgentForConversation(conversationId);

  if (executionCtx?.waitUntil) {
    executionCtx.waitUntil(runPromise);
    return c.text('accepted', 202);
  }

  // Local dev: fire and forget without blocking response
  runPromise.catch((err) => console.error('Agent run error:', err));
  return c.text('accepted', 202);
});
