'use client';

import { useEffect } from 'react';
import { useCookieConsent } from '@/components/cookie-consent';
import { reportVisit } from '@/lib/storefront';
import { visitorId } from '@/lib/visitor';

/**
 * Reports one page view per storefront render, and only after the visitor has accepted
 * analytics. Rendered from the store layout, which stays mounted while a shopper moves
 * between products in the same visit — so this fires on arrival, not on every click.
 */
export function VisitBeacon({ slug }: { slug: string }) {
  const consent = useCookieConsent();
  const analyticsAllowed = consent?.consent?.analytics === true;

  useEffect(() => {
    if (!analyticsAllowed) return;
    reportVisit(slug, window.location.pathname, visitorId());
  }, [slug, analyticsAllowed]);

  return null;
}
