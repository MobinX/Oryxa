import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CheckoutFlow } from '@/components/storefront/checkout-flow';
import { CheckoutSkeleton } from '@/components/storefront/storefront-skeleton';
import { getStore } from '@/lib/storefront';

type CheckoutParams = Promise<{ slug: string }>;

async function loadName(slug: string) {
  const store = await getStore(slug).catch(() => null);
  return store ? { slug: store.slug, name: store.name } : null;
}

export async function generateMetadata({
  params,
}: {
  params: CheckoutParams;
}): Promise<Metadata> {
  const { slug } = await params;
  const store = await loadName(slug);
  return { title: store ? `Checkout — ${store.name}` : 'Checkout' };
}

async function CheckoutView({ params }: { params: CheckoutParams }) {
  const { slug } = await params;
  const store = await loadName(slug);
  if (!store) notFound();

  return <CheckoutFlow store={store} />;
}

export default function StorefrontCheckoutPage({ params }: { params: CheckoutParams }) {
  return (
    <Suspense fallback={<CheckoutSkeleton />}>
      <CheckoutView params={params} />
    </Suspense>
  );
}
