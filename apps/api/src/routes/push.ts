import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { authMiddleware } from '@api/middleware/auth';
import { businessAccessMiddleware } from '@api/middleware/business';
import { sendPushToBusiness } from '@api/lib/push';
import { emit } from '@api/lib/log';
import { registerPushToken, unregisterPushToken, unregisterTokenFromAll } from '@repo/db/crud/push';

export const pushRouter = new OpenAPIHono();

/**
 * Logout cleanup must work after the Firebase bearer expires. This lives in its
 * own router so it can be mounted before every `/:businessId/*` router — those
 * wildcards match even single-segment paths and would otherwise answer 401
 * before this public route is reached.
 */
export const publicPushRouter = new OpenAPIHono();
publicPushRouter.post('/push-unsubscribe', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { token?: unknown };
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (token.length < 20 || token.length > 500) {
    return c.json({ error: 'A device token is required' }, 400);
  }
  await unregisterTokenFromAll(token);
  return c.json({ unsubscribed: true }, 200);
});

const mobileLogsRoute = createRoute({
  method: 'post',
  path: '/mobile/logs',
  tags: ['Mobile'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            events: z.array(z.record(z.unknown())),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ ok: z.boolean(), count: z.number() }) } },
      description: 'Mobile log events accepted and routed to log sink',
    },
  },
});

publicPushRouter.openapi(mobileLogsRoute, async (c) => {
  const { events } = c.req.valid('json');
  for (const ev of events) {
    const isError = ev.level === 'error' || ev.level === 'critical' || !!ev.error;
    emit(isError ? 'error' : 'bg', {
      task: 'mobile',
      ok: !isError,
      name: String(ev.tag ?? ev.evt ?? 'mobile'),
      message: String(ev.message ?? 'mobile log'),
      stack: ev.stack ? String(ev.stack) : undefined,
    });
  }
  return c.json({ ok: true, count: events.length }, 200);
});

const globalUnsubscribeRoute = createRoute({
  method: 'post',
  path: '/push/unsubscribe',
  tags: ['Notifications'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            token: z.string().min(20).max(500),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ unsubscribed: z.boolean() }) } },
      description: 'Device token removed from all businesses',
    },
  },
});

pushRouter.use('/push/unsubscribe', authMiddleware);
pushRouter.openapi(globalUnsubscribeRoute, async (c) => {
  const { token } = c.req.valid('json');
  await unregisterTokenFromAll(token.trim());
  return c.json({ unsubscribed: true }, 200);
});

pushRouter.use('/:businessId/*', authMiddleware, businessAccessMiddleware);

const subscribeRoute = createRoute({
  method: 'post',
  path: '/{businessId}/push/subscribe',
  tags: ['Notifications'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            /** The FCM registration token this browser obtained from the Web SDK. */
            token: z.string().min(20).max(500),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ subscribed: z.boolean() }) } },
      description: 'This browser now receives the business’s push notices',
    },
  },
});

pushRouter.openapi(subscribeRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const { token } = c.req.valid('json');
  await registerPushToken(businessId, token.trim());
  return c.json({ subscribed: true }, 200);
});

const unsubscribeRoute = createRoute({
  method: 'post',
  path: '/{businessId}/push/unsubscribe',
  tags: ['Notifications'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            token: z.string().min(20).max(500),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ unsubscribed: z.boolean() }) } },
      description: 'This device/browser no longer receives the business’s push notices',
    },
  },
});

pushRouter.openapi(unsubscribeRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const { token } = c.req.valid('json');
  await unregisterPushToken(businessId, token.trim());
  return c.json({ unsubscribed: true }, 200);
});

const testPushRoute = createRoute({
  method: 'post',
  path: '/{businessId}/push/test',
  tags: ['Notifications'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ businessId: z.string().uuid() }) },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            tokens: z.number().int(),
            sent: z.number().int(),
            failed: z.number().int(),
            removed: z.number().int(),
            skipped: z.enum(['no-tokens', 'not-configured']).optional(),
            firstError: z.string().optional(),
          }),
        },
      },
      description: 'What the test push did, so a silent failure can be explained',
    },
  },
});

/** A push the merchant asked for from the notifications page — same sender, immediate answer. */
pushRouter.openapi(testPushRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const result = await sendPushToBusiness({
    businessId,
    title: 'Test notification',
    body: 'Push notifications are working — this is a test from Oryxa.',
    link: `/b/${businessId}/notifications`,
  });
  return c.json(result, 200);
});
