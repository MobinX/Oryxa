import { headers } from "next/headers";
import { getBrand } from "@/lib/brand-server";
import { siteUrl } from "@/lib/seo";
import { buildLlmsTxt } from "@/lib/llms-txt";

/**
 * llms.txt: a machine-readable summary of the site for LLM crawlers and
 * assistants (https://llmstxt.org). Plain text, brand-aware links, and every
 * link targets a page that really exists.
 */
export async function GET(): Promise<Response> {
  const requestHeaders = await headers();
  const { companyName } = await getBrand();
  const body = buildLlmsTxt({
    companyName,
    origin: siteUrl(requestHeaders.get("host")),
  });
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
