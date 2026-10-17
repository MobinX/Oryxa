import type { Context, Next } from 'hono';
import { getBusinessById, verifyBusinessOwnership } from '@repo/db/crud/business';

export async function businessAccessMiddleware(c: Context, next: Next) {
  const businessId = c.req.param('businessId') ?? c.req.param('id');
  const user = c.get('user');

  if (!businessId || !user) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const hasAccess = await verifyBusinessOwnership(businessId, user.id);
  if (!hasAccess) {
    const userEmail = user.email?.toLowerCase().trim();
    const isOperator = userEmail === 'admin123@oryxa.app' || userEmail === 'mobin.devx@gmail.com' || Boolean(process.env.ADMIN_EMAILS?.includes(userEmail ?? ''));
    if (isOperator) {
      const b = await getBusinessById(businessId);
      if (b && b.slug === 'oryxa-sandbox') {
        return next();
      }
    }
    return c.json({ error: 'Business not found or access denied' }, 403);
  }

  return next();
}
