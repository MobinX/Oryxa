-- Payment strategy: how much must be paid before an order may exist. The store default lives
-- on the business and reaches every product; a product may override it, and each order keeps
-- the strategy it was placed under so a later change cannot rewrite history. Existing stores
-- default to cash on delivery, which is exactly how they behave today. One DO block: the
-- migrator executes each file as a single prepared statement.
DO $$
BEGIN
  ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "payment_strategy" varchar(30) NOT NULL DEFAULT 'cod';
  ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "payment_strategy_override" varchar(30);
  ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_strategy" varchar(30);
END $$;
