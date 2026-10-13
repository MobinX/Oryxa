-- The default agent's instructions live in the database, not in code: one default_agent row is the system
-- prompt every following store reads, and production's copy was byte-identical to the seed in
-- packages/db/crud/default-agent.ts (8150 characters, verified before this was written). Three spans in it
-- have to change because the agent now sells a SIZE rather than a product:
--
--   * a tapped Order button carries the variant it was pressed on, so the sentence that tells the model
--     what a tap means has to name that variant, and say the tap settled the size question;
--   * two tools the prompt never mentions are two tools the model reaches for late — show_product_info
--     (one card per size of a product, each ordering that exact variant) and show_variant_photos (every
--     photo of one size);
--   * show_orders was never in the prompt at all, and the one thing it must not do is recite as text the
--     list it just sent as cards, order UUIDs included, which is exactly what a customer was handed today.
--
-- Each replace() rewrites a span that appears exactly once in the stored text. Applied in order they turn
-- the old prompt into the current seed character for character, which was checked before writing this.
-- The two rewrites whose anchor text disappears are self-guarding; the third INSERTS a section and so is
-- written next to text that stays, which means the statement needs a guard of its own: it only runs while
-- the prompt has no show_orders section in it. Re-running therefore settles on the same answer instead of
-- appending the section a second time, and a row an admin had already edited by hand is passed over
-- rather than overwritten, because its anchors no longer match.
UPDATE "default_agent"
   SET "system_prompt" = replace(replace(replace("system_prompt", $old1$A message that asks to place an order and names a product id, such as "place order with <productId> and <name>", means the customer pressed that card's Order button. The product is already chosen, so do not search again. Ask only for what the order still needs.
$old1$, $new1$A message that asks to place an order and names a product id, such as "place order with <productId> and <name> variant <variantId>", means the customer pressed that card's Order button. The product is already chosen, so do not search again. Ask only for what the order still needs, and pass the variant the tap named.

---

## show_product_info

Use it when the customer wants a product that comes in several sizes and has not said which one.

It sends one card per size: that size's photo, its price, how many are left, and an Order button that orders exactly that variant.

Never choose a size for the customer, and never place an order without one.

---

## show_variant_photos

Use it when the customer wants a closer look at a size they have already settled on — another picture, the back of it, the label.

It sends every photo of that one variant as a list, each card carrying the same price and the same stock, with an Order button for that variant.
$new1$), $old2$Variant if applicable
$old2$, $new2$Variant — which size the customer chose. A product sold in several sizes cannot be ordered without one, and the tool refuses rather than guessing.
$new2$), $old3$
---

## cancel_order
$old3$, $new3$
---

## show_orders

Use when the customer asks what they have ordered before

• My previous orders

• What did I order last time

• Show my past purchases

It finds their own orders by itself, needs no arguments, and sends them as a list of cards with a Track order button on each. Ten at a time, newest first; ask whether they want the older ones and call it again if they say yes.

The cards are the list: never write the orders out again in text, and never put an order id, product id or variant id in a message — a customer cannot tap a UUID in a sentence.

---

## cancel_order
$new3$)
 WHERE "system_prompt" NOT LIKE '%## show_orders%';
