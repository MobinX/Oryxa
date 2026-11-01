-- Payment methods become merchant-defined instead of a hardcoded bKash/Nagad rule: the store
-- lists each way it takes money with the account the customer pays into, and says whether that
-- method cannot be ordered without a transaction id. An empty list is today's behaviour, so no
-- existing store changes. One DO block: the migrator executes each file as a single prepared
-- statement.
DO $$
BEGIN
  ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "payment_methods" jsonb NOT NULL DEFAULT '[]'::jsonb;
END $$;
