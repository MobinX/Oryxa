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
  agents: (businessId: string) => `agents-${businessId}`,
  posts: (businessId: string) => `posts-${businessId}`,
  post: (postId: string) => `post-${postId}`,
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

export function expireOrders(businessId: string, orderId?: string) {
  updateTag(cacheTags.orders(businessId));
  updateTag(cacheTags.analytics(businessId));
  if (orderId) updateTag(cacheTags.order(orderId));
}

export function expireChannelPage(businessId: string) {
  updateTag(cacheTags.channels(businessId));
  updateTag(cacheTags.agents(businessId));
  updateTag(cacheTags.analytics(businessId));
}

export function expirePosts(businessId: string, postId?: string) {
  updateTag(cacheTags.posts(businessId));
  if (postId) updateTag(cacheTags.post(postId));
}
