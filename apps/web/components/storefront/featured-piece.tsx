import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { AddToCart } from '@/components/storefront/add-to-cart';
import { ProductImage } from '@/components/storefront/product-image';
import { formatPrice } from '@/lib/storefront';
import type { PublicProduct } from '@/lib/storefront';

type FeaturedPieceProps = {
  slug: string;
  product: PublicProduct;
  label?: string;
};

export function FeaturedPiece({ slug, product, label = 'Featured piece' }: FeaturedPieceProps) {
  const href = `/store/${slug}/${product.id}`;

  return (
    <section className="border-b border-[#E4E1DB] bg-white">
      <div className="mx-auto grid w-full max-w-[1560px] gap-10 px-5 py-16 sm:px-8 md:grid-cols-12 md:gap-14 md:py-20 lg:px-12">
        <div className="md:col-span-7 lg:col-span-8">
          <Link href={href} className="group block">
            <ProductImage
              src={product.thumbnailUrl}
              alt={product.name}
              eager
              className="aspect-[16/11] w-full sm:aspect-[7/5]"
              imgClassName="group-hover:scale-[1.02]"
            />
          </Link>
        </div>

        <div className="flex flex-col justify-center md:col-span-5 lg:col-span-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--store-accent)]">{label}</p>
          <h2
            className="mt-5 text-[clamp(1.6rem,3vw,2.4rem)] leading-[1.1] tracking-[-0.01em] text-[#141414]"
            style={{ fontFamily: 'var(--store-font)' }}
          >
            <Link href={href} className="transition-colors duration-300 hover:text-[var(--store-accent)]">
              {product.name}
            </Link>
          </h2>
          <p className="mt-4 text-[15px] tabular-nums text-[#141414]">{formatPrice(product.price)}</p>

          {product.description ? (
            <p className="mt-6 max-w-[46ch] text-[13.5px] leading-[1.8] text-[#6b6b6b]">
              {product.description.length > 240 ? `${product.description.slice(0, 240).trimEnd()}…` : product.description}
            </p>
          ) : null}

          {product.variants.length > 0 ? (
            <p className="mt-6 text-[11px] uppercase tracking-[0.2em] text-[#a29d96]">
              {product.variants.slice(0, 6).map((v) => v.name).join(' · ')}
            </p>
          ) : null}

          <div className="mt-9 flex flex-wrap items-center gap-5">
            <AddToCart
              product={product}
              tone="band"
              revealCart
              text={product.inStock ? 'Add to bag' : 'Sold out'}
              className="h-11 px-9"
            />
            <Link
              href={href}
              className="nav-rule inline-flex h-11 items-center gap-2 text-[10.5px] uppercase tracking-[0.26em] text-[#6b6b6b] transition-colors duration-300 hover:text-[#141414]"
            >
              View details
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
