-- OnlyOrders mail migration 0002: inbound spam flags + outbound failure detail.
-- Additive only: new nullable/defaulted columns plus one index. Apply with:
--   wrangler d1 execute onlyorders-mail-db --local  --file=./migrations/0002_spam_and_failures.sql
--   wrangler d1 execute onlyorders-mail-db --remote --file=./migrations/0002_spam_and_failures.sql

ALTER TABLE emails ADD COLUMN spam_score REAL NOT NULL DEFAULT 0;
ALTER TABLE emails ADD COLUMN is_spam INTEGER NOT NULL DEFAULT 0 CHECK (is_spam IN (0, 1));
ALTER TABLE emails ADD COLUMN spam_reason TEXT;
ALTER TABLE emails ADD COLUMN failure_code TEXT;
ALTER TABLE emails ADD COLUMN failure_message TEXT;

CREATE INDEX IF NOT EXISTS idx_emails_mailbox_spam
  ON emails (mailbox_id, is_spam, created_at DESC);
