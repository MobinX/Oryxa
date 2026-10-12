-- The reply guidance — the wording block that tells the agent how to answer, as opposed to who it
-- is — used to be a constant in code, so tuning it for one store was a deploy. Two columns make it
-- the store's own text, editable in the admin playground the same way its system prompt is.
--
-- NULL is not "empty instructions": both runners read NULL as "use Oryxa's built-in wording", which
-- is the reviewed text every store ships with today. So this adds nothing to existing rows on
-- purpose — no store's replies change because of this migration, and clearing a box in the UI
-- returns a store to exactly that state.
--
-- Idempotent: replayed from scratch by tests/helpers/pglite-db.ts, applied once by hand to
-- production Neon.
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "reply_guidance" text;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "comment_reply_guidance" text;
