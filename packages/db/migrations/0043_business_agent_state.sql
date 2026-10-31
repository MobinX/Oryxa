-- A business-wide agent switch, controlled from the merchant dashboard or by sending
-- ON/OFF from a connected notification Messenger account. True (the default) keeps every
-- existing store answering exactly as before; false stores incoming messages but runs no
-- automatic reply.
DO $$
BEGIN
  ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "agent_state" boolean NOT NULL DEFAULT true;
END $$;
