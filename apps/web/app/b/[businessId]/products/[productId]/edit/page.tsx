import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { cachedCategories, cachedProduct } from '@/app/_cache/queries';
import { updateProductAction } from '@/app/actions/products';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { VariantEditor } from '@/components/products/variant-editor';
import { CategorySelect } from '@/components/products/category-select';
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

  const variantInitial = product.variants.map((v) => ({
    id: v.id,
    name: v.name,
    stock: v.stock,
    price: v.price,
    imageKey: v.imageKey,
    imagePreviewUrl: v.imageUrl,
  }));

  const formKey = [
    product.name,
    product.sku,
    String(product.price),
    product.description ?? '',
    product.category?.id ?? '',
    ...variantInitial.map((v) => `${v.id}:${v.name}:${v.stock}:${v.price ?? ''}:${v.imageKey ?? ''}`),
  ].join('|');

  return (
    <Card className="mt-4 sm:mt-6">
      <h1 className="text-xl font-bold">Edit product</h1>
      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      <form
        key={formKey}
        action={updateProductAction.bind(null, businessId, productId)}
        className="mt-6 space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Product name</label>
            <Input name="name" defaultValue={product.name} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Price ($)</label>
            <Input
              name="price"
              type="number"
              step="0.01"
              min="0.01"
              defaultValue={String(product.price)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">SKU</label>
            <Input name="sku" defaultValue={product.sku} required />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Description</label>
            <Textarea name="description" rows={3} defaultValue={product.description ?? ''} />
          </div>
          <div className="sm:col-span-2">
            <CategorySelect
              categories={categories}
              defaultCategoryId={product.category?.id}
            />
          </div>
        </div>

        <VariantEditor initial={variantInitial} businessId={businessId} />

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Link href={`/b/${businessId}/products`} className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="w-full">
              Cancel
            </Button>
          </Link>
          <Button type="submit" className="w-full sm:w-auto">Save changes</Button>
        </div>
      </form>
    </Card>
  );
}
