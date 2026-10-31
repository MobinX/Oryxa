import { getBrand } from '@/lib/brand-server';
import { supportEmailForHost } from '@/lib/brand';
import { siteUrl } from '@/lib/seo';

/**
 * Site identity for search engines: Organization + WebSite. The logo is a crawlable
 * 512px raster file, because Google's Organization spec does not accept SVG.
 */
export async function OrganizationJsonLd(): Promise<React.JSX.Element> {
  const brand = await getBrand();
  const base = siteUrl(brand.host);
  const supportEmail = supportEmailForHost(brand.host);
  const logo = `${base}/logo.png`;
  const description = `${brand.companyName} answers DMs, comments and storefront questions with AI, manages catalog and orders for Facebook, Instagram and WhatsApp commerce.`;

  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${base}/#organization`,
        name: brand.companyName,
        legalName: brand.parentCompanyName,
        url: base,
        description,
        logo: {
          '@type': 'ImageObject',
          '@id': `${base}/#logo`,
          url: logo,
          contentUrl: logo,
          width: 512,
          height: 512,
          caption: `${brand.companyName} logo`,
        },
        image: { '@id': `${base}/#logo` },
        email: supportEmail,
        address: {
          '@type': 'PostalAddress',
          streetAddress: '51, Mirpur Road, Room 517, Alpana Plaza, Level 5',
          addressLocality: 'Dhaka',
          postalCode: '1205',
          addressCountry: 'BD',
        },
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          email: supportEmail,
          availableLanguage: ['English', 'Bengali'],
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${base}/#website`,
        url: base,
        name: brand.companyName,
        description,
        inLanguage: 'en',
        publisher: { '@id': `${base}/#organization` },
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
