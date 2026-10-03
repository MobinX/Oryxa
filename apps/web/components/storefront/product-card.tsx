import Link from 'next/link';
import { AddToCart } from '@/components/storefront/add-to-cart';
import { ProductImage } from '@/components/storefront/product-image';
import { formatPrice } from '@/lib/storefront';
import type { PublicProduct } from '@/lib/storefront';
import { cn } from '@/lib/utils';

type ProductCardProps = {
  slug: string;
  product: PublicProduct;
  /** Featured cards get a larger title and always-visible quick add. */
  featured?: boolean;
  eager?: boolean;
  className?: string;
};

function priceLabel(product: PublicProduct): string {
  const prices = [product.price, ...product.variants.map((v) => v.price ?? product.price)];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatPrice(min) : `From ${formatPrice(min)}`;
}

export function ProductCard({ slug, product, featured = false, eager = false, className }: ProductCardProps) {
  const href = `/store/${slug}/${product.id}`;
  const variantNames = product.variants.map((v) => v.name).filter(Boolean);

  return (
    <article
      className={cn(
        'group relative flex flex-col',
        featured && 'md:pb-2',
        className,
      )}
    >
      <div
        className={cn(
          'relative overflow-hidden bg-[#F2F0EC]',
          featured ? 'aspect-[4/5] sm:aspect-[3/4]' : 'aspect-[4/5]',
        )}
      >
        <Link
          href={href}
          className="absolute inset-0 z-10"
          aria-label={`${product.name} — view product`}
        />
        <ProductImage
          src={product.thumbnailUrl}
          alt={product.name}
          eager={eager}
          className="h-full w-full"
          imgClassName="group-hover:scale-[1.035]"
        />

        {!product.inStock ? (
          <span className="absolute left-0 top-0 z-20 bg-white/90 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-[#6b6b6b]">
            Sold out
          </span>
        ) : null}

        <div
          className={cn(
            'absolute inset-x-0 bottom-0 z-20 p-2 sm:p-3',
            'transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
            featured ? 'translate-y-0' : 'translate-y-0 md:translate-y-[130%] md:group-hover:translate-y-0',
          )}
        >
          <AddToCart
            product={product}
            tone={featured ? 'band' : 'outline'}
            text={product.inStock ? 'Quick add' : 'Sold out'}
            revealCart
            className="backdrop-blur-[2px]"
          />
        </div>
      </div>

      <div className={cn('flex items-start justify-between gap-4', featured ? 'mt-5' : 'mt-4')}>
        <div className="min-w-0">
          {product.categoryName ? (
            <p className="text-[10px] uppercase tracking-[0.24em] text-[#8f8b85]">
              {product.categoryName}
            </p>
          ) : null}
          <h3 className={cn('mt-1.5 leading-snug text-[#141414]', featured ? 'text-base' : 'text-[13.5px]')}>
            <Link
              href={href}
              className="transition-colors duration-300 hover:text-[var(--store-accent)]"
            >
              {product.name}
            </Link>
          </h3>
          {variantNames.length > 0 ? (
            <p className="mt-1 truncate text-[11px] tracking-wide text-[#9a968f]">
              {variantNames.slice(0, 4).join(' · ')}
              {variantNames.length > 4 ? ` +${variantNames.length - 4}` : ''}
            </p>
          ) : null}
        </div>
        <p
          className={cn(
            'shrink-0 whitespace-nowrap tabular-nums',
            featured ? 'text-base text-[#141414]' : 'text-[13px] text-[#3d3d3d]',
          )}
          style={{ fontFamily: 'var(--store-font)' }}
        >
          {priceLabel(product)}
        </p>
      </div>
    </article>
  );
}
