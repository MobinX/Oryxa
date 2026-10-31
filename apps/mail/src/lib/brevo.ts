import type { Env, StoredAddress } from "../types";
import { ApiError } from "./errors";

interface BrevoSendInput {
  from: StoredAddress;
  to: StoredAddress[];
  cc: StoredAddress[];
  bcc: StoredAddress[];
  replyTo: StoredAddress | null;
  subject: string;
  html: string;
  text: string;
  attachments: Array<{ filename: string; contentBase64: string }>;
  tags?: string[];
}

export async function sendWithBrevo(
  env: Env,
  input: BrevoSendInput,
): Promise<{ messageId: string }> {
  const apiKey = (env.BREVO_API_KEY || "").trim();
  if (!apiKey) {
    throw new ApiError(503, "brevo_not_configured", "BREVO_API_KEY is not configured on this Worker");
  }

  const payload = {
    sender: { email: input.from.email, name: input.from.name || undefined },
    to: input.to.map((address) => ({ email: address.email, name: address.name || undefined })),
    ...(input.cc.length ? { cc: input.cc.map((a) => ({ email: a.email, name: a.name || undefined })) } : {}),
    ...(input.bcc.length ? { bcc: input.bcc.map((a) => ({ email: a.email, name: a.name || undefined })) } : {}),
    ...(input.replyTo
      ? { replyTo: { email: input.replyTo.email, name: input.replyTo.name || undefined } }
      : {}),
    subject: input.subject,
    htmlContent: input.html,
    textContent: input.text,
    ...(input.attachments.length
      ? {
          attachment: input.attachments.map((attachment) => ({
            name: attachment.filename,
            content: attachment.contentBase64,
          })),
        }
      : {}),
    ...(input.tags?.length ? { tags: input.tags } : {}),
  };

  let response: Response;
  try {
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new ApiError(
      502,
      "brevo_unreachable",
      `Brevo request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const rawBody = await response.text();
  let parsed: { messageId?: string; message?: string; code?: string } = {};
  try {
    parsed = rawBody ? (JSON.parse(rawBody) as typeof parsed) : {};
  } catch {
    parsed = {};
  }

  if (!response.ok) {
    throw new ApiError(
      502,
      "brevo_error",
      parsed.message || `Brevo rejected the send with status ${response.status}`,
      { status: response.status, body: rawBody.slice(0, 500) },
    );
  }

  return { messageId: parsed.messageId || "" };
}
