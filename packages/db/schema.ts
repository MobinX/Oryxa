import { pgTable, uuid, varchar, text, integer, boolean, numeric, timestamp, pgEnum, index, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export type StoreTheme = {
  accentColor?: string;
  font?: 'sans' | 'serif' | 'mono';
  tagline?: string;
  heroImageUrl?: string;
  logoUrl?: string;
  layout?: 'grid' | 'featured';
};

export const orderStateEnum = pgEnum('order_state', ['pending', 'acknowledged', 'onDelivery', 'done']);
export const platformEnum = pgEnum('platform', ['facebook', 'instagram', 'whatsapp', 'telegram', 'twitter']);
export const messageFromEnum = pgEnum('message_from', ['self', 'customer']);
export const messageStateEnum = pgEnum('message_state', ['pending', 'working', 'done']);
export const postStateEnum = pgEnum('post_state', ['draft', 'scheduled', 'published', 'failed']);
export const integrationTypeEnum = pgEnum('integration_type', [
  'facebook_messenger',
  'facebook_comment',
  'instagram_messenger',
  'whatsapp',
  'ai_post_generation',
  'ai_post_tuning',
]);
export const planActorKindEnum = pgEnum('plan_actor_kind', ['operator', 'merchant', 'system']);

/**
 * What the operator sells. Limits are read at gate time and never copied onto the
 * business, which is why editing a plan propagates to every business on it instantly.
 *
 * A NULL limit means that allowance is uncapped; 0 means zero replies are allowed.
 * These are opposite things, so neither is a default here — see crud/billing.ts for how
 * each is enforced, and /admin/plans for the warning that has to sit next to the 0.
 */
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 80 }).notNull(),
  slug: varchar('slug', { length: 64 }).notNull(),
  priceCents: integer('price_cents').default(0).notNull(),
  currency: varchar('currency', { length: 8 }).default('USD').notNull(),
  messageLimit: integer('message_limit'),
  commentLimit: integer('comment_limit'),
  features: jsonb('features').$type<string[]>().default([]).notNull(),
  position: integer('position').default(0).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  slugUniq: uniqueIndex('plans_slug_idx').on(t.slug).where(sql`${t.deletedAt} is null`),
  activePositionIdx: index('plans_active_position_idx').on(t.active, t.position),
}));

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  gender: varchar('gender', { length: 20 }),
  phone: varchar('phone', { length: 20 }),
  email: varchar('email', { length: 255 }).unique(),
  firebaseUid: varchar('firebase_uid', { length: 255 }).unique().notNull(),
  signInMethod: varchar('sign_in_method', { length: 50 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  phone: varchar('phone', { length: 20 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  email: varchar('email', { length: 255 }),
  address: text('address'),
  avatar: varchar('avatar', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  idx: index('customers_company_idx').on(t.companyId, t.name),
}));

export const businesses = pgTable('businesses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }),
  storePublished: boolean('store_published').default(false).notNull(),
  storeTheme: jsonb('store_theme').$type<StoreTheme>(),
  description: text('description'),
  employeeCount: integer('employee_count'),
  type: varchar('type', { length: 100 }),
  foundedDate: timestamp('founded_date'),
  hasTradeLicense: boolean('has_trade_license').default(false),
  hasTaxLicense: boolean('has_tax_license').default(false),
  facebookPageLink: varchar('facebook_page_link', { length: 500 }),
  phone: varchar('phone', { length: 20 }),
  /** NULL = no plan = unlimited. The operator's per-business escape hatch. */
  planId: uuid('plan_id').references(() => plans.id, { onDelete: 'set null' }),
  /**
   * The cycle anchor: 30-day allowances roll from this date, not from the 1st of a
   * month. Set once, at the first assignment, and deliberately never moved afterwards —
   * a re-anchor on plan switch would let a merchant zero their own counter by changing
   * plans, which with self-serve and no payment rail is an unlimited-replies exploit.
   */
  planStartedAt: timestamp('plan_started_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  slugUniq: uniqueIndex('businesses_slug_idx').on(t.slug),
  planIdx: index('businesses_plan_id_idx').on(t.planId),
  companyIdx: index('businesses_company_id_idx').on(t.companyId),
}));

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  uniq: uniqueIndex('categories_business_slug_idx')
    .on(t.businessId, t.slug)
    .where(sql`${t.deletedAt} is null`),
}));

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  sku: varchar('sku', { length: 100 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  uniq: uniqueIndex('products_business_slug_idx')
    .on(t.businessId, t.slug)
    .where(sql`${t.deletedAt} is null`),
  customerIdx: index('products_customer_id_idx').on(t.customerId),
}));

export const variants = pgTable('variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  imageUrl: varchar('image_url', { length: 500 }),
  price: numeric('price', { precision: 10, scale: 2 }),
  stock: integer('stock').default(0).notNull(),
  isAvailable: boolean('is_available').default(true).notNull(),
  rating: numeric('rating', { precision: 3, scale: 2 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  variantId: uuid('variant_id').references(() => variants.id, { onDelete: 'set null' }),
  count: integer('count').default(1).notNull(),
  variantPrice: numeric('variant_price', { precision: 10, scale: 2 }).notNull(),
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  customerAvatar: varchar('customer_avatar', { length: 500 }),
  customerAddress: text('customer_address'),
  customerPhone: varchar('customer_phone', { length: 20 }),
  state: orderStateEnum('state').default('pending').notNull(),
  totalPrice: numeric('total_price', { precision: 10, scale: 2 }).notNull(),
  conversationId: uuid('conversation_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  systemPrompt: text('system_prompt').notNull(),
  platformType: platformEnum('platform_type').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

export const channels = pgTable('channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  platform: platformEnum('platform').notNull(),
  apiToken: text('api_token').notNull(),
  platformChannelId: varchar('platform_channel_id', { length: 255 }).notNull(),
  extraInfo: text('extra_info'),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  uniq: uniqueIndex('channels_business_platform_channel_idx').on(t.businessId, t.platform, t.platformChannelId),
}));

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'cascade' }).notNull(),
  customerPlatformId: varchar('customer_platform_id', { length: 255 }).notNull(),
  customerName: varchar('customer_name', { length: 255 }),
  customerAvatar: varchar('customer_avatar', { length: 500 }),
  lastMessageState: messageStateEnum('last_message_state').default('done').notNull(),
  /** Tracks when lastMessageState last changed — used by the stale-runner watchdog. */
  lastStateAt: timestamp('last_state_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  uniq: uniqueIndex('conversations_channel_customer_idx').on(t.channelId, t.customerPlatformId),
}));

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  from: messageFromEnum('from').notNull(),
  contentType: varchar('content_type', { length: 20 }).default('text').notNull(),
  content: text('content').notNull(),
  time: timestamp('time').defaultNow().notNull(),
  state: messageStateEnum('state').default('pending').notNull(),
  /** Meta platform message id (messaging.message.mid) for webhook dedup. Null for non-platform messages. */
  externalId: varchar('external_id', { length: 100 }),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  idx: index('messages_conversation_time_idx').on(t.conversationId, t.time),
  uniq: uniqueIndex('messages_external_id_idx').on(t.externalId),
}));

export const usersRelations = relations(users, ({ many }) => ({
  businesses: many(businesses),
  companies: many(companies),
}));

export const companyRelations = relations(companies, ({ one, many }) => ({
  user: one(users, { fields: [companies.userId], references: [users.id] }),
  businesses: many(businesses),
  customers: many(customers),
}));

export const customerRelations = relations(customers, ({ one, many }) => ({
  company: one(companies, { fields: [customers.companyId], references: [companies.id] }),
  products: many(products),
}));

export const businessRelations = relations(businesses, ({ one, many }) => ({
  user: one(users, { fields: [businesses.userId], references: [users.id] }),
  plan: one(plans, { fields: [businesses.planId], references: [plans.id] }),
  company: one(companies, { fields: [businesses.companyId], references: [companies.id] }),
  products: many(products),
  orders: many(orders),
  channels: many(channels),
  agents: many(agents),
  conversations: many(conversations),
  commentThreads: many(commentThreads),
  categories: many(categories),
  posts: many(posts),
  llmTokenLogs: many(llmTokenLogs),
  hourlyTokenAnalytics: many(hourlyTokenAnalytics),
}));

export const categoryRelations = relations(categories, ({ one, many }) => ({
  business: one(businesses, { fields: [categories.businessId], references: [businesses.id] }),
  products: many(products),
}));

export const productRelations = relations(products, ({ one, many }) => ({
  business: one(businesses, { fields: [products.businessId], references: [businesses.id] }),
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  customer: one(customers, { fields: [products.customerId], references: [customers.id] }),
  variants: many(variants),
  orders: many(orders),
}));

export const variantRelations = relations(variants, ({ one }) => ({
  product: one(products, { fields: [variants.productId], references: [products.id] }),
}));

export const orderRelations = relations(orders, ({ one }) => ({
  business: one(businesses, { fields: [orders.businessId], references: [businesses.id] }),
  product: one(products, { fields: [orders.productId], references: [products.id] }),
  variant: one(variants, { fields: [orders.variantId], references: [variants.id] }),
}));

export const agentRelations = relations(agents, ({ one, many }) => ({
  business: one(businesses, { fields: [agents.businessId], references: [businesses.id] }),
  channels: many(channels),
}));

export const channelRelations = relations(channels, ({ one, many }) => ({
  business: one(businesses, { fields: [channels.businessId], references: [businesses.id] }),
  agent: one(agents, { fields: [channels.agentId], references: [agents.id] }),
  conversations: many(conversations),
  commentThreads: many(commentThreads),
  posts: many(posts),
}));

export const conversationRelations = relations(conversations, ({ one, many }) => ({
  business: one(businesses, { fields: [conversations.businessId], references: [businesses.id] }),
  channel: one(channels, { fields: [conversations.channelId], references: [channels.id] }),
  messages: many(messages),
}));

export const messageRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
}));

export const commentThreads = pgTable('comment_threads', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'cascade' }).notNull(),
  /** The post/media/tweet the comments live on (FB post id, IG media id, tweet id). */
  platformItemId: varchar('platform_item_id', { length: 255 }).notNull(),
  commenterPlatformId: varchar('commenter_platform_id', { length: 255 }).notNull(),
  commenterName: varchar('commenter_name', { length: 255 }),
  commenterAvatar: varchar('commenter_avatar', { length: 500 }),
  /** Cached post caption/attachment/permalink so the agent has post context. */
  postContext: text('post_context'),
  lastCommentState: messageStateEnum('last_comment_state').default('done').notNull(),
  /** Tracks when lastCommentState last changed — used by the stale-runner watchdog. */
  lastStateAt: timestamp('last_state_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  uniq: uniqueIndex('comment_threads_channel_item_commenter_idx').on(t.channelId, t.platformItemId, t.commenterPlatformId),
}));

export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  commentThreadId: uuid('comment_thread_id').references(() => commentThreads.id, { onDelete: 'cascade' }).notNull(),
  from: messageFromEnum('from').notNull(),
  contentType: varchar('content_type', { length: 20 }).default('text').notNull(),
  content: text('content').notNull(),
  time: timestamp('time').defaultNow().notNull(),
  state: messageStateEnum('state').default('pending').notNull(),
  /** Platform comment id for webhook dedup; also the id of the bot's reply comment. */
  externalId: varchar('external_id', { length: 100 }),
  /** The platform comment id this row replies to (bot reply → the customer comment it answered). */
  parentExternalId: varchar('parent_external_id', { length: 100 }),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  idx: index('comments_thread_time_idx').on(t.commentThreadId, t.time),
  uniq: uniqueIndex('comments_external_id_idx').on(t.externalId),
}));

export const commentThreadRelations = relations(commentThreads, ({ one, many }) => ({
  business: one(businesses, { fields: [commentThreads.businessId], references: [businesses.id] }),
  channel: one(channels, { fields: [commentThreads.channelId], references: [channels.id] }),
  comments: many(comments),
}));

export const commentRelations = relations(comments, ({ one }) => ({
  commentThread: one(commentThreads, { fields: [comments.commentThreadId], references: [commentThreads.id] }),
}));

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'cascade' }).notNull(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  content: text('content').notNull().default(''),
  mediaUrls: text('media_urls').array(),
  postState: postStateEnum('post_state').default('draft').notNull(),
  scheduledAt: timestamp('scheduled_at'),
  publishedAt: timestamp('published_at'),
  platformPostId: varchar('platform_post_id', { length: 255 }),
  aiPrompt: text('ai_prompt'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  idx: index('posts_business_channel_idx').on(t.businessId, t.channelId),
}));

export const postSyncs = pgTable('post_syncs', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }).notNull(),
  likeCount: integer('like_count').default(0).notNull(),
  commentCount: integer('comment_count').default(0).notNull(),
  shareCount: integer('share_count').default(0).notNull(),
  reachCount: integer('reach_count').default(0).notNull(),
  syncedAt: timestamp('synced_at').defaultNow().notNull(),
});

export const postRelations = relations(posts, ({ one, many }) => ({
  business: one(businesses, { fields: [posts.businessId], references: [businesses.id] }),
  channel: one(channels, { fields: [posts.channelId], references: [channels.id] }),
  product: one(products, { fields: [posts.productId], references: [products.id] }),
  syncs: many(postSyncs),
}));

export const postSyncRelations = relations(postSyncs, ({ one }) => ({
  post: one(posts, { fields: [postSyncs.postId], references: [posts.id] }),
}));

export const llmTokenLogs = pgTable('llm_token_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'set null' }),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
  commentThreadId: uuid('comment_thread_id').references(() => commentThreads.id, { onDelete: 'cascade' }),
  postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }),
  messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
  integrationType: integrationTypeEnum('integration_type').notNull(),
  provider: varchar('provider', { length: 50 }).default('gemini').notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  inputTokens: integer('input_tokens').default(0).notNull(),
  outputTokens: integer('output_tokens').default(0).notNull(),
  totalTokens: integer('total_tokens').default(0).notNull(),
  cacheHitTokens: integer('cache_hit_tokens').default(0).notNull(),
  cacheMissTokens: integer('cache_miss_tokens').default(0).notNull(),
  cacheHitPercent: numeric('cache_hit_percent', { precision: 5, scale: 2 }).default('0.00').notNull(),
  latencyMs: integer('latency_ms').default(0).notNull(),
  estimatedCostUsd: numeric('estimated_cost_usd', { precision: 10, scale: 6 }).default('0.000000').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  businessTimeIdx: index('llm_token_logs_business_time_idx').on(t.businessId, t.createdAt),
  businessIntegrationIdx: index('llm_token_logs_business_integration_idx').on(t.businessId, t.integrationType, t.createdAt),
}));

export const hourlyTokenAnalytics = pgTable('hourly_token_analytics', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  integrationType: integrationTypeEnum('integration_type').notNull(),
  hourBucket: timestamp('hour_bucket').notNull(),
  totalInputTokens: integer('total_input_tokens').default(0).notNull(),
  totalOutputTokens: integer('total_output_tokens').default(0).notNull(),
  totalTokens: integer('total_tokens').default(0).notNull(),
  totalCacheHitTokens: integer('total_cache_hit_tokens').default(0).notNull(),
  totalCacheMissTokens: integer('total_cache_miss_tokens').default(0).notNull(),
  runCount: integer('run_count').default(0).notNull(),
  avgTokensPerMessage: numeric('avg_tokens_per_message', { precision: 10, scale: 2 }).default('0.00').notNull(),
  avgLatencyMs: integer('avg_latency_ms').default(0).notNull(),
  totalEstimatedCostUsd: numeric('total_estimated_cost_usd', { precision: 10, scale: 6 }).default('0.000000').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  uniqHourlyBucket: uniqueIndex('hourly_token_analytics_uniq_idx').on(t.businessId, t.integrationType, t.hourBucket),
  businessBucketIdx: index('hourly_token_analytics_business_bucket_idx').on(t.businessId, t.hourBucket),
}));

export const llmTokenLogRelations = relations(llmTokenLogs, ({ one }) => ({
  business: one(businesses, { fields: [llmTokenLogs.businessId], references: [businesses.id] }),
  channel: one(channels, { fields: [llmTokenLogs.channelId], references: [channels.id] }),
  conversation: one(conversations, { fields: [llmTokenLogs.conversationId], references: [conversations.id] }),
  commentThread: one(commentThreads, { fields: [llmTokenLogs.commentThreadId], references: [commentThreads.id] }),
  post: one(posts, { fields: [llmTokenLogs.postId], references: [posts.id] }),
  message: one(messages, { fields: [llmTokenLogs.messageId], references: [messages.id] }),
}));

export const hourlyTokenAnalyticsRelations = relations(hourlyTokenAnalytics, ({ one }) => ({
  business: one(businesses, { fields: [hourlyTokenAnalytics.businessId], references: [businesses.id] }),
}));

/**
 * One row per person per store per UTC day — a daily-unique visit, not a page view.
 * Nothing personal is stored: no IP, no user-agent, no cookie value. `visitor` is a
 * hash over the browser's anonymous id joined with this store and this day, so a row
 * can say "this browser opened this store today" and nothing about who they were,
 * what they read after that, or which other stores they opened. The day is in the
 * hash, so the same person tomorrow is a different row and cannot be followed.
 *
 * `path` is the first page that visitor opened that day, which is how people arrive
 * rather than where they go. Because a repeat visit writes nothing, the only cost of
 * hammering this endpoint is one indexed read.
 */
export const visits = pgTable('visits', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  visitor: varchar('visitor', { length: 64 }).notNull(),
  path: varchar('path', { length: 500 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  timeIdx: index('visits_created_at_idx').on(t.createdAt),
  businessTimeIdx: index('visits_business_created_at_idx').on(t.businessId, t.createdAt),
}));

export const visitRelations = relations(visits, ({ one }) => ({
  business: one(businesses, { fields: [visits.businessId], references: [businesses.id] }),
}));

/**
 * One row per business per 30-day cycle. `period` is the cycle's start date as a
 * 'YYYY-MM-DD' label computed in Node from businesses.plan_started_at — never by SQL
 * date maths — so a string comparison decides which row is "now", and the reset is a
 * key rotation rather than a job. No row for the current period simply means 0 used.
 *
 * Nothing here is soft-deletable: a counter is a fact. The atomic spend lives in
 * crud/billing.ts as a single conditional upsert, because the neon-http driver cannot
 * transact and two statements would let two concurrent runs both see room to spare.
 */
export const quotaUsage = pgTable('quota_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  period: varchar('period', { length: 10 }).notNull(),
  messagesUsed: integer('messages_used').default(0).notNull(),
  commentsUsed: integer('comments_used').default(0).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  businessPeriodUniq: uniqueIndex('quota_usage_business_period_uniq_idx').on(t.businessId, t.period),
}));

/**
 * Merchant-facing notices. kind is a varchar rather than an enum so a new notice
 * ('plan_changed', 'welcome') is one INSERT away instead of a ALTER TYPE migration, while
 * the wire stays strict: shared/schemas/plan.ts validates a closed z.enum at the boundary.
 *
 * The unique (business_id, kind, period) is what makes a notice fire exactly once per
 * cycle without a read-then-write, and NULL periods never collide in Postgres, so a
 * notice that belongs to no cycle stays unconstrained by the same index.
 */
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  kind: varchar('kind', { length: 40 }).notNull(),
  period: varchar('period', { length: 10 }),
  title: varchar('title', { length: 120 }).notNull(),
  body: text('body').notNull(),
  link: varchar('link', { length: 300 }),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  businessKindPeriodUniq: uniqueIndex('notifications_business_kind_period_uniq_idx').on(t.businessId, t.kind, t.period),
  businessUnreadIdx: index('notifications_business_unread_idx').on(t.businessId, t.readAt, t.createdAt),
}));

/**
 * Append-only history of who put which business on which plan. Not a subscriptions
 * table — the live pointer is businesses.plan_id — just the record that pointer
 * overwrites. plan_id NULL is a revoke. actor_user_id has no FK on purpose: tests
 * hard-delete user rows, and an audit row should outlive the account that acted.
 */
export const planAssignments = pgTable('plan_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  planId: uuid('plan_id').references(() => plans.id, { onDelete: 'set null' }),
  previousPlanId: uuid('previous_plan_id').references(() => plans.id, { onDelete: 'set null' }),
  actorKind: planActorKindEnum('actor_kind').notNull(),
  actorUserId: uuid('actor_user_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  businessTimeIdx: index('plan_assignments_business_time_idx').on(t.businessId, t.createdAt),
  planIdx: index('plan_assignments_plan_idx').on(t.planId),
}));

export const plansRelations = relations(plans, ({ many }) => ({
  businesses: many(businesses),
}));

export const quotaUsageRelations = relations(quotaUsage, ({ one }) => ({
  business: one(businesses, { fields: [quotaUsage.businessId], references: [businesses.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  business: one(businesses, { fields: [notifications.businessId], references: [businesses.id] }),
}));

export const planAssignmentsRelations = relations(planAssignments, ({ one }) => ({
  business: one(businesses, { fields: [planAssignments.businessId], references: [businesses.id] }),
  plan: one(plans, { fields: [planAssignments.planId], references: [plans.id], relationName: 'assignmentPlan' }),
  previousPlan: one(plans, { fields: [planAssignments.previousPlanId], references: [plans.id], relationName: 'previousPlan' }),
}));

