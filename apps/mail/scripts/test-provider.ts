import { readFileSync } from "node:fs";

const vars: Record<string, string> = {};
for (const line of readFileSync(new URL("../.dev.vars", import.meta.url), "utf8").split("\n")) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (match) vars[match[1]] = match[2];
}

const BASE = process.env.MAIL_BASE_URL || "https://onlyorders-mail.mobin-devx.workers.dev";
const API_KEY = vars.MAIL_API_KEY;
const SENDER_KEY = vars.SENDER_API_KEY;
const MAILOSAUR_KEY = vars.MAILOSAUR_API_KEY;
const SERVER = vars.MAILOSAUR_SERVER || "vgaehlr1";
const TEST_ADDRESS = vars.MAILOSAUR_TEST_ADDRESS || `probe@${SERVER}.mailosaur.net`;
const FROM_EMAIL =
  vars.BREVO_TEST_SENDER || vars.DEFAULT_FROM_EMAIL || "noreply@onlyorders.tech";

if (!API_KEY) throw new Error("MAIL_API_KEY missing in .dev.vars");
if (!SENDER_KEY) throw new Error("SENDER_API_KEY missing in .dev.vars");
if (!MAILOSAUR_KEY) throw new Error("MAILOSAUR_API_KEY missing in .dev.vars");

let passed = 0;
function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
  console.log(`PASS  ${message}`);
}

async function worker(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  const headers = new Headers(init.headers);
  headers.set("x-api-key", API_KEY);
  if (init.body) headers.set("content-type", "application/json");
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

const mailosaurAuth = `Basic ${Buffer.from(`api:${MAILOSAUR_KEY}`).toString("base64")}`;
async function mailosaur(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  const headers = new Headers(init.headers);
  headers.set("authorization", mailosaurAuth);
  if (init.body) headers.set("content-type", "application/json");
  const response = await fetch(`https://mailosaur.com/api${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const health = await worker("/health");
check(health.status === 200, "deployed worker health is OK");
check(health.body.send_provider === "brevo", "Brevo is the active send provider");
check(health.body.brevo_configured === true, "Brevo key is configured on the Worker");

const address = `brevo-e2e-${Date.now()}@onlyorders.tech`;
const mailboxResult = await worker("/api/mailboxes", {
  method: "POST",
  body: JSON.stringify({ address, name: "Brevo E2E" }),
});
check(mailboxResult.status === 201, "test mailbox created");
const mailboxId: string = mailboxResult.body.mailbox.id;

const token = crypto.randomUUID();
const subject = `OnlyOrders Brevo E2E ${Date.now()}`;
const attachmentBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nK0AAAAASUVORK5CYII=";
const attachmentBytes = Buffer.from(attachmentBase64, "base64");
const sendResult = await worker("/api/emails/send", {
  method: "POST",
  body: JSON.stringify({
    mailbox_id: mailboxId,
    from: { email: FROM_EMAIL, name: "OnlyOrders E2E" },
    to: [{ email: TEST_ADDRESS, name: "Mailosaur" }],
    subject,
    html: `<p>Hello from the Worker via Sender.net.</p><p>Token: <strong>${token}</strong></p>`,
    text: `Hello from the Worker via Sender.net. Token: ${token}`,
    attachments: [
      {
        filename: "probe.png",
        content_type: "image/png",
        content_base64: attachmentBase64,
      },
    ],
  }),
});

if (sendResult.status !== 201) {
  console.error("Worker send failed:", JSON.stringify(sendResult.body));
  process.exit(1);
}
check(sendResult.body.provider === "brevo", "Worker reports Brevo provider");
check(typeof sendResult.body.provider_message_id === "string", "Brevo returned a message id");
check(sendResult.body.email.direction === "outbound", "sent email is stored as outbound");
check(sendResult.body.email.attachment_count === 1, "sent email attachment stored");
check(sendResult.body.email.size_bytes > attachmentBytes.length, "sent email storage counted");
const emailId: string = sendResult.body.email.id;

const storage = await worker(`/api/storage?mailbox_id=${mailboxId}`);
check(storage.status === 200 && storage.body.used_bytes > 0, "mailbox storage increased after send");

const detail = await worker(`/api/emails/${emailId}`);
check(detail.status === 200 && detail.body.content_available === true, "sent email JSON readable from B2");
check(detail.body.content.provider.name === "brevo", "JSON records Brevo provider");
check(detail.body.content.attachments.length === 1, "JSON records the attachment");

const attachment = await fetch(
  `${BASE}/api/emails/${emailId}/attachments/${detail.body.content.attachments[0].id}`,
  { headers: { "x-api-key": API_KEY } },
);
check(attachment.status === 200, "sent attachment downloads from B2");
check(
  Buffer.from(await attachment.arrayBuffer()).equals(attachmentBytes),
  "sent attachment bytes match",
);

const since = encodeURIComponent(new Date(Date.now() - 120_000).toISOString());
let messageId: string | null = null;
for (let attempt = 0; attempt < 40; attempt += 1) {
  const listed = await mailosaur(`/messages?server=${SERVER}&receivedAfter=${since}&itemsPerPage=100`);
  if (listed.status !== 200) {
    console.error("Mailosaur list failed:", JSON.stringify(listed.body));
    process.exit(1);
  }
  const match = (listed.body.items || []).find((item: any) => item.subject === subject);
  if (match) {
    messageId = match.id;
    break;
  }
  await sleep(3000);
}

check(typeof messageId === "string", "Mailosaur received the Brevo email within 120s");
const received = await mailosaur(`/messages/${messageId}`);
check(received.status === 200, "Mailosaur returned the received message");
check(received.body.subject === subject, "received subject matches");
check(received.body.text?.body?.includes(token) === true, "received text body contains the token");
check(received.body.html?.body?.includes(token) === true, "received HTML body contains the token");
check(
  (received.body.from || []).some((item: any) => item.email?.toLowerCase() === FROM_EMAIL.toLowerCase()),
  "received sender matches",
);
const receivedAttachment = (received.body.attachments || []).find((item: any) =>
  String(item.fileName || "").includes("probe.png"),
);
check(receivedAttachment !== undefined, "Mailosaur received the attachment");

if (receivedAttachment) {
  const file = await fetch(`https://mailosaur.com/api/files/attachments/${receivedAttachment.id}`, {
    headers: { authorization: mailosaurAuth },
    signal: AbortSignal.timeout(30_000),
  });
  check(file.status === 200, "Mailosaur attachment download succeeds");
  check(
    Buffer.from(await file.arrayBuffer()).equals(attachmentBytes),
    "Mailosaur attachment bytes match",
  );
}

const deleted = await worker("/api/emails/delete", {
  method: "POST",
  body: JSON.stringify({ ids: [emailId] }),
});
check(deleted.status === 200 && deleted.body.deleted === 1, "sent email purged from worker");

const emptied = await worker(`/api/storage?mailbox_id=${mailboxId}`);
check(emptied.body.used_bytes === 0 && emptied.body.physical_bytes === 0, "worker storage returns to zero");

if (messageId) {
  const removed = await mailosaur(`/messages/${messageId}`, { method: "DELETE" });
  check(removed.status === 204 || removed.status === 200, "Mailosaur test message cleaned up");
}

console.log(`\n${passed} checks passed.`);
