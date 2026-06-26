import { cache } from 'react';
import { requireAuth } from '@/lib/auth';
import { getBusiness, getBusinessStats, getMe } from '@/lib/api';

/** One API call per business per request (layout + page share the result). */
export const getBusinessForRequest = cache(async (businessId: string) => {
  const token = await requireAuth();
  return getBusiness(token, businessId);
});

export const getBusinessStatsForRequest = cache(async (businessId: string) => {
  const token = await requireAuth();
  return getBusinessStats(token, businessId);
});

export const getMeForRequest = cache(async () => {
  const token = await requireAuth();
  try {
    return await getMe(token);
  } catch {
    return { id: '', name: 'User', email: null };
  }
});
