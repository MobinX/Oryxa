import { Hono } from 'hono';
import { internalRunInputSchema, internalRunCommentInputSchema } from '@repo/shared';
import { runAgentForConversation } from '@api/lib/agent-runner';
import { runAgentForCommentThread } from '@api/lib/comment-runner';
import { awaitOnVercel } from '@api/lib/background';
import { testRunRouter } from '@api/routes/internal/test-run';

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

  // On Vercel the run is finished before this responds. Answering first and
  // working afterwards hands the platform the choice of when to stop: the
  // invocation is frozen once its response is flushed, which left conversations
  // claimed as `working` with a half-finished reply and no runner alive.
  // Elsewhere the 202 stays immediate — run after the response on edge via
  // waitUntil, fire-and-forget on Node, drained by flushBackground in tests.
  await awaitOnVercel(c, runAgentForConversation(parsed.data.conversationId), 'agent-run');
  return c.text('accepted', 202);
});

internalRouter.post('/run-comment', async (c) => {
  const internalKey = c.req.header('x-internal-key');
  if (internalKey !== process.env.INTERNAL_KEY) {
    return c.text('Unauthorized', 401);
  }

  const body = await c.req.json();
  const parsed = internalRunCommentInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.text('Invalid payload', 400);
  }

  // Same rule as /run: the comment agent gets the request's own lifetime rather
  // than whatever the platform allows after the response.
  await awaitOnVercel(c, runAgentForCommentThread(parsed.data.commentThreadId), 'comment-run');
  return c.text('accepted', 202);
});

// Mount SSE test endpoint — same auth, different response mode
internalRouter.route('/', testRunRouter);
