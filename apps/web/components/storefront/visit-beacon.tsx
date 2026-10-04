'use client';

import { useEffect } from 'react';
import { reportVisit } from '@/lib/storefront';
import { visitorId } from '@/lib/visitor';

/**
 * Reports one page view per storefront render. Rendered from the store layout, which
 * stays mounted while a shopper moves between products in the same visit — so this
 * fires on arrival, not on every click, and the server dedupes the rest.
 */
export function VisitBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    reportVisit(slug, window.location.pathname, visitorId());
  }, [slug]);

  return null;
}
