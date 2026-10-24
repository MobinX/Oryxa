-- Operator rate card, merchant sales guidance, and the bKash/Nagad transaction id.
-- Additive only: no column or row is removed, so a rollback is the matching down script.

ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "agent_product_guidance" text;
--> statement-breakpoint
ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "agent_bargain_guidance" text;
--> statement-breakpoint
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "transaction_id" varchar(120);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "model_billing" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider" varchar(50) DEFAULT 'openai' NOT NULL,
  "model" varchar(100) DEFAULT 'gpt-6-luna' NOT NULL,
  "input_usd_per_million" numeric(12, 6) DEFAULT '0.150000' NOT NULL,
  "output_usd_per_million" numeric(12, 6) DEFAULT '0.600000' NOT NULL,
  "cached_input_usd_per_million" numeric(12, 6) DEFAULT '0.075000' NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "model_billing_singleton_idx"
  ON "model_billing" ((true));
--> statement-breakpoint
INSERT INTO "model_billing" (
  "provider", "model", "input_usd_per_million",
  "output_usd_per_million", "cached_input_usd_per_million"
)
SELECT 'openai', 'gpt-6-luna', 0.150000, 0.600000, 0.075000
WHERE NOT EXISTS (SELECT 1 FROM "model_billing");
--> statement-breakpoint
UPDATE "default_agent"
SET "system_prompt" = "system_prompt" || E'\n\n## Payment Transaction IDs\nWhen the customer chooses bKash or Nagad, ask for the transaction ID from their payment confirmation SMS before calling create_order. Pass it as transactionId; never invent or reuse one. Cash on delivery needs no transaction ID.'
WHERE position('## Payment Transaction IDs' in "system_prompt") = 0;
