import { Hono, type Context } from "hono";
import type { EmailRow, Env, MailboxRow, MailboxStorage, StoredAddress } from "./types";
import { ApiError, assert, errorPayload } from "./lib/errors";
import { getObject, presignGet } from "./lib/b2";
import { sendWithBrevo } from "./lib/brevo";
import { activeSendProvider, sendWithSenderNet } from "./lib/sender";
import {
  allMailboxStorage,
  ensureMailbox,
  getEmailRow,
  getMailbox,
  getMailboxByAddress,
  hardDeleteEmails,
  mailboxStorage,
  markEmailFailed,
  markEmailSent,
  persistEmail,
  readEmailDocument,
  restoreEmails,
  serializeEmailRow,
  sumStorage,
  trashEmails,
} from "./lib/store";
import {
  base64ToBytes,
  htmlToText,
  isEmail,
  sanitizeFilename,
  textToHtml,
  toStoredAddress,
} from "./lib/mime";

type AppEnv = { Bindings: Env };
type AppContext = Context<AppEnv>;

const MAX_TRASH_BATCH = 100;
const MAX_RESTORE_BATCH = 100;
const MAX_DELETE_BATCH = 10;
const MAX_ATTACHMENTS = 20;
const MAX_BODY_CHARS = 2_000_000;
const MAX_REQUEST_BYTES = 25 * 1024 * 1024;

const app = new Hono<AppEnv>();

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function ok(payload: Record<string, unknown>, status = 200): Response {
  return json(status, { ok: true, ...payload });
}

function fail(status: number, code: string, message: string, details?: unknown): Response {
  return json(status, {
    ok: false,
    error: { code, message, ...(details === undefined ? {} : { details }) },
  });
}

async function secureEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < leftBytes.length; i += 1) difference |= leftBytes[i] ^ rightBytes[i];
  return difference === 0;
}

app.use("*", async (c, next) => {
  const started = Date.now();
  await next();
  if (c.req.path.startsWith("/api/")) {
    console.log(
      JSON.stringify({
        event: "http",
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Date.now() - started,
      }),
    );
  }
});

app.use("/api/*", async (c, next) => {
  const expected = (c.env.MAIL_API_KEY || "").trim();
  if (!expected) {
    return fail(503, "not_configured", "MAIL_API_KEY is not configured on this Worker");
  }
  const authorization = c.req.header("authorization") || "";
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  const provided = (c.req.header("x-api-key") || bearer).trim();
  if (!provided || !(await secureEqual(provided, expected))) {
    return fail(401, "unauthorized", "Provide a valid x-api-key or Bearer token");
  }
  await next();
});

async function readJson(c: AppContext): Promise<Record<string, unknown>> {
  const length = Number(c.req.header("content-length") || 0);
  if (Number.isFinite(length) && length > MAX_REQUEST_BYTES) {
    throw new ApiError(413, "payload_too_large", "Request body exceeds 25 MB");
  }
  let value: unknown;
  try {
    value = await c.req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
  }
  assert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    400,
    "invalid_json",
    "Request body must be a JSON object",
  );
  return value as Record<string, unknown>;
}

function optionalString(value: unknown, field: string, maxLength = 500): string | undefined {
  if (value === undefined || value === null) return undefined;
  assert(typeof value === "string", 400, "invalid_field", `${field} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  assert(trimmed.length <= maxLength, 400, "invalid_field", `${field} is too long`);
  return trimmed;
}

function parseAddressList(
  value: unknown,
  field: string,
  required: boolean,
  max: number,
): StoredAddress[] {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ApiError(400, "missing_field", `${field} is required`);
    return [];
  }
  const list = Array.isArray(value) ? value : [value];
  assert(list.length <= max, 400, "too_many_addresses", `${field} accepts at most ${max} addresses`);
  const addresses: StoredAddress[] = [];
  for (const item of list) {
    let address: StoredAddress;
    try {
      address = toStoredAddress(item);
    } catch {
      throw new ApiError(400, "invalid_address", `${field} contains an invalid address`);
    }
    if (!isEmail(address.email)) {
      throw new ApiError(400, "invalid_address", `${field} contains an invalid address`);
    }
    addresses.push(address);
  }
  if (required && addresses.length === 0) {
    throw new ApiError(400, "missing_field", `${field} is required`);
  }
  return addresses;
}

function parseIds(value: unknown, max: number): string[] {
  assert(Array.isArray(value), 400, "invalid_ids", "ids must be an array of email ids");
  const ids = Array.from(
    new Set(
      value.map((item) => {
        assert(
          typeof item === "string" && item.trim().length > 0 && item.trim().length <= 100,
          400,
          "invalid_ids",
          "Every id must be a non-empty string",
        );
        return item.trim();
      }),
    ),
  );
  assert(ids.length > 0, 400, "invalid_ids", "ids must contain at least one email id");
  assert(ids.length <= max, 400, "batch_too_large", `At most ${max} ids are allowed per request`);
  return ids;
}

function intQuery(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  assert(
    Number.isInteger(parsed) && parsed >= min && parsed <= max,
    400,
    "invalid_query",
    `Expected an integer between ${min} and ${max}`,
  );
  return parsed;
}

function serializeMailbox(mailbox: MailboxRow): Record<string, unknown> {
  return {
    id: mailbox.id,
    address: mailbox.address,
    name: mailbox.name,
    created_at: mailbox.created_at,
    updated_at: mailbox.updated_at,
  };
}

function storageView(storage: MailboxStorage): Record<string, unknown> {
  return {
    mailbox_id: storage.mailbox_id,
    ...(storage.address === undefined ? {} : { address: storage.address }),
    ...(storage.name === undefined ? {} : { name: storage.name }),
    used_bytes: storage.used_bytes,
    used_mb: Number((storage.used_bytes / 1_048_576).toFixed(3)),
    trashed_bytes: storage.trashed_bytes,
    trashed_mb: Number((storage.trashed_bytes / 1_048_576).toFixed(3)),
    physical_bytes: storage.physical_bytes,
    physical_mb: Number((storage.physical_bytes / 1_048_576).toFixed(3)),
    active_emails: storage.active_emails,
    trashed_emails: storage.trashed_emails,
    total_emails: storage.total_emails,
  };
}

interface ParsedSendAttachment {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
  base64: string;
}

function parseSendAttachments(value: unknown, maxBytes: number): ParsedSendAttachment[] {
  if (value === undefined || value === null) return [];
  assert(Array.isArray(value), 400, "invalid_attachments", "attachments must be an array");
  assert(
    value.length <= MAX_ATTACHMENTS,
    400,
    "too_many_attachments",
    `At most ${MAX_ATTACHMENTS} attachments are allowed`,
  );

  const parsed: ParsedSendAttachment[] = [];
  let encodedTotal = 0;
  let decodedTotal = 0;
  const maxEncoded = Math.ceil((maxBytes * 4) / 3) + 16;

  for (const [index, item] of value.entries()) {
    assert(
      item !== null && typeof item === "object" && !Array.isArray(item),
      400,
      "invalid_attachments",
      "Each attachment must be an object",
    );
    const record = item as Record<string, unknown>;
    const filenameRaw =
      optionalString(record.filename, "attachment filename", 300) ||
      optionalString(record.name, "attachment filename", 300) ||
      `attachment-${index + 1}`;
    const filename = sanitizeFilename(filenameRaw, `attachment-${index + 1}`);
    const contentType =
      optionalString(record.content_type ?? record.contentType, "attachment content type", 200) ||
      "application/octet-stream";

    const rawBase64 =
      record.content_base64 ?? record.contentBase64 ?? record.content ?? record.base64;
    assert(
      typeof rawBase64 === "string" && rawBase64.trim().length > 0,
      400,
      "invalid_attachments",
      "Each attachment needs base64 content",
    );
    let base64 = rawBase64.trim();
    if (base64.startsWith("data:")) {
      const comma = base64.indexOf(",");
      assert(comma !== -1, 400, "invalid_attachments", "Invalid attachment data URL");
      base64 = base64.slice(comma + 1);
    }
    assert(
      base64.length <= maxEncoded,
      413,
      "attachment_too_large",
      `Attachment ${filename} exceeds the ${maxBytes} byte limit`,
    );
    encodedTotal += base64.length;
    assert(
      encodedTotal <= maxEncoded,
      413,
      "payload_too_large",
      `Attachments exceed the ${maxBytes} byte limit`,
    );

    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(base64);
    } catch {
      throw new ApiError(400, "invalid_attachments", `Attachment ${filename} is not valid base64`);
    }
    decodedTotal += bytes.byteLength;
    assert(
      decodedTotal <= maxBytes,
      413,
      "payload_too_large",
      `Attachments exceed the ${maxBytes} byte limit`,
    );

    parsed.push({ filename, contentType, bytes, base64 });
  }

  return parsed;
}

function maxSendBytes(env: Env): number {
  const parsed = Number(env.MAX_SEND_BYTES || "");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 10 * 1024 * 1024;
}

function downloadContentType(value: string): string {
  const type = value.toLowerCase().split(";")[0].trim();
  if (type.startsWith("image/") && !type.includes("svg")) return type;
  if (type === "application/pdf" || type === "text/plain") return type;
  return "application/octet-stream";
}

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

app.get("/", (c) =>
  ok({
    service: "onlyorders-mail",
    endpoints: [
      "GET /health",
      "POST /api/mailboxes",
      "GET /api/mailboxes",
      "GET /api/mailboxes/lookup?address=",
      "GET /api/mailboxes/:id",
      "GET /api/mailboxes/:id/emails",
      "POST /api/emails/send",
      "GET /api/emails/:id",
      "GET /api/emails/:id/content",
      "GET /api/emails/:id/attachments/:attachmentId",
      "GET /api/emails/:id/b2-url",
      "POST /api/emails/trash",
      "POST /api/emails/restore",
      "POST /api/emails/delete",
      "GET /api/storage",
    ],
    auth: "x-api-key or Authorization: Bearer",
    sending: "Brevo transactional API (primary) with optional Sender.net fallback",
    storage_note: "used_bytes excludes trash; trash is soft until POST /api/emails/delete",
  }),
);

app.get("/health", async (c) => {
  let database = "ok";
  try {
    await c.env.DB.prepare("SELECT 1").first();
  } catch {
    database = "error";
  }
  const ready = database === "ok";
  return ok(
    {
      service: "onlyorders-mail",
      database,
      b2_configured: Boolean(c.env.B2_KEY_ID && c.env.B2_APPLICATION_KEY && c.env.B2_BUCKET_NAME),
      sender_configured: Boolean((c.env.SENDER_API_KEY || "").trim()),
      brevo_configured: Boolean((c.env.BREVO_API_KEY || "").trim()),
      send_provider: activeSendProvider(c.env),
      time: new Date().toISOString(),
    },
    ready ? 200 : 503,
  );
});

app.post("/api/mailboxes", async (c) => {
  const body = await readJson(c);
  const address = optionalString(body.address, "address", 320);
  assert(address, 400, "missing_field", "address is required");
  const name = optionalString(body.name, "name", 200);

  const existing = await getMailboxByAddress(c.env, address);
  if (existing) {
    return ok({ created: false, mailbox: serializeMailbox(existing) }, 200);
  }
  const mailbox = await ensureMailbox(c.env, address, name);
  return ok({ created: true, mailbox: serializeMailbox(mailbox) }, 201);
});

app.get("/api/mailboxes", async (c) => {
  const [mailboxes, storage] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM mailboxes ORDER BY created_at DESC").all<MailboxRow>(),
    allMailboxStorage(c.env),
  ]);
  const storageById = new Map(storage.map((row) => [row.mailbox_id, row]));
  return ok({
    mailboxes: mailboxes.results.map((mailbox) => ({
      ...serializeMailbox(mailbox),
      storage: storageView(
        storageById.get(mailbox.id) || {
          mailbox_id: mailbox.id,
          address: mailbox.address,
          name: mailbox.name,
          used_bytes: 0,
          trashed_bytes: 0,
          physical_bytes: 0,
          active_emails: 0,
          trashed_emails: 0,
          total_emails: 0,
        },
      ),
    })),
  });
});

app.get("/api/mailboxes/lookup", async (c) => {
  const address = optionalString(c.req.query("address"), "address", 320);
  assert(address, 400, "missing_field", "address query parameter is required");
  const mailbox = await getMailboxByAddress(c.env, address);
  if (!mailbox) return fail(404, "mailbox_not_found", "No mailbox exists for that address");
  const storage = await mailboxStorage(c.env, mailbox.id);
  return ok({
    mailbox: serializeMailbox(mailbox),
    storage: storage ? storageView(storage) : null,
  });
});

app.get("/api/mailboxes/:id", async (c) => {
  const mailbox = await getMailbox(c.env, c.req.param("id"));
  if (!mailbox) return fail(404, "mailbox_not_found", "Mailbox not found");
  const storage = await mailboxStorage(c.env, mailbox.id);
  return ok({
    mailbox: serializeMailbox(mailbox),
    storage: storage ? storageView(storage) : null,
  });
});

app.get("/api/mailboxes/:id/emails", async (c) => {
  const mailboxId = c.req.param("id");
  const mailbox = await getMailbox(c.env, mailboxId);
  if (!mailbox) return fail(404, "mailbox_not_found", "Mailbox not found");

  const trashed = (c.req.query("trashed") || "false").toLowerCase();
  assert(
    ["true", "false", "all"].includes(trashed),
    400,
    "invalid_query",
    "trashed must be true, false or all",
  );
  const direction = c.req.query("direction");
  if (direction !== undefined) {
    assert(
      ["inbound", "outbound"].includes(direction),
      400,
      "invalid_query",
      "direction must be inbound or outbound",
    );
  }
  const limit = intQuery(c.req.query("limit"), 50, 1, 100);
  const offset = intQuery(c.req.query("offset"), 0, 0, 1_000_000);
  const query = (c.req.query("q") || "").trim().slice(0, 200);
  const since = c.req.query("since");

  const conditions = ["mailbox_id = ?"];
  const bindings: Array<string | number> = [mailboxId];

  if (trashed !== "all") {
    conditions.push("is_trashed = ?");
    bindings.push(trashed === "true" ? 1 : 0);
  }
  if (direction) {
    conditions.push("direction = ?");
    bindings.push(direction);
  }
  if (query) {
    conditions.push("(subject LIKE ? ESCAPE '\\' OR from_email LIKE ? ESCAPE '\\')");
    const escaped = query.replace(/[\\%_]/g, (character) => `\\${character}`);
    bindings.push(`%${escaped}%`, `%${escaped}%`);
  }
  if (since) {
    assert(!Number.isNaN(Date.parse(since)), 400, "invalid_query", "since must be an ISO date");
    conditions.push("created_at >= ?");
    bindings.push(new Date(since).toISOString());
  }

  const where = conditions.join(" AND ");
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM emails WHERE ${where}`)
    .bind(...bindings)
    .first<{ count: number }>();
  const rows = await c.env.DB.prepare(
    `SELECT * FROM emails WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
  )
    .bind(...bindings, limit, offset)
    .all<EmailRow>();

  return ok({
    mailbox: serializeMailbox(mailbox),
    emails: rows.results.map(serializeEmailRow),
    total: Number(total?.count || 0),
    limit,
    offset,
  });
});

app.post("/api/emails/send", async (c) => {
  const env = c.env;
  const body = await readJson(c);

  const mailboxId = optionalString(body.mailbox_id ?? body.mailboxId, "mailbox_id", 100);
  const mailboxAddress = optionalString(
    body.mailbox_address ?? body.mailboxAddress,
    "mailbox_address",
    320,
  );
  const fromList = parseAddressList(body.from, "from", false, 1);
  const from = fromList[0] || {
    email: env.DEFAULT_FROM_EMAIL,
    name: env.DEFAULT_FROM_NAME || "",
  };
  const to = parseAddressList(body.to, "to", true, 50);
  const cc = parseAddressList(body.cc, "cc", false, 50);
  const bcc = parseAddressList(body.bcc, "bcc", false, 50);
  const replyTo =
    parseAddressList(body.reply_to ?? body.replyTo, "reply_to", false, 1)[0] || null;

  const provider = activeSendProvider(env);
  if (!provider) {
    return fail(
      503,
      "provider_not_configured",
      "Neither SENDER_API_KEY nor BREVO_API_KEY is configured on this Worker",
    );
  }
  if (provider === "sender.net") {
    if (to.length !== 1) {
      return fail(
        400,
        "recipient_limit",
        "Sender.net sending supports exactly one recipient per request",
      );
    }
    if (cc.length || bcc.length) {
      return fail(400, "unsupported_field", "Sender.net sending does not support cc/bcc");
    }
  }

  let mailbox: MailboxRow;
  if (mailboxId) {
    const existing = await getMailbox(env, mailboxId);
    if (!existing) return fail(404, "mailbox_not_found", "Mailbox not found");
    mailbox = existing;
  } else {
    const address = mailboxAddress || from.email;
    if (!isEmail(address)) {
      return fail(400, "invalid_mailbox", "mailbox_address or from must be a valid email address");
    }
    mailbox = await ensureMailbox(env, address, optionalString(body.mailbox_name, "mailbox_name", 200));
  }

  const subject = optionalString(body.subject, "subject", 2000);
  assert(subject, 400, "missing_field", "subject is required");

  const htmlInput =
    typeof body.htmlContent === "string"
      ? body.htmlContent
      : typeof body.html === "string"
        ? body.html
        : "";
  const textInput =
    typeof body.textContent === "string"
      ? body.textContent
      : typeof body.text === "string"
        ? body.text
        : "";
  assert(
    htmlInput.length > 0 || textInput.length > 0,
    400,
    "missing_field",
    "html/text content is required",
  );
  assert(
    htmlInput.length <= MAX_BODY_CHARS && textInput.length <= MAX_BODY_CHARS,
    413,
    "payload_too_large",
    "Email body is too large",
  );

  const html = htmlInput || textToHtml(textInput);
  const text = textInput || htmlToText(htmlInput);
  const attachments = parseSendAttachments(body.attachments, maxSendBytes(env));
  const now = new Date().toISOString();
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 20)
    : [];

  const { row, document } = await persistEmail(env, {
    mailboxId: mailbox.id,
    direction: "outbound",
    messageId: null,
    from,
    to,
    cc,
    bcc,
    replyTo: replyTo ? [replyTo] : [],
    subject,
    date: now,
    receivedAt: now,
    text,
    html,
    attachments: attachments.map((attachment) => ({
      id: crypto.randomUUID(),
      filename: attachment.filename,
      contentType: attachment.contentType,
      disposition: "attachment",
      contentId: null,
      content: attachment.bytes,
    })),
    provider,
    status: "sending",
  });

  let result: { messageId: string };
  try {
    if (provider === "sender.net") {
      const senderAttachments = await Promise.all(
        document.attachments.map(async (attachment) => ({
          filename: attachment.filename,
          url: await presignGet(env, attachment.b2Key, 86400),
        })),
      );
      result = await sendWithSenderNet(env, {
        from,
        to: to[0],
        subject,
        html,
        text,
        attachments: senderAttachments,
      });
    } else {
      result = await sendWithBrevo(env, {
        from,
        to,
        cc,
        bcc,
        replyTo,
        subject,
        html,
        text,
        attachments: attachments.map((attachment) => ({
          filename: attachment.filename,
          contentBase64: attachment.base64,
        })),
        tags,
      });
    }
  } catch (error) {
    const cleanup = await hardDeleteEmails(env, [row.id]).catch(() => null);
    if (!cleanup || cleanup.deleted === 0) {
      await markEmailFailed(env, row.id).catch(() => {});
    }
    throw error;
  }

  let updated: EmailRow | null = null;
  let warning: string | undefined;
  try {
    updated = await markEmailSent(env, row.id, result.messageId);
  } catch {
    warning = "Email was sent, but the metadata status update failed";
  }

  return ok(
    {
      email: serializeEmailRow(updated || row),
      provider,
      provider_message_id: result.messageId,
      ...(warning ? { warning } : {}),
    },
    201,
  );
});

app.post("/api/emails/trash", async (c) => {
  const body = await readJson(c);
  const ids = parseIds(body.ids, MAX_TRASH_BATCH);
  const result = await trashEmails(c.env, ids);
  return ok({ ...result });
});

app.post("/api/emails/restore", async (c) => {
  const body = await readJson(c);
  const ids = parseIds(body.ids, MAX_RESTORE_BATCH);
  const result = await restoreEmails(c.env, ids);
  return ok({ ...result });
});

app.post("/api/emails/delete", async (c) => {
  const body = await readJson(c);
  let ids: string[];

  if (body.ids !== undefined) {
    ids = parseIds(body.ids, MAX_DELETE_BATCH);
  } else {
    const mailboxId = optionalString(body.mailbox_id ?? body.mailboxId, "mailbox_id", 100);
    const trashOnly = body.trashed === true || body.trash === true;
    assert(
      mailboxId && trashOnly,
      400,
      "invalid_request",
      "Provide ids, or mailbox_id with trashed: true to empty a mailbox trash",
    );
    const rows = await c.env.DB.prepare(
      "SELECT id FROM emails WHERE mailbox_id = ? AND is_trashed = 1 ORDER BY created_at ASC LIMIT ?",
    )
      .bind(mailboxId, MAX_DELETE_BATCH)
      .all<{ id: string }>();
    ids = rows.results.map((row) => row.id);
  }

  if (ids.length === 0) {
    return ok({ requested: 0, found: 0, deleted: 0, freed_bytes: 0, failed: [] });
  }

  const result = await hardDeleteEmails(c.env, ids);
  return ok({ ...result, partial: result.failed.length > 0 });
});

app.get("/api/emails/:id", async (c) => {
  const row = await getEmailRow(c.env, c.req.param("id"));
  if (!row) return fail(404, "email_not_found", "Email not found");
  let content = null;
  let contentError: string | undefined;
  try {
    content = await readEmailDocument(c.env, row);
  } catch (error) {
    contentError = error instanceof Error ? error.message : String(error);
  }
  return ok({
    email: serializeEmailRow(row),
    content,
    content_available: content !== null,
    ...(contentError ? { content_error: contentError } : {}),
  });
});

app.get("/api/emails/:id/content", async (c) => {
  const row = await getEmailRow(c.env, c.req.param("id"));
  if (!row) return fail(404, "email_not_found", "Email not found");
  const object = await getObject(c.env, row.json_key);
  if (!object) return fail(404, "content_not_found", "Stored email JSON was not found in B2");
  return new Response(object.body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});

app.get("/api/emails/:id/b2-url", async (c) => {
  const row = await getEmailRow(c.env, c.req.param("id"));
  if (!row) return fail(404, "email_not_found", "Email not found");
  const expires = intQuery(c.req.query("expires_in"), 3600, 60, 86400);
  const url = await presignGet(c.env, row.json_key, expires);
  return ok({
    url,
    key: row.json_key,
    expires_in: expires,
    expires_at: new Date(Date.now() + expires * 1000).toISOString(),
  });
});

app.get("/api/emails/:id/attachments/:attachmentId", async (c) => {
  const row = await getEmailRow(c.env, c.req.param("id"));
  if (!row) return fail(404, "email_not_found", "Email not found");
  const document = await readEmailDocument(c.env, row);
  if (!document) return fail(404, "content_not_found", "Stored email JSON was not found in B2");
  const attachment = document.attachments.find(
    (item) => item.id === c.req.param("attachmentId"),
  );
  if (!attachment) return fail(404, "attachment_not_found", "Attachment not found");
  const object = await getObject(c.env, attachment.b2Key);
  if (!object) return fail(404, "attachment_not_found", "Attachment object was not found in B2");

  const headers = new Headers();
  headers.set("content-type", downloadContentType(attachment.contentType));
  headers.set("content-disposition", contentDisposition(attachment.filename));
  headers.set("content-length", String(attachment.size));
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { status: 200, headers });
});

app.get("/api/storage", async (c) => {
  const mailboxId = optionalString(c.req.query("mailbox_id"), "mailbox_id", 100);
  if (mailboxId) {
    const storage = await mailboxStorage(c.env, mailboxId);
    if (!storage) return fail(404, "mailbox_not_found", "Mailbox not found");
    return ok({
      scope: "mailbox",
      mailbox: { id: storage.mailbox_id, address: storage.address, name: storage.name },
      ...storageView(storage),
    });
  }

  const rows = await allMailboxStorage(c.env);
  const total = sumStorage(rows);
  return ok({
    scope: "global",
    ...storageView({ mailbox_id: "", ...total }),
    mailboxes: rows.map(storageView),
  });
});

app.notFound((c) => fail(404, "not_found", `No route for ${c.req.method} ${c.req.path}`));

app.onError((error, _c) => {
  if (error instanceof ApiError) {
    return json(error.status, errorPayload(error));
  }
  console.error(
    JSON.stringify({
      event: "unhandled_error",
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  return fail(500, "internal_error", "Unexpected server error");
});

export { app };
