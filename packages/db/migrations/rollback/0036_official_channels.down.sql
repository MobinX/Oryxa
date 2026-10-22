-- Rollback for migration 0036_official_channels.sql (disposable-DB tested; never run against
-- production without operator sign-off). Removes only what 0036 created plus the one column
-- it relaxed. The 'tiktok' platform value cannot be dropped from a Postgres enum; it is
-- reserved and harmless — noted here rather than faked in SQL.

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
-- Refuses (errors) while any official conversation still has no business; the operator
-- must move or remove those rows deliberately — never from this script.
ALTER TABLE "conversations" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
DROP TYPE IF EXISTS "prospect_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "ticket_priority";
--> statement-breakpoint
DROP TYPE IF EXISTS "ticket_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "ticket_type";
