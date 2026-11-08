import { getDocsArticles } from "./docs-content";

/**
 * llms.txt body builder (https://llmstxt.org). Pure and import-free so vitest
 * can verify it without the Next alias. Every link points at a page that
 * really exists — this file must never advertise vapor.
 */
export function buildLlmsTxt(input: {
  companyName: string;
  origin: string;
}): string {
  const { companyName, origin } = input;
  const articles = getDocsArticles(companyName);
  const lines = [
    `# ${companyName}`,
    "",
    `> ${companyName} answers DMs, comments, and storefront questions with AI — catalog, orders, and handoff for Facebook, Instagram, and WhatsApp.`,
    "",
    "## Key pages",
    "",
    `- [Home](${origin}/): product tour, live demo, pricing, FAQ`,
    `- [Solutions](${origin}/solutions): what changes for Facebook, Instagram, and WhatsApp sellers`,
    `- [Documentation](${origin}/docs): setup guides and troubleshooting`,
    `- [Pricing](${origin}/pricing): current plans and limits`,
    `- [Contact](${origin}/contact): support and partnership inquiries`,
    "",
    "## Guides",
    "",
    ...articles.map(
      (a) => `- [${a.title}](${origin}/docs/${a.slug}): ${a.description}`,
    ),
    "",
    "## Policies",
    "",
    `- [Privacy Policy](${origin}/privacy)`,
    `- [Terms of Service](${origin}/terms)`,
    `- [Data Deletion Instructions](${origin}/data-delete-instructions)`,
    "",
    "## Notes",
    "",
    "- No public API or agent-authenticated endpoints are offered; the merchant console requires login.",
    "- Catalog, prices, and plans change over time — treat the docs and pricing pages as canonical.",
    "",
  ];
  return lines.join("\n");
}
