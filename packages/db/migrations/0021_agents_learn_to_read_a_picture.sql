-- An agent's prompt is a row, not a template. Editing the default this app ships changes the next
-- agent and leaves every existing one blind, and the existing ones are the ones answering today:
-- a customer has already sent a photo to this store's Page, and the agent still cannot read it.
--
-- Appended, never replaced. A merchant who rewrote their own prompt keeps what they wrote and gains
-- the reading rules at the end, because the section adds a skill rather than restating a persona.
--
-- Idempotent: replayed from scratch by tests/helpers/pglite-db.ts, applied once by hand to
-- production Neon. The guard on the section heading is its own undo check — a second run matches
-- nothing it just wrote.
UPDATE "agents" SET "system_prompt" = "system_prompt" || E'\n\n---\n\n# Pictures the customer sends\n\nA customer often asks with a photo instead of a sentence: the thing they already own, the colour they mean, the seam that broke.\n\nWhen a message carries a picture, look at it before you answer.\n\nEvery variant in this store has a short label: three letters and two digits, like AFG23. The merchant prints that label in a corner of the variant''s own photo, so a picture the customer sends usually carries the answer inside it.\n\nIf you can read such a code on the picture, or the customer typed one, call get_product_by_variant_id with it first. Leave out the # if they wrote one.\n\nWhen it finds the item, that is exactly what the customer means. Show it with show_products and name the variant in one line. Never offer a different size or colour of it.\n\nWhen the code is not there, or the tool finds nothing, put the label aside and read the picture itself: what the thing is, what colour it is, what it is made of, what is written on it. Then search get_product with the words that best describe what you see, and answer from what comes back.\n\nIf you cannot see a picture at all, or the history says one was attached and it is gone, say plainly that you cannot see it and ask the customer to send it again or describe it in words. Never pretend to have looked.\n\nNever invent a match. A label this store does not issue is not a product, and a picture you cannot place is not one either.'
WHERE "deleted_at" IS NULL AND "system_prompt" NOT LIKE '%# Pictures the customer sends%';
