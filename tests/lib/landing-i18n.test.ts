import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectLandingLang, LANDING_STRINGS } from '../../apps/web/components/landing/i18n';

function stubLandingEnv(opts: {
  stored?: string | null;
  lang?: string;
  tz?: string;
  throws?: boolean;
} = {}) {
  const { stored = null, lang = 'en-US', tz = 'America/New_York', throws = false } = opts;
  vi.stubGlobal('localStorage', {
    getItem: throws
      ? () => {
          throw new Error('denied');
        }
      : () => stored,
  });
  vi.stubGlobal('navigator', { language: lang });
  vi.stubGlobal('Intl', {
    DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: tz }) }),
  });
}

describe('detectLandingLang', () => {
  beforeEach(() => {
    stubLandingEnv();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the stored oo-lang choice first', () => {
    stubLandingEnv({ stored: 'bn', lang: 'en-US', tz: 'America/New_York' });
    expect(detectLandingLang()).toBe('bn');

    stubLandingEnv({ stored: 'en', lang: 'bn-BD', tz: 'Asia/Dhaka' });
    expect(detectLandingLang()).toBe('en');
  });

  it("returns 'bn' when navigator.language starts with 'bn'", () => {
    stubLandingEnv({ lang: 'bn-BD' });
    expect(detectLandingLang()).toBe('bn');

    stubLandingEnv({ lang: 'bn' });
    expect(detectLandingLang()).toBe('bn');
  });

  it("returns 'bn' for the Asia/Dhaka timezone", () => {
    stubLandingEnv({ lang: 'en-US', tz: 'Asia/Dhaka' });
    expect(detectLandingLang()).toBe('bn');
  });

  it("defaults to 'en' otherwise", () => {
    stubLandingEnv({ lang: 'en-US', tz: 'America/New_York' });
    expect(detectLandingLang()).toBe('en');
  });

  it("defaults to 'en' when storage throws", () => {
    stubLandingEnv({ throws: true, lang: 'bn-BD', tz: 'Asia/Dhaka' });
    expect(detectLandingLang()).toBe('en');
  });
});

describe('LANDING_STRINGS', () => {
  it('has identical top-level keys in EN and BN', () => {
    expect(Object.keys(LANDING_STRINGS.bn).sort()).toEqual(Object.keys(LANDING_STRINGS.en).sort());
  });

  it('has 8 rows of 4 strings in wfDefs in both languages', () => {
    for (const lang of ['en', 'bn'] as const) {
      expect(LANDING_STRINGS[lang].wfDefs).toHaveLength(8);
      for (const row of LANDING_STRINGS[lang].wfDefs) {
        expect(row).toHaveLength(4);
        for (const cell of row) expect(typeof cell).toBe('string');
      }
    }
  });

  it('has 5 question/answer pairs in faqItems in both languages', () => {
    for (const lang of ['en', 'bn'] as const) {
      expect(LANDING_STRINGS[lang].faqItems).toHaveLength(5);
      for (const item of LANDING_STRINGS[lang].faqItems) {
        expect(typeof item.q).toBe('string');
        expect(typeof item.a).toBe('string');
      }
    }
  });
});
