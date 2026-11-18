-- The product-answer writer is the first subagent whose instructions an operator can edit without a
-- deploy. Its text is seeded on first read from `SUBAGENT_DEFINITIONS` in @repo/shared, not copied
-- into this file: a second copy would drift from the reviewed default the console offers to restore,
-- and a prompt pasted into SQL is exactly the kind of hidden source this table exists to replace.
CREATE TABLE IF NOT EXISTS "subagents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" varchar(64) NOT NULL,
  "name" varchar(255) NOT NULL,
  "system_prompt" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "subagents_key_unique" UNIQUE("key")
);
