-- A variant has a uuid, and a uuid is fine for a machine and useless for a person: nobody reads
-- "9f1c…" off a shelf label or repeats it over the phone. Merchants want a short handle they can
-- say, sticker and search — three letters and two digits.
--
-- The label is unique inside one business, not across them, because the row does not know which
-- business it belongs to, only which product: so the column is plain, uniqueness is held at write
-- time against that business's own labels, and a lookup always joins its way to the business.
-- Two shops holding "KQP42" is expected and harmless.
--
-- Rows that predate this get a label here instead of by hand, built from the row's place in its
-- business — letters carry the place in base 26, digits carry it in base 100, so two rows in one
-- business would have to sit 439,400 apart to collide. Rows written after this get a shuffled
-- label from the app, re-rolled until the business does not already hold it.
--
-- Idempotent: replayed from scratch by tests/helpers/pglite-db.ts, applied once by hand to
-- production Neon. `variant_id IS NULL` leaves filled rows alone, and the label is only refused
-- when that same business already hands it out — a label is unique per business, not per table.
ALTER TABLE "variants" ADD COLUMN IF NOT EXISTS "variant_id" varchar(5);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "variants_variant_id_idx" ON "variants" USING btree ("variant_id");--> statement-breakpoint

UPDATE "variants" v SET "variant_id" = r."label"
FROM (
  SELECT "id", "business_id", "label"
  FROM (
    SELECT "id", "business_id",
      CHR(65 + ("rn" % 26)::int)
      || CHR(65 + (FLOOR("rn" / 26)::int % 26))
      || CHR(65 + (FLOOR("rn" / 676)::int % 26))
      || LPAD(("rn" % 100)::text, 2, '0') AS "label"
    FROM (
      SELECT v2."id", p2."business_id",
        ROW_NUMBER() OVER (PARTITION BY p2."business_id" ORDER BY v2."id") AS "rn"
      FROM "variants" v2
      JOIN "products" p2 ON p2."id" = v2."product_id"
      WHERE v2."variant_id" IS NULL AND v2."deleted_at" IS NULL
    ) ranked
  ) made
  WHERE NOT EXISTS (
    SELECT 1 FROM "variants" held
    JOIN "products" owned ON owned."id" = held."product_id"
    WHERE held."variant_id" = made."label" AND owned."business_id" = made."business_id"
  )
) r
WHERE v."id" = r."id";
