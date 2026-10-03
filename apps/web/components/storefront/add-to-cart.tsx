'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { useCart } from '@/components/storefront/cart-context';
import { defaultVariant, formatPrice, variantPrice } from '@/lib/storefront';
import type { PublicProduct, PublicVariant } from '@/lib/storefront';
import { cn } from '@/lib/utils';

type AddToCartProps = {
  product: PublicProduct;
  /** Omit to add the first purchasable variant (quick add). */
  variant?: PublicVariant | null;
  quantity?: number;
  /** `band` = full-width fill, `outline` = hairline button, `quiet` = text link. */
  tone?: 'band' | 'outline' | 'quiet';
  text?: string;
  className?: string;
  /** Slide the bag open right after adding (used by product cards). */
  revealCart?: boolean;
};

const TONE = {
  band: 'bg-[var(--store-accent)] text-[var(--store-accent-fg)] border border-[var(--store-accent)] hover:opacity-90',
  outline:
    'border border-[#1a1a1a]/25 bg-white/85 text-[#141414] hover:border-[var(--store-accent)] hover:text-[var(--store-accent)]',
  quiet: 'border border-transparent bg-transparent text-[#141414] hover:text-[var(--store-accent)]',
} as const;

export function AddToCart({
  product,
  variant,
  quantity = 1,
  tone = 'band',
  text,
  className,
  revealCart = false,
}: AddToCartProps) {
  const { add, openCart } = useCart();
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const chosen = variant ?? defaultVariant(product);
  const hasVariants = product.variants.length > 0;
  const soldOut =
    !product.inStock || (hasVariants && (!chosen || !chosen.isAvailable || chosen.stock <= 0));
  const price = variantPrice(product, chosen);
  const label = text ?? (soldOut ? 'Sold out' : 'Add to cart');

  function handleAdd(event: React.MouseEvent<HTMLButtonElement>) {
    // Cards wrap this button in a link — never let the click navigate away.
    event.preventDefault();
    event.stopPropagation();
    if (soldOut) return;

    add({
      productId: product.id,
      variantId: chosen?.id,
      name: product.name,
      variantName: chosen?.name,
      price,
      image: chosen?.imageUrl ?? product.thumbnailUrl,
      qty: quantity,
    });

    setAdded(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 1800);
    if (revealCart) openCart();
  }

  return (
    <button
      type="button"
      onClick={handleAdd}
      disabled={soldOut}
      aria-label={
        soldOut
          ? `${product.name} is sold out`
          : `Add ${product.name} to cart — ${formatPrice(price)}`
      }
      className={cn(
        'group/add inline-flex items-center justify-center gap-2',
        'text-[10.5px] font-medium uppercase tracking-[0.2em]',
        'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'disabled:cursor-not-allowed disabled:opacity-45',
        TONE[tone],
        className,
      )}
    >
      {added ? (
        <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
      ) : (
        <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
      )}
      <span>{added ? 'Added' : label}</span>
    </button>
  );
}
