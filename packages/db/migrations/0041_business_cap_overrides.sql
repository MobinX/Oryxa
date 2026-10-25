-- Operators sometimes need one store on a bespoke allowance without inventing a plan.
-- NULL means "follow the plan"; 0 stays a freeze; positive integers are the custom cap.
-- One DO block: the migrator executes each file as a single prepared statement.
DO $$
BEGIN
  ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "message_limit_override" integer;
  ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "comment_limit_override" integer;
END $$;
