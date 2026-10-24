import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  errorSchema,
  modelBillingSchema,
  updateModelBillingInputSchema,
} from '@repo/shared';
import {
  getModelBilling,
  ratesOf,
  updateModelBilling,
  type ModelBillingRow,
} from '@repo/db/crud/model-billing';
import { logsAuthMiddleware } from '@api/middleware/logs-access';

export const adminModelBillingRouter = new OpenAPIHono();

adminModelBillingRouter.use('*', logsAuthMiddleware);

function toResponse(row: ModelBillingRow) {
  return {
    provider: row.provider,
    model: row.model,
    ...ratesOf(row),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const getRoute = createRoute({
  method: 'get',
  path: '/admin/model-billing',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: { 'application/json': { schema: modelBillingSchema } },
      description: 'The model rates used to price token analytics',
    },
    401: { content: { 'application/json': { schema: errorSchema } }, description: 'No console session' },
    403: { content: { 'application/json': { schema: errorSchema } }, description: 'Not an operator' },
  },
});

adminModelBillingRouter.openapi(getRoute, async (c) =>
  c.json(toResponse(await getModelBilling()), 200),
);

const putRoute = createRoute({
  method: 'put',
  path: '/admin/model-billing',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: updateModelBillingInputSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: modelBillingSchema } },
      description: 'Saved; token analytics is repriced from these rates',
    },
    400: { content: { 'application/json': { schema: errorSchema } }, description: 'Invalid rates' },
    401: { content: { 'application/json': { schema: errorSchema } }, description: 'No console session' },
    403: { content: { 'application/json': { schema: errorSchema } }, description: 'Not an operator' },
  },
});

adminModelBillingRouter.openapi(putRoute, async (c) => {
  const data = c.req.valid('json');
  if (
    data.inputUsdPerMillion < 0 ||
    data.outputUsdPerMillion < 0 ||
    data.cachedInputUsdPerMillion < 0
  ) {
    return c.json({ error: 'Rates cannot be negative' }, 400);
  }
  return c.json(toResponse(await updateModelBilling(data)), 200);
});
