import { OpenAPIHono } from '@hono/zod-openapi';
import { authMiddleware } from '@api/middleware/auth';
import { businessAccessMiddleware } from '@api/middleware/business';
import {
  ensureMessengerNotification,
  getMessengerNotificationOverview,
} from '@repo/db/crud/messenger-notification';

export const messengerNotificationsRouter = new OpenAPIHono();

messengerNotificationsRouter.use('/:businessId/*', authMiddleware, businessAccessMiddleware);

/**
 * The merchant's Messenger notification portal. The code is created only when the merchant asks
 * for it; until it is sent to the operator's page as a DM, nobody is subscribed to this business.
 */
messengerNotificationsRouter.get('/:businessId/messenger-notifications', async (c) => {
  const businessId = c.req.param('businessId');
  const overview = await getMessengerNotificationOverview(businessId);
  return c.json({
    code: overview.code,
    users: overview.users.map((user) => ({
      id: user.id,
      name: user.name,
      connectedAt: user.createdAt.toISOString(),
    })),
  });
});

messengerNotificationsRouter.post('/:businessId/messenger-notifications', async (c) => {
  const businessId = c.req.param('businessId');
  const code = await ensureMessengerNotification(businessId);
  return c.json({ code });
});
