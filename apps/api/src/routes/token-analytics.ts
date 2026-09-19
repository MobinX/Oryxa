import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { tokenAnalyticsResponseSchema, errorSchema } from '@repo/shared';
import { getBusinessTokenAnalytics, listTokenLogs } from '@repo/db/crud/token-analytics';
import { authMiddleware } from '@api/middleware/auth';
import { businessAccessMiddleware } from '@api/middleware/business';

export const tokenAnalyticsRouter = new OpenAPIHono();

tokenAnalyticsRouter.use('/:businessId/*', authMiddleware, businessAccessMiddleware);

const getBusinessTokenAnalyticsRoute = createRoute({
  method: 'get',
  path: '/{businessId}/analytics/tokens',
  tags: ['Analytics'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    query: z.object({
      hours: z.string().transform((v) => parseInt(v, 10)).pipe(z.number().positive()).optional().default('24'),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: tokenAnalyticsResponseSchema } },
      description: 'Business LLM token analytics summary, integration breakdown, and per-hour graph data',
    },
    404: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Business not found',
    },
  },
});

tokenAnalyticsRouter.openapi(getBusinessTokenAnalyticsRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const { hours } = c.req.valid('query');
  const analytics = await getBusinessTokenAnalytics(businessId, hours);
  return c.json(analytics, 200);
});

const listTokenLogsRoute = createRoute({
  method: 'get',
  path: '/{businessId}/analytics/tokens/logs',
  tags: ['Analytics'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    query: z.object({
      limit: z.string().transform((v) => parseInt(v, 10)).pipe(z.number().positive()).optional().default('50'),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(z.any()) } },
      description: 'List recent raw token log events',
    },
  },
});

tokenAnalyticsRouter.openapi(listTokenLogsRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const { limit } = c.req.valid('query');
  const logs = await listTokenLogs(businessId, limit);
  return c.json(logs, 200);
});
