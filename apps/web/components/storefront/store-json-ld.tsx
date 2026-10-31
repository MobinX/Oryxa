import { getBrand } from '@/lib/brand-server';
import { siteUrl } from '@/lib/seo';
import type { PublicStore } from '@/lib/storefront';

function absolute(base: string, url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${base}${url.startsWith('/') ? url : `/${url}`}`;
}

/** Storefront identity, separate from the platform Organization in the root layout. */
export async function StoreJsonLd({
  store,
  slug,
}: {
  store: PublicStore;
  slug: string;
}): Promise<React.JSX.Element> {
  const brand = await getBrand();
  const base = siteUrl(brand.host);
  const canonical = `${base}/store/${slug}`;
  const description = store.description ?? store.theme?.tagline ?? undefined;
  const image = absolute(base, store.theme?.logoUrl ?? store.theme?.heroImageUrl);
  const logo = absolute(base, store.theme?.logoUrl);

  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'OnlineStore',
        '@id': `${canonical}#store`,
        name: store.name,
        url: canonical,
        ...(description ? { description } : {}),
        ...(image ? { image } : {}),
        ...(logo ? { logo } : {}),
        ...(store.phone ? { telephone: store.phone } : {}),
      },
      {
        '@type': 'WebPage',
        '@id': canonical,
        url: canonical,
        name: store.name,
        ...(description ? { description } : {}),
        isPartOf: { '@id': `${base}/#website` },
        about: { '@id': `${canonical}#store` },
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
