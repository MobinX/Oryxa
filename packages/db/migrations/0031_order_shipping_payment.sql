ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "shipping_cost" numeric(10, 2) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "payment_method" varchar(40);
