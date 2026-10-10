-- A Facebook Page can only ever be wired to one store. Inbound webhooks arrive carrying only
-- the Page id, so `getChannelByPageId` has to guess which business a message belongs to when
-- two rows claim the same Page — and it guessed wrong, writing one tenant's customers into
-- another tenant's inbox. The guess is impossible once the database refuses the duplicate.
--
-- Partial (`WHERE deleted_at IS NULL`) so a Page can be disconnected and reconnected later;
-- the soft-deleted row stays as history. Idempotent: replayed from scratch by
-- tests/helpers/pglite-db.ts, applied once by hand to production.
CREATE UNIQUE INDEX IF NOT EXISTS "channels_platform_channel_live_idx"
  ON "channels" USING btree ("platform", "platform_channel_id")
  WHERE "deleted_at" IS NULL;
