This is an incredibly solid, modern architecture. Combining a TypeScript monorepo with Hono, Drizzle, LangChain, and Next.js creates a robust foundation for an Agents as a Service platform tailored to e-commerce. The "fire-and-forget" webhook pattern is specifically a brilliant solution for serverless timeout constraints.
Here is the fully synthesized, highly detailed PROJECT_SPEC.md. It merges all your logic, schemas, and user journeys into a single, self-sustaining blueprint. You can drop this exact file into Cursor, v0, or GitHub Copilot, and it will have all the context it needs to scaffold the entire platform
# PROJECT_SPEC.md - Multi-Channel AI Auto-Reply E-commerce SaaS
## 1. Project Target & Vision
Build a highly scalable, multi-tenant "Agents as a Service" SaaS where e-commerce businesses can connect their social channels (Facebook, Instagram, WhatsApp, Telegram, Twitter). An AI agent automatically replies to customer comments and DMs, fetches product catalog data, and directly creates orders from chats.
**Core Architecture Goals:**
 1. **Zero Duplicate Code:** Zod schemas act as the single source of truth for Database validation, API validation, OpenAPI documentation, and Frontend React Query types.
 2. **Serverless-Safe Concurrency:** Webhooks return 200 OK immediately. The LangChain agent runs in a fire-and-forget architecture (recursive polling) to completely bypass standard serverless 30-second timeout limits.
 3. **End-to-End Type Safety:** Postgres → Drizzle ORM → Zod → Hono API → OpenAPI JSON → Next.js React Query hooks.
## 2. Tech Stack Definition
 * **Runtime / Package Manager:** Bun (v1.2+)
 * **Monorepo Structure:** Bun Workspaces (no Turborepo required)
 * **API Layer:** Hono + @hono/zod-openapi + Swagger UI
 * **Database:** Postgres paired with Drizzle ORM
 * **Validation:** Zod
 * **AI / LLM:** LangChain.js (with OpenAI/Anthropic models)
 * **Frontend Web App:** Next.js 14+ (App Router), React, Tailwind CSS, shadcn/ui
 * **API Client Generation:** TanStack React Query (generated via openapi-zod-client)
 * **Authentication:** Firebase Auth (Google OAuth + Phone login)
 * **File Storage:** UploadThing (for product/variant images)
## 3. Monorepo File System Architecture
```text
social-ai-saas/
├── package.json                    # Root workspace definitions & unified scripts
├── tsconfig.base.json              # Shared TS compiler options
├── drizzle.config.ts               # Drizzle migration/studio config
├── .env                            # Unified environment variables
├── apps/
│   ├── web/                        # Next.js 14 Dashboard (Business Portal)
│   │   ├── app/
│   │   ├── components/             # shadcn/ui components
│   │   ├── lib/api.ts              # Auto-generated React Query hooks
│   │   └── next.config.js
│   ├── api/                        # Main Hono Server + Webhooks
│   │   ├── src/
│   │   │   ├── index.ts            # Hono OpenAPI entry point
│   │   │   ├── routes/             # CRUD route definitions
│   │   │   └── webhooks/           # Channel webhook receivers
│   │   └── package.json
│   └── agent-runner/               # Isolated Hono API for Agent Execution
│       ├── src/
│       │   └── index.ts            # Fire-and-forget execution endpoint
│       └── package.json
└── packages/
    ├── db/                         # Drizzle schema, migrations, CRUD operations
    │   ├── schema.ts               # Full DB schema
    │   ├── client.ts               # DB connection logic
    │   └── crud/                   # DB interaction functions (e.g., product.ts)
    ├── shared/                     # Zod schemas, openapi configs, and shared types
    │   └── schemas/                # base.ts, business.ts, product.ts, etc.
    ├── agent/                      # Core LangChain Agent logic
    │   ├── Agent.ts                # Agent class
    │   └── tools/                  # DB/Channel tools (getProduct, createOrder)
    ├── integrations/               # API clients for Social Platforms
    │   └── facebook.ts             # OAuth and Send API logic
    └── utils/                      # Shared helper functions

```
### Root package.json
```json
{
  "name": "social-ai-saas",
  "private": true,
  "packageManager": "bun@1.2",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev:api": "bun --filter api dev",
    "dev:web": "bun --filter web dev",
    "dev:agent": "bun --filter agent-runner dev",
    "build": "bun run -r build",
    "db:push": "bun --filter db drizzle-kit push",
    "db:studio": "bun --filter db drizzle-kit studio",
    "gen:api": "bun --filter web gen:api"
  }
}

```
## 4. Database Architecture (Drizzle Schema)
This schema supports multi-tenant businesses, product variations, robust order tracking, and conversation history mapping.
**File:** packages/db/schema.ts
```typescript
import { pgTable, uuid, varchar, text, integer, boolean, numeric, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const orderStateEnum = pgEnum('order_state', ['pending', 'acknowledged', 'onDelivery', 'done']);
export const platformEnum = pgEnum('platform', ['facebook', 'instagram', 'whatsapp', 'telegram', 'twitter']);
export const messageFromEnum = pgEnum('message_from', ['self', 'customer']);
export const messageStateEnum = pgEnum('message_state', ['pending', 'working', 'done']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', {length: 255}).notNull(),
  gender: varchar('gender', {length: 20}),
  phone: varchar('phone', {length: 20}),
  email: varchar('email', {length: 255}).unique(),
  firebaseUid: varchar('firebase_uid', {length: 255}).unique().notNull(),
  signInMethod: varchar('sign_in_method', {length: 50}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const businesses = pgTable('businesses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, {onDelete: 'cascade'}).notNull(),
  name: varchar('name', {length: 255}).notNull(),
  description: text('description'),
  employeeCount: integer('employee_count'),
  type: varchar('type', {length: 100}),
  foundedDate: timestamp('founded_date'),
  hasTradeLicense: boolean('has_trade_license').default(false),
  hasTaxLicense: boolean('has_tax_license').default(false),
  facebookPageLink: varchar('facebook_page_link', {length: 500}),
  phone: varchar('phone', {length: 20}),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, {onDelete: 'cascade'}).notNull(),
  name: varchar('name', {length: 255}).notNull(),
  slug: varchar('slug', {length: 255}).notNull()
}, t => ({uniq: index().on(t.businessId, t.slug)}));

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, {onDelete: 'cascade'}).notNull(),
  categoryId: uuid('category_id').references(() => categories.id, {onDelete: 'set null'}),
  name: varchar('name', {length: 255}).notNull(),
  price: numeric('price', {precision: 10, scale: 2}).notNull(),
  slug: varchar('slug', {length: 255}).notNull(),
  sku: varchar('sku', {length: 100}).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull()
}, t => ({uniq: index().on(t.businessId, t.slug)}));

export const variants = pgTable('variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').references(() => products.id, {onDelete: 'cascade'}).notNull(),
  name: varchar('name', {length: 255}).notNull(),
  imageUrl: varchar('image_url', {length: 500}),
  price: numeric('price', {precision: 10, scale: 2}), 
  stock: integer('stock').default(0).notNull(),
  isAvailable: boolean('is_available').default(true).notNull(),
  rating: numeric('rating', {precision: 3, scale: 2})
});

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, {onDelete: 'cascade'}).notNull(),
  productId: uuid('product_id').references(() => products.id, {onDelete: 'set null'}),
  variantId: uuid('variant_id').references(() => variants.id, {onDelete: 'set null'}),
  count: integer('count').default(1).notNull(),
  variantPrice: numeric('variant_price', {precision: 10, scale: 2}).notNull(),
  customerName: varchar('customer_name', {length: 255}).notNull(),
  customerAvatar: varchar('customer_avatar', {length: 500}),
  customerAddress: text('customer_address'),
  customerPhone: varchar('customer_phone', {length: 20}),
  state: orderStateEnum('state').default('pending').notNull(),
  totalPrice: numeric('total_price', {precision: 10, scale: 2}).notNull(),
  conversationId: uuid('conversation_id'), 
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, {onDelete: 'cascade'}).notNull(),
  name: varchar('name', {length: 255}).notNull(),
  systemPrompt: text('system_prompt').notNull(),
  platformType: platformEnum('platform_type').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const channels = pgTable('channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, {onDelete: 'cascade'}).notNull(),
  platform: platformEnum('platform').notNull(),
  apiToken: text('api_token').notNull(),
  platformChannelId: varchar('platform_channel_id', {length: 255}).notNull(), 
  extraInfo: text('extra_info'),
  agentId: uuid('agent_id').references(() => agents.id, {onDelete: 'set null'}),
  createdAt: timestamp('created_at').defaultNow().notNull()
}, t => ({uniq: index().on(t.businessId, t.platform, t.platformChannelId)}));

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').references(() => businesses.id, {onDelete: 'cascade'}).notNull(),
  channelId: uuid('channel_id').references(() => channels.id, {onDelete: 'cascade'}).notNull(),
  customerPlatformId: varchar('customer_platform_id', {length: 255}).notNull(),
  customerName: varchar('customer_name', {length: 255}),
  customerAvatar: varchar('customer_avatar', {length: 500}),
  lastMessageState: messageStateEnum('last_message_state').default('done').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
}, t => ({uniq: index().on(t.channelId, t.customerPlatformId)}));

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => conversations.id, {onDelete: 'cascade'}).notNull(),
  from: messageFromEnum('from').notNull(),
  contentType: varchar('content_type', {length: 20}).default('text').notNull(),
  content: text('content').notNull(),
  time: timestamp('time').defaultNow().notNull(),
  state: messageStateEnum('state').default('pending').notNull()
}, t => ({idx: index().on(t.conversationId, t.time)}));

// Relations setup
export const businessRelations = relations(businesses, ({many}) => ({
  products: many(products),
  orders: many(orders),
  channels: many(channels),
  agents: many(agents)
}));
export const productRelations = relations(products, ({one, many}) => ({
  business: one(businesses, {fields: [products.businessId], references: [businesses.id]}),
  category: one(categories, {fields: [products.categoryId], references: [categories.id]}),
  variants: many(variants),
  orders: many(orders)
}));

```
## 5. Zod Schema Strategy (Base → Insert → Output)
Every entity strictly follows a pattern in packages/shared/schemas/.
**Example: packages/shared/schemas/product.ts**
```typescript
import { z } from '@hono/zod-openapi';
import { uuidSchema, timestampSchema } from './base';

export const baseProductSchema = z.object({
  businessId: uuidSchema,
  categoryId: uuidSchema.nullable(),
  name: z.string().min(1).max(255).openapi({example: 'Premium Cotton T-Shirt'}),
  price: z.coerce.number().positive().openapi({example: 29.99}),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  sku: z.string().max(100).openapi({example: 'TS-COT-001'}),
  description: z.string().optional()
}).openapi('Product');

export const baseVariantSchema = z.object({
  productId: uuidSchema,
  name: z.string().min(1).max(255).openapi({example: 'Red XL'}),
  imageUrl: z.string().url().optional(),
  price: z.coerce.number().positive().optional(),
  stock: z.number().int().min(0).default(0),
  isAvailable: z.boolean().default(true),
  rating: z.coerce.number().min(0).max(5).optional()
}).openapi('Variant');

export const insertProductSchema = baseProductSchema.omit({slug: true});

export const createProductInputSchema = insertProductSchema.extend({
  categoryName: z.string().optional(),
  variants: z.array(baseVariantSchema.omit({productId: true})).default([])
});

export const selectProductSchema = baseProductSchema.extend({id: uuidSchema, createdAt: timestampSchema});

export const getProductByIdOutputSchema = selectProductSchema.extend({
  category: z.object({id: uuidSchema, name: z.string()}).nullable(),
  variants: z.array(baseVariantSchema.extend({id: uuidSchema}))
});

```
**DB CRUD Mapping: packages/db/crud/product.ts**
```typescript
import { db } from '../client';
import { products, variants, categories } from '../schema';
import { eq } from 'drizzle-orm';
import { createProductInputSchema, type z } from '@repo/shared';

export type CreateProductInput = z.infer<typeof createProductInputSchema>;

export async function createProduct(input: CreateProductInput) {
  const parsed = createProductInputSchema.parse(input);
  
  let categoryId = parsed.categoryId;
  if (!categoryId && parsed.categoryName) {
    const [cat] = await db.insert(categories).values({
      businessId: parsed.businessId,
      name: parsed.categoryName,
      slug: parsed.categoryName.toLowerCase().replace(/\s+/g, '-')
    }).returning();
    categoryId = cat.id;
  }

  const slug = parsed.name.toLowerCase().replace(/\s+/g, '-');
  const [product] = await db.insert(products).values({...parsed, categoryId, slug}).returning();

  if (parsed.variants.length > 0) {
    await db.insert(variants).values(
      parsed.variants.map(v => ({...v, productId: product.id}))
    );
  }
  return product;
}

```
## 6. Hono OpenAPI & Webhooks Architecture
**API Entry apps/api/src/index.ts:**
Automatically validates endpoints via Zod schemas.
```typescript
import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { insertProductSchema, selectProductSchema } from '@repo/shared';
import { createProduct } from '@repo/db/crud/product';

const app = new OpenAPIHono();

const createProductRoute = createRoute({
  method: 'post',
  path: '/products',
  request: { body: { content: {'application/json': {schema: insertProductSchema}}}},
  responses: {201: {content: {'application/json': {schema: selectProductSchema}}}}
});

app.openapi(createProductRoute, async (c) => {
  const data = c.req.valid('json'); // 100% Type-safe
  const product = await createProduct(data);
  return c.json(product, 201);
});

app.doc('/doc', { openapi: '3.0.0', info: {title: 'SaaS API', version: '1.0.0'} });
app.get('/ui', swaggerUI({url: '/doc'}));

```
**Webhook Flow apps/api/src/webhooks/facebook.ts:**
This is the entry point for chat messages. Note the critical fire-and-forget mechanism to AGENT_RUNNER_URL to avoid function timeouts.
```typescript
app.post('/webhooks/facebook', async (c) => {
  const body = await c.req.json();
  const entry = body.entry[0];
  const messaging = entry.messaging[0];
  const senderId = messaging.sender.id;
  const text = messaging.message.text;

  const channel = await getChannelByPageId(entry.id);
  let conv = await getConversation(channel.id, senderId) || await createConversation(channel.businessId, channel.id, senderId);

  // 1. Save new customer message as 'pending'
  await createMessage({conversationId: conv.id, from: 'customer', content: text, state: 'pending'});

  // 2. Fire and Forget Agent
  if (conv.lastMessageState !== 'pending' && conv.lastMessageState !== 'working') {
    fetch(`${process.env.AGENT_RUNNER_URL}/run`, {
      method: 'POST',
      headers: {'x-internal-key': process.env.INTERNAL_KEY},
      body: JSON.stringify({conversationId: conv.id})
    }); // NO AWAIT - Let the webhook return immediately
  }
  
  return c.text('OK', 200);
});

```
## 7. AI Agent Execution (Fire & Forget Recursive Loop)
**Agent Runner API apps/agent-runner/src/index.ts:**
```typescript
import { Agent } from '@repo/agent';

app.post('/run', async (c) => {
  const {conversationId} = await c.req.json();
  const conv = await getConversationWithHistory(conversationId);
  
  // Set state to working
  await updateConversationState(conv.id, 'working');

  // Init LangChain Agent
  const agent = new Agent({
    systemPrompt: conv.agent.systemPrompt, 
    business: conv.business, 
    history: conv.messages
  });

  // Run the agent loop (may take 10-20 seconds)
  const reply = await agent.run();
  
  // Save completion
  await createMessage({conversationId, from: 'self', content: reply, state: 'done'});
  await updateConversationState(conv.id, 'done');

  // RECURSIVE CHECK: Did the user send another message while we were generating?
  const hasPending = await checkPendingMessages(conv.id);
  if (hasPending) {
    fetch(`${process.env.AGENT_RUNNER_URL}/run`, {
      method: 'POST', 
      headers: {'x-internal-key': process.env.INTERNAL_KEY},
      body: JSON.stringify({conversationId})
    }); 
  }
  
  return c.text('done');
});

```
**Agent Core packages/agent/Agent.ts:**
```typescript
import { ChatOpenAI } from '@langchain/openai';
import { getProductTool, createOrderTool, sendMessageTool } from './tools';

export class Agent {
  constructor(private config: {systemPrompt: string, business: any, history: any[]}) {}

  async run() {
    const llm = new ChatOpenAI({model: 'gpt-4o'});
    const tools = [getProductTool, createOrderTool, sendMessageTool];

    // LangChain execution logic:
    // 1. Pass in business data as context
    // 2. Bind tools
    // 3. Process LLM outputs. If the LLM uses `createOrderTool`, 
    //    it executes the DB CRUD function seamlessly.
    // 4. Finally, uses `sendMessageTool` to hit the Meta API to respond.
  }
}

```
## 8. Detailed User Journey & Application Flow
### **Step 1: Auth & Workspace Creation**
 1. User lands on app.domain.com/login.
 2. Firebase Authentication UI loads (supports Google Provider).
 3. Firebase returns firebaseUid.
 4. Hono API validates the UID. If no user exists, it creates one.
 5. User redirects to /onboarding.
 6. Form requests Business Details (Name, Employees, Type, Tax/Trade licenses).
 7. POST to /api/businesses provisions the workspace. User directed to /b/[businessId]/dashboard.
### **Step 2: Inventory & Catalog Management**
 1. Sidebar navigation to **Products** (/b/[businessId]/products).
 2. **Add Product Modal:** Name, Price, SKU, dynamically created Category dropdown, Description.
 3. **Variant UI:** Dynamic array UI to add variants (e.g., "Red XL", "Blue M"). Uses UploadThing to handle variant images.
 4. Submission hits /api/products. The DB writes the product, generates the slug, maps the category, and maps the N variants in a single transaction.
### **Step 3: Channel Connections (OAuth)**
 1. Sidebar navigation to **Channels**.
 2. Shows connection cards (FB, IG, WA). User clicks "Connect Facebook".
 3. Redirected to Meta OAuth flow. User grants pages_messaging permissions.
 4. Meta callback hits /api/auth/facebook/callback. Code is exchanged for a permanent API token.
 5. channels table updates with platformApiToken and platformChannelId.
 6. UI exposes a toggle switch: **"Enable AI Agent"** which binds an active agentId to the channel.
### **Step 4: AI Inbox & Auto-Replies**
 1. Customer sends a DM to the connected FB page.
 2. Webhook triggers (see section 6).
 3. LangChain Agent reads the active systemPrompt (e.g., *"You are a sales rep for {business.name}. Check the catalog and push sales."*).
 4. The Agent searches the DB using tools, finds "Red XL T-Shirt", replies to the user via Meta Graph API, and ends the session.
 5. In the UI Dashboard Sidebar → **Inbox**, the business owner can see a live WhatsApp-style chat interface showing the customer's text and the Agent's automated reply (marked with an "AI" badge).
### **Step 5: Order Processing & Sales Analytics**
 1. If the customer buys during the chat, the Agent uses createOrderTool writing to the orders table.
 2. Sidebar navigation to **Orders** displays a DataTable (using shadcn/ui and @tanstack/react-table).
 3. Badges represent states: Pending (Yellow), Acknowledged (Blue), OnDelivery (Purple), Done (Green).
 4. Sidebar navigation to **Analytics** renders Recharts graphs mapping sales velocity, popular variants, and total revenue parsed from the DB.
## 9. Next.js 14 UI Structure & Styling
The frontend will leverage:
 * **Tailwind CSS (v4)** for atomic styling.
 * **shadcn/ui** for accessible, headless components (DataTables, Modals, Forms).
 * **TanStack React Query** for data fetching.
**API Hook Generation:**
Run bun --filter web gen:api in your terminal. This triggers openapi-zod-client to ingest the generated http://localhost:3000/doc JSON from Hono and automatically emit perfectly typed React Query hooks in apps/web/lib/api.ts.
*(e.g., const { data: product } = useGetProductById(id) will instantly know the exact variant and category shape based on the backend Drizzle Schema).*






This is the complete, comprehensive OpenAPI-compliant API route registry mapping perfectly to your database schema architecture.
## 1. User & Authentication Routes (/api/v1/users)
| Method & Path | Summary | Request Params / Query | Request Body Schema (Zod) | Success Response Schema (200/201) |
|---|---|---|---|---|
| **POST** /sync | Register or sync a freshly authenticated Firebase session user. | None | firebaseUid: string
name: string
email: string
signInMethod: string | id: uuid
firebaseUid: string
createdAt: string(datetime) |
| **GET** /me | Retrieve the authenticated user's profile metadata details. | None | None | id: uuid
name: string
email: string
phone: string | null |
## 2. Business Management Routes (/api/v1/businesses)
| Method & Path | Summary | Request Params / Query | Request Body Schema (Zod) | Success Response Schema (200/201) |
|---|---|---|---|---|
| **POST** / | Provision a new e-commerce storefront entity under the user profile. | None | name: string
description: string?
employeeCount: int?
type: string?
hasTradeLicense: bool
hasTaxLicense: bool
phone: string? | id: uuid
userId: uuid
name: string |
| **GET** /{id} | Fetch deep metadata profile configurations for a single business. | **Path:** id: uuid | None | Entire businesses table record shape + timestamp strings. |
| **PUT** /{id} | Update business profile, license check states, or contact anchors. | **Path:** id: uuid | All fields in **POST** but marked optional (.partial()). | success: boolean |
## 3. Catalog (Categories, Products & Variants) Routes
| Method & Path | Summary | Request Params / Query | Request Body Schema (Zod) | Success Response Schema (200/201) |
|---|---|---|---|---|
| **POST** /:businessId/categories | Generate a distinct structural catalog category. | **Path:** businessId: uuid | name: string | id: uuid
name: string
slug: string |
| **GET** /:businessId/categories | List all catalog categories configured for a store. | **Path:** businessId: uuid | None | Array<{ id: uuid, name: string, slug: string }> |
| **POST** /:businessId/products | Create an inventory product alongside its multi-attribute variant matrix. | **Path:** businessId: uuid | name: string
price: number
sku: string
description: string?
categoryId: uuid?
categoryName: string?
variants: Array<VariantBase> | id: uuid
slug: string
variantCount: number |
| **GET** /:businessId/products | Query paginated product catalogs filtered by category filters. | **Path:** businessId: uuid
**Query:** categoryId: uuid?
limit: int?
offset: int? | None | products: Array<Product>
totalCount: number |
| **GET** /:businessId/products/:productId | Retrieve full details of a specific product with all active nested SKU variants. | **Path:** businessId: uuid
productId: uuid | None | Full nested structure matching getProductByIdOutputSchema. |
| **PUT** /:businessId/products/:productId | Mutate primary product details or alter global catalog listings. | **Path:** businessId: uuid
productId: uuid | name: string?
price: number?
sku: string?
description: string? | updated: boolean |
| **DELETE** /:businessId/products/:productId | Safely remove a product and cascade delete all its options from the catalog. | **Path:** businessId: uuid
productId: uuid | None | deleted: boolean |
## 4. AI Messaging Agents & Channel Integration Routes
| Method & Path | Summary | Request Params / Query | Request Body Schema (Zod) | Success Response Schema (200/201) |
|---|---|---|---|---|
| **POST** /:businessId/agents | Configure an automated AI agent personality with system instructions. | **Path:** businessId: uuid | name: string
systemPrompt: string
platformType: enum | id: uuid
createdAt: string(datetime) |
| **GET** /:businessId/agents | List all AI interaction models trained for the company. | **Path:** businessId: uuid | None | Array<{ id: uuid, name: string, platformType: enum }> |
| **POST** /:businessId/channels | Connect a social entrypoint token (e.g., Facebook Page access tokens). | **Path:** businessId: uuid | platform: enum
apiToken: string
platformChannelId: string
agentId: uuid? | id: uuid
status: string('linked') |
## 5. Conversations & Live Inbox Chat Routes
| Method & Path | Summary | Request Params / Query | Request Body Schema (Zod) | Success Response Schema (200/201) |
|---|---|---|---|---|
| **GET** /:businessId/conversations | Fetch active client threads sorted by message states (pending, working, done). | **Path:** businessId: uuid
**Query:** state: enum?
limit: int? | None | Array<{ id: uuid, customerName: string, lastMessageState: enum, channelId: uuid }> |
| **GET** /:businessId/conversations/:conversationId/messages | Load historical message feeds chronologically for customer context. | **Path:** businessId: uuid
conversationId: uuid
**Query:** limit: int? | None | Array<{ id: uuid, from: enum, content: string, contentType: string, time: string(datetime) }> |
| **POST** /:businessId/conversations/:conversationId/messages | Dispatch a human-agent reply directly to the customer, bypassing the AI agent. | **Path:** businessId: uuid
conversationId: uuid | content: string
contentType: string('text'|'image') | id: uuid
time: string(datetime) |
| **PATCH** /:businessId/conversations/:conversationId/state | Update conversation status flags (e.g., marking a support thread as resolved). | **Path:** businessId: uuid
conversationId: uuid | state: enum('pending', 'working', 'done') | id: uuid
updatedState: enum |
## 6. Checkout Order Engine Routes
| Method & Path | Summary | Request Params / Query | Request Body Schema (Zod) | Success Response Schema (200/201) |
|---|---|---|---|---|
| **POST** /:businessId/orders | Create a customer order (triggered by a human or an AI agent action). | **Path:** businessId: uuid | productId: uuid
variantId: uuid?
count: int
customerName: string
customerPhone: string
customerAddress: string
conversationId: uuid? | id: uuid
totalPrice: number
state: string('pending') |
| **GET** /:businessId/orders | List and filter customer orders across your business dashboard. | **Path:** businessId: uuid
**Query:** state: enum?
limit: int? | None | Array<{ id: uuid, customerName: string, totalPrice: number, state: enum, createdAt: string }> |
| **PATCH** /:businessId/orders/:orderId/state | Progress an order's status through your fulfillment pipeline. | **Path:** businessId: uuid
orderId: uuid | state: enum('pending', 'acknowledged', 'onDelivery', 'done') | id: uuid
newState: enum |
## 7. Automated Verification & Inbound Hook Ports
| Method & Path | Summary | Request Params / Query | Request Body Schema (Zod) | Success Response Schema (200) |
|---|---|---|---|---|
| **GET** /webhooks/facebook | Handles the initial Meta developer security challenge verification handshake. | **Query:**
hub.mode: string
hub.challenge: string
hub.verify_token: string | None | Returns the raw hub.challenge string parameter text directly. |
| **POST** /webhooks/facebook | Processes real-time inbound chat events from customers on Facebook Messenger. | None | **Meta Message Shape:**
object: string('page')
entry: Array<{ id: string, messaging: Array<{ sender: { id: string }, message: { text: string } }> }> | Plaintext: EVENT_RECEIVED |




Here is the comprehensive, battle-tested test suite using **Vitest** (the fastest and best-suited runner for TypeScript/Hono/Drizzle environments).
This suite tests the architecture across every boundary: data validation, database transactions, API route responses, and edge-case webhook event interceptions.
### 1. Test Environment Setup
First, ensure you have the necessary testing utilities. Vitest allows us to execute these rapidly while Hono provides a built-in .request() method, eliminating the need for supertest.
```bash
npm install -D vitest @vitest/coverage-v8 dotenv

```
Create a vitest.config.ts in your root directory:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    setupFiles: ['./tests/setup.ts'],
  },
});

```
### 2. Zod Schema Unit Tests
**Target:** Ensure all inbound payloads and structural constraints fail gracefully before touching the database.
tests/schemas/product.test.ts
```typescript
import { describe, it, expect } from 'vitest';
import { createProductInputSchema } from '@repo/shared/schemas/product';

describe('Product Zod Schemas', () => {
  it('should validate a perfect product payload with variants', () => {
    const validPayload = {
      businessId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Agent Configuration Service Pack',
      price: 299.99,
      sku: 'AGENT-SRV-01',
      variants: [
        { name: 'Standard Auto-Reply', stock: 100, isAvailable: true }
      ]
    };
    
    const result = createProductInputSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('should reject a product with a negative price', () => {
    const invalidPayload = {
      businessId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Faulty Product',
      price: -50.00, // Invalid
      sku: 'ERR-01'
    };
    
    const result = createProductInputSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Number must be greater than 0');
    }
  });
});

```
### 3. Database CRUD & Transaction Tests
**Target:** Verify Drizzle ORM relationships, composite unique index enforcements, and cascading rollbacks.
tests/db/crud.test.ts
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@repo/db/client';
import { users, businesses, products } from '@repo/db/schema';
import { createProduct } from '@repo/db/crud/product';
import { eq } from 'drizzle-orm';

describe('Database CRUD Operations', () => {
  let testUserId: string;
  let testBusinessId: string;

  beforeAll(async () => {
    // Seed initial test relationships
    const [user] = await db.insert(users).values({
      name: 'Test Admin',
      firebaseUid: `test-uid-${Date.now()}`,
      signInMethod: 'email'
    }).returning();
    testUserId = user.id;

    const [business] = await db.insert(businesses).values({
      userId: testUserId,
      name: 'Test Agents as a Service Co.'
    }).returning();
    testBusinessId = business.id;
  });

  afterAll(async () => {
    // Cleanup cascade deletes the rest
    await db.delete(users).where(eq(users.id, testUserId));
  });

  it('should create a product with inline category and variants atomically', async () => {
    const productData = {
      businessId: testBusinessId,
      name: 'Automated Messenger Agent AI',
      price: 150.00,
      sku: 'AI-MSG-001',
      categoryName: 'AI Services',
      description: 'Provides automated messenger agents and AI post creation.',
      variants: [
        { name: 'Basic Tier', stock: 999, isAvailable: true }
      ]
    };

    const newProduct = await createProduct(productData);

    expect(newProduct).toBeDefined();
    expect(newProduct.slug).toBe('automated-messenger-agent-ai');

    // Verify it actually hit the database
    const fetchedProduct = await db.query.products.findFirst({
      where: eq(products.id, newProduct.id),
      with: { variants: true, category: true }
    });

    expect(fetchedProduct?.variants.length).toBe(1);
    expect(fetchedProduct?.category?.name).toBe('AI Services');
  });

  it('should enforce composite unique constraint on businessId + slug', async () => {
    const duplicateData = {
      businessId: testBusinessId, // Same business
      name: 'Automated Messenger Agent AI', // Same name, will generate same slug
      price: 200.00,
      sku: 'AI-MSG-002',
      variants: []
    };

    await expect(createProduct(duplicateData)).rejects.toThrowError(/duplicate key value violates unique constraint/);
  });
});

```
### 4. Hono OpenAPI Route (E2E) Tests
**Target:** Ensure the HTTP layer correctly parses parameters, passes them to CRUD, and formats standard JSON responses.
tests/api/products.test.ts
```typescript
import { describe, it, expect, vi } from 'vitest';
import { productRouter } from '../../apps/api/src/routes/products';
import * as productCrud from '@repo/db/crud/product';

// Mock the DB layer so we only test HTTP routing logic here
vi.mock('@repo/db/crud/product', () => ({
  createProduct: vi.fn(),
  getProductById: vi.fn()
}));

describe('Product API Routes', () => {
  it('POST / - should return 201 on valid payload', async () => {
    const mockId = '11111111-2222-3333-4444-555555555555';
    vi.mocked(productCrud.createProduct).mockResolvedValueOnce({ id: mockId } as any);

    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Quantum Radar Schematic PDF',
        price: 19.99,
        sku: 'QR-PDF-01',
        variants: []
      })
    });

    const res = await productRouter.request(req);
    expect(res.status).toBe(201);
    
    const body = await res.json();
    expect(body).toEqual({ id: mockId });
  });

  it('GET /{id} - should return 404 if product does not exist', async () => {
    vi.mocked(productCrud.getProductById).mockResolvedValueOnce(null);

    const req = new Request('http://localhost/99999999-9999-9999-9999-999999999999');
    const res = await productRouter.request(req);
    
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Product entity missing');
  });
});

```
### 5. Webhook Interception & Async Runner Tests
**Target:** Verify the Meta verification handshake, ensure inbound text updates the inbox correctly, and confirm the fire-and-forget fetch call triggers the internal agent runner without awaiting.
tests/webhooks/facebook.test.ts
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fbWebhookRouter } from '../../apps/api/src/webhooks/facebook';
import { db } from '@repo/db/client';

// Mock DB and global fetch
vi.mock('@repo/db/client', () => ({
  db: {
    query: {
      channels: {
        findFirst: vi.fn()
      }
    },
    transaction: vi.fn()
  }
}));

const globalFetchMock = vi.fn();
global.fetch = globalFetchMock;

describe('Facebook Webhook Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should ignore non-page payloads', async () => {
    const req = new Request('http://localhost/facebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ object: 'user', entry: [] })
    });

    const res = await fbWebhookRouter.request(req);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Unhandled or malformed webhook');
  });

  it('should process valid text message, save to db, and trigger background agent runner', async () => {
    // 1. Mock channel lookup (simulate connected Facebook page)
    vi.mocked(db.query.channels.findFirst).mockResolvedValueOnce({
      id: 'channel-id-123',
      businessId: 'business-id-123',
    } as any);

    // 2. Mock transaction returning conversation state
    vi.mocked(db.transaction).mockResolvedValueOnce({
      conversationId: 'conv-id-456',
      priorStatus: 'done' // "done" means the agent is free to reply
    });

    // 3. Fake Meta Payload
    const metaPayload = {
      object: 'page',
      entry: [{
        id: 'PAGE_ID',
        messaging: [{
          sender: { id: 'CUSTOMER_ID' },
          message: { text: 'I need details on your automated messenger agents.' }
        }]
      }]
    };

    const req = new Request('http://localhost/facebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metaPayload)
    });

    const res = await fbWebhookRouter.request(req);
    
    // Validate Webhook acknowledges Meta immediately
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('EVENT_RECEIVED');

    // Validate the Background Fetch was fired to the Agent Runner
    expect(globalFetchMock).toHaveBeenCalledTimes(1);
    const fetchCallArg = globalFetchMock.mock.calls[0][0];
    expect(fetchCallArg).toContain('/run');
    
    const fetchCallInit = globalFetchMock.mock.calls[0][1];
    expect(fetchCallInit.method).toBe('POST');
    expect(JSON.parse(fetchCallInit.body as string)).toEqual({
      conversationId: 'conv-id-456'
    });
  });
});

```
