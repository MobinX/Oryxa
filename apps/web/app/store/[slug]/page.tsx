import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { ProductGridSkeleton } from '@/components/storefront/product-grid';
import { StorefrontHome } from '@/components/storefront/storefront-home';
import { getStore, parseStoreFilters, toStoreFilters } from '@/lib/storefront';

type CollectionParams = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function Collection({
  params,
  searchParams,
}: {
  params: CollectionParams;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const initialFilters = parseStoreFilters(await searchParams);

  const store = await getStore(slug, toStoreFilters(initialFilters)).catch(() => null);
  if (!store) notFound();

  return <StorefrontHome store={store} initialFilters={initialFilters} />;
}

export default function StorefrontCollectionPage({
  params,
  searchParams,
}: {
  params: CollectionParams;
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<ProductGridSkeleton />}>
      <Collection params={params} searchParams={searchParams} />
    </Suspense>
  );
}
