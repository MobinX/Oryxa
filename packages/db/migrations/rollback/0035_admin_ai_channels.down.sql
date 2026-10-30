-- Rollback for migration 0035_admin_ai_channels.sql (disposable-DB tested; never run against
-- production without operator sign-off). Removes only what 0035 created — no existing
-- entity is touched, so this restores the pre-0035 schema exactly.

DROP TABLE IF EXISTS "lead_events";
--> statement-breakpoint
DROP TABLE IF EXISTS "capacity_reservations";
--> statement-breakpoint
DROP TABLE IF EXISTS "leads";
--> statement-breakpoint
DROP TYPE IF EXISTS "lead_status";
--> statement-breakpoint
DROP TABLE IF EXISTS "capacity";
--> statement-breakpoint
DROP TABLE IF EXISTS "knowledge_entries";
--> statement-breakpoint
DROP TABLE IF EXISTS "business_profiles";
--> statement-breakpoint
DROP TABLE IF EXISTS "channel_ai_configs";
--> statement-breakpoint
-- Only drop if our own migration added the column (pre-0035 schema has neither).
ALTER TABLE "messages" DROP COLUMN IF EXISTS "sent_by";
--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN IF EXISTS "ai_paused";
