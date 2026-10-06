import { PackageOpen } from 'lucide-react';
import { ProductCard } from '@/components/storefront/product-card';
import type { PublicProduct } from '@/lib/storefront';
import { cn } from '@/lib/utils';

type ProductGridProps = {
  slug: string;
  products: PublicProduct[];
  density?: 3 | 4;
  className?: string;
};

export function ProductGrid({ slug, products, density = 4, className }: ProductGridProps) {
  return (
    <div
      data-store-grid
      className={cn(
        'grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-6 sm:gap-y-14',
        'lg:grid-cols-3',
        density === 4 ? '2xl:grid-cols-4' : '2xl:grid-cols-3',
        className,
      )}
    >
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          slug={slug}
          product={product}
          eager={index < density}
        />
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-6 sm:gap-y-14 lg:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="animate-pulse">
          <div className="aspect-[4/5] w-full bg-[var(--store-plate)]" />
          <div className="mt-4 h-2.5 w-16 bg-[var(--store-plate)]" />
          <div className="mt-2.5 h-3 w-3/4 bg-[var(--store-plate)]" />
          <div className="mt-2 h-3 w-10 bg-[var(--store-plate)]" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center border border-dashed border-[var(--store-line)] bg-[var(--store-surface)]/40 px-6 py-24 text-center">
      <PackageOpen className="h-6 w-6 text-[var(--store-ink-3)]" strokeWidth={1.25} />
      <h2 className="mt-6 text-[15px] uppercase tracking-[0.3em] text-[var(--store-ink-2)]">{title}</h2>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--store-ink-3)]">{message}</p>
      {action ? <div className="mt-8">{action}</div> : null}
    </div>
  );
}
