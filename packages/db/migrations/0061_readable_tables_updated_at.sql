-- Every table readable through the API now carries a nullable updated_at, maintained by a trigger.
-- The column is added WITHOUT a default: existing rows stay NULL (no backfill, no rewrite),
-- new rows get the insert instant, and any UPDATE bumps it. Idempotent for replay on PGlite.
CREATE OR REPLACE FUNCTION oryxa_touch_updated_at() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.updated_at IS NULL THEN
      NEW.updated_at = now();
    END IF;
  ELSE
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
ALTER TABLE "capacity_reservations" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "lead_events" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "prospect_events" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "product_options" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "product_option_values" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "external_service_pending_page" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "messenger_notification" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "messenger_notification_user_info" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "comment_threads" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "post_syncs" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "llm_token_logs" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "plan_assignments" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "console_sessions" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "capacity_reservations";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "capacity_reservations" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "lead_events";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "lead_events" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "ticket_events";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "ticket_events" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "prospect_events";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "prospect_events" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "users";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "companies";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "companies" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "customers";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "customers" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "businesses";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "businesses" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "categories";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "categories" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "products";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "products" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "variants";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "variants" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "product_options";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "product_options" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "product_option_values";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "product_option_values" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "orders";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "orders" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "agents";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "agents" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "channels";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "channels" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "external_service_pending_page";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "external_service_pending_page" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "messenger_notification";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "messenger_notification" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "messenger_notification_user_info";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "messenger_notification_user_info" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "conversations";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "conversations" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "messages";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "messages" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "comment_threads";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "comment_threads" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "comments";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "comments" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "posts";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "posts" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "post_syncs";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "post_syncs" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "llm_token_logs";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "llm_token_logs" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "visits";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "visits" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "notifications";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "notifications" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "plan_assignments";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "plan_assignments" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "push_tokens";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "push_tokens" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "oryxa_touch_updated_at_trigger" ON "console_sessions";--> statement-breakpoint
CREATE TRIGGER "oryxa_touch_updated_at_trigger" BEFORE INSERT OR UPDATE ON "console_sessions" FOR EACH ROW EXECUTE FUNCTION oryxa_touch_updated_at();
