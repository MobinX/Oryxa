import type { Env, PushPlatform, PushSubscriptionRow } from "../types";
import { ensureMailbox } from "./store";

/**
 * Firebase Cloud Messaging for the admin mailbox.
 *
 * The Worker talks to FCM's HTTP v1 API directly: Workers have WebCrypto but no
 * Node runtime, so the Firebase Admin SDK cannot run here. A service account JWT
 * is signed (RS256) and exchanged for an OAuth access token, cached until shortly
 * before it expires.
 *
 * Subscriptions are per device token and per console session. They expire with
 * the console session, and a sign-out removes them, so a closed session never
 * keeps buzzing.
 */

const TOKEN_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const FCM_ENDPOINT = "https://fcm.googleapis.com/v1/projects";
const DEFAULT_TTL_SECONDS = 12 * 60 * 60;
const MAX_TTL_SECONDS = 30 * 24 * 60 * 60;
const TOKEN_REFRESH_SKEW_MS = 60_000;

interface CachedAccessToken {
  token: string;
  expiresAt: number;
}

let accessTokenCache: CachedAccessToken | null = null;

export function pushConfigured(env: Env): boolean {
  return Boolean(
    env.FIREBASE_PROJECT_ID?.trim() &&
      env.FIREBASE_CLIENT_EMAIL?.trim() &&
      env.FIREBASE_PRIVATE_KEY?.trim(),
  );
}

function base64UrlBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlJson(value: unknown): string {
  return base64UrlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToPkcs8(pem: string): Uint8Array {
  const normalized = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function signServiceAccountJwt(env: Env): Promise<string | null> {
  const clientEmail = env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = env.FIREBASE_PRIVATE_KEY;
  if (!clientEmail || !privateKey) return null;

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "pkcs8",
      pemToPkcs8(privateKey),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "push_jwt_key_invalid",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const signingInput = `${base64UrlJson({ alg: "RS256", typ: "JWT" })}.${base64UrlJson({
    iss: clientEmail,
    scope: TOKEN_SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlBytes(new Uint8Array(signature))}`;
}

async function getAccessToken(env: Env): Promise<string | null> {
  if (
    accessTokenCache &&
    accessTokenCache.expiresAt - TOKEN_REFRESH_SKEW_MS > Date.now()
  ) {
    return accessTokenCache.token;
  }

  const assertion = await signServiceAccountJwt(env);
  if (!assertion) return null;

  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      console.error(
        JSON.stringify({ event: "push_oauth_failed", status: response.status, detail }),
      );
      return null;
    }
    const body = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!body.access_token) return null;
    const ttl = Number(body.expires_in) > 0 ? Number(body.expires_in) : 3600;
    accessTokenCache = {
      token: body.access_token,
      expiresAt: Date.now() + ttl * 1000,
    };
    return body.access_token;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "push_oauth_error",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return null;
  }
}

interface FcmResult {
  ok: boolean;
  /** True when FCM says this registration can never receive mail again. */
  stale: boolean;
  errorCode?: string;
}

interface FcmNotification {
  token: string;
  title: string;
  body: string;
  link: string;
  data?: Record<string, string>;
}

/** The exact FCM HTTP v1 message body. Exported so the payload shape is testable. */
export function buildFcmMessage(notice: FcmNotification): Record<string, unknown> {
  const data: Record<string, string> = {
    title: notice.title,
    body: notice.body,
    link: notice.link,
    kind: "mail",
    ...(notice.data ?? {}),
  };
  return {
    message: {
      token: notice.token,
      notification: { title: notice.title, body: notice.body },
      data,
      android: {
        priority: "high",
        notification: {
          title: notice.title,
          body: notice.body,
          icon: "ic_notification",
          color: "#10B981",
          channelId: "high_importance_channel",
          priority: "high",
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        payload: { aps: { sound: "default", badge: 1 } },
      },
      webpush: { headers: { Urgency: "high" } },
    },
  };
}

async function sendFcmMessage(env: Env, notice: FcmNotification): Promise<FcmResult> {
  const projectId = env.FIREBASE_PROJECT_ID?.trim();
  if (!projectId) return { ok: false, stale: false, errorCode: "not-configured" };
  const accessToken = await getAccessToken(env);
  if (!accessToken) return { ok: false, stale: false, errorCode: "oauth-failed" };

  try {
    const response = await fetch(`${FCM_ENDPOINT}/${encodeURIComponent(projectId)}/messages:send`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(buildFcmMessage(notice)),
    });

    if (response.ok) return { ok: true, stale: false };

    const raw = await response.text().catch(() => "");
    let errorCode = `http-${response.status}`;
    let status = "";
    try {
      const parsed = JSON.parse(raw) as {
        error?: {
          status?: string;
          details?: Array<{ errorCode?: string }>;
        };
      };
      const detailCode = parsed.error?.details?.find((item) => item.errorCode)?.errorCode;
      status = parsed.error?.status ?? "";
      if (detailCode) errorCode = detailCode;
      else if (status) errorCode = status;
    } catch {
      // Keep the HTTP status as the code.
    }

    const stale =
      response.status === 404 ||
      errorCode === "UNREGISTERED" ||
      errorCode === "INVALID_ARGUMENT" ||
      errorCode === "SENDER_ID_MISMATCH";

    console.warn(
      JSON.stringify({
        event: "push_fcm_rejected",
        status: response.status,
        errorCode,
        stale,
      }),
    );
    return { ok: false, stale, errorCode };
  } catch (error) {
    return {
      ok: false,
      stale: false,
      errorCode: error instanceof Error ? error.message.slice(0, 120) : "send-failed",
    };
  }
}

function normalizePlatform(value: unknown): PushPlatform {
  return value === "android" || value === "ios" ? value : "web";
}

export function resolveExpiry(env: Env, requested: string | undefined): string {
  const now = Date.now();
  const configured = Number(env.MAIL_PUSH_MAX_TTL_SECONDS);
  const maxSeconds =
    Number.isFinite(configured) && configured > 0
      ? Math.min(MAX_TTL_SECONDS, Math.floor(configured))
      : MAX_TTL_SECONDS;
  const fallback = new Date(now + Math.min(DEFAULT_TTL_SECONDS, maxSeconds) * 1000).toISOString();
  if (!requested) return fallback;
  const parsed = Date.parse(requested);
  if (Number.isNaN(parsed)) return fallback;
  const capped = Math.min(parsed, now + maxSeconds * 1000);
  if (capped <= now) return new Date(now + 60_000).toISOString();
  return new Date(capped).toISOString();
}

export interface SubscribeInput {
  adminId: string;
  adminEmail: string;
  sessionId: string;
  token: string;
  platform: string;
  deviceLabel?: string | null;
  expiresAt?: string;
}

export interface PublicPushSubscription {
  id: string;
  admin_id: string;
  admin_email: string;
  mailbox_id: string;
  platform: PushPlatform;
  device_label: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
  expires_at: string;
}

function publicSubscription(row: PushSubscriptionRow): PublicPushSubscription {
  return {
    id: row.id,
    admin_id: row.admin_id,
    admin_email: row.admin_email,
    mailbox_id: row.mailbox_id,
    platform: row.platform,
    device_label: row.device_label,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_seen_at: row.last_seen_at,
    expires_at: row.expires_at,
  };
}

async function pruneExpired(env: Env): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "DELETE FROM push_subscriptions WHERE expires_at <= ? AND revoked_at IS NULL",
  )
    .bind(now)
    .run()
    .catch(() => null);
}

export async function subscribeToMailPush(
  env: Env,
  input: SubscribeInput,
): Promise<PublicPushSubscription> {
  const mailbox = await ensureMailbox(env, input.adminEmail, undefined);
  const now = new Date().toISOString();
  const expiresAt = resolveExpiry(env, input.expiresAt);
  const platform = normalizePlatform(input.platform);
  const id = crypto.randomUUID();

  await pruneExpired(env);
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (
       id, admin_id, admin_email, mailbox_id, session_id, token, platform,
       device_label, created_at, updated_at, last_seen_at, expires_at, revoked_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(token) DO UPDATE SET
       admin_id = excluded.admin_id,
       admin_email = excluded.admin_email,
       mailbox_id = excluded.mailbox_id,
       session_id = excluded.session_id,
       platform = excluded.platform,
       device_label = excluded.device_label,
       updated_at = excluded.updated_at,
       last_seen_at = excluded.last_seen_at,
       expires_at = excluded.expires_at,
       revoked_at = NULL`,
  )
    .bind(
      id,
      input.adminId,
      input.adminEmail,
      mailbox.id,
      input.sessionId,
      input.token,
      platform,
      input.deviceLabel ?? null,
      now,
      now,
      now,
      expiresAt,
    )
    .run();

  const row = await env.DB.prepare("SELECT * FROM push_subscriptions WHERE token = ?")
    .bind(input.token)
    .first<PushSubscriptionRow>();
  if (!row) throw new Error("Push subscription was not stored");
  return publicSubscription(row);
}

export async function unsubscribeFromMailPush(
  env: Env,
  filter: { token?: string; sessionId?: string; adminId?: string },
): Promise<number> {
  const conditions: string[] = [];
  const bindings: string[] = [];
  if (filter.token) {
    conditions.push("token = ?");
    bindings.push(filter.token);
  }
  if (filter.sessionId) {
    conditions.push("session_id = ?");
    bindings.push(filter.sessionId);
  }
  if (filter.adminId) {
    conditions.push("admin_id = ?");
    bindings.push(filter.adminId);
  }
  if (conditions.length === 0) return 0;
  const result = await env.DB.prepare(
    `DELETE FROM push_subscriptions WHERE ${conditions.join(" OR ")}`,
  )
    .bind(...bindings)
    .run();
  return Number(result.meta?.changes ?? 0);
}

export async function heartbeatMailPush(
  env: Env,
  filter: { token?: string; sessionId?: string },
  expiresAt?: string,
): Promise<number> {
  const conditions: string[] = [];
  const filterBindings: string[] = [];
  if (filter.token) {
    conditions.push("token = ?");
    filterBindings.push(filter.token);
  }
  if (filter.sessionId) {
    conditions.push("session_id = ?");
    filterBindings.push(filter.sessionId);
  }
  if (conditions.length === 0) return 0;
  const now = new Date().toISOString();
  const expiry = resolveExpiry(env, expiresAt);
  // Both identifiers must match when both are supplied: a token rebound to a new
  // session must not be kept alive by the session that just ended.
  const result = await env.DB.prepare(
    `UPDATE push_subscriptions
        SET last_seen_at = ?, updated_at = ?, expires_at = ?
      WHERE (${conditions.join(" AND ")}) AND revoked_at IS NULL`,
  )
    .bind(now, now, expiry, ...filterBindings)
    .run();
  return Number(result.meta?.changes ?? 0);
}

export interface PushStatus {
  subscribed: boolean;
  count: number;
  last_seen_at: string | null;
  expires_at: string | null;
}

export async function mailPushStatus(
  env: Env,
  mailboxId: string,
  sessionId?: string,
): Promise<PushStatus> {
  await pruneExpired(env);
  const now = new Date().toISOString();
  const conditions = ["mailbox_id = ?", "revoked_at IS NULL", "expires_at > ?"];
  const bindings: string[] = [mailboxId, now];
  if (sessionId) {
    conditions.push("session_id = ?");
    bindings.push(sessionId);
  }
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count, MAX(last_seen_at) AS last_seen_at, MAX(expires_at) AS expires_at
       FROM push_subscriptions WHERE ${conditions.join(" AND ")}`,
  )
    .bind(...bindings)
    .first<{ count: number; last_seen_at: string | null; expires_at: string | null }>();
  const count = Number(row?.count ?? 0);
  return {
    subscribed: count > 0,
    count,
    last_seen_at: row?.last_seen_at ?? null,
    expires_at: row?.expires_at ?? null,
  };
}

async function listActiveSubscriptions(
  env: Env,
  mailboxId: string,
): Promise<PushSubscriptionRow[]> {
  const now = new Date().toISOString();
  const rows = await env.DB.prepare(
    `SELECT * FROM push_subscriptions
      WHERE mailbox_id = ? AND revoked_at IS NULL AND expires_at > ?`,
  )
    .bind(mailboxId, now)
    .all<PushSubscriptionRow>();
  return rows.results;
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export interface InboundPushInput {
  mailboxId: string;
  emailId: string;
  fromEmail: string;
  fromName?: string | null;
  subject: string;
  isSpam: boolean;
}

/**
 * Sends one inbox alert per active subscription. Called from the inbound email
 * handler through `ctx.waitUntil`, so mail delivery never waits on FCM.
 */
export async function notifyInboundEmail(env: Env, input: InboundPushInput): Promise<void> {
  if (input.isSpam && env.MAIL_PUSH_INCLUDE_SPAM !== "1") return;
  if (!pushConfigured(env)) return;

  const subscriptions = await listActiveSubscriptions(env, input.mailboxId);
  if (subscriptions.length === 0) return;

  const title = clip(
    `New mail from ${input.fromName?.trim() || input.fromEmail || "someone"}`,
    80,
  );
  const body = clip(input.subject?.trim() || "(no subject)", 160);
  const link = `/mails/${encodeURIComponent(input.emailId)}`;
  const deliveries: Array<{ subscriptionId: string; status: string; errorCode: string | null }> = [];
  const staleIds: string[] = [];

  for (const subscription of subscriptions) {
    const result = await sendFcmMessage(env, {
      token: subscription.token,
      title,
      body,
      link,
      data: {
        emailId: input.emailId,
        mailboxId: input.mailboxId,
        platform: subscription.platform,
      },
    });
    deliveries.push({
      subscriptionId: subscription.id,
      status: result.ok ? "sent" : "failed",
      errorCode: result.errorCode ?? null,
    });
    if (result.stale) staleIds.push(subscription.id);
  }

  const now = new Date().toISOString();
  const statements = deliveries.map((delivery) =>
    env.DB.prepare(
      `INSERT INTO push_deliveries (id, subscription_id, email_id, status, error_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      delivery.subscriptionId,
      input.emailId,
      delivery.status,
      delivery.errorCode,
      now,
    ),
  );
  if (statements.length > 0) await env.DB.batch(statements).catch(() => null);

  // Delete after the delivery log so the audit row still points at a real subscription.
  for (const staleId of staleIds) {
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?")
      .bind(staleId)
      .run()
      .catch(() => null);
  }

  console.log(
    JSON.stringify({
      event: "push_inbound",
      emailId: input.emailId,
      mailboxId: input.mailboxId,
      subscriptions: subscriptions.length,
      sent: deliveries.filter((delivery) => delivery.status === "sent").length,
      failed: deliveries.filter((delivery) => delivery.status === "failed").length,
    }),
  );
}
