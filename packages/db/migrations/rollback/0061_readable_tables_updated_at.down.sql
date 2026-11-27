-- Rolls back 0061: remove the touch triggers, the nullable columns and the shared function.
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "capacity_reservations";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "lead_events";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "ticket_events";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "prospect_events";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "users";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "companies";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "customers";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "businesses";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "categories";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "products";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "variants";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "product_options";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "product_option_values";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "orders";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "agents";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "channels";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "external_service_pending_page";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "messenger_notification";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "messenger_notification_user_info";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "conversations";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "messages";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "comment_threads";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "comments";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "posts";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "post_syncs";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "llm_token_logs";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "visits";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "notifications";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "plan_assignments";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "push_tokens";--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "console_sessions";--> statement-breakpoint
ALTER TABLE "capacity_reservations" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "lead_events" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "ticket_events" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "prospect_events" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "businesses" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "categories" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "variants" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "product_options" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "product_option_values" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "channels" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "external_service_pending_page" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "messenger_notification" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "messenger_notification_user_info" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "comment_threads" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "comments" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "post_syncs" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "llm_token_logs" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "visits" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "plan_assignments" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "push_tokens" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "console_sessions" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
DROP FUNCTION IF EXISTS oryxa_touch_updated_at();
