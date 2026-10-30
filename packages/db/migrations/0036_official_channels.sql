DO $$ BEGIN
  CREATE TYPE "ticket_type" AS ENUM('support', 'security');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "ticket_status" AS ENUM('open', 'in_progress', 'waiting', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "ticket_priority" AS ENUM('low', 'normal', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "prospect_status" AS ENUM('new', 'reviewing', 'prioritized', 'onboarding_requested', 'onboarded', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TYPE "platform" ADD VALUE IF NOT EXISTS 'tiktok';
--> statement-breakpoint
-- Official Channels conversations belong to nobody: the channel is the operator's own
-- account and there is no store behind it. Nullable everywhere the FK would allow a NULL
-- business; the store queries never read them because their channel ids differ.
ALTER TABLE "conversations" ALTER COLUMN "business_id" DROP NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "official_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "availability" varchar(40) DEFAULT 'available' NOT NULL,
  "availability_note" text,
  "ai_enabled" boolean DEFAULT true NOT NULL,
  "auto_reply" boolean DEFAULT true NOT NULL,
  "tone" varchar(40) DEFAULT 'friendly',
  "language" varchar(20) DEFAULT 'auto',
  "instructions" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "official_settings_singleton_idx" ON "official_settings" ((true));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE cascade,
  "conversation_id" uuid REFERENCES "conversations"("id") ON DELETE set null,
  "customer_platform_id" varchar(255) NOT NULL,
  "customer_name" varchar(255),
  "type" ticket_type DEFAULT 'support' NOT NULL,
  "status" ticket_status DEFAULT 'open' NOT NULL,
  "priority" ticket_priority DEFAULT 'normal' NOT NULL,
  "assignee_user_id" uuid,
  "subject" varchar(500),
  "summary" text,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_status_priority_idx" ON "tickets" ("status", "priority", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_conversation_idx" ON "tickets" ("conversation_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" uuid NOT NULL REFERENCES "tickets"("id") ON DELETE cascade,
  "actor_kind" varchar(10) DEFAULT 'system' NOT NULL,
  "actor_user_id" uuid,
  "kind" varchar(40) NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_events_ticket_time_idx" ON "ticket_events" ("ticket_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prospects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE cascade,
  "conversation_id" uuid REFERENCES "conversations"("id") ON DELETE set null,
  "platform" varchar(30) NOT NULL,
  "contact_platform_id" varchar(255) NOT NULL,
  "name" varchar(255),
  "country" varchar(100),
  "business_type" varchar(100),
  "employees_estimate" varchar(40),
  "budget" varchar(100),
  "needs" text,
  "consent" boolean DEFAULT false NOT NULL,
  "consent_at" timestamp,
  "status" prospect_status DEFAULT 'new' NOT NULL,
  "score" integer DEFAULT 0 NOT NULL,
  "score_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prospects_channel_contact_uniq_idx" ON "prospects" ("channel_id", "contact_platform_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prospects_status_idx" ON "prospects" ("status", "score");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prospect_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "prospect_id" uuid NOT NULL REFERENCES "prospects"("id") ON DELETE cascade,
  "actor_kind" varchar(10) DEFAULT 'system' NOT NULL,
  "actor_user_id" uuid,
  "kind" varchar(40) NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prospect_events_prospect_time_idx" ON "prospect_events" ("prospect_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prospect_weights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prospect_weights_singleton_idx" ON "prospect_weights" ((true));
