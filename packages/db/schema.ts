import { pgTable, uuid, varchar, text, integer, boolean, numeric, timestamp, pgEnum, index, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import type { ConversationAgentState } from '@repo/shared';

export type StoreTheme = {
  accentColor?: string;
  font?: 'sans' | 'serif' | 'mono';
  tagline?: string;
  heroImageUrl?: string;
  logoUrl?: string;
  layout?: 'grid' | 'featured';
  preset?: 'gallery' | 'pine' | 'terracotta' | 'petrol' | 'atelier';
  structure?: 'classic' | 'editorial' | 'market' | 'terminal' | 'atelier';
};

export const orderStateEnum = pgEnum('order_state', ['pending', 'acknowledged', 'onDelivery', 'done']);
export const platformEnum = pgEnum('platform', ['facebook', 'instagram', 'whatsapp', 'telegram', 'twitter', 'tiktok']);
export const messageFromEnum = pgEnum('message_from', ['self', 'customer']);
export const messageStateEnum = pgEnum('message_state', ['pending', 'working', 'done']);
export const postStateEnum = pgEnum('post_state', ['draft', 'scheduled', 'published', 'failed']);
export const integrationTypeEnum = pgEnum('integration_type', [
  'facebook_messenger',
  'facebook_comment',
  'instagram_messenger',
  'instagram_comment',
  'whatsapp',
  'ai_post_generation',
  'ai_post_tuning',
]);
export const planActorKindEnum = pgEnum('plan_actor_kind', ['operator', 'merchant', 'system']);

/**
 * Official Channels ticketing. `type` is the AI-reported intent — support or security;
 * sales questions become prospects instead, and `other` stays a plain conversation.
 */
export const ticketTypeEnum = pgEnum('ticket_type', ['support', 'security']);
export const ticketStatusEnum = pgEnum('ticket_status', [
  'open',
  'in_progress',
  'waiting',
  'resolved',
  'closed',
]);
export const ticketPriorityEnum = pgEnum('ticket_priority', ['low', 'normal', 'high', 'urgent']);

/** How far an onboarding inquiry has moved after the AI gathered it from a conversation. */
export const prospectStatusEnum = pgEnum('prospect_status', [
  'new',
  'reviewing',
  'prioritized',
  'onboarding_requested',
  'onboarded',
  'rejected',
]);

/**
 * The leads CRM pipeline (spec D). Statuses are closed so the operator UI can render
 * them as a rail; unknown ones arrive only when someone writes SQL by hand.
 */
export const leadStatusEnum = pgEnum('lead_status', [
  'new',
  'qualified',
  'awaiting_information',
  'waitlisted',
  'contact_requested',
  'contacted',
  'converted',
  'closed',
]);

/**
 * How the agent is allowed to answer one channel. Every field is advisory context for the
 * runner except the on/off toggles and the confidence threshold, which the runner enforces.
 * One row per channel: the connect flows leave it absent until someone opens the AI Studio.
 */
export const channelAiConfigs = pgTable('channel_ai_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  channelId: uuid('channel_id')
    .references(() => channels.id, { onDelete: 'cascade' })
    .notNull(),
  aiEnabled: boolean('ai_enabled').default(true).notNull(),
  aiCommentsEnabled: boolean('ai_comments_enabled').default(true).notNull(),
  privateRepliesEnabled: boolean('private_replies_enabled').default(true).notNull(),
  autoReply: boolean('auto_reply').default(true).notNull(),
  /** Below it the AI escalates to a human instead of guessing. */
  confidenceThreshold: numeric('confidence_threshold', { precision: 3, scale: 2 })
    .default('0.60')
    .notNull(),
  maxReplyLength: integer('max_reply_length').default(1000).notNull(),
  tone: varchar('tone', { length: 40 }).default('friendly'),
  /** 'auto' keeps the repo's own Bangla/Banglish/English detection in charge. */
  language: varchar('language', { length: 20 }).default('auto'),
  perChannelInstructions: text('per_channel_instructions'),
  leadQuestions: jsonb('lead_questions').$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
  escalationRules: jsonb('escalation_rules')
    .$type<Record<string, unknown>>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  commentBehavior: jsonb('comment_behavior')
    .$type<Record<string, unknown>>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  channelUniq: uniqueIndex('channel_ai_configs_channel_uniq_idx').on(t.channelId),
}));

/**
 * What the AI may claim about the business it answers for. No field is prefabricated:
 * the row is created empty and the operator writes it, because a synthesized answer is
 * exactly the fabricated data the spec forbids.
 */
export const businessProfiles = pgTable('business_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  displayName: varchar('display_name', { length: 120 }).default('Only Order').notNull(),
  description: text('description'),
  productsServices: text('products_services'),
  audience: text('audience'),
  serviceAreas: text('service_areas'),
  pricingPackages: text('pricing_packages'),
  hoursHolidays: text('hours_holidays'),
  contacts: text('contacts'),
  website: varchar('website', { length: 300 }),
  socials: text('socials'),
  limitations: text('limitations'),
  policies: text('policies'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  businessUniq: uniqueIndex('business_profiles_business_uniq_idx').on(t.businessId),
}));

/** Per-business knowledge base / FAQ the agent draws on before guessing. */
export const knowledgeEntries = pgTable('knowledge_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  tags: text('tags').array().default(sql`'{}'::text[]`).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  businessActiveIdx: index('knowledge_entries_business_idx').on(t.businessId, t.active),
}));

/**
 * How much work the business can still take on. `available_capacity` is the only field the
 * software writes between manual saves: each reservation is one atomic conditional decrement
 * (`available_capacity > 0`), the exclusive gate the spec demands, because this driver cannot
 * open a transaction (see the quota_usage comment for the same lesson).
 */
export const capacity = pgTable('capacity', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  acceptingNewCustomers: boolean('accepting_new_customers').default(true).notNull(),
  maxCapacity: integer('max_capacity').default(0).notNull(),
  availableCapacity: integer('available_capacity').default(0).notNull(),
  /** off | auto | manual */
  waitlistMode: varchar('waitlist_mode', { length: 20 }).default('off').notNull(),
  fullCapacityMessage: text('full_capacity_message'),
  followUpInfo: text('follow_up_info'),
  preferredContact: varchar('preferred_contact', { length: 40 }),
  etaText: varchar('eta_text', { length: 200 }),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  businessUniq: uniqueIndex('capacity_business_uniq_idx').on(t.businessId),
}));

/** One hold on one capacity slot. Releasing keeps the row, mirroring order history. */
export const capacityReservations = pgTable('capacity_reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  conversationId: uuid('conversation_id'),
  /** active | released */
  status: varchar('status', { length: 20 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  releasedAt: timestamp('released_at'),
}, (t) => ({
  businessStatusIdx: index('capacity_reservations_business_idx').on(t.businessId, t.status),
}));

/**
 * The leads CRM row. Deduped on (channel_id, platform_user_id) — never on name or phone,
 * which are self-reported values the same person may enter differently every time.
 */
export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'cascade' }).notNull(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  commentThreadId: uuid('comment_thread_id').references(() => commentThreads.id, { onDelete: 'set null' }),
  platform: platformEnum('platform').notNull(),
  platformUserId: varchar('platform_user_id', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }),
  businessName: varchar('business_name', { length: 255 }),
  phone: varchar('phone', { length: 20 }),
  email: varchar('email', { length: 255 }),
  contactMethod: varchar('contact_method', { length: 20 }),
  requirements: text('requirements'),
  interest: text('interest'),
  timeframe: varchar('timeframe', { length: 100 }),
  consent: boolean('consent').default(false).notNull(),
  consentAt: timestamp('consent_at'),
  sourceChannel: varchar('source_channel', { length: 30 }),
  conversationRef: varchar('conversation_ref', { length: 255 }),
  status: leadStatusEnum('status').default('new').notNull(),
  // No FK on purpose, same as planAssignments.actorUserId: an audit trail outlives accounts.
  assigneeUserId: uuid('assignee_user_id'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  dedupeUniq: uniqueIndex('leads_channel_platform_user_uniq_idx').on(t.channelId, t.platformUserId),
  businessStatusIdx: index('leads_business_status_idx').on(t.businessId, t.status, t.updatedAt),
  businessPhoneIdx: index('leads_business_phone_idx').on(t.businessId, t.phone),
}));

/** Append-only audit + history for a lead. Nobody edits or deletes these. */
export const leadEvents = pgTable('lead_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }).notNull(),
  /** operator | ai | system */
  actorKind: varchar('actor_kind', { length: 10 }).default('system').notNull(),
  actorUserId: uuid('actor_user_id'),
  kind: varchar('kind', { length: 40 }).notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  leadTimeIdx: index('lead_events_lead_time_idx').on(t.leadId, t.createdAt),
}));

export const leadRelations = relations(leads, ({ one, many }) => ({
  business: one(businesses, { fields: [leads.businessId], references: [businesses.id] }),
  channel: one(channels, { fields: [leads.channelId], references: [channels.id] }),
  conversation: one(conversations, { fields: [leads.conversationId], references: [conversations.id] }),
  commentThread: one(commentThreads, { fields: [leads.commentThreadId], references: [commentThreads.id] }),
  events: many(leadEvents),
}));

export const leadEventRelations = relations(leadEvents, ({ one }) => ({
  lead: one(leads, { fields: [leadEvents.leadId], references: [leads.id] }),
}));

/* ------------------------------------------------------------------ */
/* Official Channels: OnlyOrders' own accounts, admin-side only.        */
/* ------------------------------------------------------------------ */

/**
 * The global official-channel settings. One row (guarded by a unique index on a constant
 * in the migration); absent = defaults, and the crud layer get-or-creates on first write.
 */
export const officialSettings = pgTable('official_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** 'available' | 'taking_onboarding_requests' — the AI's wording follows this value. */
  availability: varchar('availability', { length: 40 }).default('available').notNull(),
  availabilityNote: text('availability_note'),
  aiEnabled: boolean('ai_enabled').default(true).notNull(),
  autoReply: boolean('auto_reply').default(true).notNull(),
  tone: varchar('tone', { length: 40 }).default('friendly'),
  language: varchar('language', { length: 20 }).default('auto'),
  /** Free-form instructions the official AI must follow, written by an operator. */
  instructions: text('instructions'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  singletonUniq: uniqueIndex('official_settings_singleton_idx').on(sql`true`),
}));

/** A support or a security ticket, opened from (or alongside) an official conversation. */
export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  channelId: uuid('channel_id')
    .references(() => channels.id, { onDelete: 'cascade' })
    .notNull(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  customerPlatformId: varchar('customer_platform_id', { length: 255 }).notNull(),
  customerName: varchar('customer_name', { length: 255 }),
  type: ticketTypeEnum('type').default('support').notNull(),
  status: ticketStatusEnum('status').default('open').notNull(),
  priority: ticketPriorityEnum('priority').default('normal').notNull(),
  // No FK on purpose: like planAssignments.actorUserId, the audit trail outlives accounts.
  assigneeUserId: uuid('assignee_user_id'),
  subject: varchar('subject', { length: 500 }),
  summary: text('summary'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  statusPriorityIdx: index('tickets_status_priority_idx').on(t.status, t.priority, t.updatedAt),
  conversationIdx: index('tickets_conversation_idx').on(t.conversationId),
}));

/** Append-only history for a ticket; nobody edits or deletes these rows. */
export const ticketEvents = pgTable('ticket_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id')
    .references(() => tickets.id, { onDelete: 'cascade' })
    .notNull(),
  /** operator | ai | system */
  actorKind: varchar('actor_kind', { length: 10 }).default('system').notNull(),
  actorUserId: uuid('actor_user_id'),
  kind: varchar('kind', { length: 40 }).notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  ticketTimeIdx: index('ticket_events_ticket_time_idx').on(t.ticketId, t.createdAt),
}));

/**
 * An onboarding inquiry the official AI gathered progressively. Deduped on
 * (channel_id, contact_platform_id) — the person's ID on that platform — never on
 * a self-reported name. Every field except the identity is optional: a field only
 * fills when the customer actually gave it (and `consent` only when they agreed).
 */
export const prospects = pgTable('prospects', {
  id: uuid('id').primaryKey().defaultRandom(),
  channelId: uuid('channel_id')
    .references(() => channels.id, { onDelete: 'cascade' })
    .notNull(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  platform: varchar('platform', { length: 30 }).notNull(),
  contactPlatformId: varchar('contact_platform_id', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }),
  country: varchar('country', { length: 100 }),
  businessType: varchar('business_type', { length: 100 }),
  employeesEstimate: varchar('employees_estimate', { length: 40 }),
  budget: varchar('budget', { length: 100 }),
  needs: text('needs'),
  consent: boolean('consent').default(false).notNull(),
  consentAt: timestamp('consent_at'),
  status: prospectStatusEnum('status').default('new').notNull(),
  /** Scored against prospect_weights at capture; rescore recomputes with current weights. */
  score: integer('score').default(0).notNull(),
  scoreBreakdown: jsonb('score_breakdown').$type<Record<string, number>>().default(sql`'{}'::jsonb`).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  dedupeUniq: uniqueIndex('prospects_channel_contact_uniq_idx').on(t.channelId, t.contactPlatformId),
  statusScoreIdx: index('prospects_status_idx').on(t.status, t.score),
}));

/** Append-only audit for a prospect. */
export const prospectEvents = pgTable('prospect_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  prospectId: uuid('prospect_id')
    .references(() => prospects.id, { onDelete: 'cascade' })
    .notNull(),
  /** operator | ai | system */
  actorKind: varchar('actor_kind', { length: 10 }).default('system').notNull(),
  actorUserId: uuid('actor_user_id'),
  kind: varchar('kind', { length: 40 }).notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  prospectTimeIdx: index('prospect_events_prospect_time_idx').on(t.prospectId, t.createdAt),
}));

/**
 * The scoring weights an operator configures. One row (unique index on a constant in the
 * migration); the crud layer upserts it. Each weight is 0–10 for its field.
 */
export const prospectWeights = pgTable('prospect_weights', {
  id: uuid('id').primaryKey().defaultRandom(),
  weights: jsonb('weights').$type<Record<string, number>>().default(sql`'{}'::jsonb`).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  singletonUniq: uniqueIndex('prospect_weights_singleton_idx').on(sql`true`),
}));

export const officialSettingsRelations = relations(officialSettings, () => ({}));

export const ticketRelations = relations(tickets, ({ one, many }) => ({
  channel: one(channels, { fields: [tickets.channelId], references: [channels.id] }),
  conversation: one(conversations, { fields: [tickets.conversationId], references: [conversations.id] }),
  events: many(ticketEvents),
}));

export const ticketEventRelations = relations(ticketEvents, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketEvents.ticketId], references: [tickets.id] }),
}));

export const prospectRelations = relations(prospects, ({ one, many }) => ({
  channel: one(channels, { fields: [prospects.channelId], references: [channels.id] }),
  conversation: one(conversations, { fields: [prospects.conversationId], references: [conversations.id] }),
  events: many(prospectEvents),
}));

export const prospectEventRelations = relations(prospectEvents, ({ one }) => ({
  prospect: one(prospects, { fields: [prospectEvents.prospectId], references: [prospects.id] }),
}));

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
  phoneIdx: index('customers_company_phone_idx').on(t.companyId, t.phone),
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
  /**
   * Merchant-authored sales rules for the answering agent, kept with the business rather than
   * one agent row so every channel (Messenger and comments) reads the same words. Blank is
   * absent, not an instruction to say nothing.
   */
  agentProductGuidance: text('agent_product_guidance'),
  agentBargainGuidance: text('agent_bargain_guidance'),
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
  /**
   * The default price is what a variant without its own price override answers with; a discount
   * is the merchant marking the default down, and the percent is what comes off it.
   */
  hasDiscount: boolean('has_discount').default(false).notNull(),
  discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }).default('0').notNull(),
  /** Free-form labels the storefront and the merchant's own filtering can read. */
  tags: text('tags').array().default(sql`'{}'::text[]`).notNull(),
  /** False hides the product from the public store without deleting it from the catalog. */
  showInStorefront: boolean('show_in_storefront').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  uniq: uniqueIndex('products_business_slug_idx')
    .on(t.businessId, t.slug)
    .where(sql`${t.deletedAt} is null`),
  customerIdx: index('products_customer_id_idx').on(t.customerId),
}));

export const variants = pgTable(
  'variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
    /**
     * The short label a merchant reads aloud, writes on a shelf and types into search: three
     * letters and two digits. It is unique inside one business and nowhere else, so two shops may
     * hold the same label and every lookup carries its business with it.
     */
    variantId: varchar('variant_id', { length: 5 }),
    name: varchar('name', { length: 255 }).notNull(),
    imageUrl: varchar('image_url', { length: 500 }),
    /**
     * Every photo the merchant hung on this variant, in the order they hung them. `imageUrl`
     * stays the first of them: a Messenger card, a storefront thumbnail and the agent's photo
     * picker all read one cover, and none of them should have to learn about the set.
     */
    imageUrls: text('image_urls').array().notNull().default(sql`'{}'::text[]`),
    price: numeric('price', { precision: 10, scale: 2 }),
    stock: integer('stock').default(0).notNull(),
    isAvailable: boolean('is_available').default(true).notNull(),
    rating: numeric('rating', { precision: 3, scale: 2 }),
    /**
     * The combination this variant is, read off the product's declared options: `{"Color":"Red",
     * "Size":"XL"}`. Empty on a variant of a product that declared no options — a product may
     * skip options entirely, but a product that declares them has no variant without a full set.
     */
    options: jsonb('options').$type<Record<string, string>>().default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => ({
    labelIdx: index('variants_variant_id_idx').on(t.variantId),
  }),
);

/**
 * The knobs a product is sold in — Color, Size — at most three per product, each with its own
 * list of allowed values. Declaring them is optional; declaring them obliges every variant of
 * the product to carry one value of each, which is what turns a row into a combination.
 */
export const productOptions = pgTable(
  'product_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .references(() => products.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    position: integer('position').default(0).notNull(),
  },
  (t) => ({
    productIdx: index('product_options_product_idx').on(t.productId),
  }),
);

export const productOptionValues = pgTable(
  'product_option_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    optionId: uuid('option_id')
      .references(() => productOptions.id, { onDelete: 'cascade' })
      .notNull(),
    value: varchar('value', { length: 80 }).notNull(),
    position: integer('position').default(0).notNull(),
  },
  (t) => ({
    optionIdx: index('product_option_values_option_idx').on(t.optionId),
  }),
);

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  variantId: uuid('variant_id').references(() => variants.id, { onDelete: 'set null' }),
  count: integer('count').default(1).notNull(),
  variantPrice: numeric('variant_price', { precision: 10, scale: 2 }).notNull(),
  // The company's customer this order matched by phone. Written wherever the order
  // came from — agent tool call, dashboard form, storefront checkout — so one person
  // stays one person across stores instead of a fresh name on every row.
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  customerAvatar: varchar('customer_avatar', { length: 500 }),
  customerAddress: text('customer_address'),
  customerPhone: varchar('customer_phone', { length: 20 }),
  /**
   * The Messenger id of the customer who placed it, so "what did I order last time?" is answerable
   * without a phone number and without an order id. Written wherever one exists — an agent tool call
   * or a storefront checkout that came in through a Page — and null for an order a merchant typed
   * into the dashboard, which has no platform identity behind it.
   */
  customerPlatformId: varchar('customer_platform_id', { length: 120 }),
  state: orderStateEnum('state').default('pending').notNull(),
  totalPrice: numeric('total_price', { precision: 10, scale: 2 }).notNull(),
  /**
   * What delivery adds on top of the items, as the buyer was told when they confirmed — shown on
   * the confirmation card beside the total rather than folded into it, so the two numbers the
   * customer agreed to stay the two numbers the merchant can reconcile. Zero when none was quoted.
   */
  shippingCost: numeric('shipping_cost', { precision: 10, scale: 2 }).default('0').notNull(),
  /** How the buyer said they will pay — "Cash on delivery", "bKash" — in their own words, not a code. */
  paymentMethod: varchar('payment_method', { length: 40 }),
  /** The bKash/Nagad transaction id the buyer gave before the order was placed. */
  transactionId: varchar('transaction_id', { length: 120 }),
  conversationId: uuid('conversation_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  // The order-history lookup: this store, this customer, newest first.
  platformLookupIdx: index('orders_business_platform_idx').on(t.businessId, t.customerPlatformId),
}));

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  systemPrompt: text('system_prompt').notNull(),
  platformType: platformEnum('platform_type').notNull(),
  /**
   * The wording block appended after the prompt that tells the agent how to answer — in a DM or in
   * a public comment. Null means "use Oryxa's built-in wording", so a store that never touched it
   * keeps shipping the reviewed text, and emptying the box in the playground puts it back.
   */
  replyGuidance: text('reply_guidance'),
  commentReplyGuidance: text('comment_reply_guidance'),
  /**
   * False means this row is the store's own writing and answers its customers; true means the row
   * keeps its text only as a record, and the store answers with the platform default instead. The
   * copy is never deleted, so one UPDATE turns a store back into an override.
   */
  followsDefault: boolean('follows_default').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

/**
 * The one agent every store answers with until it writes its own — the row an operator edits for all
 * merchants at once, where the code constant could only ever reach stores created after the edit.
 * Read as a singleton (`order by created_at limit 1`) and created on first read, the same way the
 * per-business rows were: nothing in Postgres needs a constraint to keep one writer honest.
 */
export const defaultAgents = pgTable('default_agent', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull().default('Oryxa Sales Agent'),
  platformType: platformEnum('platform_type').notNull().default('facebook'),
  systemPrompt: text('system_prompt').notNull(),
  replyGuidance: text('reply_guidance'),
  commentReplyGuidance: text('comment_reply_guidance'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const channels = pgTable('channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Null on a platform channel: it belongs to the operator, not to any store. */
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }),
  platform: platformEnum('platform').notNull(),
  apiToken: text('api_token').notNull(),
  platformChannelId: varchar('platform_channel_id', { length: 255 }).notNull(),
  extraInfo: text('extra_info'),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  /**
   * True when the page is connected from the admin console and answers no customers: its DMs
   * only carry business notification codes. Null/false on a store's own channel.
   */
  isAdminOnly: boolean('is_admin_only'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  uniq: uniqueIndex('channels_business_platform_channel_idx').on(t.businessId, t.platform, t.platformChannelId),
  // One platform account, one live owner. Webhooks carry only the Page id, so two live rows
  // for the same Page would silently route one tenant's customers into another's inbox.
  liveUniq: uniqueIndex('channels_platform_channel_live_idx')
    .on(t.platform, t.platformChannelId)
    .where(sql`${t.deletedAt} is null`),
}));

/**
 * One notification code per business. The merchant sends it as a DM to the operator's page;
 * the webhook binds that Messenger account to this business, and every later notice is also
 * delivered there as a message. `token` is a uuid so it cannot be guessed and never repeats.
 */
export const messengerNotifications = pgTable('messenger_notification', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  token: uuid('token').defaultRandom().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  businessUniq: uniqueIndex('messenger_notification_business_uniq_idx').on(t.businessId),
  tokenUniq: uniqueIndex('messenger_notification_token_uniq_idx').on(t.token),
}));

/**
 * A Messenger account that redeemed a business's notification code. Many accounts may follow
 * one business, and one account may follow several businesses; the page it messaged is kept so
 * future notices are sent through the channel that answer is allowed to use.
 */
export const messengerNotificationUsers = pgTable('messenger_notification_user_info', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'cascade' }).notNull(),
  platformUserId: varchar('platform_user_id', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex('messenger_notification_user_business_platform_uniq_idx').on(t.businessId, t.platformUserId),
  businessIdx: index('messenger_notification_user_business_idx').on(t.businessId),
}));

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Official Channels conversations have no store behind them; the operator's own
  // accounts keep businessId NULL and every store query filters on its own channel ids.
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }),
  channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'cascade' }).notNull(),
  customerPlatformId: varchar('customer_platform_id', { length: 255 }).notNull(),
  customerName: varchar('customer_name', { length: 255 }),
  customerAvatar: varchar('customer_avatar', { length: 500 }),
  agentState: jsonb('agent_state').$type<ConversationAgentState>().default(sql`'{}'::jsonb`).notNull(),
  lastMessageState: messageStateEnum('last_message_state').default('done').notNull(),
  /** Tracks when lastMessageState last changed — used by the stale-runner watchdog. */
  lastStateAt: timestamp('last_state_at').defaultNow().notNull(),
  /** True after a human took the thread over: the agent must never answer it again. */
  aiPaused: boolean('ai_paused').default(false).notNull(),
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
  /**
   * B2 keys of the pictures the customer sent, in the order they arrived. A message with photos
   * still carries its text: the array records what the picture was, so the inbox can re-show it
   * and the agent can look at it again — Meta's own attachment URL goes stale within hours.
   */
  imageKeys: text('image_keys').array().notNull().default(sql`'{}'::text[]`),
  /**
   * Who actually composed a store-side row: 'ai' when the agent wrote it, 'human' when a
   * person sent it from a dashboard. Null on legacy rows — the inbox renders those plainly.
   */
  sentBy: varchar('sent_by', { length: 10 }),
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
  orders: many(orders),
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
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
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

export const messengerNotificationRelations = relations(messengerNotifications, ({ one, many }) => ({
  business: one(businesses, { fields: [messengerNotifications.businessId], references: [businesses.id] }),
  users: many(messengerNotificationUsers),
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

/**
 * One operator-editable rate card for the model the agent runs. The agent currently uses
 * one model at a time, so a single row is enough to price every rollup bucket; the provider
 * and model names are stored so the console says which deployment these rates belong to.
 */
export const modelBilling = pgTable('model_billing', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: varchar('provider', { length: 50 }).default('openai').notNull(),
  model: varchar('model', { length: 100 }).default('gpt-6-luna').notNull(),
  inputUsdPerMillion: numeric('input_usd_per_million', { precision: 12, scale: 6 }).default('0.150000').notNull(),
  outputUsdPerMillion: numeric('output_usd_per_million', { precision: 12, scale: 6 }).default('0.600000').notNull(),
  cachedInputUsdPerMillion: numeric('cached_input_usd_per_million', { precision: 12, scale: 6 }).default('0.075000').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  singletonUniq: uniqueIndex('model_billing_singleton_idx').on(sql`true`),
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

/**
 * One browser's FCM registration for one business. A device that manages two stores holds a row
 * per store (token unique inside the business), so each store's notices reach the same browser.
 * Dead tokens are removed by the sender when FCM reports them unregistered.
 */
export const pushTokens = pgTable('push_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }).notNull(),
  token: text('token').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex('push_tokens_business_token_uniq_idx').on(t.businessId, t.token),
  businessIdx: index('push_tokens_business_idx').on(t.businessId),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  business: one(businesses, { fields: [notifications.businessId], references: [businesses.id] }),
}));

export const planAssignmentsRelations = relations(planAssignments, ({ one }) => ({
  business: one(businesses, { fields: [planAssignments.businessId], references: [businesses.id] }),
  plan: one(plans, { fields: [planAssignments.planId], references: [plans.id], relationName: 'assignmentPlan' }),
  previousPlan: one(plans, { fields: [planAssignments.previousPlanId], references: [plans.id], relationName: 'previousPlan' }),
}));

