-- External services: third-party integrations that connect platform accounts through Oryxa,
-- receive inbound events on their own webhook URLs, and send replies with the banked tokens.
--
-- Idempotent: replayed from scratch by tests/helpers/pglite-db.ts and applied once to
-- production Neon — a second run of either must be a no-op.

CREATE TABLE IF NOT EXISTS "external_service" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"unique_name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "external_service_unique_name_idx" ON "external_service" USING btree ("unique_name");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "external_service_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"webhook_url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "external_service_webhooks" ADD CONSTRAINT "external_service_webhooks_service_id_external_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."external_service"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_service_webhooks_service_idx" ON "external_service_webhooks" USING btree ("service_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "external_service_channel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"platform" "platform" NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"platform_channel_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "external_service_channel" ADD CONSTRAINT "external_service_channel_service_id_external_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."external_service"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "external_service_channel_service_platform_account_idx" ON "external_service_channel" USING btree ("service_id","platform","platform_channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "external_service_channel_platform_account_live_idx" ON "external_service_channel" USING btree ("platform","platform_channel_id") WHERE "external_service_channel"."deleted_at" is null;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "external_service_pending_page" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" varchar(255) NOT NULL,
	"page_id" varchar(255) NOT NULL,
	"page_name" varchar(255) NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "external_service_pending_page_business_page_idx" ON "external_service_pending_page" USING btree ("business_id","page_id");
