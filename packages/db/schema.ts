import { pgTable, uuid, varchar, text, integer, boolean, numeric, timestamp, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const orderStateEnum = pgEnum('order_state', ['pending', 'acknowledged', 'onDelivery', 'done']);
export const platformEnum = pgEnum('platform', ['facebook', 'instagram', 'whatsapp', 'telegram', 'twitter']);
export const messageFromEnum = pgEnum('message_from', ['self', 'customer']);
export const messageStateEnum = pgEnum('message_state', ['pending', 'working', 'done']);

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

export const businesses = pgTable('businesses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  employeeCount: integer('employee_count'),
  type: varchar('type', { length: 100 }),
  foundedDate: timestamp('founded_date'),
  hasTradeLicense: boolean('has_trade_license').default(false),
  hasTaxLicense: boolean('has_tax_license').default(false),
  facebookPageLink: varchar('facebook_page_link', { length: 500 }),
  phone: varchar('phone', { length: 20 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  uniq: uniqueIndex('categories_business_slug_idx').on(t.businessId, t.slug),
}));

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  sku: varchar('sku', { length: 100 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  uniq: uniqueIndex('products_business_slug_idx').on(t.businessId, t.slug),
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
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  idx: index('messages_conversation_time_idx').on(t.conversationId, t.time),
}));

export const usersRelations = relations(users, ({ many }) => ({
  businesses: many(businesses),
}));

export const businessRelations = relations(businesses, ({ one, many }) => ({
  user: one(users, { fields: [businesses.userId], references: [users.id] }),
  products: many(products),
  orders: many(orders),
  channels: many(channels),
  agents: many(agents),
  conversations: many(conversations),
  categories: many(categories),
}));

export const categoryRelations = relations(categories, ({ one, many }) => ({
  business: one(businesses, { fields: [categories.businessId], references: [businesses.id] }),
  products: many(products),
}));

export const productRelations = relations(products, ({ one, many }) => ({
  business: one(businesses, { fields: [products.businessId], references: [businesses.id] }),
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
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
}));

export const conversationRelations = relations(conversations, ({ one, many }) => ({
  business: one(businesses, { fields: [conversations.businessId], references: [businesses.id] }),
  channel: one(channels, { fields: [conversations.channelId], references: [channels.id] }),
  messages: many(messages),
}));

export const messageRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
}));
