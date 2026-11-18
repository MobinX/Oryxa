import { asc, and, eq, isNull } from 'drizzle-orm';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  assistantChatInputSchema,
  assistantQuotaResponseSchema,
  chatReplySchema,
  errorSchema,
  publicChatInputSchema,
  publicChatReplySchema,
} from '@repo/shared';
import { db } from '@repo/db/client';
import { plans } from '@repo/db/schema';
import {
  getAssistantQuotaStatus,
  hashIp,
  publicChatDay,
  refundAssistantMessage,
  spendAssistantMessage,
  spendPublicChatMessage,
} from '@repo/db/crud/assistant';
import { recordTokenUsage } from '@repo/db/crud/token-analytics';
import { authMiddleware } from '@api/middleware/auth';
import { businessAccessMiddleware } from '@api/middleware/business';
import {
  buildAssistantSystemPrompt,
  buildPublicSystemPrompt,
  chatConfigured,
  getPublicCachedReply,
  runChatTurn,
  setPublicCachedReply,
  type PlanFacts,
} from '@api/lib/chat';

/**
 * Site assistant, two doors. Public visitors are capped per IP per UTC day in
 * `public_chat_usage` (one conditional upsert, so every serverless instance
 * shares the cap); merchants spend their plan's 30-day assistant budget in
 * `assistant_usage`. History is client-kept and re-validated on every turn,
 * so the API stores no chat text at all.
 */
export const chatRouter = new OpenAPIHono();

const DEFAULT_PUBLIC_DAILY_LIMIT = 10;

function publicDailyLimit(): number {
  const raw = Number(process.env.CHAT_PUBLIC_DAILY_LIMIT || DEFAULT_PUBLIC_DAILY_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_PUBLIC_DAILY_LIMIT;
}

function clientIp(c: { req: { header(name: string): string | undefined } }): string {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-real-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function tomorrowUtc(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

async function planFacts(): Promise<PlanFacts[]> {
  const rows = await db
    .select({
      name: plans.name,
      priceCents: plans.priceCents,
      messageLimit: plans.messageLimit,
      assistantLimit: plans.assistantLimit,
    })
    .from(plans)
    .where(and(eq(plans.active, true), isNull(plans.deletedAt)))
    .orderBy(asc(plans.position), asc(plans.name));
  return rows;
}

const publicChatRoute = createRoute({
  method: 'post',
  path: '/chat/public',
  tags: ['Chat'],
  request: {
    body: { content: { 'application/json': { schema: publicChatInputSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: publicChatReplySchema } },
      description: 'Assistant reply with the visitor budget left today',
    },
    429: { content: { 'application/json': { schema: errorSchema } }, description: 'Daily IP cap reached' },
    502: { content: { 'application/json': { schema: errorSchema } }, description: 'Model call failed' },
    503: { content: { 'application/json': { schema: errorSchema } }, description: 'No model key configured' },
  },
});

chatRouter.openapi(publicChatRoute, async (c) => {
  if (!chatConfigured()) return c.json({ error: 'The assistant is not set up yet' }, 503);
  const body = c.req.valid('json');
  const limit = publicDailyLimit();
  const day = publicChatDay();
  // The salt keeps the stored hash useless outside this table; the raw IP is never logged.
  const salt = process.env.MESSAGES_ENCRYPTION_KEY || 'public-chat-fallback';
  let spend;
  try {
    spend = await spendPublicChatMessage(hashIp(clientIp(c), salt), day, limit);
  } catch (err) {
    // Missing tables, DB down — answer 502 with a retry message, never a bare 500.
    console.error('[chat-router] public spend failed:', err);
    return c.json({ error: 'The assistant is unavailable right now. Please try again.' }, 502);
  }
  if (!spend.spent) {
    return c.json(
      { error: 'You have used today’s free chats. Please come back tomorrow — or sign in for a bigger allowance.' },
      429,
    );
  }
  // Repeat standalone question: budget already spent above, but skip the model call.
  if (body.history.length === 0) {
    const cached = getPublicCachedReply(body.brand, body.lang, body.message);
    if (cached !== null) {
      return c.json(
        { reply: cached, remaining: Math.max(0, limit - spend.used), resetsAt: tomorrowUtc() },
        200,
      );
    }
  }
  try {
    const system = buildPublicSystemPrompt(body.brand, body.lang, await planFacts());
    const { text } = await runChatTurn(system, body.history, body.message);
    if (body.history.length === 0) setPublicCachedReply(body.brand, body.lang, body.message, text);
    return c.json(
      { reply: text, remaining: Math.max(0, limit - spend.used), resetsAt: tomorrowUtc() },
      200,
    );
  } catch (err) {
    console.error('[chat-router] public turn failed:', err);
    return c.json({ error: 'The assistant is unavailable right now. Please try again.' }, 502);
  }
});

// Merchant doors below: the bearer must own the business, like every other /:businessId route.
chatRouter.use('/:businessId/*', authMiddleware, businessAccessMiddleware);

const params = z.object({ businessId: z.string().uuid() });

const assistantChatRoute = createRoute({
  method: 'post',
  path: '/{businessId}/assistant/chat',
  tags: ['Chat'],
  security: [{ bearerAuth: [] }],
  request: {
    params,
    body: { content: { 'application/json': { schema: assistantChatInputSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: chatReplySchema } },
      description: 'Assistant reply with this cycle’s budget left',
    },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'No such business' },
    429: { content: { 'application/json': { schema: errorSchema } }, description: 'Plan budget for this cycle is used up' },
    502: { content: { 'application/json': { schema: errorSchema } }, description: 'Model call failed' },
    503: { content: { 'application/json': { schema: errorSchema } }, description: 'No model key configured' },
  },
});

chatRouter.openapi(assistantChatRoute, async (c) => {
  const businessId = c.req.param('businessId');
  let quota;
  try {
    quota = await getAssistantQuotaStatus(businessId);
  } catch (err) {
    console.error('[chat-router] assistant quota failed:', err);
    return c.json({ error: 'The assistant is unavailable right now. Please try again.' }, 502);
  }
  if (!quota) return c.json({ error: 'Business not found' }, 404);
  if (quota.blocked) {
    return c.json(
      { error: 'You have used this cycle’s assistant chats. They reset on ' + quota.cycle.resetsAt + ' — or move to a bigger plan in Billing.' },
      429,
    );
  }
  if (!chatConfigured()) return c.json({ error: 'The assistant is not set up yet' }, 503);
  const body = c.req.valid('json');
  let spend;
  try {
    spend = await spendAssistantMessage(businessId);
  } catch (err) {
    console.error('[chat-router] assistant spend failed:', err);
    return c.json({ error: 'The assistant is unavailable right now. Please try again.' }, 502);
  }
  if (!spend.spent) {
    return c.json(
      { error: 'You have used this cycle’s assistant chats. They reset on ' + quota.cycle.resetsAt + ' — or move to a bigger plan in Billing.' },
      429,
    );
  }
  try {
    const system = buildAssistantSystemPrompt(body.brand, body.lang, quota.planName);
    const { text, usage } = await runChatTurn(system, body.history, body.message);
    try {
      await recordTokenUsage({
        businessId,
        integrationType: 'assistant_chat',
        provider: usage.provider,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.inputTokens + usage.outputTokens,
        cacheHitTokens: 0,
        cacheMissTokens: usage.inputTokens,
        cacheHitPercent: 0,
        latencyMs: usage.latencyMs,
      });
    } catch (metricErr) {
      console.error('[chat-router] failed to record assistant token metrics:', metricErr);
    }
    const remaining = spend.limit === null || spend.used === null ? null : Math.max(0, spend.limit - spend.used);
    return c.json({ reply: text, remaining }, 200);
  } catch (err) {
    // A failed model call must not eat the merchant's budget.
    await refundAssistantMessage(businessId, spend.period);
    console.error('[chat-router] assistant turn failed:', err);
    return c.json({ error: 'The assistant is unavailable right now. Please try again.' }, 502);
  }
});

const assistantQuotaRoute = createRoute({
  method: 'get',
  path: '/{businessId}/assistant/quota',
  tags: ['Chat'],
  security: [{ bearerAuth: [] }],
  request: { params },
  responses: {
    200: {
      content: { 'application/json': { schema: assistantQuotaResponseSchema } },
      description: 'This business’s assistant budget for the current cycle',
    },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'No such business' },
  },
});

chatRouter.openapi(assistantQuotaRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const quota = await getAssistantQuotaStatus(businessId);
  if (!quota) return c.json({ error: 'Business not found' }, 404);
  return c.json({ businessId, quota }, 200);
});
