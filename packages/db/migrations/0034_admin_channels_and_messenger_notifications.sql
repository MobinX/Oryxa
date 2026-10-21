ALTER TABLE "channels" ALTER COLUMN "business_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "is_admin_only" boolean;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messenger_notification" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "token" uuid DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "messenger_notification_business_uniq_idx" ON "messenger_notification" ("business_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "messenger_notification_token_uniq_idx" ON "messenger_notification" ("token");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messenger_notification_user_info" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE cascade,
  "platform_user_id" varchar(255) NOT NULL,
  "name" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "messenger_notification_user_business_platform_uniq_idx" ON "messenger_notification_user_info" ("business_id", "platform_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messenger_notification_user_business_idx" ON "messenger_notification_user_info" ("business_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "token" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "push_tokens_business_token_uniq_idx" ON "push_tokens" ("business_id", "token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_tokens_business_idx" ON "push_tokens" ("business_id");
