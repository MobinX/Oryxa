DO $$
BEGIN
  ALTER TABLE "businesses" DROP COLUMN IF EXISTS "message_limit_override";
  ALTER TABLE "businesses" DROP COLUMN IF EXISTS "comment_limit_override";
END $$;
