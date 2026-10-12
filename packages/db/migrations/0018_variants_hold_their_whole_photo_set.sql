-- A variant is one thing, and one thing has more than one side: the front of the jacket, the
-- lining, the colour on a real person. The column held a single key, so a merchant with four
-- photos of one size either chose one and threw the rest away or split the size into variants
-- that differed only by picture.
--
-- The set is a second column rather than a replacement. `image_url` keeps holding the cover —
-- the first picture — because every reader that shows one image (Messenger cards, the storefront
-- thumbnail, an order's snapshot) already reads it, and a cover is what those surfaces want.
-- Nothing here changes what they see.
--
-- Idempotent: replayed from scratch by tests/helpers/pglite-db.ts, applied once by hand to
-- production Neon. The backfill only touches rows still holding an empty set, so a second run
-- matches what it already filled and changes nothing.
ALTER TABLE "variants" ADD COLUMN IF NOT EXISTS "image_urls" text[] NOT NULL DEFAULT '{}'::text[];--> statement-breakpoint

UPDATE "variants" SET "image_urls" = ARRAY["image_url"] WHERE "image_url" IS NOT NULL AND "image_urls" = '{}'::text[];
