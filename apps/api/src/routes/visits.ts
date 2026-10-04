import { createHash } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { visitInputSchema } from '@repo/shared';
import { getBusinessBySlug } from '@repo/db/crud/store';
import { recordVisit } from '@repo/db/crud/visits';
import { runInBackground } from '@api/lib/background';

/**
 * The recorder behind the storefront's page-view beacon. A shopper has no token, so
 * this is the one public write on the API, and it is deliberately the weakest thing
 * it can be: it answers nothing about the data, stores nothing personal, and cannot
 * be inflated — see the visitor hash below.
 */
export const visitsRouter = new OpenAPIHono();

const errorSchema = z.object({ error: z.string() });

const recordVisitRoute = createRoute({
  method: 'post',
  path: '/visits',
  tags: ['Store'],
  request: { body: { content: { 'application/json': { schema: visitInputSchema } } } },
  responses: {
    204: { description: 'Counted, or already counted for this visitor today' },
    400: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Not a storefront path',
    },
    404: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'No published store answers to this slug',
    },
  },
});

visitsRouter.openapi(recordVisitRoute, async (c) => {
  const { slug, path, visitor } = c.req.valid('json');
  if (!path.startsWith('/store/')) return c.json({ error: 'Not a storefront path' }, 400);

  const business = await getBusinessBySlug(slug);
  if (!business || !business.storePublished) return c.json({ error: 'Store not found' }, 404);

  // The id the browser sent is thrown away: what is stored is a hash over
  // id + store + UTC day, so one row is "this browser, this store, today" and the
  // same browser tomorrow or at another store hashes to something unrelated. A hit
  // with no cookie — a bot, or curl — lands in one shared `anon` bucket per store
  // per day, so volume cannot be manufactured without volume of real browsers.
  const utcDay = new Date().toISOString().slice(0, 10);
  const token = createHash('sha256')
    .update(`${visitor ?? 'anon'}.${slug}.${utcDay}`)
    .digest('hex');

  // Nobody reads this response, so the insert runs after it: a slow or dead
  // database must not make a shopper's page wait, and a failure logs `evt=bg`
  // rather than turning into a 500 nobody asked about.
  runInBackground(c, recordVisit({ businessId: business.id, visitor: token, path }), 'visit');
  return c.body(null, 204);
});
