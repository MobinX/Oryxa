import { Hono } from 'hono';
import { internalRunInputSchema } from '@repo/shared';
import { runAgentForConversation } from '@api/lib/agent-runner';

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
  const runPromise = runAgentForConversation(conversationId);

  let waitUntil: ((p: Promise<unknown>) => void) | undefined;
  try {
    waitUntil = c.executionCtx?.waitUntil?.bind(c.executionCtx);
  } catch {
    // No ExecutionContext outside Vercel Edge — fall through to fire-and-forget
  }

  if (waitUntil) {
    waitUntil(runPromise);
    return c.text('accepted', 202);
  }

  runPromise.catch((err) => console.error('Agent run error:', err));
  return c.text('accepted', 202);
});
