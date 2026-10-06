'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, ShoppingBag, X } from 'lucide-react';
import { useCart } from '@/components/storefront/cart-context';
import { cn } from '@/lib/utils';

type StorefrontHeaderProps = {
  slug: string;
  name: string;
  logoUrl?: string | null;
  categories?: string[];
};

export function StorefrontHeader({ slug, name, logoUrl, categories = [] }: StorefrontHeaderProps) {
  const router = useRouter();
  const { count, openCart } = useCart();
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [logoFailed, setLogoFailed] = useState(false);

  const showLogo = Boolean(logoUrl) && !logoFailed;
  const navCategories = categories.slice(0, 4);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const query = term.trim();
    setSearchOpen(false);
    router.push(query ? `/store/${slug}?q=${encodeURIComponent(query)}` : `/store/${slug}`);
  }

  return (
    <header
      data-store-header
      className="sticky top-0 z-40 border-b border-[var(--store-line)] bg-[var(--store-paper)]/80 backdrop-blur-xl"
    >
      <div className="mx-auto flex w-full max-w-[1560px] items-center gap-4 px-5 py-3.5 sm:px-8 md:py-4 lg:px-12">
        <Link
          href={`/store/${slug}`}
          className="group flex min-w-0 shrink-0 items-center gap-3"
          aria-label={`${name} home`}
        >
          {showLogo ? (
            <img
              src={logoUrl ?? undefined}
              alt={`${name} logo`}
              onError={() => setLogoFailed(true)}
              className="h-7 w-auto max-w-[9.5rem] object-contain md:h-8"
              // eslint-disable-next-line @next/next/no-img-element
            />
          ) : (
            <span
              className="truncate text-[15px] uppercase tracking-[0.34em] text-[var(--store-ink)] transition-opacity duration-300 group-hover:opacity-70 md:text-[16px]"
              style={{ fontFamily: 'var(--store-font)' }}
            >
              {name}
            </span>
          )}
        </Link>

        {navCategories.length > 0 ? (
          <nav className="ml-6 hidden items-center gap-7 lg:flex" aria-label="Categories">
            {navCategories.map((category) => (
              <Link
                key={category}
                href={`/store/${slug}?category=${encodeURIComponent(category)}`}
                className="nav-rule text-[10.5px] uppercase tracking-[0.22em] text-[var(--store-ink-2)] transition-colors duration-300 hover:text-[var(--store-ink)]"
              >
                {category}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
          <form onSubmit={submitSearch} className="hidden items-center md:flex">
            <label className="sr-only" htmlFor="storefront-search">
              Search products
            </label>
            <div className="flex h-9 w-44 items-center gap-2 border border-transparent px-2 transition-all duration-500 focus-within:w-56 focus-within:border-[var(--store-line)] focus-within:bg-[var(--store-surface)] xl:w-60">
              <Search className="h-3.5 w-3.5 shrink-0 text-[var(--store-ink-3)]" strokeWidth={1.5} />
              <input
                id="storefront-search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--store-ink)] outline-none placeholder:text-[10px] placeholder:uppercase placeholder:tracking-[0.2em] placeholder:text-[var(--store-ink-3)]"
              />
            </div>
          </form>

          <button
            type="button"
            onClick={() => setSearchOpen((open) => !open)}
            aria-label={searchOpen ? 'Close search' : 'Open search'}
            aria-expanded={searchOpen}
            className="grid h-10 w-10 place-items-center text-[var(--store-ink)] transition-colors hover:text-[var(--store-accent)] md:hidden"
          >
            {searchOpen ? <X className="h-4 w-4" strokeWidth={1.5} /> : <Search className="h-4 w-4" strokeWidth={1.5} />}
          </button>

          <button
            type="button"
            onClick={openCart}
            aria-label={`Open shopping bag${count > 0 ? `, ${count} items` : ''}`}
            className="relative grid h-10 w-10 place-items-center text-[var(--store-ink)] transition-colors hover:text-[var(--store-accent)]"
          >
            <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.4} />
            <span
              className={cn(
                'absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center px-1',
                'bg-[var(--store-accent)] text-[var(--store-accent-fg)]',
                'text-[9.5px] font-medium tabular-nums tracking-tight',
                'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                count > 0 ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
              )}
            >
              {count > 99 ? '99+' : count}
            </span>
          </button>
        </div>
      </div>

      {searchOpen ? (
        <form
          onSubmit={submitSearch}
          className="border-t border-[var(--store-line)] bg-[var(--store-paper)] px-5 py-3 sm:px-8 md:hidden"
        >
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-[var(--store-ink-3)]" strokeWidth={1.5} />
            <input
              value={term}
              autoFocus
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search the collection"
              aria-label="Search products"
              className="h-10 min-w-0 flex-1 border-b border-[var(--store-line)] bg-transparent text-[13px] text-[var(--store-ink)] outline-none placeholder:text-[10px] placeholder:uppercase placeholder:tracking-[0.2em] placeholder:text-[var(--store-ink-3)]"
            />
            <button
              type="submit"
              className="shrink-0 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[var(--store-accent)]"
            >
              Go
            </button>
          </div>
        </form>
      ) : null}
    </header>
  );
}
