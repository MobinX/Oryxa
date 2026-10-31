import type {
  EmailRow,
  Env,
  MailboxRow,
  MailboxStorage,
  PersistInput,
  StoredEmail,
} from "../types";
import { ApiError } from "./errors";
import {
  attachmentKey,
  deletePrefix,
  emailJsonKey,
  emailPrefix,
  getJson,
  putObject,
} from "./b2";
import { isEmail, keySafeFilename, normalizeEmail } from "./mime";

function nowIso(): string {
  return new Date().toISOString();
}

export async function ensureMailbox(env: Env, address: string, name?: string): Promise<MailboxRow> {
  const normalized = normalizeEmail(address);
  if (!isEmail(normalized)) {
    throw new ApiError(400, "invalid_mailbox", "Mailbox address is not a valid email address");
  }

  const existing = await env.DB.prepare("SELECT * FROM mailboxes WHERE address = ?")
    .bind(normalized)
    .first<MailboxRow>();
  if (existing) {
    if (name && !existing.name) {
      const updatedAt = nowIso();
      await env.DB.prepare("UPDATE mailboxes SET name = ?, updated_at = ? WHERE id = ?")
        .bind(name.slice(0, 200), updatedAt, existing.id)
        .run();
      return { ...existing, name: name.slice(0, 200), updated_at: updatedAt };
    }
    return existing;
  }

  const id = crypto.randomUUID();
  const timestamp = nowIso();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO mailboxes (id, address, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, normalized, name?.slice(0, 200) || null, timestamp, timestamp)
    .run();

  const row = await env.DB.prepare("SELECT * FROM mailboxes WHERE address = ?")
    .bind(normalized)
    .first<MailboxRow>();
  if (!row) throw new ApiError(500, "mailbox_create_failed", "Could not create mailbox");
  return row;
}

export async function getMailbox(env: Env, id: string): Promise<MailboxRow | null> {
  return await env.DB.prepare("SELECT * FROM mailboxes WHERE id = ?").bind(id).first<MailboxRow>();
}

export async function getMailboxByAddress(env: Env, address: string): Promise<MailboxRow | null> {
  return await env.DB.prepare("SELECT * FROM mailboxes WHERE address = ?")
    .bind(normalizeEmail(address))
    .first<MailboxRow>();
}

export async function getEmailRow(env: Env, id: string): Promise<EmailRow | null> {
  return await env.DB.prepare("SELECT * FROM emails WHERE id = ?").bind(id).first<EmailRow>();
}

export async function findInboundDuplicate(
  env: Env,
  mailboxId: string,
  messageId: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT id FROM emails WHERE mailbox_id = ? AND message_id = ? LIMIT 1",
  )
    .bind(mailboxId, messageId)
    .first<{ id: string }>();
  return row?.id ?? null;
}

async function safeCleanup(env: Env, mailboxId: string, emailId: string): Promise<void> {
  try {
    await deletePrefix(env, emailPrefix(env, mailboxId, emailId));
  } catch (error) {
    console.error("mail_cleanup_failed", {
      emailId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function persistEmail(
  env: Env,
  input: PersistInput,
): Promise<{ document: StoredEmail; row: EmailRow }> {
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const jsonKey = emailJsonKey(env, input.mailboxId, id);
  const attachments = input.attachments || [];

  const storedAttachments = attachments.map((attachment, index) => {
    const filename = keySafeFilename(attachment.filename, `attachment-${index + 1}`);
    return {
      id: attachment.id,
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.content.byteLength,
      disposition: attachment.disposition,
      contentId: attachment.contentId,
      b2Key: attachmentKey(env, input.mailboxId, id, attachment.id, filename),
      content: attachment.content,
    };
  });

  try {
    for (const attachment of storedAttachments) {
      await putObject(env, attachment.b2Key, attachment.content, attachment.contentType);
    }

    const document: StoredEmail = {
      version: 1,
      id,
      mailboxId: input.mailboxId,
      direction: input.direction,
      messageId: input.messageId,
      inReplyTo: input.inReplyTo || null,
      references: input.references || [],
      from: input.from,
      to: input.to,
      cc: input.cc || [],
      bcc: input.bcc || [],
      replyTo: input.replyTo || [],
      subject: input.subject,
      date: input.date,
      receivedAt: input.receivedAt,
      text: input.text,
      html: input.html,
      headers: input.headers || [],
      attachments: storedAttachments.map(({ content: _content, ...meta }) => meta),
      provider: {
        name: input.provider,
        messageId: input.providerMessageId || null,
        ...(input.providerRawSize === undefined ? {} : { rawSize: input.providerRawSize }),
      },
      sizeBytes: 0,
      createdAt: timestamp,
    };

    const attachmentBytes = storedAttachments.reduce((sum, item) => sum + item.size, 0);
    const initialJson = JSON.stringify(document);
    const totalBytes = new TextEncoder().encode(initialJson).byteLength + attachmentBytes;
    document.sizeBytes = totalBytes;
    const json = JSON.stringify(document);
    const storedBytes = new TextEncoder().encode(json).byteLength + attachmentBytes;

    await putObject(env, jsonKey, json, "application/json");

    const toEmail = input.to[0]?.email || "";
    try {
      await env.DB.prepare(
        `INSERT INTO emails (
          id, mailbox_id, direction, from_email, from_name, to_email, subject,
          message_id, provider, provider_message_id, json_key, json_url,
          size_bytes, attachment_count, status, is_trashed, received_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
        .bind(
          id,
          input.mailboxId,
          input.direction,
          input.from.email,
          input.from.name || null,
          toEmail,
          input.subject,
          input.messageId,
          input.provider,
          input.providerMessageId || null,
          jsonKey,
          `/api/emails/${id}/content`,
          storedBytes,
          storedAttachments.length,
          input.status,
          input.receivedAt,
          timestamp,
        )
        .run();
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
        await safeCleanup(env, input.mailboxId, id);
        throw new ApiError(409, "duplicate_email", "An email with this Message-ID already exists");
      }
      throw error;
    }

    const row = await getEmailRow(env, id);
    if (!row) throw new ApiError(500, "email_insert_failed", "Email metadata was not stored");
    return { document: { ...document, sizeBytes: storedBytes }, row };
  } catch (error) {
    if (!(error instanceof ApiError && error.code === "duplicate_email")) {
      await safeCleanup(env, input.mailboxId, id);
    }
    throw error;
  }
}

export async function readEmailDocument(env: Env, row: EmailRow): Promise<StoredEmail | null> {
  return await getJson<StoredEmail>(env, row.json_key);
}

export async function trashEmails(
  env: Env,
  ids: string[],
): Promise<{ requested: number; found: number; updated: number; already_trashed: number; storage_freed_bytes: number }> {
  if (ids.length === 0) return { requested: 0, found: 0, updated: 0, already_trashed: 0, storage_freed_bytes: 0 };
  const placeholders = ids.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT id, size_bytes, is_trashed FROM emails WHERE id IN (${placeholders})`,
  )
    .bind(...ids)
    .all<{ id: string; size_bytes: number; is_trashed: number }>();

  const active = rows.results.filter((row) => row.is_trashed === 0);
  if (active.length > 0) {
    const activePlaceholders = active.map(() => "?").join(",");
    await env.DB.prepare(
      `UPDATE emails SET is_trashed = 1, trashed_at = ? WHERE id IN (${activePlaceholders}) AND is_trashed = 0`,
    )
      .bind(nowIso(), ...active.map((row) => row.id))
      .run();
  }

  return {
    requested: ids.length,
    found: rows.results.length,
    updated: active.length,
    already_trashed: rows.results.length - active.length,
    storage_freed_bytes: active.reduce((sum, row) => sum + row.size_bytes, 0),
  };
}

export async function restoreEmails(
  env: Env,
  ids: string[],
): Promise<{ requested: number; found: number; restored: number; storage_added_bytes: number }> {
  if (ids.length === 0) return { requested: 0, found: 0, restored: 0, storage_added_bytes: 0 };
  const placeholders = ids.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT id, size_bytes, is_trashed FROM emails WHERE id IN (${placeholders})`,
  )
    .bind(...ids)
    .all<{ id: string; size_bytes: number; is_trashed: number }>();

  const trashed = rows.results.filter((row) => row.is_trashed === 1);
  if (trashed.length > 0) {
    const trashedPlaceholders = trashed.map(() => "?").join(",");
    await env.DB.prepare(
      `UPDATE emails SET is_trashed = 0, trashed_at = NULL WHERE id IN (${trashedPlaceholders}) AND is_trashed = 1`,
    )
      .bind(...trashed.map((row) => row.id))
      .run();
  }

  return {
    requested: ids.length,
    found: rows.results.length,
    restored: trashed.length,
    storage_added_bytes: trashed.reduce((sum, row) => sum + row.size_bytes, 0),
  };
}

export async function hardDeleteEmails(
  env: Env,
  ids: string[],
): Promise<{
  requested: number;
  found: number;
  deleted: number;
  freed_bytes: number;
  failed: Array<{ id: string; error: string }>;
}> {
  if (ids.length === 0) return { requested: 0, found: 0, deleted: 0, freed_bytes: 0, failed: [] };
  const placeholders = ids.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT id, mailbox_id, size_bytes FROM emails WHERE id IN (${placeholders})`,
  )
    .bind(...ids)
    .all<{ id: string; mailbox_id: string; size_bytes: number }>();

  const deletedIds: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  let freedBytes = 0;

  for (const row of rows.results) {
    try {
      await deletePrefix(env, emailPrefix(env, row.mailbox_id, row.id));
      deletedIds.push(row.id);
      freedBytes += row.size_bytes;
    } catch (error) {
      failed.push({ id: row.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (deletedIds.length > 0) {
    const deletedPlaceholders = deletedIds.map(() => "?").join(",");
    await env.DB.prepare(`DELETE FROM emails WHERE id IN (${deletedPlaceholders})`)
      .bind(...deletedIds)
      .run();
  }

  return {
    requested: ids.length,
    found: rows.results.length,
    deleted: deletedIds.length,
    freed_bytes: freedBytes,
    failed,
  };
}

export async function markEmailSent(env: Env, id: string, providerMessageId: string): Promise<EmailRow | null> {
  try {
    await env.DB.prepare(
      "UPDATE emails SET status = 'sent', message_id = ?, provider_message_id = ? WHERE id = ?",
    )
      .bind(providerMessageId || null, providerMessageId || null, id)
      .run();
  } catch {
    await env.DB.prepare(
      "UPDATE emails SET status = 'sent', provider_message_id = ? WHERE id = ?",
    )
      .bind(providerMessageId || null, id)
      .run();
  }
  return await getEmailRow(env, id);
}

export async function markEmailFailed(env: Env, id: string): Promise<void> {
  await env.DB.prepare("UPDATE emails SET status = 'failed' WHERE id = ?").bind(id).run();
}

export async function mailboxStorage(env: Env, mailboxId: string): Promise<MailboxStorage | null> {
  const mailbox = await getMailbox(env, mailboxId);
  if (!mailbox) return null;
  const row = await env.DB.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN is_trashed = 0 THEN size_bytes ELSE 0 END), 0) AS used_bytes,
       COALESCE(SUM(CASE WHEN is_trashed = 1 THEN size_bytes ELSE 0 END), 0) AS trashed_bytes,
       COALESCE(SUM(size_bytes), 0) AS physical_bytes,
       COALESCE(SUM(CASE WHEN is_trashed = 0 THEN 1 ELSE 0 END), 0) AS active_emails,
       COALESCE(SUM(CASE WHEN is_trashed = 1 THEN 1 ELSE 0 END), 0) AS trashed_emails,
       COUNT(*) AS total_emails
     FROM emails WHERE mailbox_id = ?`,
  )
    .bind(mailboxId)
    .first<Omit<MailboxStorage, "mailbox_id" | "address" | "name">>();
  if (!row) return null;
  return {
    mailbox_id: mailbox.id,
    address: mailbox.address,
    name: mailbox.name,
    used_bytes: Number(row.used_bytes),
    trashed_bytes: Number(row.trashed_bytes),
    physical_bytes: Number(row.physical_bytes),
    active_emails: Number(row.active_emails),
    trashed_emails: Number(row.trashed_emails),
    total_emails: Number(row.total_emails),
  };
}

export async function allMailboxStorage(env: Env): Promise<MailboxStorage[]> {
  const rows = await env.DB.prepare(
    `SELECT
       m.id AS mailbox_id,
       m.address,
       m.name,
       COALESCE(SUM(CASE WHEN e.is_trashed = 0 THEN e.size_bytes ELSE 0 END), 0) AS used_bytes,
       COALESCE(SUM(CASE WHEN e.is_trashed = 1 THEN e.size_bytes ELSE 0 END), 0) AS trashed_bytes,
       COALESCE(SUM(e.size_bytes), 0) AS physical_bytes,
       COALESCE(SUM(CASE WHEN e.is_trashed = 0 THEN 1 ELSE 0 END), 0) AS active_emails,
       COALESCE(SUM(CASE WHEN e.is_trashed = 1 THEN 1 ELSE 0 END), 0) AS trashed_emails,
       COUNT(e.id) AS total_emails
     FROM mailboxes m
     LEFT JOIN emails e ON e.mailbox_id = m.id
     GROUP BY m.id
     ORDER BY used_bytes DESC, m.created_at DESC`,
  ).all<MailboxStorage>();
  return rows.results.map((row) => ({
    ...row,
    used_bytes: Number(row.used_bytes),
    trashed_bytes: Number(row.trashed_bytes),
    physical_bytes: Number(row.physical_bytes),
    active_emails: Number(row.active_emails),
    trashed_emails: Number(row.trashed_emails),
    total_emails: Number(row.total_emails),
  }));
}

export function serializeEmailRow(row: EmailRow): Record<string, unknown> {
  return {
    id: row.id,
    mailbox_id: row.mailbox_id,
    direction: row.direction,
    from: { email: row.from_email, name: row.from_name || "" },
    to_email: row.to_email,
    subject: row.subject,
    message_id: row.message_id,
    provider: row.provider,
    provider_message_id: row.provider_message_id,
    json_key: row.json_key,
    json_url: row.json_url,
    size_bytes: row.size_bytes,
    attachment_count: row.attachment_count,
    status: row.status,
    is_trashed: row.is_trashed === 1,
    trashed_at: row.trashed_at,
    received_at: row.received_at,
    created_at: row.created_at,
  };
}

export function sumStorage(rows: MailboxStorage[]): Omit<MailboxStorage, "mailbox_id" | "address" | "name"> {
  return rows.reduce(
    (total, row) => ({
      used_bytes: total.used_bytes + row.used_bytes,
      trashed_bytes: total.trashed_bytes + row.trashed_bytes,
      physical_bytes: total.physical_bytes + row.physical_bytes,
      active_emails: total.active_emails + row.active_emails,
      trashed_emails: total.trashed_emails + row.trashed_emails,
      total_emails: total.total_emails + row.total_emails,
    }),
    {
      used_bytes: 0,
      trashed_bytes: 0,
      physical_bytes: 0,
      active_emails: 0,
      trashed_emails: 0,
      total_emails: 0,
    },
  );
}
