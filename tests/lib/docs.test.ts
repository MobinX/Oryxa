import { describe, expect, it } from "vitest";
import { DOC_SLUGS, getDocsArticles } from "../../apps/web/lib/docs-content";
import { PROOF_STATS } from "../../apps/web/components/landing/proof";

const BRAND = "TestCo";

describe("docs content", () => {
  it("slugs are unique kebab-case ids", () => {
    expect(new Set(DOC_SLUGS).size).toBe(DOC_SLUGS.length);
    for (const slug of DOC_SLUGS) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("covers every slug with a complete article", () => {
    const articles = getDocsArticles(BRAND);
    expect(articles.map((a) => a.slug).sort()).toEqual([...DOC_SLUGS].sort());
    for (const article of articles) {
      expect(article.title.length).toBeGreaterThan(0);
      expect(article.description.length).toBeGreaterThan(0);
      expect(article.updated.length).toBeGreaterThan(0);
      expect(article.sections.length).toBeGreaterThanOrEqual(2);
      for (const section of article.sections) {
        expect(section.heading.length).toBeGreaterThan(0);
        expect(
          section.body.length + (section.steps?.length ?? 0),
        ).toBeGreaterThan(0);
        for (const step of section.steps ?? []) {
          expect(step.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("never hardcodes a real brand name", () => {
    const json = JSON.stringify(getDocsArticles(BRAND));
    expect(json).not.toMatch(/onlyorders|oryxa/i);
    expect(json).toContain(BRAND);
  });
});

describe("proof strip", () => {
  it("shows owner-provided traction figures with Bengali labels", () => {
    expect(PROOF_STATS.length).toBeGreaterThan(0);
    for (const stat of PROOF_STATS) {
      expect(stat.value.length).toBeGreaterThan(0);
      expect(stat.en.length).toBeGreaterThan(0);
      expect(stat.bn.length).toBeGreaterThan(0);
    }
    expect(PROOF_STATS.some((s) => s.value === "10")).toBe(true);
  });
});
