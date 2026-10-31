import { getBrand } from '@/lib/brand-server';
import { siteUrl } from '@/lib/seo';
import type { PublicProduct, PublicStore } from '@/lib/storefront';

type ProductJsonLdProps = {
  product: PublicProduct;
  store: PublicStore | null;
  slug: string;
};

function absoluteUrl(base: string, url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${base}${url.startsWith('/') ? url : `/${url}`}`;
}

/** Product + breadcrumb markup mirroring the visible product page. */
export async function ProductJsonLd({
  product,
  store,
  slug,
}: ProductJsonLdProps): Promise<React.JSX.Element | null> {
  const brand = await getBrand();
  const base = siteUrl(brand.host);
  const canonical = `${base}/store/${slug}/${product.id}`;
  const image = absoluteUrl(base, product.thumbnailUrl);
  // Product requires an image: skip rather than ship invalid markup.
  if (!image) return null;

  const crumbs: { '@type': 'ListItem'; position: number; name: string; item?: string }[] = [
    {
      '@type': 'ListItem',
      position: 1,
      name: store?.name ?? 'Store',
      item: `${base}/store/${slug}`,
    },
  ];
  if (product.categoryName) {
    crumbs.push({
      '@type': 'ListItem',
      position: 2,
      name: product.categoryName,
      item: `${base}/store/${slug}?category=${encodeURIComponent(product.categoryName)}`,
    });
  }
  crumbs.push({ '@type': 'ListItem', position: crumbs.length + 1, name: product.name });

  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        '@id': canonical,
        url: canonical,
        name: product.name,
        ...(product.description ? { description: product.description } : {}),
        image,
        ...(store ? { brand: { '@type': 'Brand', name: store.name } } : {}),
        offers: {
          '@type': 'Offer',
          url: canonical,
          price: product.price.toFixed(2),
          priceCurrency: 'USD',
          itemCondition: 'https://schema.org/NewCondition',
          availability: product.inStock
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
          ...(store
            ? {
                seller: {
                  '@type': 'Organization',
                  name: store.name,
                  url: `${base}/store/${slug}`,
                },
              }
            : {}),
        },
      },
      { '@type': 'BreadcrumbList', itemListElement: crumbs },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
