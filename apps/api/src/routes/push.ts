import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { authMiddleware } from '@api/middleware/auth';
import { businessAccessMiddleware } from '@api/middleware/business';
import { sendPushToBusiness } from '@api/lib/push';
import { registerPushToken } from '@repo/db/crud/push';

export const pushRouter = new OpenAPIHono();

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
            token: z.string().min(40).max(500),
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
