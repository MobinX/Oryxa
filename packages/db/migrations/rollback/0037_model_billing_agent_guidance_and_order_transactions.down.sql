ALTER TABLE "businesses" DROP COLUMN IF EXISTS "agent_product_guidance";
ALTER TABLE "businesses" DROP COLUMN IF EXISTS "agent_bargain_guidance";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "transaction_id";
DROP TABLE IF EXISTS "model_billing";
UPDATE "default_agent"
SET "system_prompt" = replace(
  "system_prompt",
  E'\n\n## Payment Transaction IDs\nWhen the customer chooses bKash or Nagad, ask for the transaction ID from their payment confirmation SMS before calling create_order. Pass it as transactionId; never invent or reuse one. Cash on delivery needs no transaction ID.',
  ''
)
WHERE position('## Payment Transaction IDs' in "system_prompt") > 0;
