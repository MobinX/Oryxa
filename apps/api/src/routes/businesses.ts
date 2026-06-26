import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createBusinessInputSchema,
  selectBusinessSchema,
  updateBusinessInputSchema,
  updateBusinessOutputSchema,
  deleteBusinessOutputSchema,
} from '@repo/shared';
import {
  createBusiness,
  getBusinessById,
  listBusinessesByUserId,
  updateBusiness,
  deleteBusiness,
} from '@repo/db/crud/business';
import { getBusinessStats } from '@repo/db/crud/stats';
import { authMiddleware } from '@api/middleware/auth';
import { businessAccessMiddleware } from '@api/middleware/business';

export const businessesRouter = new OpenAPIHono();

businessesRouter.use('/*', authMiddleware);

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Businesses'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ businesses: z.array(selectBusinessSchema) }),
        },
      },
      description: 'Businesses for the authenticated user',
    },
  },
});

businessesRouter.openapi(listRoute, async (c) => {
  const user = c.get('user');
  const rows = await listBusinessesByUserId(user.id);
  return c.json({
    businesses: rows.map((b) => ({
      ...b,
      createdAt: b.createdAt.toISOString(),
      foundedDate: b.foundedDate?.toISOString() ?? null,
    })),
  });
});

const createRoute_ = createRoute({
  method: 'post',
  path: '/',
  tags: ['Businesses'],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: createBusinessInputSchema } } },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: selectBusinessSchema.pick({ id: true, userId: true, name: true }),
        },
      },
      description: 'Business created',
    },
  },
});

businessesRouter.openapi(createRoute_, async (c) => {
  const user = c.get('user');
  const data = c.req.valid('json');
  const business = await createBusiness(user.id, data);
  return c.json({ id: business.id, userId: business.userId, name: business.name }, 201);
});

businessesRouter.use('/:id', businessAccessMiddleware);

const statsRoute = createRoute({
  method: 'get',
  path: '/{id}/stats',
  tags: ['Businesses'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            products: z.number().int(),
            orders: z.number().int(),
            channels: z.number().int(),
            conversations: z.number().int(),
          }),
        },
      },
      description: 'Aggregate counts for dashboard',
    },
  },
});

businessesRouter.openapi(statsRoute, async (c) => {
  const id = c.req.param('id');
  const stats = await getBusinessStats(id);
  return c.json(stats);
});

const getRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Businesses'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { content: { 'application/json': { schema: selectBusinessSchema } }, description: 'Business' },
    404: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Not found' },
  },
});

businessesRouter.openapi(getRoute, async (c) => {
  const id = c.req.param('id');
  const business = await getBusinessById(id);
  if (!business) return c.json({ error: 'Not found' }, 404);
  return c.json({
    ...business,
    createdAt: business.createdAt.toISOString(),
    foundedDate: business.foundedDate?.toISOString() ?? null,
  });
});

const updateRoute = createRoute({
  method: 'put',
  path: '/{id}',
  tags: ['Businesses'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: updateBusinessInputSchema } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: updateBusinessOutputSchema } }, description: 'Updated' },
  },
});

businessesRouter.openapi(updateRoute, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const result = await updateBusiness(id, user.id, data);
  if (!result) return c.json({ error: 'Not found' }, 404);
  return c.json(result);
});

const deleteRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['Businesses'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { content: { 'application/json': { schema: deleteBusinessOutputSchema } }, description: 'Deleted' },
    404: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Not found' },
  },
});

businessesRouter.openapi(deleteRoute, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const result = await deleteBusiness(id, user.id);
  if (!result) return c.json({ error: 'Not found' }, 404);
  return c.json(result);
});
