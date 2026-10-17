ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "order_number" integer;
--> statement-breakpoint
UPDATE "orders" o
SET "order_number" = (10000 + x.rn)::int
FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at") AS rn FROM "orders") x
WHERE o."id" = x."id" AND o."order_number" IS NULL;
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "order_number" SET NOT NULL;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "orders_order_number_seq" START 10001;
--> statement-breakpoint
SELECT setval('orders_order_number_seq', 10000 + (SELECT COUNT(*) FROM "orders"), true);
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "order_number" SET DEFAULT nextval('orders_order_number_seq');
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "orders_order_number_idx" ON "orders" ("order_number");
