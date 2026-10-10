-- A channel with no agent is a Page that goes quiet: the webhook receives the customer, finds no
-- agent on the channel and runs nothing, so the store sees the message in its inbox and never
-- replies. Merchants used to pick an agent per channel and picked wrong, so the agent is now the
-- store's own and nothing is chosen. This puts the existing rows in that shape.
--
-- Businesses that already have an agent keep it — the oldest one is what their channels were
-- answering with. Stores with no agent at all are left alone here: `ensureDefaultAgent()` creates
-- one the first time the store connects a page or opens the playground, so this file does not need
-- the prompt text and cannot drift from it.
--
-- Idempotent: replayed from scratch by tests/helpers/pglite-db.ts, applied once by hand to
-- production Neon. The second run matches rows this has already fixed and changes nothing.
UPDATE "channels" c
   SET "agent_id" = d."agent_id"
  FROM (
    SELECT DISTINCT ON ("business_id") "business_id", "id" AS "agent_id"
      FROM "agents"
     WHERE "deleted_at" IS NULL
     ORDER BY "business_id", "created_at"
  ) d
 WHERE c."deleted_at" IS NULL
   AND c."agent_id" IS NULL
   AND c."business_id" = d."business_id";
