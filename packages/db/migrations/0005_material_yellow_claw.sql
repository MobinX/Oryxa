CREATE TYPE "public"."post_state" AS ENUM('draft', 'scheduled', 'published', 'failed');--> statement-breakpoint
CREATE TABLE "post_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"share_count" integer DEFAULT 0 NOT NULL,
	"reach_count" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"product_id" uuid,
	"content" text DEFAULT '' NOT NULL,
	"media_urls" text[],
	"post_state" "post_state" DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp,
	"published_at" timestamp,
	"platform_post_id" varchar(255),
	"ai_prompt" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "post_syncs" ADD CONSTRAINT "post_syncs_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_business_channel_idx" ON "posts" USING btree ("business_id","channel_id");