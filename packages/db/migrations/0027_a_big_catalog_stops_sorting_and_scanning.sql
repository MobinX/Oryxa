-- A catalog tool that pages reads a store's products in name order and then, for every product on the
-- page, its sizes — because a card needs the size's photo, price and stock, and the order a customer taps
-- has to name a variant. Both halves were doing their work the slow way, and neither shows up at this
-- store's sizes:
--
--   * "variants" has no index on product_id at all (production pg_indexes: only the primary key and
--     variant_id). The relational read the catalog now uses pushes that into one lateral per product, so
--     a page of ten sizes out the whole variants table ten times. Seventy-four products make that free;
--     a thousand products with five sizes each makes it the slowest thing in the reply.
--   * "products" is filtered by business and then sorted by name for a stable page. The only usable index
--     is the partial unique on (business_id, slug), which cannot answer an ORDER BY name, so every page
--     paid a sort of the store's own rows.
--
-- These two indexes are what makes the paging honest rather than merely correct: the numbers a customer is
-- told only mean anything if asking for page two does not cost more than asking for page one.
CREATE INDEX IF NOT EXISTS "variants_product_id_idx" ON "variants" ("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_business_name_idx" ON "products" ("business_id", "name");
