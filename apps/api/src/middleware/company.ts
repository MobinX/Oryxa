import type { Context, Next } from 'hono';
import { verifyCompanyOwnership } from '@repo/db/crud/company';

export async function companyAccessMiddleware(c: Context, next: Next) {
  const companyId = c.req.param('companyId') ?? c.req.param('id');
  const user = c.get('user');

  if (!companyId || !user) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const hasAccess = await verifyCompanyOwnership(companyId, user.id);
  if (!hasAccess) {
    return c.json({ error: 'Company not found or access denied' }, 403);
  }

  return next();
}
