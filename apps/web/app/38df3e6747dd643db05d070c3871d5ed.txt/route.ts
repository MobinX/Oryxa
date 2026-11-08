import { INDEXNOW_KEY } from "@/lib/indexnow";

/**
 * IndexNow domain proof for Bing + Yandex. IndexNow validates submissions by
 * fetching `https://<host>/<key>.txt` and comparing the content to the key, so
 * this route must stay byte-identical to the key in `@/lib/indexnow`.
 * Same pattern as the existing robots.txt / sitemap.xml routes.
 */
export function GET(): Response {
  return new Response(`${INDEXNOW_KEY}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
