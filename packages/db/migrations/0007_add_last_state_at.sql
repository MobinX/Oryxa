ALTER TABLE "comment_threads" ADD COLUMN IF NOT EXISTS "last_state_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "last_state_at" timestamp DEFAULT now() NOT NULL;
