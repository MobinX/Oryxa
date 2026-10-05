import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { publicPlanSchema } from '@repo/shared';
import { listPublicPlans } from '@repo/db/crud/plans';

/**
 * The public price list. No auth, because /pricing is read by people who have not
 * signed up yet, and no ids, because a plan uuid is the thing an assignment endpoint
 * accepts — a marketing page must not hand out the operator's assignable handles.
 *
 * Its own router so nothing is added inside the handlers the Flutter client already
 * depends on; this is a new path, not a new branch in an old one.
 */
export const plansRouter = new OpenAPIHono();

const listPlansRoute = createRoute({
  method: 'get',
  path: '/plans',
  tags: ['Plans'],
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(publicPlanSchema) } },
      description: 'Active plans in display order. Retired and deleted plans are never listed.',
    },
  },
});

plansRouter.openapi(listPlansRoute, async (c) => c.json(await listPublicPlans(), 200));
