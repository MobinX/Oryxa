-- A notice stored in the app and a notice the merchant actually received are different facts.
-- Messenger copies were sent fire-and-forget, so a send Meta refused (the merchant had not
-- messaged the page inside its window) left no trace and looked identical to one that arrived.
-- This records the outcome on the notice itself. One DO block: the migrator executes each file as
-- a single prepared statement.
DO $$
BEGIN
  ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "messenger_status" varchar(16);
  ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "messenger_recipients" integer;
  ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "messenger_delivered" integer;
  ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "messenger_detail" text;
END $$;
