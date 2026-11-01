-- Console admins: DB-backed identities, per-admin mail address, capabilities and sessions.
-- The superuser row stores a scrypt hash only; the plaintext password is never in the repo.
CREATE TYPE "public"."console_role" AS ENUM('superuser', 'admin');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "console_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(255) NOT NULL,
  "name" varchar(255),
  "password_hash" text NOT NULL,
  "role" "console_role" DEFAULT 'admin' NOT NULL,
  "capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "console_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "console_sessions" (
  "token_hash" varchar(64) PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "console_users"("id") ON DELETE CASCADE,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "console_sessions_user_idx" ON "console_sessions" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "console_sessions_expiry_idx" ON "console_sessions" ("expires_at");
--> statement-breakpoint
INSERT INTO "console_users" (
  "id", "email", "name", "password_hash", "role", "capabilities", "is_active"
) VALUES (
  '5fcf53f4-493a-4719-b419-3ac2af9bc473',
  'ceo@onlyorders.tech',
  'CEO',
  'scrypt$16384$8$1$ebOojzvJ4rlWt3QgaMGubw$4JU5n3-ka59UPDffU76ZwgY6DIboanNZZ8cVgPBaZF86tN9QTQb9ZxqgqL9fP3KOPVA_NMNzBUHNwwwkd1WYyw',
  'superuser',
  '[]'::jsonb,
  true
)
ON CONFLICT ("email") DO NOTHING;
