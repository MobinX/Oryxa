import Link from 'next/link';
import { CartDrawer } from '@/components/storefront/cart-drawer';
import { CartProvider } from '@/components/storefront/cart-context';
import { StorefrontHeader } from '@/components/storefront/storefront-header';
import { isDarkStructure, storeStructure, themeVars } from '@/lib/storefront';
import type { PublicStore } from '@/lib/storefront';
import type { ReactNode } from 'react';

/**
 * Everything the storefront needs beyond utility classes: the shared effects, and one
 * `[data-structure="…"]` block per template.
 *
 * The components carry the palette through `--store-*` custom properties, and their layout
 * deltas live here rather than in a `structure` prop threaded through every card and page —
 * each block's two attribute selectors outrank the single class it overrides, so a template
 * can re-frame a product card or centre a hero without the public page knowing it exists.
 * Exported so the merchant-facing preview styles the exact same shell markup.
 */
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
    background-image: radial-gradient(color-mix(in srgb, var(--store-ink) 7%, transparent) 1px, transparent 1px);
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

  /* Editorial — a newspaper column: solid masthead, rule beside the hero, price below. */
  .store-root[data-structure="editorial"] [data-store-header] {
    position: static;
    background: var(--store-paper);
    backdrop-filter: none;
  }
  .store-root[data-structure="editorial"] [data-store-hero] { border-bottom: 3px double var(--store-line); }
  .store-root[data-structure="editorial"] [data-store-hero-inner] {
    border-left: 2px solid var(--store-accent-line);
    padding-left: clamp(1rem, 3vw, 2.5rem);
  }
  .store-root[data-structure="editorial"] [data-store-card-foot] {
    flex-direction: column;
    align-items: flex-start;
    gap: .7rem;
    padding-top: .9rem;
    border-top: 1px solid var(--store-line);
  }
  .store-root[data-structure="editorial"] [data-store-card-price] { font-size: 15px; letter-spacing: .01em; }
  .store-root[data-structure="editorial"] [data-store-featured-title] {
    border-bottom: 1px solid var(--store-accent-line);
    padding-bottom: .6rem;
  }
  @media (min-width: 1536px) {
    .store-root[data-structure="editorial"] [data-store-grid] {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  /* Market — a shopfront: cream, rounded tiles, centred hero, prices on a pill. */
  .store-root[data-structure="market"] [data-store-header] { border-radius: 0 0 22px 22px; }
  .store-root[data-structure="market"] [data-store-hero-inner] {
    align-items: center;
    justify-content: center;
    text-align: center;
    min-height: 42vh;
    padding-bottom: 4rem;
  }
  .store-root[data-structure="market"] [data-store-hero-title] { max-width: 20ch; }
  .store-root[data-structure="market"] [data-store-card] {
    padding: .8rem;
    border: 1px solid var(--store-line);
    border-radius: var(--store-radius);
    background: var(--store-surface);
    box-shadow: 0 14px 26px -22px color-mix(in srgb, var(--store-ink) 55%, transparent);
  }
  .store-root[data-structure="market"] [data-store-card-media] { border-radius: calc(var(--store-radius) - 6px); }
  .store-root[data-structure="market"] [data-store-card-cta] {
    translate: none;
    padding: 0;
    inset: auto .55rem .55rem .55rem;
  }
  .store-root[data-structure="market"] [data-store-card-cta] button { border-radius: 999px; }
  .store-root[data-structure="market"] [data-store-card-foot] { padding-top: .75rem; }
  .store-root[data-structure="market"] [data-store-card-price] {
    padding: .2rem .7rem;
    border-radius: 999px;
    background: var(--store-plate);
  }
  .store-root[data-structure="market"] [data-store-grid] { gap: 1.1rem 1.1rem; }

  /* Terminal — an instrument panel: dark, boxed, square, uppercase, no slide-away. */
  .store-root[data-structure="terminal"] [data-store-header] { background: var(--store-paper); backdrop-filter: none; }
  .store-root[data-structure="terminal"] .store-plate {
    background-image:
      linear-gradient(to right, color-mix(in srgb, var(--store-ink) 7%, transparent) 1px, transparent 1px),
      linear-gradient(to bottom, color-mix(in srgb, var(--store-ink) 7%, transparent) 1px, transparent 1px);
    background-size: 34px 34px;
    background-position: 0 0;
  }
  .store-root[data-structure="terminal"] [data-store-hero-inner] { justify-content: center; }
  .store-root[data-structure="terminal"] [data-store-hero-title] {
    text-transform: uppercase;
    letter-spacing: .015em;
    max-width: 22ch;
  }
  .store-root[data-structure="terminal"] [data-store-card] {
    padding: .55rem;
    border: 1px solid var(--store-line);
    background: var(--store-surface);
  }
  .store-root[data-structure="terminal"] [data-store-card-media] { aspect-ratio: 1 / 1; }
  .store-root[data-structure="terminal"] [data-store-card-cta] { translate: none; }
  .store-root[data-structure="terminal"] [data-store-card-cta] button {
    font-family: var(--store-font-ui);
    letter-spacing: .18em;
  }
  .store-root[data-structure="terminal"] [data-store-card-foot] {
    margin-top: .8rem;
    padding-top: .6rem;
    border-top: 1px dashed var(--store-line);
  }
  .store-root[data-structure="terminal"] [data-store-grid] { gap: 1rem 1rem; }
  @media (min-width: 1536px) {
    .store-root[data-structure="terminal"] [data-store-grid] {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  /* Atelier — a gallery night opening: espresso, gold hairlines, centred captions. */
  .store-root[data-structure="atelier"] [data-store-header] { border-bottom-color: var(--store-accent-line); }
  .store-root[data-structure="atelier"] [data-store-hero] { border-bottom-color: var(--store-accent-line); }
  .store-root[data-structure="atelier"] [data-store-hero-inner] {
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  .store-root[data-structure="atelier"] [data-store-hero-title] { max-width: 14ch; }
  .store-root[data-structure="atelier"] [data-store-card-cta] { translate: none; }
  .store-root[data-structure="atelier"] [data-store-card-foot] {
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: .45rem;
  }
  .store-root[data-structure="atelier"] [data-store-card-price] { color: var(--store-accent); }
  .store-root[data-structure="atelier"] [data-store-grid] { gap: 2rem 2.5rem; }
  .store-root[data-structure="atelier"] [data-store-featured] { border-top: 1px solid var(--store-accent-line); }
  .store-root[data-structure="atelier"] [data-store-featured-title]::before {
    content: '';
    display: block;
    width: 3rem;
    height: 1px;
    margin-bottom: 1.1rem;
    background: var(--store-accent);
  }
`;

export function StorefrontShell({ store, children }: { store: PublicStore; children: ReactNode }) {
  const { theme } = store;

  return (
    <div
      data-structure={storeStructure(theme)}
      className="store-root min-h-screen bg-[var(--store-paper)] text-[var(--store-ink)] antialiased"
      style={{
        ...themeVars(theme),
        fontFamily: 'var(--store-font-ui)',
        colorScheme: isDarkStructure(theme) ? 'dark' : 'light',
      }}
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
    <footer className="mt-24 border-t border-[var(--store-line)] bg-[var(--store-surface)]">
      <div className="mx-auto grid w-full max-w-[1560px] gap-10 px-5 py-16 sm:grid-cols-2 sm:px-8 lg:px-12">
        <div>
          <p
            className="text-[15px] uppercase tracking-[0.34em] text-[var(--store-ink)]"
            style={{ fontFamily: 'var(--store-font)' }}
          >
            {store.name}
          </p>
          {store.description ? (
            <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-[var(--store-ink-2)]">
              {store.description}
            </p>
          ) : null}
        </div>

        <div className="sm:justify-self-end">
          <p className="text-[10px] uppercase tracking-[0.26em] text-[var(--store-ink-3)]">Client services</p>
          <ul className="mt-4 space-y-2.5 text-[13px] text-[var(--store-ink-2)]">
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

      <div className="border-t border-[var(--store-line)]">
        <div className="mx-auto flex w-full max-w-[1560px] flex-col items-center justify-between gap-2 px-5 py-6 text-[10px] uppercase tracking-[0.26em] text-[var(--store-ink-3)] sm:flex-row sm:px-8 lg:px-12">
          <span>&copy; {store.name}</span>
          <span>
            Powered by{' '}
            <span className="text-[var(--store-ink-2)]">Oryxa</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
