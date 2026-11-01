import type { AttachmentInput, EmailRow, Env, StoredAddress, StoredEmail } from "../types";
import { activeSendProvider, sendWithSenderNet } from "./sender";
import { sendWithBrevo } from "./brevo";
import { hardDeleteEmails, markEmailFailed, markEmailSent, persistEmail } from "./store";
import { presignGet } from "./b2";
import { ApiError, assert } from "./errors";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function sendStoredOutbound(
  env: Env,
  input: {
    mailboxId: string;
    from: StoredAddress;
    to: StoredAddress[];
    cc: StoredAddress[];
    bcc: StoredAddress[];
    replyTo?: StoredAddress | null;
    subject: string;
    text: string;
    html: string;
    attachments: AttachmentInput[];
    inReplyTo?: string | null;
    references?: string[];
  },
): Promise<{
  row: EmailRow;
  document: StoredEmail;
  provider: string;
  providerMessageId: string;
}> {
  const provider = activeSendProvider(env);
  if (!provider) {
    throw new ApiError(503, "provider_not_configured", "No outbound mail provider is configured");
  }
  if (provider === "sender.net") {
    assert(input.to.length === 1, 400, "recipient_limit", "Sender.net supports one recipient");
    assert(input.cc.length === 0 && input.bcc.length === 0, 400, "unsupported_field", "Sender.net does not support cc/bcc");
  }

  const now = new Date().toISOString();
  const { row, document } = await persistEmail(env, {
    mailboxId: input.mailboxId,
    direction: "outbound",
    messageId: null,
    inReplyTo: input.inReplyTo ?? null,
    references: input.references ?? [],
    from: input.from,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    replyTo: input.replyTo ? [input.replyTo] : [],
    subject: input.subject,
    date: now,
    receivedAt: now,
    text: input.text,
    html: input.html,
    attachments: input.attachments,
    provider,
    status: "sending",
  });

  let providerMessageId = "";
  try {
    if (provider === "sender.net") {
      const senderAttachments = await Promise.all(
        document.attachments.map(async (attachment) => ({
          filename: attachment.filename,
          url: await presignGet(env, attachment.b2Key, 86400),
        })),
      );
      const result = await sendWithSenderNet(env, {
        from: input.from,
        to: input.to[0],
        subject: input.subject,
        html: input.html,
        text: input.text,
        attachments: senderAttachments,
      });
      providerMessageId = result.messageId;
    } else {
      const result = await sendWithBrevo(env, {
        from: input.from,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        replyTo: input.replyTo ?? null,
        subject: input.subject,
        html: input.html,
        text: input.text,
        attachments: input.attachments.map((attachment) => ({
          filename: attachment.filename,
          contentBase64: bytesToBase64(attachment.content),
        })),
      });
      providerMessageId = result.messageId;
    }
  } catch (error) {
    const cleanup = await hardDeleteEmails(env, [row.id]).catch(() => null);
    if (!cleanup || cleanup.deleted === 0) await markEmailFailed(env, row.id).catch(() => {});
    throw error;
  }

  const updated = await markEmailSent(env, row.id, providerMessageId);
  return {
    row: updated || row,
    document,
    provider,
    providerMessageId,
  };
}
