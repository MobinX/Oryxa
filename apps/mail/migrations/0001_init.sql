-- OnlyOrders mail: mandatory metadata only. Bodies and attachments live in B2 JSON.

CREATE TABLE IF NOT EXISTS mailboxes (
  id         TEXT PRIMARY KEY,
  address    TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name       TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS emails (
  id                  TEXT PRIMARY KEY,
  mailbox_id          TEXT NOT NULL REFERENCES mailboxes(id),
  direction           TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_email          TEXT NOT NULL,
  from_name           TEXT,
  to_email            TEXT NOT NULL,
  subject             TEXT NOT NULL DEFAULT '',
  message_id          TEXT,
  provider            TEXT NOT NULL DEFAULT '',
  provider_message_id TEXT,
  json_key            TEXT NOT NULL,
  json_url            TEXT NOT NULL,
  size_bytes          INTEGER NOT NULL DEFAULT 0,
  attachment_count    INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'received',
  is_trashed          INTEGER NOT NULL DEFAULT 0 CHECK (is_trashed IN (0, 1)),
  trashed_at          TEXT,
  received_at         TEXT,
  created_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_emails_mailbox_created
  ON emails (mailbox_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_emails_mailbox_trashed
  ON emails (mailbox_id, is_trashed, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_mailbox_message
  ON emails (mailbox_id, message_id)
  WHERE message_id IS NOT NULL AND message_id <> '';

CREATE INDEX IF NOT EXISTS idx_emails_provider_message
  ON emails (provider_message_id)
  WHERE provider_message_id IS NOT NULL AND provider_message_id <> '';
