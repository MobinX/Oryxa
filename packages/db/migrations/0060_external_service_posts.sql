-- External-service posts: maps the platform post id a caller receives from
-- /ext-service/:id/post back to the channel token that may read, edit or delete it.
-- Idempotent: replayed from scratch by tests/helpers/pglite-db.ts and applied once to
-- production Neon — a second run of either must be a no-op.

CREATE TABLE IF NOT EXISTS "external_service_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"platform_post_id" varchar(255) NOT NULL,
	"platform_channel_id" varchar(255) NOT NULL,
	"text" text,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "external_service_post" ADD CONSTRAINT "external_service_post_service_id_external_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."external_service"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "external_service_post" ADD CONSTRAINT "external_service_post_channel_id_external_service_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."external_service_channel"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "external_service_post_service_platform_post_idx" ON "external_service_post" USING btree ("service_id","platform_post_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_service_post_service_idx" ON "external_service_post" USING btree ("service_id");
