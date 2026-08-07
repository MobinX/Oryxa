DROP INDEX IF EXISTS "categories_business_slug_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "categories_business_slug_idx" ON "categories" USING btree ("business_id","slug") WHERE "deleted_at" IS NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "products_business_slug_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "products_business_slug_idx" ON "products" USING btree ("business_id","slug") WHERE "deleted_at" IS NULL;
