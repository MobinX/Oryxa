import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { authMiddleware } from '@api/middleware/auth';
import { businessAccessMiddleware } from '@api/middleware/business';
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
