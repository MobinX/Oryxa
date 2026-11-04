import type { AttachmentInput, EmailRow, Env, StoredAddress, StoredEmail } from "../types";
import { sendWithSenderNet, type SendProvider } from "./sender";
import { sendWithBrevo } from "./brevo";
import { markEmailFailed, markEmailSent, persistEmail } from "./store";
import { presignGet } from "./b2";
import { ApiError, assert } from "./errors";
import {
  allowedFromDomains,
  isFromDomainAllowed,
  isRetryableSendError,
  maxSendAttempts,
  providerFallbackOrder,
  retryDelayMs,
  sendAttemptTimeoutMs,
} from "./send-policy";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorCode(error: unknown): string {
  return error instanceof ApiError ? error.code : "send_failed";
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

function logEvent(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields }));
}

interface ProviderAttemptInput {
  from: StoredAddress;
  to: StoredAddress[];
  cc: StoredAddress[];
  bcc: StoredAddress[];
  replyTo: StoredAddress | null;
  subject: string;
  text: string;
  html: string;
  tags: string[];
}

async function attemptProviderSend(
  env: Env,
  provider: SendProvider,
  input: ProviderAttemptInput,
  attachments: AttachmentInput[],
  document: StoredEmail,
  timeoutMs: number,
): Promise<string> {
  if (provider === "sender.net") {
    const senderAttachments = await Promise.all(
      document.attachments.map(async (attachment) => ({
        filename: attachment.filename,
        url: await presignGet(env, attachment.b2Key, 86400),
      })),
    );
    const result = await sendWithSenderNet(
      env,
      {
        from: input.from,
        to: input.to[0],
        subject: input.subject,
        html: input.html,
        text: input.text,
        attachments: senderAttachments,
      },
      { timeoutMs },
    );
    return result.messageId;
  }
  const result = await sendWithBrevo(
    env,
    {
      from: input.from,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      // Default Reply-To to the sender so replies never fall into the void
      // when the caller omits it; keeps SPF/DKIM alignment on the From domain.
      replyTo: input.replyTo ?? input.from,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: attachments.map((attachment) => ({
        filename: attachment.filename,
        contentBase64: bytesToBase64(attachment.content),
      })),
      ...(input.tags.length > 0 ? { tags: input.tags } : {}),
    },
    { timeoutMs },
  );
  return result.messageId;
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
    tags?: string[];
  },
): Promise<{
  row: EmailRow;
  document: StoredEmail;
  provider: string;
  providerMessageId: string;
  attempts: number;
  statusWarning?: string;
}> {
  const providers = providerFallbackOrder(env);
  if (providers.length === 0) {
    throw new ApiError(503, "provider_not_configured", "No outbound mail provider is configured");
  }
  const allowed = allowedFromDomains(env);
  if (!isFromDomainAllowed(input.from.email, allowed)) {
    throw new ApiError(
      400,
      "unverified_sender",
      `From domain is not in ALLOWED_FROM_DOMAINS (${allowed?.join(", ")})`,
    );
  }
  for (const provider of providers) {
    if (provider === "sender.net" && providers.length === 1) {
      assert(input.to.length === 1, 400, "recipient_limit", "Sender.net supports one recipient");
      assert(input.cc.length === 0 && input.bcc.length === 0, 400, "unsupported_field", "Sender.net does not support cc/bcc");
    }
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
    provider: providers[0],
    status: "sending",
  });

  const timeoutMs = sendAttemptTimeoutMs(env);
  const maxAttempts = maxSendAttempts(env);
  const started = Date.now();
  const recipientCount = input.to.length + input.cc.length + input.bcc.length;
  const sendInput: ProviderAttemptInput = {
    from: input.from,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    replyTo: input.replyTo ?? null,
    subject: input.subject,
    text: input.text,
    html: input.html,
    tags: (input.tags || []).filter((tag) => tag.trim().length > 0).slice(0, 20),
  };

  let attempts = 0;
  let lastError: unknown = null;
  const tried: SendProvider[] = [];

  for (const provider of providers) {
    // Sender.net only supports single-recipient mail; skip it (rather than
    // failing the send) when failing over a multi-recipient message.
    if (
      provider === "sender.net" &&
      (sendInput.to.length !== 1 || sendInput.cc.length > 0 || sendInput.bcc.length > 0)
    ) {
      continue;
    }
    tried.push(provider);
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      attempts += 1;
      const attemptStarted = Date.now();
      try {
        const providerMessageId = await attemptProviderSend(
          env,
          provider,
          sendInput,
          input.attachments,
          document,
          timeoutMs,
        );
        let updated: EmailRow | null = null;
        let statusWarning: string | undefined;
        try {
          updated = await markEmailSent(env, row.id, providerMessageId);
        } catch {
          statusWarning = "Email was sent, but the metadata status update failed";
        }
        logEvent("outbound_sent", {
          emailId: row.id,
          mailboxId: input.mailboxId,
          provider,
          providersTried: tried,
          attempts,
          recipients: recipientCount,
          attachments: input.attachments.length,
          ms: Date.now() - started,
        });
        return {
          row: updated || row,
          document,
          provider,
          providerMessageId,
          attempts,
          ...(statusWarning ? { statusWarning } : {}),
        };
      } catch (error) {
        lastError = error;
        const retryable = isRetryableSendError(error);
        logEvent("outbound_attempt_failed", {
          emailId: row.id,
          mailboxId: input.mailboxId,
          provider,
          attempt,
          maxAttempts,
          retryable,
          code: errorCode(error),
          error: errorMessage(error).slice(0, 200),
          ms: Date.now() - attemptStarted,
        });
        if (!retryable) break;
        if (attempt < maxAttempts) await sleep(retryDelayMs(attempt));
      }
    }
    // Only fail over when the failure looks transient; a validation
    // rejection (bad address, unverified sender) would fail everywhere.
    if (!isRetryableSendError(lastError)) break;
  }

  // The send failed: keep the row as a failed audit record (with the reason)
  // instead of deleting it, so operators can see and retry failed mail.
  const failure = { code: errorCode(lastError), message: errorMessage(lastError) };
  await markEmailFailed(env, row.id, failure).catch((error: unknown) => {
    logEvent("outbound_failure_mark_failed", {
      emailId: row.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  logEvent("outbound_failed", {
    emailId: row.id,
    mailboxId: input.mailboxId,
    providersTried: tried,
    attempts,
    recipients: recipientCount,
    code: failure.code,
    error: failure.message.slice(0, 200),
    ms: Date.now() - started,
  });
  throw lastError instanceof Error
    ? lastError
    : new ApiError(502, failure.code, failure.message);
}
