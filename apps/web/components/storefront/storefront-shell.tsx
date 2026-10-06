import Link from 'next/link';
import { CartDrawer } from '@/components/storefront/cart-drawer';
import { CartProvider } from '@/components/storefront/cart-context';
import { StorefrontHeader } from '@/components/storefront/storefront-header';
import { themeVars } from '@/lib/storefront';
import type { PublicStore } from '@/lib/storefront';
import type { ReactNode } from 'react';

/** Exported so the merchant-facing preview styles the exact same shell markup. */
export const STORE_CSS = `
  .nav-rule { position: relative; }
  .nav-rule::after {
    content: '';
    position: absolute;
    left: 0;
    bottom: -6px;
    height: 1px;
    width: 0;
    background: var(--store-accent);
    transition: width 420ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .nav-rule:hover::after { width: 100%; }
  .store-fade { animation: storeFade 700ms cubic-bezier(0.16, 1, 0.3, 1) both; }
  .store-plate {
    background-image: radial-gradient(rgba(20, 20, 20, 0.06) 1px, transparent 1px);
    background-size: 18px 18px;
    background-position: -9px -9px;
  }
  @keyframes storeFade {
    from { opacity: 0; transform: translate3d(0, 14px, 0); }
    to { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .store-root .store-fade { animation: none; }
    .store-root *,
    .store-root *::before,
    .store-root *::after {
      transition-duration: 120ms !important;
      animation-duration: 120ms !important;
    }
  }
`;

export function StorefrontShell({ store, children }: { store: PublicStore; children: ReactNode }) {
  const { theme } = store;

  return (
    <div
      className="store-root min-h-screen bg-[#FBFAF8] text-[#141414] antialiased"
      style={{ ...themeVars(theme), fontFamily: 'var(--store-font-ui)', colorScheme: 'light' }}
    >
      <style dangerouslySetInnerHTML={{ __html: STORE_CSS }} />

      <CartProvider slug={store.slug}>
        {theme?.tagline || store.phone ? (
          <div className="bg-[var(--store-accent)] text-[var(--store-accent-fg)]">
            <div className="mx-auto flex w-full max-w-[1560px] items-center justify-center gap-6 px-5 py-2 text-center text-[10px] uppercase tracking-[0.26em] sm:px-8 lg:px-12">
              {theme?.tagline ? <span className="truncate">{theme.tagline}</span> : null}
              {store.phone ? (
                <a
                  href={`tel:${store.phone.replace(/[^+\d]/g, '')}`}
                  className="hidden truncate opacity-80 transition-opacity hover:opacity-100 sm:inline"
                >
                  Care: {store.phone}
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        <StorefrontHeader
          slug={store.slug}
          name={store.name}
          logoUrl={theme?.logoUrl}
          categories={store.categories}
        />

        <main>{children}</main>

        <StorefrontFooter store={store} />
        <CartDrawer slug={store.slug} />
      </CartProvider>
    </div>
  );
}

function StorefrontFooter({ store }: { store: PublicStore }) {
  return (
    <footer className="mt-24 border-t border-[#E4E1DB] bg-[#F7F5F1]">
      <div className="mx-auto grid w-full max-w-[1560px] gap-10 px-5 py-16 sm:grid-cols-2 sm:px-8 lg:px-12">
        <div>
          <p
            className="text-[15px] uppercase tracking-[0.34em] text-[#141414]"
            style={{ fontFamily: 'var(--store-font)' }}
          >
            {store.name}
          </p>
          {store.description ? (
            <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-[#7c7871]">{store.description}</p>
          ) : null}
        </div>

        <div className="sm:justify-self-end">
          <p className="text-[10px] uppercase tracking-[0.26em] text-[#a29d96]">Client services</p>
          <ul className="mt-4 space-y-2.5 text-[13px] text-[#5c5c5c]">
            <li>
              <Link
                href={`/store/${store.slug}`}
                className="transition-colors hover:text-[var(--store-accent)]"
              >
                All products
              </Link>
            </li>
            {store.categories.slice(0, 4).map((category) => (
              <li key={category}>
                <Link
                  href={`/store/${store.slug}?category=${encodeURIComponent(category)}`}
                  className="transition-colors hover:text-[var(--store-accent)]"
                >
                  {category}
                </Link>
              </li>
            ))}
            {store.phone ? (
              <li>
                <a
                  href={`tel:${store.phone.replace(/[^+\d]/g, '')}`}
                  className="transition-colors hover:text-[var(--store-accent)]"
                >
                  {store.phone}
                </a>
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="border-t border-[#E4E1DB]">
        <div className="mx-auto flex w-full max-w-[1560px] flex-col items-center justify-between gap-2 px-5 py-6 text-[10px] uppercase tracking-[0.26em] text-[#a29d96] sm:flex-row sm:px-8 lg:px-12">
          <span>&copy; {store.name}</span>
          <span>
            Powered by{' '}
            <span className="text-[#6b6b6b]">Oryxa</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
