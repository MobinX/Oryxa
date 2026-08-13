import Link from 'next/link';
import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { cachedCategories } from '@/app/_cache/queries';
import { createProductAction } from '@/app/actions/products';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { VariantEditor } from '@/components/products/variant-editor';
import { CategorySelect } from '@/components/products/category-select';
import NewProductSkeleton from './skeleton';

export default function NewProductPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href=".."
        className="text-sm text-[var(--muted-foreground)] hover:text-[var(--primary)]"
      >
        ← Back to products
      </Link>
      <Suspense fallback={<NewProductSkeleton />}>
        <NewProductForm params={params} />
      </Suspense>
    </div>
  );
}

async function NewProductForm({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const token = await requireAuth();
  const categories = await cachedCategories(token, businessId);

  return (
    <Card className="mt-4 sm:mt-6">
      <h1 className="text-xl font-bold">Add product</h1>
      <form
        action={createProductAction.bind(null, businessId)}
        className="mt-6 space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Product name</label>
            <Input name="name" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Price ($)</label>
            <Input name="price" type="number" step="0.01" min="0.01" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">SKU</label>
            <Input name="sku" required />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Description</label>
            <Textarea name="description" rows={3} />
          </div>
          <div className="sm:col-span-2">
            <CategorySelect categories={categories} />
          </div>
        </div>

        <VariantEditor businessId={businessId} />

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Link href={`/b/${businessId}/products`} className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="w-full">
              Cancel
            </Button>
          </Link>
          <Button type="submit" className="w-full sm:w-auto">Create product</Button>
        </div>
      </form>
    </Card>
  );
}
