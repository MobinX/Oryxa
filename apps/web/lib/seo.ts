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
 * Open Graph and Twitter cards for a page. Without this, child pages inherit the
 * homepage's social title and description, which is what Google and chat apps show.
 */
export function socialMetadata(input: {
  title: string;
  description: string;
  path: string;
  siteName: string;
}) {
  return {
    openGraph: {
      type: 'website' as const,
      siteName: input.siteName,
      title: input.title,
      description: input.description,
      url: input.path,
      images: [
        { url: '/og-default.png', width: 1200, height: 630, alt: input.title },
      ],
    },
    twitter: {
      card: 'summary_large_image' as const,
      title: input.title,
      description: input.description,
      images: ['/og-default.png'],
    },
  };
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
  '/cookies',
  '/data-delete-instructions',
] as const;
