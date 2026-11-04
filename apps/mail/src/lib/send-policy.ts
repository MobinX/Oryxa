import type { Env } from "../types";
import type { SendProvider } from "./sender";

/**
 * Outbound send policy: retries, timeouts, provider failover and sender
 * guardrails. Everything here is pure (no fetch, no secrets) so the repo's
 * vitest suite can cover it without a Worker runtime.
 */

export const DEFAULT_SEND_TIMEOUT_MS = 30_000;
export const DEFAULT_SEND_MAX_ATTEMPTS = 3;
export const SEND_RETRY_BASE_DELAY_MS = 500;
export const SEND_RETRY_MAX_DELAY_MS = 8_000;

/** HTTP statuses worth retrying: rate limits, timeouts and server errors. */
export function isRetryableStatus(status: number): boolean {
  if (status === 408 || status === 425 || status === 429) return true;
  return status >= 500 && status <= 599;
}

/**
 * Deterministic exponential backoff for send attempt `attempt` (1-based,
 * i.e. the delay before attempt N+1). No jitter: outbound sends are low
 * volume, and determinism keeps behaviour testable.
 */
export function retryDelayMs(attempt: number): number {
  if (!Number.isInteger(attempt) || attempt < 1) return SEND_RETRY_BASE_DELAY_MS;
  const delay = SEND_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
  return Math.min(delay, SEND_RETRY_MAX_DELAY_MS);
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

/** Per-attempt provider timeout. Env: MAIL_SEND_TIMEOUT_MS (default 30000). */
export function sendAttemptTimeoutMs(env: Pick<Env, "MAIL_SEND_TIMEOUT_MS">): number {
  return clampInt(env.MAIL_SEND_TIMEOUT_MS, DEFAULT_SEND_TIMEOUT_MS, 5_000, 60_000);
}

/** Attempts per provider before giving up or failing over. Env: MAIL_SEND_MAX_ATTEMPTS (default 3). */
export function maxSendAttempts(env: Pick<Env, "MAIL_SEND_MAX_ATTEMPTS">): number {
  return clampInt(env.MAIL_SEND_MAX_ATTEMPTS, DEFAULT_SEND_MAX_ATTEMPTS, 1, 5);
}

/**
 * Ordered list of configured providers to try. Mirrors activeSendProvider's
 * precedence (Brevo first) but returns every usable provider so a retryable
 * primary failure can fail over to the secondary instead of failing the send.
 * A forced MAIL_SEND_PROVIDER keeps its strict meaning: only that provider
 * is used, and none when its key is missing.
 */
export function providerFallbackOrder(env: Env): SendProvider[] {
  const forced = (env.MAIL_SEND_PROVIDER || "").trim().toLowerCase();
  const brevo = Boolean((env.BREVO_API_KEY || "").trim());
  const sender = Boolean((env.SENDER_API_KEY || "").trim());
  if (forced === "sender" || forced === "sender.net") return sender ? ["sender.net"] : [];
  if (forced === "brevo") return brevo ? ["brevo"] : [];
  const order: SendProvider[] = [];
  if (brevo) order.push("brevo");
  if (sender) order.push("sender.net");
  return order;
}

function sendErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const details = (error as { details?: unknown }).details;
  if (!details || typeof details !== "object") return null;
  const status = (details as { status?: unknown }).status;
  return typeof status === "number" && Number.isInteger(status) ? status : null;
}

/**
 * True when a failed provider attempt is worth retrying or failing over:
 * transport errors (request never got a response) and retryable HTTP
 * statuses. Validation failures (4xx from the provider, bad addresses,
 * unverified senders) fail fast so we never double-send a rejected message.
 */
export function isRetryableSendError(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";
  if (code.endsWith("_unreachable")) return true;
  if (code === "provider_not_configured") return false;
  const status = sendErrorStatus(error);
  if (status !== null) return isRetryableStatus(status);
  // Provider errors without a status (and anything unrecognised) fail fast:
  // the provider may already have accepted the message, and a retry could
  // double-send. Transport errors are always *_unreachable, handled above.
  return false;
}

/**
 * Optional from-domain allowlist. Env: ALLOWED_FROM_DOMAINS, comma-separated,
 * e.g. "onlyorders.tech". Null means unrestricted (current behaviour).
 * Restricting the envelope sender to authenticated domains keeps SPF/DKIM
 * aligned and avoids provider-side "unverified sender" rejections.
 */
export function allowedFromDomains(env: Pick<Env, "ALLOWED_FROM_DOMAINS">): string[] | null {
  const raw = (env.ALLOWED_FROM_DOMAINS || "").trim();
  if (!raw) return null;
  const domains = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase().replace(/^\.+/, ""))
    .filter((entry) => entry.length > 0 && entry.includes("."));
  return domains.length > 0 ? domains : null;
}

export function isFromDomainAllowed(fromEmail: string, allowed: string[] | null): boolean {
  if (!allowed) return true;
  const domain = fromEmail.trim().toLowerCase().split("@").pop() || "";
  return allowed.some((entry) => domain === entry || domain.endsWith(`.${entry}`));
}
