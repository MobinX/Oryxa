import { readFileSync } from "node:fs";

const vars: Record<string, string> = {};
for (const line of readFileSync(new URL("../.dev.vars", import.meta.url), "utf8").split("\n")) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (match) vars[match[1]] = match[2];
}

const BASE = process.env.MAIL_BASE_URL || "http://127.0.0.1:8787";
const API_KEY = vars.MAIL_API_KEY;
if (!API_KEY) throw new Error("MAIL_API_KEY missing in .dev.vars");

let passed = 0;
function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
  console.log(`PASS  ${message}`);
}

interface Result {
  status: number;
  body: any;
}

async function api(path: string, init: RequestInit = {}, key = API_KEY): Promise<Result> {
  const headers = new Headers(init.headers);
  if (key) headers.set("x-api-key", key);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

function rfc822(options: {
  messageId: string;
  from?: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachmentName?: string;
  attachmentBase64?: string;
}): string {
  const boundary = `b-${crypto.randomUUID()}`;
  const lines = [
    `From: "Test Sender" <${options.from || "alice@example.com"}>`,
    `To: ${options.to}`,
    `Subject: ${options.subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${options.messageId}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    "",
    options.text,
    "",
  ];
  if (options.html) {
    lines.push(
      `--${boundary}`,
      'Content-Type: text/html; charset="utf-8"',
      "",
      options.html,
      "",
    );
  }
  if (options.attachmentBase64) {
    lines.push(
      `--${boundary}`,
      `Content-Type: text/plain; name="${options.attachmentName || "note.txt"}"`,
      `Content-Disposition: attachment; filename="${options.attachmentName || "note.txt"}"`,
      "Content-Transfer-Encoding: base64",
      "",
      options.attachmentBase64,
      "",
    );
  }
  lines.push(`--${boundary}--`, "");
  return lines.join("\r\n");
}

async function deliver(raw: string, from: string, to: string): Promise<Result> {
  const url = `${BASE}/cdn-cgi/local/email?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "message/rfc822" },
    body: raw,
  });
  const text = await response.text();
  return { status: response.status, body: text };
}

const address = `inbox-${Date.now()}@onlyorders.tech`;
const subject = `OnlyOrders test ${Date.now()}`;
const attachmentText = "Hello attachment!";
const attachmentBase64 = Buffer.from(attachmentText).toString("base64");

const health = await api("/health", {}, "");
check(health.status === 200 && health.body.ok === true, "health is public and healthy");
check(health.body.b2_configured === true, "health reports B2 configured");
check(health.body.send_provider !== null, "health reports a configured send provider");

const unauthorized = await api("/api/mailboxes", {}, "");
check(unauthorized.status === 401, "API rejects missing key");

const wrongKey = await api("/api/mailboxes", {}, "definitely-wrong");
check(wrongKey.status === 401, "API rejects wrong key");

const badJson = await fetch(`${BASE}/api/mailboxes`, {
  method: "POST",
  headers: { "x-api-key": API_KEY, "content-type": "application/json" },
  body: "{not-json",
});
check(badJson.status === 400, "invalid JSON is rejected");

const createdMailbox = await api("/api/mailboxes", {
  method: "POST",
  body: JSON.stringify({ address, name: "Test Inbox" }),
});
check(createdMailbox.status === 201 && createdMailbox.body.created === true, "mailbox created");
const mailboxId: string = createdMailbox.body.mailbox.id;

const duplicateMailbox = await api("/api/mailboxes", {
  method: "POST",
  body: JSON.stringify({ address, name: "Test Inbox" }),
});
check(duplicateMailbox.status === 200 && duplicateMailbox.body.created === false, "mailbox create is idempotent");

const lookup = await api(`/api/mailboxes/lookup?address=${encodeURIComponent(address)}`);
check(lookup.status === 200 && lookup.body.mailbox.id === mailboxId, "lookup mailbox by address");

const mailboxes = await api("/api/mailboxes");
check(
  mailboxes.status === 200 && mailboxes.body.mailboxes.some((item: any) => item.id === mailboxId),
  "list mailboxes includes the new mailbox",
);

const messageId = `local-${Date.now()}@example.com`;
const raw = rfc822({
  messageId,
  to: address,
  subject,
  text: "Hello from the local email test.",
  html: `<p>Hello from the <strong>local</strong> email test.</p>`,
  attachmentName: "note.txt",
  attachmentBase64,
});

const delivered = await deliver(raw, "alice@example.com", address);
check(delivered.status === 200, "local Email Routing delivery accepted");

const duplicateDelivery = await deliver(raw, "alice@example.com", address);
check(duplicateDelivery.status === 200, "duplicate Message-ID delivery accepted");

const listInbox = await api(`/api/mailboxes/${mailboxId}/emails?direction=inbound`);
check(listInbox.status === 200 && listInbox.body.total === 1, "inbound email stored exactly once");
const email = listInbox.body.emails[0];
const emailId: string = email.id;
check(email.subject === subject, "stored subject matches");
check(email.direction === "inbound" && email.is_trashed === false, "stored direction and trash flag");
check(email.attachment_count === 1, "attachment count recorded");
check(email.size_bytes > attachmentText.length, "size includes JSON and attachment");
check(typeof email.json_key === "string" && email.json_key.startsWith("emails/"), "JSON key lives under emails/");

const search = await api(`/api/mailboxes/${mailboxId}/emails?q=OnlyOrders`);
check(search.status === 200 && search.body.total === 1, "subject search works");

const detail = await api(`/api/emails/${emailId}`);
check(detail.status === 200 && detail.body.content_available === true, "email details read JSON from B2");
check(detail.body.content.text.includes("local email test"), "JSON text body matches");
check(detail.body.content.html.includes("<strong>local</strong>"), "JSON HTML body matches");
check(detail.body.content.attachments.length === 1, "JSON lists attachment metadata");
const attachmentId: string = detail.body.content.attachments[0].id;

const content = await api(`/api/emails/${emailId}/content`);
check(content.status === 200 && content.body.id === emailId, "content endpoint returns JSON document");

const attachment = await fetch(`${BASE}/api/emails/${emailId}/attachments/${attachmentId}`, {
  headers: { "x-api-key": API_KEY },
});
check(attachment.status === 200, "attachment download succeeds");
check(
  attachment.headers.get("content-disposition")?.includes("attachment") === true,
  "attachment is served as a download",
);
check((await attachment.text()) === attachmentText, "attachment bytes match");

const b2Url = await api(`/api/emails/${emailId}/b2-url?expires_in=120`);
check(b2Url.status === 200 && typeof b2Url.body.url === "string", "B2 presigned URL generated");
const direct = await fetch(b2Url.body.url);
check(direct.status === 200, "presigned B2 URL is readable");
const directJson = await direct.json();
check(directJson.id === emailId, "presigned B2 URL returns the email JSON");

const storageBefore = await api(`/api/storage?mailbox_id=${mailboxId}`);
check(storageBefore.status === 200 && storageBefore.body.used_bytes > 0, "storage counts active email");
check(storageBefore.body.active_emails === 1, "storage counts active emails");
const beforeBytes = storageBefore.body.used_bytes;

const trash = await api("/api/emails/trash", {
  method: "POST",
  body: JSON.stringify({ ids: [emailId] }),
});
check(trash.status === 200 && trash.body.updated === 1, "email moved to trash");

const storageTrashed = await api(`/api/storage?mailbox_id=${mailboxId}`);
check(storageTrashed.body.used_bytes === 0, "trash reduces used storage");
check(storageTrashed.body.trashed_bytes === beforeBytes, "trash tracks trashed bytes");
check(storageTrashed.body.physical_bytes === beforeBytes, "B2 physical bytes remain until purge");

const listTrashed = await api(`/api/mailboxes/${mailboxId}/emails?trashed=true`);
check(listTrashed.status === 200 && listTrashed.body.total === 1, "trashed list filter works");

const restore = await api("/api/emails/restore", {
  method: "POST",
  body: JSON.stringify({ ids: [emailId] }),
});
check(restore.status === 200 && restore.body.restored === 1, "email restored from trash");

const storageRestored = await api(`/api/storage?mailbox_id=${mailboxId}`);
check(storageRestored.body.used_bytes === beforeBytes, "restore increases used storage again");

if (health.body.send_provider === "sender.net") {
  const twoRecipients = await api("/api/emails/send", {
    method: "POST",
    body: JSON.stringify({
      mailbox_id: mailboxId,
      to: ["a@example.com", "b@example.com"],
      subject: "Too many recipients",
      text: "Should be rejected before sending.",
    }),
  });
  check(
    twoRecipients.status === 400 && twoRecipients.body.error.code === "recipient_limit",
    "Sender.net rejects multiple recipients",
  );

  const ccSend = await api("/api/emails/send", {
    method: "POST",
    body: JSON.stringify({
      mailbox_id: mailboxId,
      to: "a@example.com",
      cc: ["c@example.com"],
      subject: "CC unsupported",
      text: "Should be rejected before sending.",
    }),
  });
  check(
    ccSend.status === 400 && ccSend.body.error.code === "unsupported_field",
    "Sender.net rejects cc/bcc",
  );
}

const badSend = await api("/api/emails/send", {
  method: "POST",
  body: JSON.stringify({ mailbox_id: mailboxId, to: "not-an-email", subject: "x", text: "y" }),
});
check(badSend.status === 400, "send validates recipient addresses");

const missingMailbox = await api("/api/mailboxes/does-not-exist");
check(missingMailbox.status === 404, "missing mailbox returns 404");

const missingEmail = await api("/api/emails/does-not-exist");
check(missingEmail.status === 404, "missing email returns 404");

const badTrash = await api("/api/emails/trash", {
  method: "POST",
  body: JSON.stringify({ ids: [] }),
});
check(badTrash.status === 400, "trash rejects empty ids");

const secondMessageId = `local-2-${Date.now()}@example.com`;
await deliver(
  rfc822({
    messageId: secondMessageId,
    to: address,
    subject: `Second ${subject}`,
    text: "Second message",
  }),
  "bob@example.com",
  address,
);
const listTwo = await api(`/api/mailboxes/${mailboxId}/emails`);
check(listTwo.body.total === 2, "second inbound email stored");
const secondId: string = listTwo.body.emails.find((item: any) => item.id !== emailId).id;

const bulkTrash = await api("/api/emails/trash", {
  method: "POST",
  body: JSON.stringify({ ids: [emailId, secondId] }),
});
check(bulkTrash.body.updated === 2, "group trash updates both emails");

const bulkDelete = await api("/api/emails/delete", {
  method: "POST",
  body: JSON.stringify({ ids: [emailId, secondId] }),
});
check(bulkDelete.status === 200 && bulkDelete.body.deleted === 2, "group hard delete removes both emails");
check(bulkDelete.body.freed_bytes > 0, "hard delete reports freed bytes");

const finalStorage = await api(`/api/storage?mailbox_id=${mailboxId}`);
check(finalStorage.body.used_bytes === 0, "storage is empty after purge");
check(finalStorage.body.physical_bytes === 0, "physical B2 bytes are zero after purge");

const finalList = await api(`/api/mailboxes/${mailboxId}/emails?trashed=all`);
check(finalList.body.total === 0, "no email rows remain");

const globalStorage = await api("/api/storage");
check(globalStorage.status === 200 && globalStorage.body.scope === "global", "global storage endpoint works");
check(Array.isArray(globalStorage.body.mailboxes), "global storage lists mailboxes");

console.log(`\n${passed} checks passed.`);
