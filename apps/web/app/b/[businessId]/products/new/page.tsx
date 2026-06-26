import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { listCategories } from '@/lib/api';
import { createProductAction } from '@/app/actions/products';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { VariantFields } from '@/components/products/variant-fields';

export default async function NewProductPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const token = await requireAuth();
  const categories = await listCategories(token, businessId);

  return (
    <div>
      <Link
        href={`/b/${businessId}/products`}
        className="text-sm text-[var(--muted-foreground)] hover:text-[var(--primary)]"
      >
        ← Back to products
      </Link>
      <Card className="mt-6 max-w-2xl">
        <h1 className="text-xl font-bold">Add product</h1>
        <form
          action={createProductAction.bind(null, businessId)}
          encType="multipart/form-data"
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
              <label className="mb-1 block text-sm font-medium">Category</label>
              <Input name="categoryName" list="product-categories" placeholder="New or existing" />
              <datalist id="product-categories">
                {categories.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>
          </div>

          <VariantFields slots={3} />

          <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
            <Link
              href={`/b/${businessId}/products`}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-medium hover:bg-[var(--muted)]"
            >
              Cancel
            </Link>
            <Button type="submit">Create product</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
