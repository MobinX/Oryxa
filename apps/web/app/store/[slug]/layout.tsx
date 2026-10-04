import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StorefrontShell } from '@/components/storefront/storefront-shell';
import { StorefrontSkeleton } from '@/components/storefront/storefront-skeleton';
import { VisitBeacon } from '@/components/storefront/visit-beacon';
import { getStore } from '@/lib/storefront';
import type { PublicStore } from '@/lib/storefront';

type StoreLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

async function loadStore(slug: string): Promise<PublicStore | null> {
  try {
    return await getStore(slug);
  } catch {
    // A 404 from the API means the boutique does not exist (or is unpublished).
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const store = await loadStore(slug);

  if (!store) {
    return { title: 'Store not found', description: 'This storefront is no longer available.' };
  }

  const tagline = store.theme?.tagline ?? null;
  const description = store.description ?? tagline ?? 'Shop the collection online.';

  return {
    title: tagline ? `${store.name} — ${tagline}` : store.name,
    description,
    openGraph: {
      type: 'website',
      title: store.name,
      description,
      images: store.theme?.heroImageUrl ? [store.theme.heroImageUrl] : undefined,
    },
  };
}

export default function StoreLayout({ children, params }: StoreLayoutProps) {
  return (
    <Suspense fallback={<StorefrontSkeleton />}>
      <StorefrontFrame params={params}>{children}</StorefrontFrame>
    </Suspense>
  );
}

async function StorefrontFrame({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await loadStore(slug);
  if (!store) notFound();

  return (
    <>
      <VisitBeacon slug={store.slug} />
      <StorefrontShell store={store}>{children}</StorefrontShell>
    </>
  );
}
