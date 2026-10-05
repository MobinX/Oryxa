import { cacheLife, cacheTag } from 'next/cache';
import {
  getBusiness,
  getBusinessAnalytics,
  getMe,
  getOrder,
  getProduct,
  listAgents,
  listBusinesses,
  listCategories,
  listChannels,
  listOrders,
  getPost,
  listPosts,
  listProducts,
  listPublicPlans,
  getBilling,
  listNotifications,
  adminListPlans,
  adminListBusinessPlans,
} from '@/lib/api';
import type { NotificationList, PublicPlan } from '@/lib/api';
import { cacheTags } from './tags';

/** Cached user profile — stable for a session, not a live feed. */
export async function cachedMe(token: string) {
  'use cache';
  cacheLife('hours');
  cacheTag(cacheTags.me());
  try {
    return await getMe(token);
  } catch {
    return { id: '', name: 'User', email: null };
  }
}

export async function cachedBusinesses(token: string) {
  'use cache';
  cacheLife('minutes');
  cacheTag(cacheTags.businesses());
  return listBusinesses(token);
}

export async function cachedBusiness(token: string, businessId: string) {
  'use cache';
  cacheLife('hours');
  cacheTag(cacheTags.business(businessId));
  return getBusiness(token, businessId);
}

export async function cachedAnalytics(token: string, businessId: string, days: number) {
  'use cache';
  cacheLife('minutes');
  cacheTag(cacheTags.analytics(businessId));
  return getBusinessAnalytics(token, businessId, days);
}

export async function cachedTokenAnalytics(token: string, businessId: string, hours: number = 24) {
  'use cache';
  cacheLife('minutes');
  cacheTag(cacheTags.analytics(businessId));
  try {
    const { getTokenAnalytics } = await import('@/lib/api');
    return await getTokenAnalytics(token, businessId, hours);
  } catch {
    return {
      totals: {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        totalCacheHitTokens: 0,
        totalCacheMissTokens: 0,
        totalRuns: 0,
        avgTokensPerMessage: 0,
        overallCacheHitPercent: 0,
        totalEstimatedCostUsd: 0,
      },
      byIntegration: [],
      hourlyGraphData: [],
    };
  }
}

export async function cachedTokenLogs(token: string, businessId: string, limit: number = 50) {
  'use cache';
  cacheLife('minutes');
  cacheTag(cacheTags.analytics(businessId));
  try {
    const { getTokenLogs } = await import('@/lib/api');
    return await getTokenLogs(token, businessId, limit);
  } catch {
    return [];
  }
}

export async function cachedProducts(
  token: string,
  businessId: string,
  params?: { categoryId?: string; limit?: number; offset?: number },
) {
  'use cache';
  cacheLife('minutes');
  cacheTag(cacheTags.products(businessId));
  return listProducts(token, businessId, params);
}

export async function cachedProduct(token: string, businessId: string, productId: string) {
  'use cache';
  cacheLife('minutes');
  cacheTag(cacheTags.product(productId));
  cacheTag(cacheTags.products(businessId));
  return getProduct(token, businessId, productId);
}

export async function cachedCategories(token: string, businessId: string) {
  'use cache';
  cacheLife('hours');
  cacheTag(cacheTags.categories(businessId));
  return listCategories(token, businessId);
}

export async function cachedOrders(token: string, businessId: string) {
  'use cache';
  cacheLife('minutes');
  cacheTag(cacheTags.orders(businessId));
  return listOrders(token, businessId);
}

export async function cachedOrder(token: string, businessId: string, orderId: string) {
  'use cache';
  cacheLife('minutes');
  cacheTag(cacheTags.order(orderId));
  return getOrder(token, businessId, orderId);
}

export async function cachedChannels(token: string, businessId: string) {
  'use cache';
  cacheLife('hours');
  cacheTag(cacheTags.channels(businessId));
  return listChannels(token, businessId);
}

export async function cachedAgents(token: string, businessId: string) {
  'use cache';
  cacheLife('hours');
  cacheTag(cacheTags.agents(businessId));
  return listAgents(token, businessId);
}

export async function cachedPosts(token: string, businessId: string) {
  'use cache';
  cacheLife('minutes');
  cacheTag(cacheTags.posts(businessId));
  return listPosts(token, businessId);
}

export async function cachedPost(token: string, businessId: string, postId: string) {
  'use cache';
  cacheLife('minutes');
  cacheTag(cacheTags.post(postId));
  cacheTag(cacheTags.posts(businessId));
  return getPost(token, businessId, postId);
}

/**
 * The public price list. A failure is a value here, never a throw: the API and this app
 * deploy from the same push and build in parallel, so the list can genuinely not exist at
 * the moment this page is prerendered, and a marketing page must not be able to abort a
 * deploy over it. `unavailable` makes the page say so instead of trusting the fallback.
 */
export async function cachedPublicPlans(): Promise<{ plans: PublicPlan[]; unavailable?: boolean }> {
  'use cache';
  cacheLife('hours');
  cacheTag(cacheTags.publicPlans());
  try {
    return { plans: await listPublicPlans() };
  } catch {
    return { plans: [], unavailable: true };
  }
}

export async function cachedPlans(token: string) {
  'use cache';
  cacheLife('hours');
  cacheTag(cacheTags.plans());
  return adminListPlans(token);
}

export async function cachedAdminBusinessPlans(token: string) {
  'use cache';
  cacheLife('minutes');
  cacheTag(cacheTags.adminBusinessPlans());
  cacheTag(cacheTags.plans());
  return adminListBusinessPlans(token);
}

/**
 * The meters on a business's own billing page. Stale by design by a few minutes: the
 * counters move inside the webhook and the agent runner, outside this app, so nothing can
 * `updateTag` them when they change. The API is the authority and the hard stop is
 * enforced server-side, so staleness here can cost at most one reply.
 */
export async function cachedBilling(token: string, businessId: string) {
  'use cache';
  cacheLife('minutes');
  cacheTag(cacheTags.billing(businessId));
  return getBilling(token, businessId);
}

export async function cachedNotifications(
  token: string,
  businessId: string,
): Promise<NotificationList & { unavailable?: boolean }> {
  'use cache';
  cacheLife('minutes');
  cacheTag(cacheTags.notifications(businessId));
  try {
    return await listNotifications(token, businessId);
  } catch {
    // The bell is decoration on top of the dashboard; a notice outage must not take the page
    // down, and must never paint a dot that claims there is something to read. The one page
    // whose only job is this list reads `unavailable` and says so instead of "all quiet".
    return { notifications: [], unreadCount: 0, unavailable: true };
  }
}
