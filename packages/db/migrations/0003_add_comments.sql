CREATE TABLE "comment_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"platform_item_id" varchar(255) NOT NULL,
	"commenter_platform_id" varchar(255) NOT NULL,
	"commenter_name" varchar(255),
	"last_comment_state" "message_state" DEFAULT 'done' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_thread_id" uuid NOT NULL,
	"from" "message_from" NOT NULL,
	"content_type" varchar(20) DEFAULT 'text' NOT NULL,
	"content" text NOT NULL,
	"time" timestamp DEFAULT now() NOT NULL,
	"state" "message_state" DEFAULT 'pending' NOT NULL,
	"external_id" varchar(100),
	"parent_external_id" varchar(100),
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "comment_threads" ADD CONSTRAINT "comment_threads_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_threads" ADD CONSTRAINT "comment_threads_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_comment_thread_id_comment_threads_id_fk" FOREIGN KEY ("comment_thread_id") REFERENCES "public"."comment_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comment_threads_channel_item_commenter_idx" ON "comment_threads" USING btree ("channel_id","platform_item_id","commenter_platform_id");--> statement-breakpoint
CREATE INDEX "comments_thread_time_idx" ON "comments" USING btree ("comment_thread_id","time");--> statement-breakpoint
CREATE UNIQUE INDEX "comments_external_id_idx" ON "comments" USING btree ("external_id");