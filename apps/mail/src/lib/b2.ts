import { AwsClient } from "aws4fetch";
import type { Env } from "../types";
import { ApiError } from "./errors";

const clients = new Map<string, AwsClient>();

function clientFor(env: Env): AwsClient {
  const cacheKey = `${env.B2_ENDPOINT}|${env.B2_REGION}|${env.B2_KEY_ID}`;
  let client = clients.get(cacheKey);
  if (!client) {
    client = new AwsClient({
      accessKeyId: env.B2_KEY_ID,
      secretAccessKey: env.B2_APPLICATION_KEY,
      service: "s3",
      region: env.B2_REGION,
    });
    clients.set(cacheKey, client);
  }
  return client;
}

function bucketBaseUrl(env: Env): string {
  return `${env.B2_ENDPOINT.replace(/\/+$/, "")}/${env.B2_BUCKET_NAME}`;
}

function objectUrl(env: Env, key: string): string {
  const encodedKey = key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${bucketBaseUrl(env)}/${encodedKey}`;
}

async function failure(response: Response, action: string): Promise<ApiError> {
  const text = await response.text().catch(() => "");
  return new ApiError(502, "b2_error", `B2 ${action} failed with ${response.status}`, {
    status: response.status,
    body: text.slice(0, 500),
  });
}

export function emailPrefix(env: Env, mailboxId: string, emailId: string): string {
  const root = (env.B2_JSON_PREFIX || "emails").replace(/^\/+|\/+$/g, "");
  return `${root}/${mailboxId}/${emailId}/`;
}

export function emailJsonKey(env: Env, mailboxId: string, emailId: string): string {
  return `${emailPrefix(env, mailboxId, emailId)}email.json`;
}

export function attachmentKey(
  env: Env,
  mailboxId: string,
  emailId: string,
  attachmentId: string,
  filename: string,
): string {
  return `${emailPrefix(env, mailboxId, emailId)}attachments/${attachmentId}-${filename}`;
}

export async function putObject(
  env: Env,
  key: string,
  body: Uint8Array | ArrayBuffer | string,
  contentType: string,
): Promise<void> {
  const response = await clientFor(env).fetch(objectUrl(env, key), {
    method: "PUT",
    body,
    headers: { "content-type": contentType },
  });
  if (!response.ok) throw await failure(response, `PUT ${key}`);
}

export async function getObject(env: Env, key: string): Promise<Response | null> {
  const response = await clientFor(env).fetch(objectUrl(env, key), { method: "GET" });
  if (response.status === 404) return null;
  if (!response.ok) throw await failure(response, `GET ${key}`);
  return response;
}

export async function getJson<T>(env: Env, key: string): Promise<T | null> {
  const response = await getObject(env, key);
  if (!response) return null;
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(502, "b2_invalid_json", "Stored email JSON is not valid JSON");
  }
}

export async function deleteObject(env: Env, key: string): Promise<void> {
  const response = await clientFor(env).fetch(objectUrl(env, key), { method: "DELETE" });
  if (!response.ok && response.status !== 404) throw await failure(response, `DELETE ${key}`);
}

function xmlDecode(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export async function listKeys(env: Env, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuation: string | null = null;

  for (let page = 0; page < 10; page += 1) {
    const url = new URL(bucketBaseUrl(env));
    url.searchParams.set("list-type", "2");
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("max-keys", "1000");
    if (continuation) url.searchParams.set("continuation-token", continuation);

    const response = await clientFor(env).fetch(url.toString(), { method: "GET" });
    if (!response.ok) throw await failure(response, "LIST");

    const xml = await response.text();
    for (const match of xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)) {
      keys.push(xmlDecode(match[1]));
    }

    const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml);
    const next = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/i);
    if (!truncated || !next) break;
    continuation = xmlDecode(next[1]);
  }

  return keys;
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export async function deletePrefix(env: Env, prefix: string): Promise<number> {
  const keys = await listKeys(env, prefix);
  if (keys.length === 0) return 0;
  await mapLimit(keys, 8, async (key) => {
    await deleteObject(env, key);
  });
  return keys.length;
}

export async function presignGet(env: Env, key: string, expiresSeconds = 3600): Promise<string> {
  const expires = Math.min(Math.max(Math.floor(expiresSeconds), 60), 86400);
  const url = new URL(objectUrl(env, key));
  url.searchParams.set("X-Amz-Expires", String(expires));
  const signed = await clientFor(env).sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true },
  });
  return signed.url.toString();
}
