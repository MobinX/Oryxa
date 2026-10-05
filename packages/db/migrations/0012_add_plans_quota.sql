-- Plans, per-business allowances and merchant notices.
--
-- Every statement is idempotent because this file is replayed from scratch by
-- tests/helpers/pglite-db.ts on a fresh cluster, and applied once by hand to
-- production Neon — the second run of either must be a no-op.
--
-- This migration creates the tables and seeds the plans. It deliberately does NOT
-- assign any business to any plan: `businesses.plan_id IS NULL` means "no plan,
-- unlimited", so applying this file changes nothing for a live merchant. The fleet
-- assignment is a separate statement the operator runs on purpose.

-- Guarded, unlike the bare CREATE TYPE in 0000/0005/0008 — those error on a second
-- replay with duplicate_object. Harmless in production (each has run exactly once) but
-- not a pattern to copy into a file that says it is idempotent.
DO $$ BEGIN
 CREATE TYPE "public"."plan_actor_kind" AS ENUM('operator', 'merchant', 'system');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"slug" varchar(64) NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"message_limit" integer,
	"comment_limit" integer,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);--> statement-breakpoint
-- A limit of NULL means that allowance is uncapped; 0 means zero replies allowed.
-- They are different things and the UI has to say so, so nothing here defaults them.
CREATE UNIQUE INDEX IF NOT EXISTS "plans_slug_idx" ON "plans" USING btree ("slug") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plans_active_position_idx" ON "plans" USING btree ("active","position");--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "plan_started_at" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "businesses" ADD CONSTRAINT "businesses_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "businesses_plan_id_idx" ON "businesses" USING btree ("plan_id");--> statement-breakpoint
-- One row per business per 30-day cycle, keyed by the cycle's start date. `period` is
-- a 'YYYY-MM-DD' label computed in Node (crud/billing.ts), never by SQL date maths, so
-- Neon and PGlite cannot disagree about where a boundary falls. A string key sorts in
-- chronological order, which is what makes "the row whose period is current" one indexed
-- read and makes the reset a key rotation instead of a scheduled job.
-- No deleted_at: a counter is a fact, like hourly_token_analytics and visits.
CREATE TABLE IF NOT EXISTS "quota_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"period" varchar(10) NOT NULL,
	"messages_used" integer DEFAULT 0 NOT NULL,
	"comments_used" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quota_usage" ADD CONSTRAINT "quota_usage_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
-- Plain, not partial: this is the ON CONFLICT target for the atomic spend, and a
-- partial index would force every writer to repeat the predicate to find it.
CREATE UNIQUE INDEX IF NOT EXISTS "quota_usage_business_period_uniq_idx" ON "quota_usage" USING btree ("business_id","period");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"kind" varchar(40) NOT NULL,
	"period" varchar(10),
	"title" varchar(120) NOT NULL,
	"body" text NOT NULL,
	"link" varchar(300),
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
-- Exactly one notice of a kind per cycle, enforced here rather than by a read-then-write
-- (the neon-http driver has no transactions). NULL periods never collide in a Postgres
-- unique index, so a notice with no cycle is unconstrained, which is what kind='quota_80'
-- and a future 'welcome' both need from this one index.
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_business_kind_period_uniq_idx" ON "notifications" USING btree ("business_id","kind","period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_business_unread_idx" ON "notifications" USING btree ("business_id","read_at","created_at");--> statement-breakpoint
-- Append-only audit: who put which business on which plan, when. It is not a subscriptions
-- table — the live pointer is businesses.plan_id — it is the history that pointer overwrites.
CREATE TABLE IF NOT EXISTS "plan_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"plan_id" uuid,
	"previous_plan_id" uuid,
	"actor_kind" "public"."plan_actor_kind" NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan_assignments" ADD CONSTRAINT "plan_assignments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan_assignments" ADD CONSTRAINT "plan_assignments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan_assignments" ADD CONSTRAINT "plan_assignments_previous_plan_id_plans_id_fk" FOREIGN KEY ("previous_plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
-- actor_user_id gets no FK on purpose. Tests hard-delete user rows, and a RESTRICT
-- reference from the audit table would make that cleanup fail; an audit row that
-- outlives the user who acted is also the more truthful record.
CREATE INDEX IF NOT EXISTS "plan_assignments_business_time_idx" ON "plan_assignments" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_assignments_plan_idx" ON "plan_assignments" USING btree ("plan_id");--> statement-breakpoint
-- The four offers. Starter/Pro/Enterprise are the numbers apps/web/app/page.tsx already
-- advertises; Free is the fleet default the operator chose for existing businesses. Free
-- and Starter carrying the same 1,000 is deliberate — Free is what everyone inherits,
-- Starter is the paid tier whose number is already public. Guarded on slug, not on
-- "any row exists", so edits the operator makes in /admin/plans survive a re-run.
INSERT INTO "plans" ("id", "name", "slug", "price_cents", "currency", "message_limit", "comment_limit", "features", "position")
SELECT '00000000-0000-4000-8000-000000000001', 'Free', 'free', 0, 'USD', 1000, 1000, '["1,000 agent replies per 30 days","1,000 comment replies per 30 days","Storefront, orders and posts included"]', 0
WHERE NOT EXISTS (SELECT 1 FROM "plans" WHERE "slug" = 'free');--> statement-breakpoint
INSERT INTO "plans" ("id", "name", "slug", "price_cents", "currency", "message_limit", "comment_limit", "features", "position")
SELECT '00000000-0000-4000-8000-000000000002', 'Starter', 'starter', 2900, 'USD', 1000, 1000, '["Up to 1,000 agent replies per 30 days","Comment replies included","Priority support"]', 1
WHERE NOT EXISTS (SELECT 1 FROM "plans" WHERE "slug" = 'starter');--> statement-breakpoint
INSERT INTO "plans" ("id", "name", "slug", "price_cents", "currency", "message_limit", "comment_limit", "features", "position")
SELECT '00000000-0000-4000-8000-000000000003', 'Pro', 'pro', 7900, 'USD', 10000, 10000, '["Up to 10,000 agent replies per 30 days","10,000 comment replies per 30 days","Multiple pages and posts"]', 2
WHERE NOT EXISTS (SELECT 1 FROM "plans" WHERE "slug" = 'pro');--> statement-breakpoint
INSERT INTO "plans" ("id", "name", "slug", "price_cents", "currency", "message_limit", "comment_limit", "features", "position")
SELECT '00000000-0000-4000-8000-000000000004', 'Enterprise', 'enterprise', 0, 'USD', NULL, NULL, '["Custom pricing, agreed with our team","Unlimited agent replies","Dedicated onboarding"]', 3
WHERE NOT EXISTS (SELECT 1 FROM "plans" WHERE "slug" = 'enterprise');
