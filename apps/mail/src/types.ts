import type { D1Database } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  B2_KEY_ID: string;
  B2_APPLICATION_KEY: string;
  B2_BUCKET_NAME: string;
  B2_ENDPOINT: string;
  B2_REGION: string;
  B2_JSON_PREFIX?: string;
  MAIL_API_KEY: string;
  SENDER_API_KEY?: string;
  BREVO_API_KEY?: string;
  MAIL_SEND_PROVIDER?: string;
  MAIL_SEND_TIMEOUT_MS?: string;
  MAIL_SEND_MAX_ATTEMPTS?: string;
  ALLOWED_FROM_DOMAINS?: string;
  SPAM_THRESHOLD?: string;
  DEFAULT_FROM_EMAIL: string;
  DEFAULT_FROM_NAME: string;
  MAX_SEND_BYTES?: string;
}

export interface MailboxRow {
  id: string;
  address: string;
  name: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailRow {
  id: string;
  mailbox_id: string;
  direction: "inbound" | "outbound";
  from_email: string;
  from_name: string | null;
  to_email: string;
  subject: string;
  message_id: string | null;
  provider: string;
  provider_message_id: string | null;
  json_key: string;
  json_url: string;
  size_bytes: number;
  attachment_count: number;
  status: string;
  is_trashed: number;
  trashed_at: string | null;
  received_at: string | null;
  created_at: string;
  // Migration 0002 columns; optional so rows read from a pre-migration
  // database (or SELECT projections) still typecheck.
  spam_score?: number | null;
  is_spam?: number | null;
  spam_reason?: string | null;
  failure_code?: string | null;
  failure_message?: string | null;
}

export interface StoredAddress {
  email: string;
  name: string;
}

export interface StoredAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  disposition: string;
  contentId: string | null;
  b2Key: string;
}

export interface StoredEmail {
  version: 1;
  id: string;
  mailboxId: string;
  direction: "inbound" | "outbound";
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  from: StoredAddress;
  to: StoredAddress[];
  cc: StoredAddress[];
  bcc: StoredAddress[];
  replyTo: StoredAddress[];
  subject: string;
  date: string;
  receivedAt: string;
  text: string;
  html: string;
  headers: Array<{ key: string; value: string }>;
  attachments: StoredAttachment[];
  provider: {
    name: string;
    messageId: string | null;
    rawSize?: number;
  };
  sizeBytes: number;
  createdAt: string;
  spam?: {
    score: number;
    isSpam: boolean;
    reasons: string[];
    threshold: number;
  };
}

export interface MailboxStorage {
  mailbox_id: string;
  address?: string;
  name?: string | null;
  used_bytes: number;
  trashed_bytes: number;
  physical_bytes: number;
  active_emails: number;
  trashed_emails: number;
  total_emails: number;
}

export interface AttachmentInput {
  id: string;
  filename: string;
  contentType: string;
  disposition: string;
  contentId: string | null;
  content: Uint8Array;
}

export interface PersistInput {
  mailboxId: string;
  direction: "inbound" | "outbound";
  messageId: string | null;
  inReplyTo?: string | null;
  references?: string[];
  from: StoredAddress;
  to: StoredAddress[];
  cc?: StoredAddress[];
  bcc?: StoredAddress[];
  replyTo?: StoredAddress[];
  subject: string;
  date: string;
  receivedAt: string;
  text: string;
  html: string;
  headers?: Array<{ key: string; value: string }>;
  attachments?: AttachmentInput[];
  provider: string;
  providerMessageId?: string | null;
  providerRawSize?: number;
  status: string;
  spam?: {
    score: number;
    isSpam: boolean;
    reasons: string[];
    threshold: number;
  };
}
