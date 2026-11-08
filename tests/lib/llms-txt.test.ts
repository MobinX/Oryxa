import { describe, expect, it } from "vitest";
import { buildLlmsTxt } from "../../apps/web/lib/llms-txt";
import { DOC_SLUGS } from "../../apps/web/lib/docs-content";

const ORIGIN = "https://example.com";

describe("llms.txt", () => {
  it("names the brand and links every guide", () => {
    const body = buildLlmsTxt({ companyName: "TestCo", origin: ORIGIN });
    expect(body).toContain("# TestCo");
    for (const slug of DOC_SLUGS) {
      expect(body).toContain(`${ORIGIN}/docs/${slug}`);
    }
    for (const path of ["/", "/solutions", "/pricing", "/contact"]) {
      expect(body).toContain(`${ORIGIN}${path}`);
    }
  });

  it("never hardcodes a real brand name", () => {
    const body = buildLlmsTxt({ companyName: "TestCo", origin: ORIGIN });
    expect(body).not.toMatch(/onlyorders|oryxa/i);
  });
});
