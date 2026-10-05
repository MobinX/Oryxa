import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  assignPlanInputSchema,
  billingOverviewSchema,
  errorSchema,
  markNotificationsReadInputSchema,
  markNotificationsReadOutputSchema,
  notificationListResponseSchema,
  planSchema,
  type BillingOverview,
  type Plan,
  type QuotaStatus,
} from '@repo/shared';
import {
  countUnreadNotifications,
  getQuotaStatus,
  listNotifications,
  markNotificationsRead,
} from '@repo/db/crud/billing';
import { assignPlan, getPlanById, listActivePlans, limitLabel } from '@repo/db/crud/plans';
import { authMiddleware } from '@api/middleware/auth';
import { businessAccessMiddleware } from '@api/middleware/business';

/**
 * What one business is on, what it has used, and the notices its bell is holding.
 *
 * Ownership is not checked here: `businessAccessMiddleware` resolves the business and
 * rejects anything the bearer does not own, exactly like conversations and channels.
 */
export const billingRouter = new OpenAPIHono();

billingRouter.use('/:businessId/*', authMiddleware, businessAccessMiddleware);

const params = z.object({ businessId: z.string().uuid() });

/** The plan row behind a business's pointer, or null when it has none. */
async function assignedPlan(status: QuotaStatus): Promise<Plan | null> {
  return status.assigned && status.planId ? getPlanById(status.planId) : null;
}

async function overview(businessId: string, status: QuotaStatus): Promise<BillingOverview> {
  const [plan, options] = await Promise.all([assignedPlan(status), listActivePlans()]);
  return { businessId, quota: status, plan, options };
}

const getBillingRoute = createRoute({
  method: 'get',
  path: '/{businessId}/billing',
  tags: ['Billing'],
  security: [{ bearerAuth: [] }],
  request: { params },
  responses: {
    200: {
      content: { 'application/json': { schema: billingOverviewSchema } },
      description: 'Current plan, this cycle, and every plan that may be chosen',
    },
    403: { content: { 'application/json': { schema: errorSchema } }, description: 'Not your business' },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'No such business' },
  },
});

billingRouter.openapi(getBillingRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const status = await getQuotaStatus(businessId);
  if (!status) return c.json({ error: 'Business not found' }, 404);
  return c.json(await overview(businessId, status), 200);
});

/**
 * The reason a switch is refused: a cap *below* what this cycle already spent would leave
 * the business with nothing left to spend until its own boundary, and doing it silently
 * would look like the agent broke. The merchant is told instead. An operator may still do
 * it — see /api2/admin — because they are the one who can then hand out more.
 */
function downgradeConflict(status: QuotaStatus, plan: Plan): string | null {
  const overMessages = status.messagesUsed > (plan.messageLimit ?? Number.POSITIVE_INFINITY);
  const overComments = status.commentsUsed > (plan.commentLimit ?? Number.POSITIVE_INFINITY);
  if (!overMessages && !overComments) return null;

  const spent = [
    overMessages ? `${status.messagesUsed} messenger ${status.messagesUsed === 1 ? 'reply' : 'replies'}` : null,
    overComments ? `${status.commentsUsed} comment ${status.commentsUsed === 1 ? 'reply' : 'replies'}` : null,
  ]
    .filter(Boolean)
    .join(' and ');

  const offered = [limitLabel(plan.messageLimit, 'messenger reply'), limitLabel(plan.commentLimit, 'comment reply')].join(
    ' and ',
  );

  return (
    `${plan.name} allows ${offered} per 30 days, and you have already sent ${spent} in this cycle. ` +
    `It would stop the agent until ${status.cycle.resetsAt}. Pick a bigger plan, or wait for the reset.`
  );
}

const switchPlanRoute = createRoute({
  method: 'put',
  path: '/{businessId}/billing/plan',
  tags: ['Billing'],
  security: [{ bearerAuth: [] }],
  request: {
    params,
    body: { content: { 'application/json': { schema: assignPlanInputSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: planSchema } },
      description: 'Applied immediately. Replies already used this cycle count against the new plan.',
    },
    400: { content: { 'application/json': { schema: errorSchema } }, description: 'That plan is not available' },
    403: { content: { 'application/json': { schema: errorSchema } }, description: 'Not your business' },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'No such business' },
    409: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Smaller than what this cycle has already used',
    },
  },
});

billingRouter.openapi(switchPlanRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const { planId } = c.req.valid('json');
  if (!planId) return c.json({ error: 'Choose a plan' }, 400);

  const target = await getPlanById(planId);
  if (!target || !target.active) return c.json({ error: 'That plan is not available' }, 400);

  const status = await getQuotaStatus(businessId);
  if (!status) return c.json({ error: 'Business not found' }, 404);

  const conflict = downgradeConflict(status, target);
  if (conflict) return c.json({ error: conflict }, 409);

  const assigned = await assignPlan(businessId, target.id, {
    actorKind: 'merchant',
    actorUserId: c.get('user')?.id ?? null,
  });
  if (!assigned) return c.json({ error: 'Business not found' }, 404);

  return c.json(target, 200);
});

const listNotificationsRoute = createRoute({
  method: 'get',
  path: '/{businessId}/notifications',
  tags: ['Billing'],
  security: [{ bearerAuth: [] }],
  request: {
    params,
    query: z.object({ unread: z.enum(['true', 'false']).optional() }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: notificationListResponseSchema } },
      description: 'Newest first, with the count the bell should light up for',
    },
    403: { content: { 'application/json': { schema: errorSchema } }, description: 'Not your business' },
  },
});

billingRouter.openapi(listNotificationsRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const [items, unreadCount] = await Promise.all([
    listNotifications(businessId),
    countUnreadNotifications(businessId),
  ]);
  const onlyUnread = c.req.valid('query').unread === 'true';
  return c.json(
    { notifications: onlyUnread ? items.filter((n) => n.readAt === null) : items, unreadCount },
    200,
  );
});

const readNotificationsRoute = createRoute({
  method: 'post',
  path: '/{businessId}/notifications/read',
  tags: ['Billing'],
  security: [{ bearerAuth: [] }],
  request: {
    params,
    body: { content: { 'application/json': { schema: markNotificationsReadInputSchema } } },
  },
  responses: {
    // 204 would leave the dashboard's dot to guess whether anything actually cleared.
    200: {
      content: { 'application/json': { schema: markNotificationsReadOutputSchema } },
      description: 'How many notices were marked read',
    },
    400: { content: { 'application/json': { schema: errorSchema } }, description: 'Neither ids nor all were sent' },
    403: { content: { 'application/json': { schema: errorSchema } }, description: 'Not your business' },
  },
});

billingRouter.openapi(readNotificationsRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const { ids, all } = c.req.valid('json');
  // Checked here rather than by `.refine()` on the schema: the refinement would have to
  // be registered before `.openapi()` to survive into the contract, and the contract is
  // the part a browser client reads.
  if (!all && (!ids || ids.length === 0)) return c.json({ error: 'Provide ids or all' }, 400);
  return c.json({ updated: await markNotificationsRead(businessId, { ids, all }) }, 200);
});
