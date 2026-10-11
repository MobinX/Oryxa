-- A phone number is the one thing a buyer carries through every door: the agent placing
-- an order from a Facebook thread, a merchant typing one into the dashboard, a customer
-- at the storefront checkout. Orders already stored the number as free text on each row;
-- this points the row at the company's customer instead, so one person stays one person
-- across a company's stores and their history becomes a query rather than a guess.
--
-- Nullable with `on delete set null`: an order outlives the card it was matched to, and
-- removing a customer must not take the sales history with it. No unique constraint on
-- the phone either — the dedupe happens by looking the number up before writing it
-- (`findOrCreateCustomerByPhone`), and two cards sharing a number is something a merchant
-- can legitimately mean: a household, a placeholder typed twice.
--
-- Idempotent: replayed from scratch by tests/helpers/pglite-db.ts, applied once by hand to
-- production Neon. The second run matches what it already fixed and changes nothing.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customer_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_customer_id_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_company_phone_idx" ON "customers" USING btree ("company_id","phone");--> statement-breakpoint

-- The orders that already happened, read backwards. A number is compared with everything
-- but digits and a leading plus stripped, because "0300-1234567" and "+92 300 1234567"
-- are the same buyer and no customer book is tidy enough to assume otherwise. The card
-- takes its name and address from the earliest order under that number.
WITH wanted AS (
  SELECT DISTINCT ON (b."company_id", regexp_replace(o."customer_phone", '[^0-9+]', '', 'g'))
         b."company_id" AS "company_id",
         regexp_replace(o."customer_phone", '[^0-9+]', '', 'g') AS "phone",
         o."customer_name" AS "name",
         o."customer_address" AS "address"
    FROM "orders" o
    JOIN "businesses" b ON b."id" = o."business_id"
   WHERE o."deleted_at" IS NULL
     AND o."customer_phone" IS NOT NULL
     AND o."customer_phone" <> ''
     AND b."company_id" IS NOT NULL
   ORDER BY b."company_id", regexp_replace(o."customer_phone", '[^0-9+]', '', 'g'), o."created_at"
)
INSERT INTO "customers" ("company_id", "name", "phone", "address")
SELECT w."company_id", w."name", w."phone", w."address"
  FROM wanted w
 WHERE NOT EXISTS (
         SELECT 1 FROM "customers" c
          WHERE c."company_id" = w."company_id"
            AND c."phone" IS NOT NULL
            AND regexp_replace(c."phone", '[^0-9+]', '', 'g') = w."phone"
 )
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Then attach the orders. Where a company somehow holds two cards for one number, the
-- oldest wins, and it keeps winning on every run.
WITH match AS (
  SELECT DISTINCT ON (o."id") o."id" AS "order_id", c."id" AS "customer_id"
    FROM "orders" o
    JOIN "businesses" b ON b."id" = o."business_id"
    JOIN "customers" c ON c."company_id" = b."company_id"
     AND c."phone" IS NOT NULL
     AND regexp_replace(c."phone", '[^0-9+]', '', 'g')
       = regexp_replace(o."customer_phone", '[^0-9+]', '', 'g')
   WHERE o."customer_id" IS NULL
     AND o."deleted_at" IS NULL
     AND o."customer_phone" IS NOT NULL
     AND o."customer_phone" <> ''
   ORDER BY o."id", c."created_at"
)
UPDATE "orders" o
   SET "customer_id" = m."customer_id"
  FROM match m
 WHERE o."id" = m."order_id";
