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
} from '@/lib/api';
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
