-- The default agent's system prompt is a row in the database, so a change to the seed in
-- packages/db/crud/default-agent.ts reaches nobody until SQL moves that row. Production's row was verified
-- byte-identical to the previous seed (11192 chars, migration 0026 applied) before this file was written.
--
-- What this answers is a customer who asked, twice in one sitting, which categories the shop has — and was
-- sent the same two product cards both times, with the sentence "we have products in 2 categories" where
-- the 2 was the PRODUCT count. Nothing in the prompt told the model how to answer a question about kinds,
-- because nothing in the catalog block in front of it named the store's shelves either: that block only
-- reached the category read past ten products, and every live store sits under ten.
--
-- The paragraph states the rule the block now supports: a question about kinds is answered in words from
-- the catalog, and a product count is never a category count.
--
-- Guarded by position(): it runs only while the old paragraph is present AND the new one is not, so
-- re-running does nothing rather than appending the paragraph twice. Every anchor here is written inline,
-- because a closing dollar-quote on the next line makes the newline part of the literal — which matches
-- nothing and turns the migration into a silent no-op. That is how the first version of this file failed.
UPDATE "default_agent"
   SET "system_prompt" = replace("system_prompt", $old1$When the customer names a kind of thing instead of a product, such as "what sarees do you have", pass that kind as the category and no search word. If their word matches nothing the store groups by, the result lists the categories the merchant actually uses: offer those in your own words, and never ask for a category id.$old1$, $new1$When the customer names a kind of thing instead of a product, such as "what sarees do you have", pass that kind as the category and no search word. If their word matches nothing the store groups by, the result lists the categories the merchant actually uses: offer those in your own words, and never ask for a category id.

A customer asking which kinds or categories the shop carries is answered in words from the catalog you were given: name its shelves, or say the store groups nothing. The number of products is not the number of categories, and a product card list is not the answer to that question.$new1$)
 WHERE position($old1$offer those in your own words, and never ask for a category id.$old1$ in "system_prompt") > 0
   AND position($new1$A customer asking which kinds or categories the shop carries is answered in words from the catalog you were given$new1$ in "system_prompt") = 0;
