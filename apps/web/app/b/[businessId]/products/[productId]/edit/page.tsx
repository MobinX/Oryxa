import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getProduct } from '@/lib/api';
import { updateProductAction } from '@/app/actions/products';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { VariantFields } from '@/components/products/variant-fields';

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ businessId: string; productId: string }>;
}) {
  const { businessId, productId } = await params;
  const token = await requireAuth();

  let product;
  try {
    product = await getProduct(token, businessId, productId);
  } catch {
    notFound();
  }

  const variantInitial = product.variants.map((v) => ({
    id: v.id,
    name: v.name,
    stock: v.stock,
    price: v.price,
    imageKey: v.imageKey,
    imagePreviewUrl: v.imageUrl,
  }));

  const slots = Math.max(3, variantInitial.length);

  return (
    <div>
      <Link
        href={`/b/${businessId}/products`}
        className="text-sm text-[var(--muted-foreground)] hover:text-[var(--primary)]"
      >
        ← Back to products
      </Link>
      <Card className="mt-6 max-w-2xl">
        <h1 className="text-xl font-bold">Edit product</h1>
        <form
          action={updateProductAction.bind(null, businessId, productId)}
          encType="multipart/form-data"
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
          </div>

          <VariantFields slots={slots} initial={variantInitial} />

          <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
            <Link
              href={`/b/${businessId}/products`}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-medium hover:bg-[var(--muted)]"
            >
              Cancel
            </Link>
            <Button type="submit">Save changes</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
