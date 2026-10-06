import { CartProvider } from '@/components/storefront/cart-context';
import { FeaturedPiece } from '@/components/storefront/featured-piece';
import { EmptyState, ProductGrid } from '@/components/storefront/product-grid';
import { StorefrontHeader } from '@/components/storefront/storefront-header';
import { StorefrontHero } from '@/components/storefront/storefront-hero';
import { STORE_CSS } from '@/components/storefront/storefront-shell';
import { isDarkStructure, storeStructure, themeVars } from '@/lib/storefront';
import type { PublicStore } from '@/lib/storefront';
import { cn } from '@/lib/utils';

/**
 * Inside a 390px bezel the storefront's own sizing stops describing the device: every
 * breakpoint and `vw` unit still measures the merchant's real laptop window, so a "phone"
 * would show three product columns and a 7rem headline. Rewriting the production components
 * with `@container` queries is the wrong trade for a preview, so the few viewport-relative
 * rules are pinned here through `data-*` hooks that render no visual change of their own.
 * These selectors must be touched whenever a breakpoint or `clamp()` in the hero, grid or
 * featured piece changes — the drift is silent.
 */
const PHONE_CSS = `
  .store-phone [class~="min-h-[54vh]"],
  .store-phone [class~="sm:min-h-[62vh]"],
  .store-phone [class~="md:min-h-[70vh]"] { min-height: 340px !important; }
  .store-phone [data-store-hero-title] { font-size: 2.35rem !important; }
  .store-phone [data-store-featured-title] { font-size: 1.5rem !important; }
  .store-phone [data-store-monogram] { font-size: 2.25rem !important; }
  .store-phone [class~="lg:grid-cols-3"],
  .store-phone [class~="2xl:grid-cols-4"],
  .store-phone [class~="2xl:grid-cols-3"] { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  .store-phone [class~="md:flex"][class~="hidden"] { display: none !important; }
`;

type PreviewFrame = 'wide' | 'phone';

/**
 * The merchant's own storefront, rendered on the admin page before anything is saved.
 *
 * It reuses the real shell pieces so a theme cannot look better here than it will in
 * public, and it deliberately leaves three things out: the `CartDrawer` (a `fixed inset-0
 * z-[70]` overlay that would blanket the admin app the moment a "Quick add" is tried), the
 * `VisitBeacon` (a trial click is not a shopper page view) and `StorefrontHome` (it rewrites
 * the URL through `history.replaceState` and refetches the public API on every filter).
 *
 * One instance is mounted at a time, selected by `?preset=` server-side — five live carts
 * would mean five duplicate `#storefront-search` ids and five `localStorage` writers.
 */
export function StorefrontPreview({
  store,
  frame = 'wide',
}: {
  store: PublicStore;
  frame?: PreviewFrame;
}) {
  const { theme } = store;
  // Mirrors the real gate in storefront-home.tsx: featured needs more than 3 products.
  const showFeatured = theme?.layout === 'featured' && store.products.length > 3;
  const gridProducts = showFeatured ? store.products.slice(1) : store.products;

  return (
    <div
      data-structure={storeStructure(theme)}
      className={cn(
        'store-root bg-[var(--store-paper)] text-[var(--store-ink)] antialiased',
        frame === 'phone' && 'store-phone',
      )}
      style={{
        ...themeVars(theme),
        fontFamily: 'var(--store-font-ui)',
        colorScheme: isDarkStructure(theme) ? 'dark' : 'light',
      }}
    >
      <style
        dangerouslySetInnerHTML={{ __html: frame === 'phone' ? `${STORE_CSS}${PHONE_CSS}` : STORE_CSS }}
      />

      <CartProvider slug={`${store.slug}--preview`}>
        {theme?.tagline || store.phone ? (
          <div className="bg-[var(--store-accent)] text-[var(--store-accent-fg)]">
            <div className="mx-auto flex w-full items-center justify-center gap-6 px-5 py-2 text-center text-[10px] uppercase tracking-[0.26em]">
              {theme?.tagline ? <span className="truncate">{theme.tagline}</span> : null}
              {store.phone ? <span className="hidden truncate opacity-80 sm:inline">Care: {store.phone}</span> : null}
            </div>
          </div>
        ) : null}

        <StorefrontHeader
          slug={store.slug}
          name={store.name}
          logoUrl={theme?.logoUrl}
          categories={store.categories}
        />

        <div>
          <StorefrontHero store={store} total={store.products.length} />

          <div id="collection">
            {showFeatured ? <FeaturedPiece slug={store.slug} product={store.products[0]} /> : null}

            <div className="mx-auto w-full max-w-[1560px] px-5 py-14 sm:px-8 md:py-20 lg:px-12">
              {store.products.length === 0 ? (
                <EmptyState
                  title="No products yet"
                  message="This boutique is curating its next selection — please check back soon."
                />
              ) : (
                <ProductGrid
                  slug={store.slug}
                  products={gridProducts}
                  density={showFeatured ? 3 : 4}
                />
              )}

              {theme?.layout === 'featured' && !showFeatured ? (
                <p className="mt-6 text-[11px] uppercase tracking-[0.2em] text-[var(--store-ink-3)]">
                  Featured layout appears on your store once you have 4+ products.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </CartProvider>
    </div>
  );
}
