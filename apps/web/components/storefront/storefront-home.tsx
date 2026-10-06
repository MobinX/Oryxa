'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FilterBar } from '@/components/storefront/filter-bar';
import { FeaturedPiece } from '@/components/storefront/featured-piece';
import { EmptyState, ProductGrid, ProductGridSkeleton } from '@/components/storefront/product-grid';
import { StorefrontHero } from '@/components/storefront/storefront-hero';
import {
  EMPTY_FILTERS,
  filtersToQuery,
  getStore,
  hasActiveFilters,
  sameFilters,
  toStoreFilters,
} from '@/lib/storefront';
import type { PublicProduct, PublicStore, StoreFilterState } from '@/lib/storefront';
import { cn } from '@/lib/utils';

export function StorefrontHome({
  store,
  initialFilters = EMPTY_FILTERS,
}: {
  store: PublicStore;
  initialFilters?: StoreFilterState;
}) {
  const slug = store.slug;
  const [filters, setFilters] = useState<StoreFilterState>(initialFilters);
  const [products, setProducts] = useState<PublicProduct[]>(store.products);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [catalogTotal, setCatalogTotal] = useState(store.products.length);

  const applied = useRef<StoreFilterState>(initialFilters);
  const requestId = useRef(0);
  const initialKey = JSON.stringify(initialFilters);

  const run = useCallback(
    async (next: StoreFilterState) => {
      applied.current = next;
      const id = ++requestId.current;
      setLoading(true);
      setFailure(null);
      try {
        const result = await getStore(slug, toStoreFilters(next));
        if (id !== requestId.current) return;
        setProducts(result.products);
        // An unfiltered response is the real size of the catalogue.
        if (!hasActiveFilters(next)) setCatalogTotal(result.products.length);
        const query = filtersToQuery(next);
        window.history.replaceState(null, '', query ? `/store/${slug}?${query}` : `/store/${slug}`);
      } catch (error) {
        if (id !== requestId.current) return;
        setFailure(error instanceof Error ? error.message : 'The collection could not be loaded.');
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [slug],
  );

  // The server renders the first paint; only later changes re-hit the API.
  useEffect(() => {
    if (sameFilters(filters, applied.current)) return;
    const debounce = setTimeout(() => {
      // An explicit commit may already have applied these exact filters.
      if (sameFilters(filters, applied.current)) return;
      void run(filters);
    }, 380);
    return () => clearTimeout(debounce);
  }, [filters, run]);

  // Deep links from the header search, category nav or the address bar arrive as new props.
  useEffect(() => {
    const serverFilters = JSON.parse(initialKey) as StoreFilterState;
    applied.current = serverFilters;
    setFilters(serverFilters);
    setProducts(store.products);
    setLoading(false);
    setFailure(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  const filtered = hasActiveFilters(filters);
  const showFeatured = store.theme?.layout === 'featured' && !filtered && products.length > 3;
  const gridProducts = showFeatured ? products.slice(1) : products;

  return (
    <>
      <StorefrontHero store={store} total={catalogTotal} />

      <div id="collection" className="scroll-mt-28">
        <FilterBar
          categories={store.categories}
          filters={filters}
          loading={loading}
          resultCount={products.length}
          totalCount={catalogTotal}
          onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
          onCommit={() => void run(filters)}
          onClear={() => setFilters(EMPTY_FILTERS)}
        />

        {showFeatured && products.length > 0 ? (
          <FeaturedPiece slug={slug} product={products[0]} />
        ) : null}

        <section className="mx-auto w-full max-w-[1560px] px-5 py-14 sm:px-8 md:py-20 lg:px-12">
          {failure ? (
            <div className="mb-10 flex flex-wrap items-center justify-between gap-4 border border-[var(--store-line)] bg-[var(--store-surface)] px-5 py-4">
              <p className="text-[13px] text-[var(--store-ink-2)]">{failure}</p>
              <button
                type="button"
                onClick={() => void run(filters)}
                className="text-[10px] uppercase tracking-[0.24em] text-[var(--store-accent)] underline-offset-4 hover:underline"
              >
                Try again
              </button>
            </div>
          ) : null}

          {loading && products.length === 0 ? (
            <ProductGridSkeleton />
          ) : products.length === 0 ? (
            <EmptyState
              title={catalogTotal === 0 ? 'No products yet' : 'Nothing matches your filters'}
              message={
                catalogTotal === 0
                  ? 'This boutique is curating its next selection — please check back soon.'
                  : 'Try another category, keyword or price range to see more pieces.'
              }
              action={
                catalogTotal === 0 ? undefined : (
                  <button
                    type="button"
                    onClick={() => setFilters(EMPTY_FILTERS)}
                    className="inline-flex h-11 items-center border border-[var(--store-ink)] px-8 text-[10.5px] uppercase tracking-[0.26em] text-[var(--store-ink)] transition-colors duration-300 hover:bg-[var(--store-ink)] hover:text-[var(--store-paper)]"
                  >
                    Clear filters
                  </button>
                )
              }
            />
          ) : (
            <div className={cn('transition-opacity duration-300', loading && 'opacity-40')}>
              <ProductGrid
                slug={slug}
                products={gridProducts}
                density={showFeatured ? 3 : 4}
              />
            </div>
          )}
        </section>
      </div>

      <div
        aria-hidden
        className={cn(
          'fixed left-0 top-0 z-50 h-[2px] w-full origin-left bg-[var(--store-accent)]',
          'transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]',
          loading ? 'scale-x-100' : 'scale-x-0',
        )}
      />
    </>
  );
}
