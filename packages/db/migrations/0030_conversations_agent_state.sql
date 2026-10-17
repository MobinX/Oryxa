ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "agent_state" jsonb NOT NULL DEFAULT '{}'::jsonb;
