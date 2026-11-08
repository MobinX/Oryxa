import { headers } from "next/headers";
import {
  buildIndexNowPayload,
  indexNowKey,
  submitIndexNow,
} from "@/lib/indexnow";
import { SITEMAP_ROUTES, siteUrl } from "@/lib/seo";

/**
 * IndexNow submission for Bing + Yandex.
 *
 * GET  → config check only (booleans, no secrets). Safe to open in a browser.
 * POST → submits every sitemap URL for the request host. Guarded by
 *         `Authorization: Bearer <INDEXNOW_SUBMIT_TOKEN>` and fail-closed when
 *         the key or token is unset.
 *
 * Runbook (key file must be deployed BEFORE submitting — IndexNow fetches it):
 *   TOKEN=<INDEXNOW_SUBMIT_TOKEN>
 *   curl -s -X POST https://onlyorders.tech/api/indexnow/submit \
 *     -H "Authorization: Bearer $TOKEN"
 * A 200 with `{"ok":true}` means Bing/Yandex accepted the URLs for crawling.
 */
export async function GET(): Promise<Response> {
  return Response.json({
    ok: true,
    configured: {
      key: indexNowKey().length > 0,
      submitToken: Boolean(process.env.INDEXNOW_SUBMIT_TOKEN),
    },
    routes: SITEMAP_ROUTES.length,
  });
}

export async function POST(request: Request): Promise<Response> {
  const token = process.env.INDEXNOW_SUBMIT_TOKEN;
  const key = indexNowKey();
  if (!token || !key) {
    return Response.json(
      {
        ok: false,
        error:
          "IndexNow not configured: set INDEXNOW_KEY and INDEXNOW_SUBMIT_TOKEN.",
      },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${token}`) {
    return Response.json(
      { ok: false, error: "Unauthorized." },
      { status: 401 },
    );
  }
  const host = (await headers()).get("host");
  const payload = buildIndexNowPayload({
    origin: siteUrl(host),
    key,
    routes: SITEMAP_ROUTES,
  });
  try {
    const result = await submitIndexNow(payload);
    return Response.json(
      {
        ok: result.ok,
        status: result.status,
        submitted: payload.urlList.length,
      },
      { status: result.ok ? 200 : 502 },
    );
  } catch {
    return Response.json(
      { ok: false, error: "IndexNow request failed." },
      { status: 502 },
    );
  }
}
