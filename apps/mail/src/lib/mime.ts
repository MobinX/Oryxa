import PostalMime from "postal-mime";
import type { StoredAddress } from "../types";

export class MimeParseError extends Error {}

interface ParsedAddress {
  name?: string;
  address?: string;
  group?: ParsedAddress[];
}

interface ParsedAttachment {
  filename: string | null;
  mimeType: string;
  disposition: string | null;
  related?: boolean;
  contentId?: string;
  content: ArrayBuffer | Uint8Array | string;
  encoding?: "base64" | "utf8";
}

interface ParsedEmail {
  headers: Array<{ key: string; value: string }>;
  from?: ParsedAddress;
  to?: ParsedAddress[];
  cc?: ParsedAddress[];
  bcc?: ParsedAddress[];
  replyTo?: ParsedAddress[];
  subject?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  date?: string;
  html?: string;
  text?: string;
  attachments: ParsedAttachment[];
}

export interface InboundAttachment {
  filename: string;
  contentType: string;
  disposition: string;
  contentId: string | null;
  content: Uint8Array;
}

export interface InboundEmail {
  from: StoredAddress;
  to: StoredAddress[];
  cc: StoredAddress[];
  bcc: StoredAddress[];
  replyTo: StoredAddress[];
  subject: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  date: string;
  text: string;
  html: string;
  headers: Array<{ key: string; value: string }>;
  attachments: InboundAttachment[];
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isEmail(value: string): boolean {
  return /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/.test(value);
}

export function toStoredAddress(value: unknown): StoredAddress {
  if (typeof value === "string") {
    return { email: normalizeEmail(value), name: "" };
  }
  if (value && typeof value === "object") {
    const candidate = value as { email?: unknown; address?: unknown; name?: unknown };
    const email = typeof candidate.email === "string" ? candidate.email : candidate.address;
    if (typeof email === "string") {
      return {
        email: normalizeEmail(email),
        name: typeof candidate.name === "string" ? candidate.name.trim().slice(0, 200) : "",
      };
    }
  }
  throw new MimeParseError("Invalid email address");
}

function pickMailbox(value: ParsedAddress | undefined): StoredAddress | null {
  if (!value) return null;
  if (value.address) {
    return { email: normalizeEmail(value.address), name: (value.name || "").slice(0, 200) };
  }
  if (value.group?.length) return pickMailbox(value.group[0]);
  return null;
}

function flattenAddresses(values: ParsedAddress[] | undefined): StoredAddress[] {
  const result: StoredAddress[] = [];
  for (const value of values || []) {
    if (value.address) {
      result.push({ email: normalizeEmail(value.address), name: (value.name || "").slice(0, 200) });
    } else if (value.group) {
      result.push(...flattenAddresses(value.group));
    }
  }
  return result;
}

function attachmentBytes(attachment: ParsedAttachment): Uint8Array {
  if (typeof attachment.content === "string") {
    if (attachment.encoding === "base64") return base64ToBytes(attachment.content);
    return new TextEncoder().encode(attachment.content);
  }
  if (attachment.content instanceof ArrayBuffer) return new Uint8Array(attachment.content);
  const view = attachment.content;
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

export function base64ToBytes(input: string): Uint8Array {
  let value = input.trim();
  if (value.startsWith("data:")) {
    const comma = value.indexOf(",");
    if (comma === -1) throw new Error("Invalid data URL");
    value = value.slice(comma + 1);
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function sanitizeFilename(value: string, fallback: string): string {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f/\\]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
  return cleaned || fallback;
}

export function keySafeFilename(value: string, fallback: string): string {
  const cleaned = sanitizeFilename(value, fallback)
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
  return cleaned || fallback;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function textToHtml(text: string): string {
  return `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(text)}</pre>`;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export async function parseInboundEmail(
  raw: ReadableStream,
  envelopeFrom: string,
  envelopeTo: string,
): Promise<InboundEmail> {
  let parsed: ParsedEmail;
  try {
    parsed = (await PostalMime.parse(raw, {
      attachmentEncoding: "arraybuffer",
    })) as unknown as ParsedEmail;
  } catch (error) {
    throw new MimeParseError(error instanceof Error ? error.message : "Unable to parse MIME message");
  }

  const from = pickMailbox(parsed.from) || { email: normalizeEmail(envelopeFrom), name: "" };
  const to = flattenAddresses(parsed.to);
  if (to.length === 0) to.push({ email: normalizeEmail(envelopeTo), name: "" });

  const dateValue = parsed.date && !Number.isNaN(Date.parse(parsed.date))
    ? new Date(parsed.date).toISOString()
    : new Date().toISOString();

  const attachments = parsed.attachments.map((attachment, index) => {
    const fallback = attachment.related ? `inline-${index + 1}` : `attachment-${index + 1}`;
    return {
      filename: sanitizeFilename(attachment.filename || "", fallback),
      contentType: attachment.mimeType || "application/octet-stream",
      disposition: attachment.disposition || (attachment.related ? "inline" : "attachment"),
      contentId: attachment.contentId || null,
      content: attachmentBytes(attachment),
    };
  });

  return {
    from,
    to,
    cc: flattenAddresses(parsed.cc),
    bcc: flattenAddresses(parsed.bcc),
    replyTo: flattenAddresses(parsed.replyTo),
    subject: (parsed.subject || "(no subject)").slice(0, 2000),
    messageId: parsed.messageId?.slice(0, 500) || null,
    inReplyTo: parsed.inReplyTo?.slice(0, 500) || null,
    references: parsed.references
      ? parsed.references.split(/\s+/).filter(Boolean).slice(0, 100)
      : [],
    date: dateValue,
    text: parsed.text || "",
    html: parsed.html || "",
    headers: parsed.headers.slice(0, 500).map((header) => ({
      key: header.key,
      value: header.value,
    })),
    attachments,
  };
}
