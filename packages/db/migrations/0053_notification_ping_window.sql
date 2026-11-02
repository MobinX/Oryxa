-- Merchant alerts die quietly: Meta only lets a page message someone for seven days after that
-- person's last message, so an owner who never writes back stops receiving order and human-help
-- notices. Recording the last PING gives the portal a deadline to show and the webhook something
-- to renew. One DO block: the migrator executes each file as a single prepared statement.
DO $$
BEGIN
  ALTER TABLE "messenger_notification_user_info" ADD COLUMN IF NOT EXISTS "last_ping_at" timestamp;
END $$;
