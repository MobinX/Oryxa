import { getBrand } from '@/lib/brand-server';
import { siteUrl } from '@/lib/seo';

/**
 * Site identity for search engines: Organization + WebSite. The logo must be a
 * crawlable raster file — Google's Organization spec does not accept SVG.
 */
export async function OrganizationJsonLd(): Promise<React.JSX.Element> {
  const brand = await getBrand();
  const base = siteUrl(brand.host);
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${base}/#organization`,
        name: brand.companyName,
        url: base,
        logo: {
          '@type': 'ImageObject',
          url: `${base}/icon-512.png`,
          width: 512,
          height: 512,
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${base}/#website`,
        url: base,
        name: brand.companyName,
        publisher: { '@id': `${base}/#organization` },
      },
    ],
  };
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
