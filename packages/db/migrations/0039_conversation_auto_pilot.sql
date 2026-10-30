-- Per-conversation auto reply switch. Existing threads keep answering (true) until a
-- merchant turns it off from the inbox.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "auto_pilot" boolean DEFAULT true NOT NULL;
