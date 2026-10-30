import { BRAND_DEFAULT_HOST, normalizeBrandHost } from '@/lib/brand';

/**
 * Canonical host for SEO: `www.` is transport, not identity, so both variants
 * canonicalize to the apex. Never cross brands — each host canonicals to itself.
 */
export function canonicalHost(host: string | null | undefined): string {
  const normalized = normalizeBrandHost(host);
  if (!normalized) return BRAND_DEFAULT_HOST;
  return normalized.replace(/^www\./, '') || BRAND_DEFAULT_HOST;
}

/** Absolute site origin for sitemaps, canonicals and schema URLs. */
export function siteUrl(host: string | null | undefined): string {
  return `https://${canonicalHost(host)}`;
}

/**
 * Public routes worth indexing. Placeholder pages (features, solutions, docs,
 * developers) stay out until they ship real content; console routes are noindexed.
 */
export const SITEMAP_ROUTES = [
  '/',
  '/pricing',
  '/terms',
  '/privacy',
  '/data-delete-instructions',
] as const;
