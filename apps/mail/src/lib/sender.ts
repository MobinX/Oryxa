import type { Env, StoredAddress } from "../types";
import { ApiError } from "./errors";

export interface OutboundAttachmentUrl {
  filename: string;
  url: string;
}

interface SenderNetInput {
  from: StoredAddress;
  to: StoredAddress;
  subject: string;
  html: string;
  text: string;
  attachments: OutboundAttachmentUrl[];
}

export type SendProvider = "sender.net" | "brevo";

export function activeSendProvider(env: Env): SendProvider | null {
  const forced = (env.MAIL_SEND_PROVIDER || "").trim().toLowerCase();
  if (forced === "sender" || forced === "sender.net") {
    return (env.SENDER_API_KEY || "").trim() ? "sender.net" : null;
  }
  if (forced === "brevo") {
    return (env.BREVO_API_KEY || "").trim() ? "brevo" : null;
  }
  if ((env.BREVO_API_KEY || "").trim()) return "brevo";
  if ((env.SENDER_API_KEY || "").trim()) return "sender.net";
  return null;
}

function uniqueFilename(filename: string, used: Set<string>): string {
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot) : "";
  let candidate = filename;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}-${counter}${extension}`;
    counter += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export async function sendWithSenderNet(
  env: Env,
  input: SenderNetInput,
): Promise<{ messageId: string }> {
  const apiKey = (env.SENDER_API_KEY || "").trim();
  if (!apiKey) {
    throw new ApiError(503, "sender_not_configured", "SENDER_API_KEY is not configured on this Worker");
  }

  const usedNames = new Set<string>();
  const attachments: Record<string, string> = {};
  for (const attachment of input.attachments) {
    attachments[uniqueFilename(attachment.filename, usedNames)] = attachment.url;
  }

  const payload = {
    from: { email: input.from.email, name: input.from.name || input.from.email },
    to: { email: input.to.email, ...(input.to.name ? { name: input.to.name } : {}) },
    subject: input.subject,
    html: input.html,
    text: input.text,
    ...(Object.keys(attachments).length ? { attachments } : {}),
  };

  let response: Response;
  try {
    response = await fetch("https://api.sender.net/v2/message/send", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new ApiError(
      502,
      "sender_unreachable",
      `Sender.net request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const rawBody = await response.text();
  let parsed: { success?: boolean; message?: string; emailId?: string; error?: unknown } = {};
  try {
    parsed = rawBody ? (JSON.parse(rawBody) as typeof parsed) : {};
  } catch {
    parsed = {};
  }

  if (!response.ok || parsed.success === false) {
    throw new ApiError(
      502,
      "sender_error",
      parsed.message || `Sender.net rejected the send with status ${response.status}`,
      { status: response.status, body: rawBody.slice(0, 500) },
    );
  }

  return { messageId: parsed.emailId || "" };
}
