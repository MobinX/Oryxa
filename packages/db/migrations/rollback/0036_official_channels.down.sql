-- Rollback for migration 0036_official_channels.sql (disposable-DB tested; never run against
-- production without operator sign-off). Removes only what 0036 created plus the one column
-- it relaxed. The 'tiktok' platform value cannot be dropped from a Postgres enum; it is
-- reserved and harmless — noted here rather than faked in SQL.

-- Refuses (errors) FIRST, before dropping anything, while any conversation still has no
-- business; official channels make such rows legitimately, so the operator must move or
-- remove those rows deliberately — never from this script.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "conversations" WHERE "business_id" IS NULL) THEN
    RAISE EXCEPTION 'rollback 0036 aborted: conversations.business_id has NULL rows (official-channel conversations); move or remove them deliberately first';
  END IF;
END $$;
--> statement-breakpoint
DROP TABLE IF EXISTS "prospect_weights";
--> statement-breakpoint
DROP TABLE IF EXISTS "prospect_events";
--> statement-breakpoint
DROP TABLE IF EXISTS "prospects";
--> statement-breakpoint
DROP TABLE IF EXISTS "ticket_events";
--> statement-breakpoint
DROP TABLE IF EXISTS "tickets";
--> statement-breakpoint
DROP TABLE IF EXISTS "official_settings";
--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
DROP TYPE IF EXISTS "prospect_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "ticket_priority";
--> statement-breakpoint
DROP TYPE IF EXISTS "ticket_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "ticket_type";
