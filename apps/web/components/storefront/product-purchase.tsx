'use client';

import { useMemo, useState } from 'react';
import { AddToCart } from '@/components/storefront/add-to-cart';
import { QuantityStepper } from '@/components/storefront/quantity-stepper';
import { defaultVariant, formatPrice, variantPrice } from '@/lib/storefront';
import type { PublicProduct, PublicVariant } from '@/lib/storefront';
import { cn } from '@/lib/utils';

function isPurchasable(variant: PublicVariant): boolean {
  return variant.isAvailable && variant.stock > 0;
}

export function ProductPurchase({ product }: { product: PublicProduct }) {
  const variants = product.variants;
  const initial = useMemo(() => defaultVariant(product), [product]);
  const [selectedId, setSelectedId] = useState<string | undefined>(initial?.id);
  const [qty, setQty] = useState(1);

  const selected: PublicVariant | null =
    variants.find((variant) => variant.id === selectedId) ?? initial ?? null;
  const price = variantPrice(product, selected);
  const soldOut = !product.inStock || (variants.length > 0 && (!selected || !isPurchasable(selected)));
  const maxQty = selected && selected.stock > 0 ? Math.min(99, selected.stock) : 1;

  function choose(variant: PublicVariant) {
    setSelectedId(variant.id);
    setQty(1);
  }

  return (
    <div className="mt-8">
      <div className="flex items-end justify-between gap-6 border-b border-[#E4E1DB] pb-6">
        <p
          className="text-[clamp(1.35rem,2.4vw,1.85rem)] leading-none tabular-nums text-[#141414]"
          style={{ fontFamily: 'var(--store-font)' }}
        >
          {formatPrice(price)}
        </p>
        <p className="text-[10px] uppercase tracking-[0.24em] text-[#a29d96]">
          {soldOut ? 'Currently unavailable' : 'Included in the bag'}
        </p>
      </div>

      {variants.length > 0 ? (
        <div className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[10px] uppercase tracking-[0.26em] text-[#a29d96]">
              {variants.length > 1 ? 'Select an option' : 'Option'}
            </p>
            {selected ? (
              <p className="text-[11px] tracking-[0.06em] text-[#6b6b6b]">
                {selected.name}
                {selected.stock > 0 ? ` · ${selected.stock} available` : ' · sold out'}
              </p>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2.5">
            {variants.map((variant) => {
              const active = selected?.id === variant.id;
              return (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => choose(variant)}
                  aria-pressed={active}
                  className={cn(
                    'min-w-[3.75rem] border px-4 py-2.5 text-[11.5px] tracking-[0.08em]',
                    'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                    active
                      ? 'border-[#141414] bg-[#141414] text-[#FBFAF8]'
                      : 'border-[#DFDCD6] bg-white text-[#141414] hover:border-[#141414]',
                    !isPurchasable(variant) && !active && 'text-[#b7b2aa] hover:border-[#DFDCD6]',
                  )}
                >
                  <span className={cn(!isPurchasable(variant) && 'line-through decoration-[#c9c5be]')}>
                    {variant.name}
                  </span>
                  {variant.price != null && variant.price !== product.price ? (
                    <span className="ml-2 text-[10px] tabular-nums opacity-70">
                      {formatPrice(variant.price)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-9 flex flex-wrap items-stretch gap-3">
        {!soldOut ? (
          <QuantityStepper
            value={Math.min(qty, maxQty)}
            onChange={setQty}
            max={maxQty}
            className="w-30 justify-between"
          />
        ) : null}
        <AddToCart
          product={product}
          variant={selected}
          quantity={soldOut ? 1 : Math.min(qty, maxQty)}
          tone="band"
          text={soldOut ? 'Sold out' : 'Add to bag'}
          className={cn('h-12 flex-1', soldOut ? '' : 'min-w-[13rem]')}
        />
      </div>

      {soldOut ? (
        <p className="mt-5 border border-[#E4E1DB] bg-white px-4 py-3 text-[12px] leading-relaxed text-[#6b6b6b]">
          This piece is currently sold out. Explore the rest of the collection for similar options.
        </p>
      ) : (
        <p className="mt-5 text-[11px] leading-relaxed tracking-[0.04em] text-[#a29d96]">
          Quantity limited to {maxQty === 1 ? 'the last piece in stock' : `${maxQty} available`}.
        </p>
      )}
    </div>
  );
}
