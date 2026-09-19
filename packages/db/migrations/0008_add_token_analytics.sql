CREATE TYPE "public"."integration_type" AS ENUM('facebook_messenger', 'facebook_comment', 'instagram_messenger', 'whatsapp', 'ai_post_generation', 'ai_post_tuning');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "llm_token_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"channel_id" uuid,
	"conversation_id" uuid,
	"comment_thread_id" uuid,
	"post_id" uuid,
	"message_id" uuid,
	"integration_type" "integration_type" NOT NULL,
	"provider" varchar(50) DEFAULT 'gemini' NOT NULL,
	"model" varchar(100) NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cache_hit_tokens" integer DEFAULT 0 NOT NULL,
	"cache_miss_tokens" integer DEFAULT 0 NOT NULL,
	"cache_hit_percent" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" numeric(10, 6) DEFAULT '0.000000' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hourly_token_analytics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"integration_type" "integration_type" NOT NULL,
	"hour_bucket" timestamp NOT NULL,
	"total_input_tokens" integer DEFAULT 0 NOT NULL,
	"total_output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"total_cache_hit_tokens" integer DEFAULT 0 NOT NULL,
	"total_cache_miss_tokens" integer DEFAULT 0 NOT NULL,
	"run_count" integer DEFAULT 0 NOT NULL,
	"avg_tokens_per_message" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"avg_latency_ms" integer DEFAULT 0 NOT NULL,
	"total_estimated_cost_usd" numeric(10, 6) DEFAULT '0.000000' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "llm_token_logs" ADD CONSTRAINT "llm_token_logs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "llm_token_logs" ADD CONSTRAINT "llm_token_logs_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "llm_token_logs" ADD CONSTRAINT "llm_token_logs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "llm_token_logs" ADD CONSTRAINT "llm_token_logs_comment_thread_id_comment_threads_id_fk" FOREIGN KEY ("comment_thread_id") REFERENCES "public"."comment_threads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "llm_token_logs" ADD CONSTRAINT "llm_token_logs_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "llm_token_logs" ADD CONSTRAINT "llm_token_logs_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hourly_token_analytics" ADD CONSTRAINT "hourly_token_analytics_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_token_logs_business_time_idx" ON "llm_token_logs" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_token_logs_business_integration_idx" ON "llm_token_logs" USING btree ("business_id","integration_type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hourly_token_analytics_uniq_idx" ON "hourly_token_analytics" USING btree ("business_id","integration_type","hour_bucket");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hourly_token_analytics_business_bucket_idx" ON "hourly_token_analytics" USING btree ("business_id","hour_bucket");
