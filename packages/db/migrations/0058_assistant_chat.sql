-- Assistant chat: per-plan allowances for the logged-in sidebar assistant, and a
-- distributed daily cap for the anonymous landing-page widget.
--
-- Idempotent: replayed from scratch by tests/helpers/pglite-db.ts and applied
-- once to production Neon — a second run of either must be a no-op.

-- New billable lane for assistant turns, beside ai_post_generation/tuning.
ALTER TYPE "integration_type" ADD VALUE IF NOT EXISTS 'assistant_chat';--> statement-breakpoint
-- Per-plan assistant allowance per 30-day cycle. NULL = uncapped, 0 = none —
-- the same reading as message_limit/comment_limit, enforced in crud/assistant.ts.
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "assistant_limit" integer;--> statement-breakpoint
-- Operator escape hatch, mirroring message_limit_override.
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "assistant_limit_override" integer;--> statement-breakpoint
-- One row per business per 30-day cycle. No row for the current period means 0 used.
CREATE TABLE IF NOT EXISTS "assistant_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"period" varchar(10) NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assistant_usage" ADD CONSTRAINT "assistant_usage_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
-- Plain, not partial: the ON CONFLICT target for the atomic spend.
CREATE UNIQUE INDEX IF NOT EXISTS "assistant_usage_business_period_uniq_idx" ON "assistant_usage" USING btree ("business_id","period");--> statement-breakpoint
-- Anonymous widget usage, keyed by salted IP hash — never a raw address.
-- One row per IP per UTC day; the spend is a conditional upsert so every
-- serverless instance shares one cap.
CREATE TABLE IF NOT EXISTS "public_chat_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_hash" varchar(64) NOT NULL,
	"day" varchar(10) NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "public_chat_usage_ip_day_uniq_idx" ON "public_chat_usage" USING btree ("ip_hash","day");--> statement-breakpoint
-- Allowances for the seeded plans. `AND assistant_limit IS NULL` keeps a rerun
-- from overwriting an operator-tuned value; enterprise stays NULL (uncapped).
UPDATE "plans" SET "assistant_limit" = 20 WHERE "slug" = 'free' AND "deleted_at" IS NULL AND "assistant_limit" IS NULL;--> statement-breakpoint
UPDATE "plans" SET "assistant_limit" = 100 WHERE "slug" = 'starter' AND "deleted_at" IS NULL AND "assistant_limit" IS NULL;--> statement-breakpoint
UPDATE "plans" SET "assistant_limit" = 500 WHERE "slug" = 'pro' AND "deleted_at" IS NULL AND "assistant_limit" IS NULL;
