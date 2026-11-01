import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { cachedCategories, cachedCustomers, cachedProduct } from '@/app/_cache/queries';
import { updateProductAction } from '@/app/actions/products';
import { Card } from '@/components/ui/card';
import { ProductWizard } from '@/components/products/product-wizard';
import { UploadGate } from '@/components/products/upload-gate';
import EditProductSkeleton from './skeleton';

export default function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; productId: string }>;
  searchParams: Promise<{ error?: string }>;
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
      <Suspense fallback={<EditProductSkeleton />}>
        <EditProductForm params={params} searchParams={searchParams} />
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

async function EditProductForm({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; productId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { businessId, productId } = await params;
  const { error } = await searchParams;
  const token = await requireAuth();

  let product;
  try {
    product = await cachedProduct(token, businessId, productId);
  } catch {
    notFound();
  }

  const categories = await cachedCategories(token, businessId);
  const book = await cachedCustomers(token, businessId);

  const variantInitial = product.variants.map((v) => {
    // The keys are what the form submits back; the signed URLs are what it shows meanwhile, and
    // the two come off the same column in the same order.
    const keys = v.imageKeys?.length ? v.imageKeys : v.imageKey ? [v.imageKey] : [];
    const shots = v.imageUrls?.length ? v.imageUrls : v.imageUrl ? [v.imageUrl] : [];
    return {
      id: v.id,
      variantId: v.variantId ?? null,
      name: v.name,
      stock: v.stock,
      price: v.price,
      images: keys.map((key, n) => ({ key, previewUrl: shots[n] ?? null })),
      options: v.options ?? {},
    };
  });

  const formKey = [
    product.name,
    product.sku,
    String(product.price),
    product.currency,
    product.description ?? '',
    product.category?.id ?? '',
    product.customer?.id ?? '',
    product.options?.map((o) => `${o.name}:${o.values.map((v) => v.value).join(',')}`).join('|') ?? '',
    ...variantInitial.map(
      (v) => `${v.id}:${v.name}:${v.stock}:${v.price ?? ''}:${v.images.map((img) => img.key).join(',')}`,
    ),
  ].join('|');

  return (
    <Card className="mt-4 sm:mt-6">
      <h1 className="text-xl font-bold">Edit product</h1>
      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      <UploadGate>
        <div key={formKey}>
          <ProductWizard
            businessId={businessId}
            action={updateProductAction.bind(null, businessId, productId)}
            categories={categories}
            customers={book.customers}
            hasCompany={product.customer != null || book.customers.length > 0}
            submitLabel="Save changes"
            savingLabel="Saving…"
            cancelHref={`/b/${businessId}/products`}
            initial={{
              name: product.name,
              price: String(product.price),
              currency: product.currency,
              sku: product.sku,
              description: product.description ?? '',
              categoryId: product.category?.id,
              customerId: product.customer?.id ?? product.customerId,
              slug: product.slug,
              hasDiscount: product.hasDiscount,
              discountPercent: product.discountPercent,
              tags: product.tags ?? [],
              showInStorefront: product.showInStorefront,
              options: (product.options ?? []).map((o) => ({
                name: o.name,
                values: o.values.map((v) => v.value),
              })),
              variants: variantInitial,
            }}
          />
        </div>
      </UploadGate>
    </Card>
  );
}
