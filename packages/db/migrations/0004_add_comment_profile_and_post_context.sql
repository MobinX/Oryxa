ALTER TABLE "comment_threads" ADD COLUMN "commenter_avatar" varchar(500);--> statement-breakpoint
ALTER TABLE "comment_threads" ADD COLUMN "post_context" text;