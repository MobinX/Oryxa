import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  syncUserInputSchema,
  selectUserSchema,
  userMeOutputSchema,
  updateUserInputSchema,
  deleteUserOutputSchema,
} from '@repo/shared';
import { syncUser, getUserById, updateUser, deleteUser } from '@repo/db/crud/user';
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

const updateUserRoute = createRoute({
  method: 'patch',
  path: '/me',
  tags: ['Users'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: updateUserInputSchema } } } },
  responses: {
    200: { content: { 'application/json': { schema: selectUserSchema } }, description: 'Updated' },
  },
});

usersRouter.openapi(updateUserRoute, async (c) => {
  const user = c.get('user');
  const data = c.req.valid('json');
  const updated = await updateUser(user.id, data);
  return c.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
  });
});

const deleteUserRoute = createRoute({
  method: 'delete',
  path: '/me',
  tags: ['Users'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: { content: { 'application/json': { schema: deleteUserOutputSchema } }, description: 'Deleted' },
  },
});

usersRouter.openapi(deleteUserRoute, async (c) => {
  const user = c.get('user');
  const result = await deleteUser(user.id);
  if (!result) return c.json({ error: 'User not found' }, 404);
  return c.json(result);
});

const getUserRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Users'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { content: { 'application/json': { schema: selectUserSchema } }, description: 'User' },
    404: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Not found' },
  },
});

usersRouter.use('/:id', authMiddleware);
usersRouter.openapi(getUserRoute, async (c) => {
  const id = c.req.param('id');
  const user = await getUserById(id);
  if (!user) return c.json({ error: 'User not found' }, 404);
  return c.json({
    ...user,
    createdAt: user.createdAt.toISOString(),
  });
});
