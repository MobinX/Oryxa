import { updateTag } from 'next/cache';

export const cacheTags = {
  me: () => 'me',
  businesses: () => 'businesses',
  business: (businessId: string) => `business-${businessId}`,
  analytics: (businessId: string) => `analytics-${businessId}`,
  products: (businessId: string) => `products-${businessId}`,
  product: (productId: string) => `product-${productId}`,
  categories: (businessId: string) => `categories-${businessId}`,
  orders: (businessId: string) => `orders-${businessId}`,
  order: (orderId: string) => `order-${orderId}`,
  channels: (businessId: string) => `channels-${businessId}`,
  posts: (businessId: string) => `posts-${businessId}`,
  post: (postId: string) => `post-${postId}`,
  plans: () => 'plans',
  publicPlans: () => 'public-plans',
  billing: (businessId: string) => `billing-${businessId}`,
  notifications: (businessId: string) => `notifications-${businessId}`,
  customers: (businessId: string) => `customers-${businessId}`,
  customer: (customerId: string) => `customer-${customerId}`,
  companies: () => 'companies',
  adminBusinessPlans: () => 'admin-business-plans',
  // Keyed by month as well as store: an operator flipping the month selector should not
  // have a finished month re-requested, and nothing writes these tags to expire them.
  adminTokenUsage: (month: string) => `admin-token-usage-${month}`,
  adminTokenUsageBusiness: (businessId: string, month: string) =>
    `admin-token-usage-${businessId}-${month}`,
} as const;

export function expireBusinesses() {
  updateTag(cacheTags.businesses());
}

export function expireBusiness(businessId: string) {
  updateTag(cacheTags.businesses());
  updateTag(cacheTags.business(businessId));
}

export function expireProducts(businessId: string, productId?: string) {
  updateTag(cacheTags.products(businessId));
  updateTag(cacheTags.analytics(businessId));
  if (productId) updateTag(cacheTags.product(productId));
}

export function expireCategories(businessId: string) {
  updateTag(cacheTags.categories(businessId));
  updateTag(cacheTags.products(businessId));
}

/**
 * An order can open a customer card or add a line under one, so the book and that card
 * expire with the order list. Without this the merchant sees the sale in Orders and an
 * empty history behind the name.
 */
export function expireOrders(businessId: string, orderId?: string, customerId?: string | null) {
  updateTag(cacheTags.orders(businessId));
  updateTag(cacheTags.analytics(businessId));
  updateTag(cacheTags.customers(businessId));
  if (orderId) updateTag(cacheTags.order(orderId));
  if (customerId) updateTag(cacheTags.customer(customerId));
}

export function expireChannelPage(businessId: string) {
  updateTag(cacheTags.channels(businessId));
  updateTag(cacheTags.analytics(businessId));
}

export function expirePosts(businessId: string, postId?: string) {
  updateTag(cacheTags.posts(businessId));
  if (postId) updateTag(cacheTags.post(postId));
}

/**
 * Editing a plan is a fleet-wide action: the caps are read from the plan at gate time and
 * never copied, so every business on it gains or loses allowance the moment this saves.
 * The callers pass those business ids in, because only they can see the roster.
 */
export function expirePlans(affectedBusinessIds: string[] = []) {
  updateTag(cacheTags.plans());
  updateTag(cacheTags.publicPlans());
  updateTag(cacheTags.adminBusinessPlans());
  for (const businessId of affectedBusinessIds) {
    updateTag(cacheTags.billing(businessId));
    updateTag(cacheTags.analytics(businessId));
  }
}

export function expireBilling(businessId: string) {
  updateTag(cacheTags.billing(businessId));
  updateTag(cacheTags.analytics(businessId));
}

export function expireNotifications(businessId: string) {
  updateTag(cacheTags.notifications(businessId));
}

export function expireCustomers(businessId: string) {
  updateTag(cacheTags.customers(businessId));
}

/** One card's own history, expired when an order lands on it or is retyped away from it. */
export function expireCustomer(customerId: string) {
  updateTag(cacheTags.customer(customerId));
}

export function expireCompanies() {
  updateTag(cacheTags.companies());
}
