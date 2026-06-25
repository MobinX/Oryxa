import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { syncUserInputSchema, selectUserSchema, userMeOutputSchema } from '@repo/shared';
import { syncUser } from '@repo/db/crud/user';
import { authMiddleware } from '@api/middleware/auth';

export const usersRouter = new OpenAPIHono();

const syncRoute = createRoute({
  method: 'post',
  path: '/sync',
  tags: ['Users'],
  request: {
    body: { content: { 'application/json': { schema: syncUserInputSchema } } },
  },
  responses: {
    201: { content: { 'application/json': { schema: selectUserSchema } }, description: 'User synced' },
  },
});

usersRouter.openapi(syncRoute, async (c) => {
  const data = c.req.valid('json');
  const user = await syncUser(data);
  return c.json(
    {
      ...user,
      createdAt: user.createdAt.toISOString(),
    },
    201,
  );
});

const meRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['Users'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: { content: { 'application/json': { schema: userMeOutputSchema } }, description: 'Current user' },
    401: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Unauthorized' },
  },
});

usersRouter.use('/me', authMiddleware);
usersRouter.openapi(meRoute, async (c) => {
  const user = c.get('user');
  return c.json({
    id: user.id,
    name: user.name,
    email: user.email ?? null,
    phone: null,
  });
});
