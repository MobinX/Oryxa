-- "What did I order last time?" was unanswerable: an order records a phone number and a name, but the
-- customer in Messenger is identified by their page-scoped id (PSID), and the only link back was
-- orders.conversation_id — which is null for an order placed through the storefront or typed into the
-- dashboard, and does not survive a new conversation with the same person. So the agent could look up
-- ONE order by id and nothing else.
--
-- The order now carries the PSID it came from, alongside the conversation link rather than instead of
-- it: the conversation says where it happened, this says who placed it, and only this is stable across
-- conversations. Null stays null for an order with no platform identity behind it — a dashboard order
-- is not somebody's Messenger history.
--
-- Idempotent: replayed from scratch by tests/helpers/pglite-db.ts, applied once by hand to production
-- Neon. Every statement guards itself, so a re-run settles on the same answer.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customer_platform_id" varchar(120);
--> statement-breakpoint
-- Backfill what can be proven: an order that knows its conversation knows whose Messenger it was.
UPDATE "orders" o SET "customer_platform_id" = c."customer_platform_id"
  FROM "conversations" c
 WHERE o."conversation_id" = c."id"
   AND o."customer_platform_id" IS NULL
   AND c."customer_platform_id" IS NOT NULL;
--> statement-breakpoint
-- The lookup is always this store, this customer, newest first. Without it the history read scans every
-- order in the business, and the busiest store is the one that pays for it.
CREATE INDEX IF NOT EXISTS "orders_business_platform_idx"
  ON "orders" ("business_id", "customer_platform_id");
