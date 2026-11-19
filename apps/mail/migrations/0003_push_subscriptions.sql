-- OnlyOrders mail migration 0003: Firebase Cloud Messaging (FCM) push subscriptions.
-- Additive only. One row per device token; a token is re-bound when another admin
-- signs in on the same browser/device. Subscriptions are scoped to the console
-- session that created them, so signing out (or the session expiring) stops the
-- inbox pushes without touching the admin's account.
-- Apply with:
--   wrangler d1 execute onlyorders-mail-db --local  --file=./migrations/0003_push_subscriptions.sql
--   wrangler d1 execute onlyorders-mail-db --remote --file=./migrations/0003_push_subscriptions.sql

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           TEXT PRIMARY KEY,
  admin_id     TEXT NOT NULL,
  admin_email  TEXT NOT NULL COLLATE NOCASE,
  mailbox_id   TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  -- SHA-256 of the console session token. The token itself never reaches D1.
  session_id   TEXT NOT NULL,
  -- FCM registration token for one browser / app install.
  token        TEXT NOT NULL,
  platform     TEXT NOT NULL DEFAULT 'web' CHECK (platform IN ('web', 'android', 'ios')),
  device_label TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  -- Mirrors the console session expiry; an expired row never receives a push.
  expires_at   TEXT NOT NULL,
  revoked_at   TEXT
);

-- One live registration per device token. A different admin signing in on the
-- same device re-binds the row instead of creating a second delivery target.
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_token
  ON push_subscriptions (token);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_mailbox
  ON push_subscriptions (mailbox_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_session
  ON push_subscriptions (session_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_admin
  ON push_subscriptions (admin_id);

CREATE TABLE IF NOT EXISTS push_deliveries (
  id              TEXT PRIMARY KEY,
  -- Deliberately not a foreign key: a stale registration is deleted right after its
  -- failed delivery is logged, and the audit row must survive that cleanup.
  subscription_id TEXT NOT NULL,
  email_id        TEXT,
  status          TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error_code      TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_deliveries_subscription
  ON push_deliveries (subscription_id);

CREATE INDEX IF NOT EXISTS idx_push_deliveries_created
  ON push_deliveries (created_at DESC);
