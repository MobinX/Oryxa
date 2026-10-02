'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, ShoppingBag, X } from 'lucide-react';
import { useCart } from '@/components/storefront/cart-context';
import { ProductImage } from '@/components/storefront/product-image';
import { QuantityStepper } from '@/components/storefront/quantity-stepper';
import { formatPrice } from '@/lib/storefront';
import { cn } from '@/lib/utils';

type CartDrawerProps = {
  slug: string;
};

export function CartDrawer({ slug }: CartDrawerProps) {
  const { items, count, subtotal, isOpen, closeCart, remove, setQty } = useCart();

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeCart();
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, closeCart]);

  return (
    <div>
      <div
        onClick={closeCart}
        className={cn(
          'fixed inset-0 z-[70] bg-[#141414]/30 transition-opacity duration-500',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Shopping bag"
        inert={!isOpen}
        className={cn(
          'fixed inset-y-0 right-0 z-[71] flex w-full max-w-[26.5rem] flex-col bg-[#FBFAF8]',
          'shadow-[0_30px_80px_-30px_rgba(20,20,20,0.45)]',
          'transition-transform duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <header className="flex items-center justify-between border-b border-[#E4E1DB] px-5 py-4 sm:px-6">
          <div className="flex items-baseline gap-3">
            <h2
              className="text-[17px] tracking-[0.02em] text-[#141414]"
              style={{ fontFamily: 'var(--store-font)' }}
            >
              Shopping bag
            </h2>
            <span className="text-[10px] uppercase tracking-[0.24em] text-[#8f8b85]">
              {count} {count === 1 ? 'item' : 'items'}
            </span>
          </div>
          <button
            type="button"
            onClick={closeCart}
            aria-label="Close shopping bag"
            className="grid h-9 w-9 place-items-center text-[#6b6b6b] transition-colors hover:text-[#141414]"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-16 text-center">
              <ShoppingBag className="h-7 w-7 text-[#c9c5be]" strokeWidth={1.25} />
              <p className="mt-5 text-[11px] uppercase tracking-[0.26em] text-[#6b6b6b]">
                Your bag is empty
              </p>
              <p className="mt-3 max-w-[15rem] text-sm leading-relaxed text-[#8f8b85]">
                Discover the pieces we have selected for you.
              </p>
              <button
                type="button"
                onClick={closeCart}
                className="mt-7 border border-[#141414] px-6 py-2.5 text-[10px] uppercase tracking-[0.24em] text-[#141414] transition-colors duration-300 hover:bg-[#141414] hover:text-[#FBFAF8]"
              >
                Continue shopping
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-[#E4E1DB]">
              {items.map((line) => (
                <li key={line.key} className="flex gap-4 py-5">
                  <Link
                    href={`/store/${slug}/${line.productId}`}
                    onClick={closeCart}
                    className="w-[84px] shrink-0"
                  >
                    <ProductImage
                      src={line.image}
                      alt={line.name}
                      className="aspect-[4/5] w-full"
                    />
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/store/${slug}/${line.productId}`}
                          onClick={closeCart}
                          className="block truncate text-[13px] text-[#141414] transition-colors hover:text-[var(--store-accent)]"
                        >
                          {line.name}
                        </Link>
                        {line.variantName ? (
                          <p className="mt-1 truncate text-[11px] text-[#8f8b85]">{line.variantName}</p>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-[13px] tabular-nums text-[#141414]">
                        {formatPrice(line.price * line.qty)}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <QuantityStepper
                        value={line.qty}
                        onChange={(next) => setQty(line.key, next)}
                        compact
                      />
                      <div className="flex items-center gap-4">
                        <span className="text-[11px] tabular-nums text-[#8f8b85]">
                          {formatPrice(line.price)} ea.
                        </span>
                        <button
                          type="button"
                          onClick={() => remove(line.key)}
                          className="text-[10px] uppercase tracking-[0.2em] text-[#a29d96] underline-offset-4 transition-colors hover:text-[#141414] hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t border-[#E4E1DB] bg-white px-5 py-5 sm:px-6">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-[0.26em] text-[#8f8b85]">Subtotal</span>
            <span
              className="text-lg tabular-nums text-[#141414]"
              style={{ fontFamily: 'var(--store-font)' }}
            >
              {formatPrice(subtotal)}
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[#a29d96]">
            Shipping and taxes calculated at checkout.
          </p>
          <Link
            href={`/store/${slug}/checkout`}
            onClick={closeCart}
            aria-disabled={items.length === 0}
            tabIndex={items.length === 0 ? -1 : 0}
            className={cn(
              'mt-5 flex h-12 items-center justify-center gap-2.5',
              'bg-[var(--store-accent)] text-[var(--store-accent-fg)]',
              'text-[10.5px] uppercase tracking-[0.26em]',
              'transition-all duration-300 hover:opacity-90',
              items.length === 0 && 'pointer-events-none opacity-40',
            )}
          >
            Checkout
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Link>
        </footer>
      </aside>
    </div>
  );
}
