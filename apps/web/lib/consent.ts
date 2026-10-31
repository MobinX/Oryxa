/**
 * Cookie consent state for the public site. The choice lives in a first-party cookie so
 * it travels with the request, survives a cleared localStorage, and can be read before
 * any optional analytics runs. No advertising cookies exist; analytics is the only
 * optional category.
 */
export const CONSENT_COOKIE = 'oryxa_consent';
export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE_DAYS = 180;
export const VISITOR_COOKIE = 'oryxa_vid';

export type ConsentCategories = {
  analytics: boolean;
  marketing: boolean;
};

export type ConsentRecord = ConsentCategories & {
  version: number;
  necessary: true;
  updatedAt: string;
};

export const DEFAULT_CONSENT: ConsentCategories = {
  analytics: false,
  marketing: false,
};

export function readConsent(): ConsentRecord | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${CONSENT_COOKIE}=`;
  const raw = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(raw.slice(prefix.length))) as Partial<ConsentRecord>;
    if (parsed.version !== CONSENT_VERSION || parsed.necessary !== true) return null;
    if (typeof parsed.analytics !== 'boolean' || typeof parsed.marketing !== 'boolean') return null;
    return {
      version: CONSENT_VERSION,
      necessary: true,
      analytics: parsed.analytics,
      marketing: parsed.marketing,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeConsent(categories: ConsentCategories): ConsentRecord {
  const record: ConsentRecord = {
    version: CONSENT_VERSION,
    necessary: true,
    analytics: Boolean(categories.analytics),
    marketing: Boolean(categories.marketing),
    updatedAt: new Date().toISOString(),
  };
  const value = encodeURIComponent(JSON.stringify(record));
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${CONSENT_COOKIE}=${value}; path=/; max-age=${CONSENT_MAX_AGE_DAYS * 86_400}; samesite=lax${secure}`;

  // Rejecting analytics also removes the anonymous visit id that only exists to count
  // storefront visits; the next accepted choice mints a fresh one.
  if (!record.analytics) {
    document.cookie = `${VISITOR_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
  }
  return record;
}

export function hasAnalyticsConsent(): boolean {
  return readConsent()?.analytics === true;
}
