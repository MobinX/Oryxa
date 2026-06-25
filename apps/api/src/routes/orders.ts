import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createOrderBodySchema,
  createOrderOutputSchema,
  listOrdersQuerySchema,
  orderListItemSchema,
  updateOrderStateInputSchema,
  updateOrderStateOutputSchema,
} from '@repo/shared';
import { createOrder, listOrders, updateOrderState } from '@repo/db/crud/order';
import { authMiddleware } from '../middleware/auth';
import { businessAccessMiddleware } from '../middleware/business';

export const ordersRouter = new OpenAPIHono();

ordersRouter.use('/:businessId/*', authMiddleware, businessAccessMiddleware);

const createOrderRoute = createRoute({
  method: 'post',
  path: '/{businessId}/orders',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: createOrderBodySchema } } },
  },
  responses: {
    201: { content: { 'application/json': { schema: createOrderOutputSchema } }, description: 'Order created' },
  },
});

ordersRouter.openapi(createOrderRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const data = c.req.valid('json');
  const order = await createOrder({ ...data, businessId });
  return c.json(order, 201);
});

const listOrdersRoute = createRoute({
  method: 'get',
  path: '/{businessId}/orders',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    query: listOrdersQuerySchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(orderListItemSchema) } },
      description: 'Orders',
    },
  },
});

ordersRouter.openapi(listOrdersRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const query = c.req.valid('query');
  const orders = await listOrders(businessId, query);
  return c.json(orders);
});

const updateOrderStateRoute = createRoute({
  method: 'patch',
  path: '/{businessId}/orders/{orderId}/state',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid(), orderId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: updateOrderStateInputSchema } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: updateOrderStateOutputSchema } }, description: 'Updated' },
    404: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Not found' },
  },
});

ordersRouter.openapi(updateOrderStateRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const orderId = c.req.param('orderId');
  const data = c.req.valid('json');
  const result = await updateOrderState(businessId, orderId, data);
  if (!result) return c.json({ error: 'Order not found' }, 404);
  return c.json(result);
});
