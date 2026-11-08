/**
 * IndexNow (Bing + Yandex + others) URL submission.
 *
 * This module is import-clean on purpose: it takes its inputs as arguments and
 * imports nothing, so the payload builder stays unit-testable under vitest
 * (which has no `@/` alias for apps/web). The route handlers wire in the real
 * host, key and sitemap routes.
 *
 * Protocol note: the IndexNow key is a domain-control proof, not a credential.
 * IndexNow only works because the key is served publicly at `/<key>.txt` —
 * committing it here is required, the same as a search-console verification file.
 * The *submit* endpoint is still guarded by INDEXNOW_SUBMIT_TOKEN, which stays
 * env-only and is never committed.
 */

/** Shared IndexNow endpoint consumed by Bing, Yandex and other engines. */
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/**
 * The key must stay identical in three places:
 * 1. this constant,
 * 2. the key-file route folder `apps/web/app/<KEY>.txt/route.ts`,
 * 3. `INDEXNOW_KEY` in the environment (overrides this default when set).
 * Rotating the key means changing all three and redeploying.
 */
export const INDEXNOW_KEY = "38df3e6747dd643db05d070c3871d5ed";

/** Env override when set, compiled-in default otherwise. */
export function indexNowKey(): string {
  return process.env.INDEXNOW_KEY || INDEXNOW_KEY;
}

export interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

export function buildIndexNowPayload(input: {
  /** Absolute origin, e.g. `https://onlyorders.tech` (no trailing slash). */
  origin: string;
  key: string;
  routes: readonly string[];
}): IndexNowPayload {
  const host = new URL(input.origin).host;
  return {
    host,
    key: input.key,
    keyLocation: `${input.origin}/${input.key}.txt`,
    urlList: input.routes.map((route) => `${input.origin}${route}`),
  };
}

export async function submitIndexNow(
  payload: IndexNowPayload,
): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  return { ok: res.ok, status: res.status };
}
