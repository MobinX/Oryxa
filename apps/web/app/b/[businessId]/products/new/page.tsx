import Link from 'next/link';
import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { cachedBusiness, cachedCategories, cachedCustomers } from '@/app/_cache/queries';
import { createProductAction } from '@/app/actions/products';
import { Card } from '@/components/ui/card';
import { ProductWizard } from '@/components/products/product-wizard';
import { UploadGate } from '@/components/products/upload-gate';
import NewProductSkeleton from './skeleton';

export default function NewProductPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <Suspense
        fallback={
          <span className="text-sm text-[var(--muted-foreground)]">← Back to products</span>
        }
      >
        <ProductsBackLink params={params} />
      </Suspense>
      <Suspense fallback={<NewProductSkeleton />}>
        <NewProductForm params={params} />
      </Suspense>
    </div>
  );
}

async function ProductsBackLink({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  return (
    <Link
      href={`/b/${businessId}/products`}
      className="text-sm text-[var(--muted-foreground)] hover:text-[var(--primary)]"
    >
      ← Back to products
    </Link>
  );
}

async function NewProductForm({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const token = await requireAuth();
  const [categories, book, business] = await Promise.all([
    cachedCategories(token, businessId),
    cachedCustomers(token, businessId),
    cachedBusiness(token, businessId).catch(() => null),
  ]);

  return (
    <Card className="mt-4 sm:mt-6">
      <h1 className="text-xl font-bold">Add product</h1>
      <UploadGate>
        <ProductWizard
          businessId={businessId}
          action={createProductAction.bind(null, businessId)}
          categories={categories}
          customers={book.customers}
          storePaymentStrategy={business?.paymentStrategy ?? 'cod'}
          submitLabel="Create product"
          savingLabel="Creating…"
          cancelHref={`/b/${businessId}/products`}
        />
      </UploadGate>
    </Card>
  );
}
