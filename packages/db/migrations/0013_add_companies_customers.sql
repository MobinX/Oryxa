-- Companies (a tenant tier above a business), the customer book each company
-- keeps, and the optional link from a product to the customer it was made for.
--
-- Every statement is idempotent because this file is replayed from scratch by
-- tests/helpers/pglite-db.ts on a fresh cluster, and applied once by hand to
-- production Neon — the second run of either must be a no-op.
--
-- Nothing here rewrites an existing row and no column is NOT NULL without a
-- default, so applying it to the live fleet changes nothing for a merchant who
-- has no company: `businesses.company_id IS NULL` is the state every row is in.

CREATE TABLE IF NOT EXISTS "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"phone" varchar(20),
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone" varchar(20),
	"email" varchar(255),
	"address" text,
	"avatar" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "companies" ADD CONSTRAINT "companies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
-- The book is read as "everyone this company has served, by name", which is both
-- filters on the list page.
CREATE INDEX IF NOT EXISTS "customers_company_idx" ON "customers" USING btree ("company_id","name");--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "company_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "businesses" ADD CONSTRAINT "businesses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "businesses_company_id_idx" ON "businesses" USING btree ("company_id");--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "customer_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_customer_id_idx" ON "products" USING btree ("customer_id");
