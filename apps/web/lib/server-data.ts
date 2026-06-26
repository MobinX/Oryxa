import { cache } from 'react';
import { requireAuth } from '@/lib/auth';
import { getBusiness, getBusinessStats } from '@/lib/api';

/** One API call per business per request (layout + page share the result). */
export const getBusinessForRequest = cache(async (businessId: string) => {
  const token = await requireAuth();
  return getBusiness(token, businessId);
});

export const getBusinessStatsForRequest = cache(async (businessId: string) => {
  const token = await requireAuth();
  return getBusinessStats(token, businessId);
});
