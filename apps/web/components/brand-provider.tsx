'use client';

import { createContext, useContext } from 'react';
import { DEFAULT_BRAND, type BrandInfo } from '@/lib/brand';

const BrandContext = createContext<BrandInfo>(DEFAULT_BRAND);

export function BrandProvider({
  brand,
  children,
}: {
  brand: BrandInfo;
  children: React.ReactNode;
}) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

/** The host-derived names for a client component. The provider is mounted by the root layout. */
export function useBrand(): BrandInfo {
  return useContext(BrandContext);
}
