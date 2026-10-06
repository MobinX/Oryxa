'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

type ProductImageProps = {
  src?: string | null;
  alt: string;
  /** Extra classes for the <img> itself, e.g. `object-contain` or a hover scale. */
  imgClassName?: string;
  className?: string;
  /** Number of leading words used for the monogram placeholder. */
  monogramWords?: number;
  eager?: boolean;
};

function monogram(alt: string, words: number): string {
  const letters = alt
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, words)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
  return letters || '—';
}

/**
 * Editorial image frame: warm stone plate, a hairline inner rule and a
 * typographic monogram whenever photography is missing or fails to load.
 */
export function ProductImage({
  src,
  alt,
  imgClassName,
  className,
  monogramWords = 2,
  eager = false,
}: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div className={cn('relative overflow-hidden bg-[var(--store-plate)]', className)}>
      {showImage ? (
        <img
          src={src ?? undefined}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          // eslint-disable-next-line @next/next/no-img-element
          className={cn(
            'h-full w-full object-cover',
            'transition-[transform,opacity] duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
            imgClassName,
          )}
        />
      ) : null}
      <span
        aria-hidden
        data-store-monogram
        className={cn(
          'pointer-events-none absolute inset-0 flex items-center justify-center',
          '[font-family:var(--store-font)] text-[clamp(1.75rem,5vw,4rem)] leading-none tracking-[0.14em] text-[var(--store-ink-3)]/60',
          showImage && 'invisible',
        )}
      >
        {monogram(alt, monogramWords)}
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_var(--store-hairline)]"
      />
    </div>
  );
}
