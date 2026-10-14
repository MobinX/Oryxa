-- The default agent's system prompt is a row in the database, so a change to the seed in
-- packages/db/crud/default-agent.ts does nothing until SQL moves that row — migration 0024 was written for
-- the same reason, and production's row was again byte-identical to the previous seed (9534 chars, verified
-- before this file was written) because no admin has edited it.
--
-- What changed is the answer to a customer on the virsys page who asked to see all the pictures of one size
-- and was told, instead, to supply the size's id. A variant UUID lives in a card's Order button, which is
-- never written into the messages table, so on the NEXT turn the model has only the words on the card back —
-- "Encilor — Fg" — and the only tool that could show the pictures demanded a UUID it could not get from
-- anything in front of it. It asked the customer, who has no id to give, and separately promised pictures
-- that were never sent, because a size can hold one photo while the sentence around it says "every picture".
--
--   * a size is named the way a customer names it: its word, the label printed on its photo, or an id the
--     model already has from a search. Asking a customer for an id is now forbidden outright, in the prompt
--     as well as in the tools, because it can never be answered;
--   * the tools hand back the facts that make the asking unnecessary — each size's id, label and picture
--     count — so a later turn is answered from a result, not from a guess;
--   * the count is stated as a count: a one-photo size is told it is the only picture, and the words "all"
--     and "every" belong only to a set that actually went out whole.
--
-- Each statement rewrites one span, guarded by position(): it runs only while the old span is still present
-- AND the new one is not, so a re-run finds nothing to do rather than appending text twice. That guard is
-- load-bearing here, not decoration — one of these spans keeps its own old sentence inside its new text,
-- which is exactly the mistake migration 0024 made and this file does not repeat.
UPDATE "default_agent"
   SET "system_prompt" = replace("system_prompt", $old1$It sends one card per size: that size's photo, its price, how many are left, and an Order button that orders exactly that variant.
$old1$, $new1$It sends one card per size: that size's photo, its price, how many are left, and an Order button that orders exactly that variant. It also returns each size's id, its label and how many pictures it has, so every later tool can be called without asking the customer anything.
$new1$)
 WHERE position($old1$It sends one card per size: that size's photo, its price, how many are left, and an Order button that orders exactly that variant.
$old1$ in "system_prompt") > 0
   AND position($new1$It sends one card per size: that size's photo, its price, how many are left, and an Order button that orders exactly that variant. It also returns each size's id, its label and how many pictures it has, so every later tool can be called without asking the customer anything.
$new1$ in "system_prompt") = 0;
--> statement-breakpoint
UPDATE "default_agent"
   SET "system_prompt" = replace("system_prompt", $old2$Use it when the customer wants a closer look at a size they have already settled on — another picture, the back of it, the label.
$old2$, $new2$Use it when the customer wants a closer look at a size — another picture, the back of it, the label.
$new2$)
 WHERE position($old2$Use it when the customer wants a closer look at a size they have already settled on — another picture, the back of it, the label.
$old2$ in "system_prompt") > 0
   AND position($new2$Use it when the customer wants a closer look at a size — another picture, the back of it, the label.
$new2$ in "system_prompt") = 0;
--> statement-breakpoint
UPDATE "default_agent"
   SET "system_prompt" = replace("system_prompt", $old3$It sends every photo of that one variant as a list, each card carrying the same price and the same stock, with an Order button for that variant.
$old3$, $new3$Name the size the way the customer did: its word ("Fg", "Black XL"), the five-character label printed on its photo ("DAA03"), or an id from a search you already ran. You never need an id from the customer, and asking for one is never the answer — nobody on their side can read or type a UUID.

It sends the pictures this store actually holds of that one size as a list, each card carrying the same price and the same stock, with an Order button for that variant. The result tells you how many pictures exist: say that number, and never promise a picture that was not sent.
$new3$)
 WHERE position($old3$It sends every photo of that one variant as a list, each card carrying the same price and the same stock, with an Order button for that variant.
$old3$ in "system_prompt") > 0
   AND position($new3$Name the size the way the customer did: its word ("Fg", "Black XL"), the five-character label printed on its photo ("DAA03"), or an id from a search you already ran. You never need an id from the customer, and asking for one is never the answer — nobody on their side can read or type a UUID.

It sends the pictures this store actually holds of that one size as a list, each card carrying the same price and the same stock, with an Order button for that variant. The result tells you how many pictures exist: say that number, and never promise a picture that was not sent.
$new3$ in "system_prompt") = 0;
--> statement-breakpoint
UPDATE "default_agent"
   SET "system_prompt" = replace("system_prompt", $old4$The cards are the list: never write the orders out again in text, and never put an order id, product id or variant id in a message — a customer cannot tap a UUID in a sentence.
$old4$, $new4$The cards are the list: never write the orders out again in text, never put an order id, product id or variant id in a message, and never ask the customer for one either. Nobody can read or type a UUID, so asking is a dead end, not a question — the only things a customer can give you are a size's name, the label printed on a photo, or a tap on a card.
$new4$)
 WHERE position($old4$The cards are the list: never write the orders out again in text, and never put an order id, product id or variant id in a message — a customer cannot tap a UUID in a sentence.
$old4$ in "system_prompt") > 0
   AND position($new4$The cards are the list: never write the orders out again in text, never put an order id, product id or variant id in a message, and never ask the customer for one either. Nobody can read or type a UUID, so asking is a dead end, not a question — the only things a customer can give you are a size's name, the label printed on a photo, or a tap on a card.
$new4$ in "system_prompt") = 0;
--> statement-breakpoint
UPDATE "default_agent"
   SET "system_prompt" = replace("system_prompt", $old5$Every variant in this store has a short label: three letters and two digits, like AFG23. The merchant prints that label in a corner of the variant's own photo, so a picture the customer sends usually carries the answer inside it.
$old5$, $new5$Every variant in this store has a short label: five characters of letters and digits, like AFG23. The merchant prints that label in a corner of the variant's own photo, so a picture the customer sends usually carries the answer inside it. A size's word ("Fg", "Black", "Small") is not a label even when it is five characters long — name that word to show_variant_photos or show_product_info instead.
$new5$)
 WHERE position($old5$Every variant in this store has a short label: three letters and two digits, like AFG23. The merchant prints that label in a corner of the variant's own photo, so a picture the customer sends usually carries the answer inside it.
$old5$ in "system_prompt") > 0
   AND position($new5$Every variant in this store has a short label: five characters of letters and digits, like AFG23. The merchant prints that label in a corner of the variant's own photo, so a picture the customer sends usually carries the answer inside it. A size's word ("Fg", "Black", "Small") is not a label even when it is five characters long — name that word to show_variant_photos or show_product_info instead.
$new5$ in "system_prompt") = 0;
--> statement-breakpoint
UPDATE "default_agent"
   SET "system_prompt" = replace("system_prompt", $old6$Tell the customer you cannot verify it.
$old6$, $new6$Say that you cannot verify it, and never invent a number of pictures, a size or a price that a tool result has not just given you.
$new6$)
 WHERE position($old6$Tell the customer you cannot verify it.
$old6$ in "system_prompt") > 0
   AND position($new6$Say that you cannot verify it, and never invent a number of pictures, a size or a price that a tool result has not just given you.
$new6$ in "system_prompt") = 0;
