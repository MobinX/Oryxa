-- Pre-rendered reusable visual product card keys and one-time LLM catalog enrichment specs.
-- Idempotent: safe across PGlite test replays and production Neon migrations.

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "card_image_key" varchar(500);--> statement-breakpoint
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "enriched_specs" jsonb;--> statement-breakpoint
ALTER TABLE "variants"
  ADD COLUMN IF NOT EXISTS "card_image_key" varchar(500);
