'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { getProduct, type ProductDetail } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Pulse } from '@/components/skeletons';

/**
 * Every picture a product owns, across all its variants and in the order they were uploaded.
 *
 * A merchant posting about a shoe does not care which size the photo was filed under, so the
 * variants are flattened — but a photo is only worth offering once, so duplicates that several
 * variants share collapse to their first appearance.
 */
export function productPhotos(
  product: ProductDetail,
): Array<{ url: string; from: string }> {
  const shots: Array<{ url: string; from: string }> = [];
  const seen = new Set<string>();
  for (const variant of product.variants) {
    const urls = variant.imageUrls?.length ? variant.imageUrls : variant.imageUrl ? [variant.imageUrl] : [];
    for (const url of urls) {
      if (!url || seen.has(url)) continue;
      seen.add(url);
      shots.push({ url, from: variant.name || variant.variantId || 'this product' });
    }
  }
  return shots;
}

type Props = {
  token: string;
  businessId: string;
  /** The product whose shelf the merchant is picking pictures from. Nothing is fetched without it. */
  productId: string;
  productName?: string;
  /** The pictures already attached to the post, as the composer holds them. */
  selected: string[];
  /** The composer's own cap — a picture past it cannot be added, though any can still be removed. */
  max: number;
  onToggle: (url: string) => void;
};

/**
 * A column of the product's own photos the merchant taps to attach.
 *
 * They arrive as signed URLs and the composer keeps them beside its uploads, so a picked photo is
 * indistinguishable from an uploaded one: the server turns either back into its stored key on save.
 */
export function ProductPhotoList({ token, businessId, productId, productName, selected, max, onToggle }: Props) {
  const [shots, setShots] = useState<Array<{ url: string; from: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!productId) {
      setShots([]);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    void getProduct(token, businessId, productId)
      .then((product) => {
        if (!cancelled) setShots(productPhotos(product));
      })
      .catch(() => {
        if (cancelled) return;
        setShots([]);
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, businessId, productId]);

  if (!productId) return null;

  const atLimit = selected.length >= max;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Photos from {productName || 'this product'}
        </label>
        <span className="text-[10px] text-muted-foreground">Tap to attach · {max} per post</span>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Pulse key={i} className="h-[64px] w-full rounded-xl" />
          ))}
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Reading the product&rsquo;s pictures…
          </span>
        </div>
      ) : failed ? (
        <p className="text-xs text-muted-foreground italic">
          Could not read this product&rsquo;s pictures. Upload your own below.
        </p>
      ) : shots.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          This product has no pictures yet. Upload your own below.
        </p>
      ) : (
        <div className="flex max-h-60 flex-col gap-2 overflow-y-auto pr-1">
          {shots.map((shot) => {
            const picked = selected.includes(shot.url);
            return (
              <button
                key={shot.url}
                type="button"
                aria-pressed={picked}
                disabled={!picked && atLimit}
                onClick={() => onToggle(shot.url)}
                title={picked ? 'Remove from the post' : 'Attach this picture to the post'}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-2 text-left transition-all',
                  picked
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border/60 bg-muted/5 hover:border-primary/50 hover:bg-muted/10',
                  !picked && atLimit && 'opacity-40 cursor-not-allowed',
                )}
              >
                <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                  <img src={shot.url} alt={shot.from} className="h-full w-full object-cover" />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{shot.from}</span>
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all',
                    picked ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                  )}
                >
                  {picked && <Check className="h-3 w-3" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
