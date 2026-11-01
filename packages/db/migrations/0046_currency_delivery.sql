-- Prices carry the currency the merchant quotes them in; BDT stays the default so every
-- existing row keeps reading as a Taka price. Orders copy the product currency at creation,
-- and the merchant's region-based delivery list lives on the business so the agent prompt and
-- the order tool read the same source. One DO block: the migrator executes each file as a
-- single prepared statement.
DO $$
BEGIN
  ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "currency" varchar(8) NOT NULL DEFAULT 'BDT';
  ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "currency" varchar(8) NOT NULL DEFAULT 'BDT';
  ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "delivery_zones" jsonb NOT NULL DEFAULT '[]'::jsonb;
END $$;
