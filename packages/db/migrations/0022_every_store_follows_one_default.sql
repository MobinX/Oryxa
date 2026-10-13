-- One agent to answer with. The default has always been a constant in code COPIED into a store's row
-- when the store was created, so editing it reached only the stores created afterwards and left the ones
-- answering customers today untouched — the same drift 0021 patched by hand. This is the row an operator
-- edits once and every merchant follows, plus the flag that says whether a store's own copy is still in
-- charge of its replies.
--
-- Deliberately NOT seeded here: the prompt text lives in packages/db/crud/default-agent.ts and the row is
-- created on first read. Copying seven thousand characters into SQL would make a second source that drifts
-- exactly the way the first one did.
--
-- Nothing is deleted. A store that starts following the default keeps its own text in its own row, dormant,
-- so turning one store back into an override is one UPDATE and no archaeology.
--
-- Idempotent: replayed from scratch by tests/helpers/pglite-db.ts, applied once by hand to production Neon.
-- The guard on the heading below is its own undo check — re-running it settles on the same answer.
CREATE TABLE IF NOT EXISTS "default_agent" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "name" varchar(255) NOT NULL DEFAULT 'Oryxa Sales Agent',
  "platform_type" platform NOT NULL DEFAULT 'facebook',
  "system_prompt" text NOT NULL,
  "reply_guidance" text,
  "comment_reply_guidance" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "follows_default" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
-- The exception, and the reason this is an UPDATE rather than a blanket default: a prompt that begins with
-- its own heading was written by somebody, not copied from a template. It keeps answering its own customers.
UPDATE "agents" SET "follows_default" = false
 WHERE "deleted_at" IS NULL AND "system_prompt" LIKE '# IDENTITY%';
