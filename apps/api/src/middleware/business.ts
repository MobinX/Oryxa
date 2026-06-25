import type { Context, Next } from 'hono';
import { verifyBusinessOwnership } from '@repo/db/crud/business';

export async function businessAccessMiddleware(c: Context, next: Next) {
  const businessId = c.req.param('businessId') ?? c.req.param('id');
  const user = c.get('user');

  if (!businessId || !user) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const hasAccess = await verifyBusinessOwnership(businessId, user.id);
  if (!hasAccess) {
    return c.json({ error: 'Business not found or access denied' }, 403);
  }

  return next();
}
