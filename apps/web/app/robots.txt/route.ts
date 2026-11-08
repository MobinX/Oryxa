import { headers } from "next/headers";
import { siteUrl } from "@/lib/seo";

/**
 * Host-aware robots.txt: the sitemap URL must be absolute, so it follows the
 * request host. The proxy skips this path, so the Host header is read directly.
 *
 * AI crawler policy: assistants' search crawlers stay allowed so pages can
 * surface in AI answers; model-training crawlers are refused. Agent-oriented
 * extras: Content-Signal preferences plus the absolute sitemap reference.
 */
export async function GET(): Promise<Response> {
  const host = (await headers()).get("host");
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /b",
    "Disallow: /businesses",
    "Disallow: /api",
    "Disallow: /api2",
    "Disallow: /login",
    "",
    "# AI assistants may surface these pages in answers.",
    "User-agent: OAI-SearchBot",
    "Allow: /",
    "User-agent: Claude-SearchBot",
    "Allow: /",
    "User-agent: PerplexityBot",
    "Allow: /",
    "",
    "# Model-training crawlers may not collect training data here.",
    "User-agent: GPTBot",
    "Disallow: /",
    "User-agent: ClaudeBot",
    "Disallow: /",
    "User-agent: Google-Extended",
    "Disallow: /",
    "User-agent: CCBot",
    "Disallow: /",
    "",
    "Content-Signal: ai-train=no, search=yes, ai-input=no",
    "",
    `Sitemap: ${siteUrl(host)}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
