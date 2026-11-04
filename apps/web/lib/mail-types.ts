export interface Mailbox {
  id: string;
  address: string;
  name: string | null;
  created_at: string;
  updated_at: string;
}

export interface MailAddress {
  email: string;
  name: string;
}

export interface MailRow {
  id: string;
  mailbox_id: string;
  direction: 'inbound' | 'outbound';
  from: MailAddress;
  to_email: string;
  subject: string;
  message_id: string | null;
  provider: string;
  provider_message_id: string | null;
  size_bytes: number;
  attachment_count: number;
  status: string;
  is_trashed: boolean;
  received_at: string | null;
  created_at: string;
}

export interface MailAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  disposition: string;
  contentId: string | null;
  b2Key: string;
}

export interface MailContent {
  id: string;
  mailboxId: string;
  direction: 'inbound' | 'outbound';
  messageId: string | null;
  from: MailAddress;
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  replyTo: MailAddress[];
  subject: string;
  date: string;
  text: string;
  html: string;
  attachments: MailAttachment[];
  provider: { name: string; messageId: string | null };
  sizeBytes: number;
}

export interface MailListResponse {
  mailbox: Mailbox;
  emails: MailRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface MailDetailResponse {
  email: MailRow;
  content: MailContent | null;
  content_available: boolean;
}
