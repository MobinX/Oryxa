-- The default agent's system prompt is a row in the database, so a change to the seed in
-- packages/db/crud/default-agent.ts reaches nobody until SQL moves that row. Production's row was verified
-- byte-identical to the previous seed (10515 chars) before this file was written, so this rewrite finds its
-- anchor where it expects it.
--
-- What this answers is a shop with more products than one message can carry. show_products sends ten cards,
-- and a catalog of a hundred and thirty-seven would have been described to the customer as ten products,
-- because nothing in the prompt or the result said otherwise. The tools now carry the real numbers —
-- matchingProducts, showing, hasMore — and this section tells the model to believe them instead of its own
-- eyes: a partial page is named a page, the whole count is offered, and the next ten come from a repeat call
-- rather than from a claim.
--
-- The second paragraph is the other half of the same problem. "What sarees do you have" is not a product
-- search; it is a category, and a category is only knowable if the model is told to pass the customer's word
-- for it and leave the search word out. When that word matches nothing, the tool already answers with the
-- categories the merchant actually uses, so the model offers those instead of inventing a group or asking
-- for an id nobody has.
--
-- One statement, guarded by position(): it runs only while the old span is still present AND the new one is
-- not, so re-running it does nothing rather than appending the two paragraphs a second time. The new span
-- keeps the old sentences inside it, which is why the guard is load-bearing here — migration 0024 shipped
-- without one and production had to be repaired by hand.
UPDATE "default_agent"
   SET "system_prompt" = replace("system_prompt", $old1$It sends the customer a card for each match: a photo, the name, the price, a short summary and an Order button.

Never repeat those details in a message after the cards went out.
$old1$, $new1$It sends the customer a card for each match: a photo, the name, the price, a short summary and an Order button.

A card list carries ten products and a store can hold many more, so what you sent can be one page of a bigger catalog. The result says how many products match and which window you showed. While it says there are more, tell the customer the store has that many and these are the first ten, then offer the next page — never call one page the full range.

When the customer names a kind of thing instead of a product, such as "what sarees do you have", pass that kind as the category and no search word. If their word matches nothing the store groups by, the result lists the categories the merchant actually uses: offer those in your own words, and never ask for a category id.

Never repeat those details in a message after the cards went out.
$new1$)
 WHERE position($old1$It sends the customer a card for each match: a photo, the name, the price, a short summary and an Order button.

Never repeat those details in a message after the cards went out.
$old1$ in "system_prompt") > 0
   AND position($new1$A card list carries ten products and a store can hold many more, so what you sent can be one page of a bigger catalog.
$new1$ in "system_prompt") = 0;
