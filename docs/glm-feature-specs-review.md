# GLM-5.3 (Z Code) — OnlyOrders feature specs and code review
_Extracted 2026-10-22 from Z Code session transcript (final answer). Secret scan: clean._

All research is done — I read the schema and agent tooling myself and had three deep-dive reviews covering the API routes, the web inbox/orders/checkout UI, and the webhook→agent pipeline, with the top findings verified against source. Here is the full deliverable.

---

# OnlyOrders review — F01/F04/F06 specs, data model + API contracts, top risks

**Context.** OnlyOrders (repo `oryxa`) is the monorepo backend for the public marketing SPA: Hono API + Drizzle/Postgres, Next.js merchant dashboard, LangGraph/Gemini sales agent answering Messenger (FB + IG) via webhooks. Today it already has a basic 3-pane inbox, a single-line-order model (`orders` = one product × count), an agent that collects address as chat text via `create_order`, and a public storefront checkout. The specs below build on that base, not on AiPraktor's.

---

## F01 — Omnichannel Inbox ("Supervision inbox")

**Original angle.** AiPraktor's inbox is a manual support queue (All/Mine/Later/Unread tabs, Done/Snooze/Assign). OnlyOrders' product premise is that the AI *is* the agent, so the inbox is designed as a **supervision surface**: the default state is "AI is handling it", and the primary queue is **Escalated** — conversations where the agent explicitly asked for a human (the `report_human_intervene` tool already exists at `packages/agent/tools/index.ts:1622`). No manual "Done" bookkeeping: queues are derived from real signals (escalation flag, agent run state, unread replies).

### Screens & components

**Screen 1 — Inbox** `/b/{businessId}/inbox` (exists, restructured)

| Zone | Components | Behavior |
|---|---|---|
| Topbar | `QueueTabs`, `ChannelChips`, `SearchBox` | Queues with live counts: **Escalated** (needsHuman), **AI Working** (lastMessageState=working), **Watching** (AI replied, unread reply since), **Closed**. ChannelChips from `channels.platform` enum (facebook, instagram, whatsapp, telegram…). Server-side search (name, phone, platform id) |
| Left rail (≥lg) | `ConversationRow` ×N | Avatar/initials, name, channel dot, relative time, snippet, badges: unread count, `🤖` on AI-sent last reply, **order chip** (live state pill) when an order/checkout is in flight, hold clock. Multi-select for bulk close/assign |
| Center | `ThreadTimeline`, `HandoffBanner`, `Composer` | Unified bubble timeline with attribution ("AI" vs agent name — needs new `messages.sentBy`). HandoffBanner pins the escalation reason with two actions: *Reply (AI stays off)* and *Resume AI*. Composer: **Reply** (human send pauses the agent for this thread) and **Internal note** (never sent to customer, `contentType:'note'`) |
| Right rail (≥xl) | `CustomerCard`, `OrdersMiniList`, `LiveDraftCard`, `AgentActivity` | Customer profile (links to existing customer page), recent orders with pills, active F04 checkout session ("Cart built by AI — ৳1,450, awaiting confirm"), "AI replied 3× today" |

**Screen 2 — Customer drawer** — reuses `/b/{businessId}/customers/[customerId]`; opened from CustomerCard. Cross-channel history comes from the company-scoped `customers` table (already the identity spine).

### States
- **Loading:** 3-pane skeleton matching the real layout (the current `SplitPaneSkeleton` renders 2 panes, `apps/web/components/skeletons.tsx:93`).
- **Empty — no channels connected:** existing "Connect your Facebook Page" CTA.
- **Empty — queue tab:** per-tab copy; Escalated empty is a *positive* state ("The AI has everything — 12 replies sent today"), not a dead end.
- **Error:** fetch failure shows a banner with **Retry** — never masked as "No conversations" (today `listConversations(...).catch(() => [])` at `inbox/page.tsx:43` renders the empty state during an API outage).
- **Sending:** optimistic bubble with "sending…" → "✓ sent"; failure keeps the text in the composer and offers retry on the bubble.
- **New inbound while scrolled up:** "2 new messages ↓" jump bar; auto-scroll only when already at bottom.

### Mobile (< lg)
Single pane, three levels: queue list → full-screen thread (sticky header: back, name, channel icon; collapsible "Customer" bottom-sheet carries the right rail) → drawer pages. QueueTabs become horizontally scrollable chips; composer sticky above the keyboard; list rows get swipe actions (swipe right = read/unread, left = claim). Poll for updates on `visibilitychange` + every 30 s while visible (FCM push already exists but only shows a notification, `apps/web/lib/push-client.ts:44` — it should also trigger refresh).

### Data model
```
business_members(id, businessId→businesses, userId→users, role 'owner'|'manager'|'agent',
                 createdAt, unique(businessId,userId))
conversations  + assigneeUserId uuid null →users
                + unreadCount int default 0
                + lastReadAt timestamptz null
                + holdUntil timestamptz null            -- "waiting on courier/customer"
                + needsHuman bool default false          -- set by report_human_intervene,
                                                           cleared by human reply or Resume AI
messages        + sentBy varchar null                    -- 'ai' | member uuid, for self messages
                contentType extended: 'note' | 'card'
index conversations(businessId, needsHuman, lastMessageState), (assigneeUserId)
```
Note: triage lives in **new columns**, deliberately *not* in `lastMessageState`, which is the agent-runner lock semantic (overloading it is an existing bug — see Risks #4).

### API contract (all `Authorization: Bearer <idToken>` + ownership-or-membership)
```
GET /api/v1/{bid}/inbox/conversations?queue=escalated|ai_working|watching|closed|all
                              &channel=&q=&assignee=me|unassigned|<uuid>&cursor=&limit=20
  200 { items:[{ id, channel, customerName, unreadCount, needsHuman, holdUntil,
                 assignee:{id,name}|null, lastMessage:{snippet,from,at},
                 lastOrder:{id,state,totalPrice}|null }], nextCursor }
GET  /api/v1/{bid}/inbox/conversations/{id}
  200 { conversation, messages[], customer, orders[], activeCheckout:{sessionId,total}|null }
POST /api/v1/{bid}/inbox/conversations/{id}/read      {lastMessageId}   → 200 {unreadCount:0}
POST /api/v1/{bid}/inbox/conversations/{id}/assign    {assigneeUserId|null} → 200 {assignee}
POST /api/v1/{bid}/inbox/conversations/{id}/hold      {until|null, reason?} → 200 {holdUntil}
POST /api/v1/{bid}/inbox/conversations/{id}/ai        {enabled:boolean}    → 200 {aiEnabled}
POST /api/v1/{bid}/conversations/{id}/messages        (existing, + {asNote?}) → 201 {id,time,sentBy}
GET  /api/v1/{bid}/inbox/updates?since=<iso>          → 200 {changedConversationIds[], serverTime}
```
The last endpoint is the polling delta (SSE is impractical on Vercel); the existing send endpoint must stop blanket-writing `state:'done'` (currently `conversations.ts:151`) and only release the runner lock when no run is active.

---

## F04 — In-chat checkout ("AI-assembled cart" checkout sheet)

**Original angle.** AiPraktor opens a generic storefront webview where the customer re-browses. OnlyOrders inverts it: **the checkout opens pre-filled with the exact cart the AI just built in chat** — the customer confirms, they don't re-shop. Phone/name are prefilled from the conversation and remembered on the customer record; delivery is quoted as a *date range* from merchant-defined zones (Dhaka inside/outside), not a date picker; payment is COD/bKash/Nagad chips (no gateway). Loop closes in-channel: confirming auto-posts a receipt card back into the thread.

**Flow.** Agent offers "Review & confirm" → new agent tool `open_checkout(items)` creates a server-priced session → customer taps a **URL button** (today every button is `postback`, `packages/integrations/facebook.ts:354` — this adds the one URL-button type) → opens `/c/{token}` in Messenger's in-app browser.

### Screen — `/c/[token]` (mobile-first single column)
Three accordion sections that lock as each completes, sticky footer with running total:

1. **Items** — from the session (server-priced): thumbnail, name, variant label, unit price, qty stepper (capped at live stock), remove. 
2. **Delivery** — radio cards of delivery options ("Inside Dhaka ৳60 · arrives Oct 24–25"), address textarea, phone (`inputMode=tel`, BD format `01XXXXXXXXX` validated). 
3. **Payment & coupon** — method chips (COD default, bKash, Nagad — from business config), coupon input with Apply.

Footer: `Items ৳1,390 + Delivery ৳60 − Coupon ৳100 = ৳1,350` → **Confirm order**.

**Success screen:** full-screen receipt — order number, line summary, ETA, "Track order" link (F06 track page), and "We'll message you here with updates" (the receipt card is simultaneously posted into the chat by the server).

### States
- **Loading:** section skeletons while `GET /checkout/{token}`.
- **Expired** (24 h TTL → `410`): "This cart expired" + "Ask the store to resend" deep-link back to the chat.
- **Stock changed while open:** stepper capped with "Only 2 left"; removed item → struck-through row "No longer available" with suggested remove; totals re-price live.
- **Coupon:** applied → green `−৳100` chip; invalid → inline "Code not valid" under the field.
- **Confirm:** spinner + double-submit guard via idempotency key; server creates all line-orders **transactionally** (all-or-nothing — fixing today's partial-cart behavior, see Risks #2).
- **Error:** banner + Retry, form contents preserved.
- **Success:** receipt (above) + posted-to-chat confirmation.

### Mobile
It *is* the mobile layout: opens inside Messenger's browser — single column, 44 px targets, sticky footer, numeric keypad for phone, zero hover dependencies, <100 KB of page JS.

### Data model
```
checkout_sessions(id, businessId→, conversationId null, customerPlatformId null,
                  status 'draft'|'open'|'confirmed'|'expired',
                  items jsonb        -- server-priced snapshot [{productId, variantId, name,
                                     --   variantLabel, unitPrice, quantity, imageUrl}]; stock
                                     --   re-checked live, never trusted from client
                  deliveryOptionId null, couponCode null,
                  itemsTotal numeric, deliveryTotal numeric, discountTotal numeric,
                  expiresAt, confirmedAt, createdAt)
delivery_options(id, businessId→, name, price numeric, etaMinDays, etaMaxDays, position, active)
coupons(id, businessId→, code, kind 'percent'|'fixed', value numeric, minSubtotal null,
        maxRedemptions null, timesRedeemed int, startsAt null, endsAt null, active,
        unique(businessId, code))
orders + checkoutSessionId uuid null, deliveryOptionId null,
        couponDiscount numeric default 0, courier varchar null, trackingNumber varchar null,
        trackToken uuid default gen            -- reused by F06 public tracking
-- URL token = HMAC(sessionId, server secret); no DB token row, instant expiry check
```

### API contract (public; the signed token *is* the credential; per-IP+slug rate limit)
```
POST /api/v1/store/{slug}/checkout-sessions          (called by agent tool or storefront)
  req  { items:[{productId, variantId?, quantity}], conversationId?, customerPlatformId? }
  201  { sessionId, url:"https://…/c/<token>", expiresAt, summary:{ itemsTotal } }
  400  { code:'STOCK', productId, available }

GET   /api/v1/checkout/{token}
  200  { status, items:[{…, available, livePrice}], deliveryOptions:[…],
         prefill:{name, phone?, address?}, totals }
  410  { reason:'expired' }   404 unknown

PATCH /api/v1/checkout/{token}   { deliveryOptionId?, couponCode?, items?:[{productId,variantId?,quantity}] }
  200  { totals }                       -- server re-prices everything
  409  { code:'STOCK', itemId }   400 { code:'COUPON_INVALID' }   410 expired

POST  /api/v1/checkout/{token}/confirm
  req  { customerName, phone, address?, paymentMethod, idempotencyKey }
  201  { orderGroupId, orders:[{id, orderNo}], total, trackUrl }
       -- transactional: all lines or none; receipt card auto-posted to the conversation
  409  { code:'STOCK'|'EXPIRED' }        200-on-retry { code:'DUPLICATE', original result }
```
`create_order` (chat text collection of address/shipping) stays for quick single-line orders; `open_checkout` becomes the preferred path for multi-item or address-bearing orders.

---

## F06 — Order management ("Order Desk")

**Original angle.** AiPraktor shows a flat list with pills. OnlyOrders: a **pipeline workspace where every transition is a communication** — moving an order forward asks "Notify customer?" (default on) and sends the update in the chat thread the order came from, and each move is journaled in an append-only event log shown as the order's timeline. It also models BD courier reality (Steadfast/Pathao consignment fields + public tracking page), and introduces **`cancelled` as a real state** so merchants stop using delete-as-cancel.

### Screens & components

**Screen 1 — Orders** `/b/{businessId}/orders` (existing workspace, restructured)
- Left: filter tabs `Pending · Confirmed · On delivery · Delivered · Cancelled` + search (customer/orderNo/phone) + date range; list rows with `#`-prefixed order number, customer, `৳` amount, StatePill, source chip (`AI chat` / `Storefront` / `Manual`).
- Right: detail drawer (below). View toggle **List | Board** (board = 5 columns; desktop only).
- `BulkActionBar` appears on multi-select: advance, cancel, export CSV (csv lib already exists).

**Screen 2 — Detail drawer** — header (order #, StatePill, source chip, created), then:
- `StageStepper` `Placed → Confirmed → On delivery → Delivered` — tap a stage or use Advance/Revert; each move opens a small **transition popover**: target state, `Notify customer` toggle, optional note.
- `EventTimeline` — from `order_events` (who moved it, when, whether the customer was notified).
- Customer block (name, phone, address, link to chat), item block (image, variant, qty, unit price), money block: `Items + Delivery − Discount = Total`, always ৳.
- `CourierFields` — courier select + consignment number, with its own notify toggle.
- Actions: Edit (qty locked after `pending`, fixing nothing but consistent with today's rule), Cancel (confirm dialog that states the restock consequence), Print packing slip.

**Screen 3 — Public tracking** `/t/{token}` — no login, linked from the "Track order" button the agent receipt already renders (`tools/index.ts:853-889`): state timeline, courier + consignment, ETA. No address or phone exposed.

**Screen 4 — New manual order** — existing form + delivery-option select and payment chips.

### States
- **Loading:** skeleton per pane (list, drawer).
- **Empty:** per filter ("No pending orders — all caught up"); zero orders at all → "Orders appear here when customers buy via chat or your storefront."
- **Error:** banner + Retry; a failed transition keeps the drawer open with the popover error.
- **Rejected transition:** toast "Can't move Delivered → Pending" listing allowed moves (mirrors the 422 below).
- **Success:** `role="status"` toast "Confirmed · customer notified ✓" (or "· notification off").

### Mobile (< lg)
List = full-width cards (order #, customer, amount, pill); tap opens detail as full-screen sheet with vertical stepper; bulk select via long-press; board view collapses to the list.

### Data model
```
order_state enum + 'cancelled'          -- pending | acknowledged | onDelivery | done | cancelled
order_events(id, orderId→orders cascade, fromState, toState,
             actorKind 'merchant'|'ai'|'system', actorUserId null, note null,
             notifiedCustomer bool default false, createdAt, index(orderId, createdAt))
orders  + trackToken (see F04)          -- cancel restocks only from pending/acknowledged,
                                        -- inside one transaction with the state write
transitions (shared/schemas, the wire contract):
  pending → [acknowledged, cancelled]   acknowledged → [onDelivery, pending, cancelled]
  onDelivery → [done, acknowledged]     done, cancelled → [] (terminal)
```
Multi-line carts remain N single-line orders **grouped by `checkoutSessionId`** (receipt shows the group); normalizing to `orders`+`order_items` is the follow-up migration, noted not designed here.

### API contract (auth'd unless marked public)
```
GET   /api/v1/{bid}/orders?state=&q=&cursor=&limit=20&from=&to=
  200  { items:[{ id, orderNo, customerName, customerPhone, totalPrice, state,
                 source:'ai'|'store'|'manual', courier, trackingNumber,
                 checkoutSessionId, createdAt }], nextCursor }

PATCH /api/v1/{bid}/orders/{id}/state
  req  { to:'acknowledged', notifyCustomer:true, note? }
  200  { id, state, notifiedCustomer:true, event:{ from,to,at } }
  422  { error:'INVALID_TRANSITION', from:'done', allowed:[] }   -- replaces today's
       -- write-anything PATCH (crud/order.ts:266) and sends the chat update when
       -- notifyCustomer && conversationId exists

POST  /api/v1/{bid}/orders/{id}/tracking   { courier:'steadfast'|'pathao'|'other',
                                             trackingNumber, notifyCustomer:true } → 200
GET   /api/v1/{bid}/orders/{id}            → existing shape + { events[], trackUrl, source }
POST  /api/v1/{bid}/orders/bulk            { orderIds[], action:{type:'transition',to}
                                             | {type:'cancel'} }
  200  { updated:[ids], failed:[{id, reason}] }
GET   /api/v1/track/{token}                (public) 
  200  { orderNo, state, stateTimeline:[{state,at}], courier, trackingNumber,
         placedAt, eta?:{from,to} }        404
POST  /api/v1/{bid}/orders                 (existing) + deliveryOptionId, checkoutSessionId
```

---

## Top 5 risks / bugs in the current code

1. **Webhook signatures are verified but never enforced — forged events are accepted.** `apps/api/src/webhooks/facebook.ts:461-463` logs "invalid signature but will go through still", and the comment at `:504-506` admits "anyone holding this URL can POST a forged page event" (the same handler serves Instagram; the Next.js proxies forward headers without checking). Anyone who discovers the URL can drive real agent runs, send messages on the merchant's Page token, and burn quota. Ship enforcement with a config flag + failure-rate metric instead of open acceptance.

2. **Public checkout is non-atomic, unthrottled, and bypassable.** `createPublicCheckout` (`packages/db/crud/store.ts:159-177`) loops `createOrder` per item with no transaction: if item 3 fails, items 1–2 persist while the shopper gets a 400 — a paid-for-nothing partial order. `POST /api/v1/store/{slug}/checkout` has no rate limit, captcha, or idempotency key, so it's an unrestricted public writer of orders and customer cards. Compounding it, stock is only checked/decremented **when a `variantId` is supplied** (`crud/order.ts:39-43, 85-97`): ordering a multi-variant product without a variantId sells at base price with unlimited quantity, and the authenticated create has no `count` max (`.max(999)` exists only in the store schema).

3. **`onDelivery` orders are broken in the orders workspace.** `apps/web/components/orders-products-workspace.tsx:77` does `state.toLowerCase()` → `'ondelivery'`, but every lookup table uses camelCase keys (`:24-41`): `NEXT_STATE['ondelivery']` is `undefined`, so **Advance/Revert silently no-op** for on-delivery orders (`:122-126`), the pill renders the raw string "ondelivery" (`:398`), the stepper never marks the current stage, and there is no on-delivery filter tab (`:313`). A sibling symptom: the same order shows `৳` in the workspace but `$` on the detail page (`orders/[orderId]/page.tsx:100-104`).

4. **The conversation state machine races itself into duplicate replies.** `updateConversationState` is an unguarded UPDATE (`crud/conversation.ts:87-95`): when a run finishes (or errors) it writes `done` (`agent-runner-core.ts:386, 398`) even if a second runner has since claimed the stale lock — the stale threshold is 35 s (`config.ts:13`) while a run can legally take longer (each trigger even `await`s a 9 s sleep, `agent-runner.ts:28`), so takeovers are routine and a third run can start → the customer gets two replies. The HTTP API makes it worse: `PATCH /conversations/{id}/state` lets a client set `working` (deadlocking the agent until stale recovery) and posting a message unconditionally writes `done` (`conversations.ts:151`), releasing a live run's lock.

5. **No order-state transition validation enables a stock-restock exploit.** `updateOrderState` writes any state to any state (`crud/order.ts:266-270`) and `updateOrder` passes `state` through unchecked (`:282`). Sequence: `done → pending` (both allowed), then `DELETE /orders/{id}` — since `state !== 'done'`, it restocks the variant (`:355-365`) for goods already shipped. Delete also restocks-then-soft-deletes in two non-transactional statements, and `updateOrder`'s read-compute-write (`:277-335`) has no optimistic lock, so concurrent edits double-decrement stock or mis-price.

**Also noted (not top-5):** `ADMIN_EMAILS?.includes(email)` substring match in `apps/api/src/middleware/business.ts:15` (`oracle@x.com` authorizes `racle@x.com`; scope-limited to the `oryxa-sandbox` slug plus two hardcoded personal emails); CORS reflects any origin with `credentials:true` (`app.ts:63-71`); error routing by `err.message.includes('not found')` (`orders.ts:53-58`); messages beyond the newest 100 are unreachable (no cursor, `crud/conversation.ts:259-272`); inbox fetch errors masked as empty states (`inbox/page.tsx:43-45`); quota gates fail open everywhere (`quota.ts:93`, sends log "sending uncharged"); raw customer message bodies and signature headers are logged (`facebook.ts:449-482`).