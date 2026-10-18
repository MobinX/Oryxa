CREATE TABLE IF NOT EXISTS "product_options" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "name" varchar(80) NOT NULL,
  "position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_options_product_idx" ON "product_options" ("product_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_option_values" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "option_id" uuid NOT NULL REFERENCES "product_options"("id") ON DELETE CASCADE,
  "value" varchar(80) NOT NULL,
  "position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_option_values_option_idx" ON "product_option_values" ("option_id");
--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN IF NOT EXISTS "options" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "has_discount" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "tags" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "show_in_storefront" boolean DEFAULT true NOT NULL;
