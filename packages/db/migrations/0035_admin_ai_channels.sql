-- Admin AI channels: per-channel AI configuration, business profiles for the AI studio,
-- knowledge base (FAQ), capacity/waitlist, the leads CRM and its audit trail, plus the
-- operator inbox columns. Append-only: nothing existing is dropped or altered destructively,
-- so the reverse is a plain rollback script (migrations/rollback/0035_admin_ai_channels.down.sql).

CREATE TYPE "lead_status" AS ENUM('new','qualified','awaiting_information','waitlisted','contact_requested','contacted','converted','closed');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE cascade,
  "conversation_id" uuid REFERENCES "conversations"("id") ON DELETE set null,
  "comment_thread_id" uuid REFERENCES "comment_threads"("id") ON DELETE set null,
  "platform" platform NOT NULL,
  "platform_user_id" varchar(255) NOT NULL,
  "name" varchar(255),
  "business_name" varchar(255),
  "phone" varchar(20),
  "email" varchar(255),
  "contact_method" varchar(20),
  "requirements" text,
  "interest" text,
  "timeframe" varchar(100),
  "consent" boolean DEFAULT false NOT NULL,
  "consent_at" timestamp,
  "source_channel" varchar(30),
  "conversation_ref" varchar(255),
  "status" lead_status DEFAULT 'new' NOT NULL,
  "assignee_user_id" uuid,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "leads_channel_platform_user_uniq_idx" ON "leads" ("channel_id", "platform_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_business_status_idx" ON "leads" ("business_id", "status", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_business_phone_idx" ON "leads" ("business_id", "phone");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE cascade,
  "actor_kind" varchar(10) DEFAULT 'system' NOT NULL,
  "actor_user_id" uuid,
  "kind" varchar(40) NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_events_lead_time_idx" ON "lead_events" ("lead_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channel_ai_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE cascade,
  "ai_enabled" boolean DEFAULT true NOT NULL,
  "ai_comments_enabled" boolean DEFAULT true NOT NULL,
  "private_replies_enabled" boolean DEFAULT true NOT NULL,
  "auto_reply" boolean DEFAULT true NOT NULL,
  "confidence_threshold" numeric(3, 2) DEFAULT 0.60 NOT NULL,
  "max_reply_length" integer DEFAULT 1000 NOT NULL,
  "tone" varchar(40) DEFAULT 'friendly',
  "language" varchar(20) DEFAULT 'auto',
  "per_channel_instructions" text,
  "lead_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "escalation_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "comment_behavior" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "channel_ai_configs_channel_uniq_idx" ON "channel_ai_configs" ("channel_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "business_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "display_name" varchar(120) DEFAULT 'Only Order' NOT NULL,
  "description" text,
  "products_services" text,
  "audience" text,
  "service_areas" text,
  "pricing_packages" text,
  "hours_holidays" text,
  "contacts" text,
  "website" varchar(300),
  "socials" text,
  "limitations" text,
  "policies" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "business_profiles_business_uniq_idx" ON "business_profiles" ("business_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "question" text NOT NULL,
  "answer" text NOT NULL,
  "tags" text[] DEFAULT '{}'::text[] NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_entries_business_idx" ON "knowledge_entries" ("business_id", "active");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "capacity" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "accepting_new_customers" boolean DEFAULT true NOT NULL,
  "max_capacity" integer DEFAULT 0 NOT NULL,
  "available_capacity" integer DEFAULT 0 NOT NULL,
  "waitlist_mode" varchar(20) DEFAULT 'off' NOT NULL,
  "full_capacity_message" text,
  "follow_up_info" text,
  "preferred_contact" varchar(40),
  "eta_text" varchar(200),
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "capacity_business_uniq_idx" ON "capacity" ("business_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "capacity_reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "lead_id" uuid REFERENCES "leads"("id") ON DELETE set null,
  "conversation_id" uuid,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "released_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "capacity_reservations_business_idx" ON "capacity_reservations" ("business_id", "status");
--> statement-breakpoint
-- Inbox: what the operator is driving. `ai_paused` is the takeover switch — once set the
-- agent never answers the thread again until the operator resumes.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "ai_paused" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "sent_by" varchar(10);
