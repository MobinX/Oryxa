ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "slug" varchar(255);--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "store_published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "businesses_slug_idx" ON "businesses" USING btree ("slug");
