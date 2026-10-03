'use client';

import { useState } from 'react';
import { ProductImage } from '@/components/storefront/product-image';
import type { PublicProduct } from '@/lib/storefront';
import { cn } from '@/lib/utils';

/** Every distinct image on the product: its thumbnail plus any variant photography. */
export function productGallery(product: PublicProduct): { src: string | null; label: string }[] {
  const shots: { src: string | null; label: string }[] = [];
  const seen = new Set<string>();

  const push = (src: string | null | undefined, label: string) => {
    if (!src) return;
    if (seen.has(src)) return;
    seen.add(src);
    shots.push({ src, label });
  };

  push(product.thumbnailUrl, product.name);
  product.variants.forEach((variant) => push(variant.imageUrl, variant.name));

  return shots.length > 0 ? shots : [{ src: product.thumbnailUrl ?? null, label: product.name }];
}

export function ProductGallery({ product }: { product: PublicProduct }) {
  const shots = productGallery(product);
  const [active, setActive] = useState(0);
  const current = shots[Math.min(active, shots.length - 1)] ?? shots[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="group relative">
        <ProductImage
          src={current.src}
          alt={product.name}
          eager
          className="aspect-[4/5] w-full"
          imgClassName="group-hover:scale-[1.015]"
        />
      </div>

      {shots.length > 1 ? (
        <div className="flex gap-2.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
          {shots.map((shot, index) => (
            <button
              key={`${shot.src ?? 'placeholder'}-${index}`}
              type="button"
              onClick={() => setActive(index)}
              aria-label={
                shot.label ? `View ${shot.label}` : `View image ${index + 1}`
              }
              aria-current={index === active}
              className={cn(
                'relative w-[74px] shrink-0 overflow-hidden transition-all duration-300',
                index === active
                  ? 'ring-1 ring-[#141414] ring-offset-2 ring-offset-[#FBFAF8]'
                  : 'opacity-70 hover:opacity-100',
              )}
            >
              <ProductImage
                src={shot.src}
                alt={shot.label}
                monogramWords={1}
                className="aspect-[4/5] w-full"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
