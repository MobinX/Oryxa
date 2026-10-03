import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ProductGallery } from '@/components/storefront/product-gallery';
import { ProductGrid } from '@/components/storefront/product-grid';
import { ProductPurchase } from '@/components/storefront/product-purchase';
import { ProductDetailSkeleton } from '@/components/storefront/storefront-skeleton';
import { formatPrice, getProduct, getStore } from '@/lib/storefront';
import type { PublicProduct } from '@/lib/storefront';

type ProductParams = Promise<{ slug: string; productId: string }>;

async function loadProduct(params: ProductParams): Promise<PublicProduct | null> {
  const { slug, productId } = await params;
  return getProduct(slug, productId).catch(() => null);
}

export async function generateMetadata({ params }: { params: ProductParams }): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(params);

  if (!product) return { title: 'Piece not found' };

  return {
    title: `${product.name} — ${formatPrice(product.price)}`,
    description: product.description?.slice(0, 170) ?? undefined,
    openGraph: {
      type: 'website',
      title: product.name,
      description: product.description ?? undefined,
      images: product.thumbnailUrl ? [product.thumbnailUrl] : undefined,
      url: `/store/${slug}/${product.id}`,
    },
  };
}

function relatedPieces(storeProducts: PublicProduct[], product: PublicProduct): PublicProduct[] {
  const others = storeProducts.filter((candidate) => candidate.id !== product.id);
  const sameCategory = others.filter(
    (candidate) =>
      Boolean(product.categoryName) && candidate.categoryName === product.categoryName,
  );
  const rest = others.filter((candidate) => !sameCategory.some((match) => match.id === candidate.id));
  return [...sameCategory, ...rest].slice(0, 4);
}

async function ProductView({ params }: { params: ProductParams }) {
  const { slug } = await params;
  const product = await loadProduct(params);
  if (!product) notFound();

  // Same request as the layout's shell fetch — de-duplicated in lib/storefront.
  const store = await getStore(slug).catch(() => null);
  const related = store ? relatedPieces(store.products, product) : [];

  return (
    <>
      <nav
        aria-label="Breadcrumb"
        className="mx-auto flex w-full max-w-[1560px] flex-wrap items-center gap-x-2.5 gap-y-1 px-5 py-5 text-[10px] uppercase tracking-[0.22em] text-[#a29d96] sm:px-8 lg:px-12"
      >
        <Link
          href={`/store/${slug}`}
          className="transition-colors hover:text-[#141414]"
        >
          {store?.name ?? 'Store'}
        </Link>
        <span aria-hidden>/</span>
        {product.categoryName ? (
          <>
            <Link
              href={`/store/${slug}?category=${encodeURIComponent(product.categoryName)}`}
              className="transition-colors hover:text-[#141414]"
            >
              {product.categoryName}
            </Link>
            <span aria-hidden>/</span>
          </>
        ) : null}
        <span className="truncate text-[#5c5c5c]">{product.name}</span>
      </nav>

      <article className="mx-auto grid w-full max-w-[1560px] gap-10 px-5 pb-16 sm:px-8 lg:grid-cols-12 lg:gap-16 lg:px-12">
        <div className="lg:col-span-7">
          <ProductGallery product={product} />
        </div>

        <div className="lg:col-span-5 lg:pt-2">
          <Link
            href={`/store/${slug}`}
            className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[#a29d96] transition-colors hover:text-[#141414]"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
            Back to collection
          </Link>

          {product.categoryName ? (
            <Link
              href={`/store/${slug}?category=${encodeURIComponent(product.categoryName)}`}
              className="mt-8 block text-[10px] uppercase tracking-[0.3em] text-[var(--store-accent)] transition-opacity hover:opacity-75"
            >
              {product.categoryName}
            </Link>
          ) : null}

          <h1
            className="mt-4 text-[clamp(1.9rem,3.6vw,3.1rem)] leading-[1.06] tracking-[-0.015em] text-[#141414]"
            style={{ fontFamily: 'var(--store-font)' }}
          >
            {product.name}
          </h1>

          {!product.inStock ? (
            <p className="mt-5 inline-flex border border-[#141414] px-3 py-1.5 text-[10px] uppercase tracking-[0.24em] text-[#141414]">
              Out of stock
            </p>
          ) : null}

          {product.description ? (
            <div className="mt-7 space-y-4 text-[13.5px] leading-[1.85] text-[#5c5c5c]">
              {product.description
                .split('\n')
                .map((paragraph) => paragraph.trim())
                .filter(Boolean)
                .map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
            </div>
          ) : (
            <p className="mt-7 text-[13.5px] leading-[1.85] text-[#8f8b85]">
              Details for this piece are on their way. Enquire with the boutique for measurements
              and availability.
            </p>
          )}

          <ProductPurchase product={product} />
        </div>
      </article>

      {related.length > 0 ? (
        <section className="border-t border-[#E4E1DB] bg-white">
          <div className="mx-auto w-full max-w-[1560px] px-5 py-16 sm:px-8 md:py-20 lg:px-12">
            <div className="mb-10 flex items-end justify-between gap-6">
              <h2
                className="text-[clamp(1.25rem,2vw,1.65rem)] tracking-[-0.01em] text-[#141414]"
                style={{ fontFamily: 'var(--store-font)' }}
              >
                Complete the look
              </h2>
              <Link
                href={`/store/${slug}`}
                className="nav-rule text-[10px] uppercase tracking-[0.24em] text-[#6b6b6b] transition-colors hover:text-[#141414]"
              >
                All pieces
              </Link>
            </div>
            <ProductGrid slug={slug} products={related} />
          </div>
        </section>
      ) : null}
    </>
  );
}

export default function StorefrontProductPage({ params }: { params: ProductParams }) {
  return (
    <Suspense fallback={<ProductDetailSkeleton />}>
      <ProductView params={params} />
    </Suspense>
  );
}
