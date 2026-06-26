import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { listProducts, getProduct } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { createOrderAction } from '@/app/actions/orders';

/**
 * Server-rendered "new order" form. The product picker is a native select; when
 * a product is chosen the user picks one of its variants (also a select). We
 * pre-fetch all products + their variants so no client-side fetching is needed.
 * On submit the server action validates and creates the order.
 */
export default async function NewOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ productId?: string }>;
}) {
  const { businessId } = await params;
  const { productId = '' } = await searchParams;
  const token = await requireAuth();

  const { products } = await listProducts(token, businessId, { limit: 100 });

  // Variant options depend on the selected product. We fetch the full product
  // detail only when a productId is present in the query string.
  let variants: Array<{ id: string; name: string; price?: number }> = [];
  if (productId) {
    try {
      const detail = await getProduct(token, businessId, productId);
      variants = detail.variants.map((v) => ({ id: v.id, name: v.name, price: v.price }));
    } catch {
      // ignore — variant select will just be empty
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/b/${businessId}/orders`}
        className="text-sm text-[var(--muted-foreground)] hover:text-[var(--primary)]"
      >
        ← Back to orders
      </Link>
      <Card className="mt-4 sm:mt-6">
        <h1 className="text-xl font-bold">New order</h1>
        <form id="productPicker" method="get" className="hidden" />
        <form action={createOrderAction.bind(null, businessId)} className="mt-6 space-y-4">
          {/* Product selection submits to the same page via GET so variants load server-side. */}
          <div>
            <label className="mb-1 block text-sm font-medium">Product</label>
            <div className="flex gap-2">
              <Select
                name="productId"
                defaultValue={productId}
                form="productPicker"
                className="flex-1"
              >
                <option value="">Select a product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.sku}
                  </option>
                ))}
              </Select>
              <Button type="submit" form="productPicker" variant="outline">
                Load variants
              </Button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Variant</label>
            <Select name="variantId" defaultValue="" disabled={variants.length === 0}>
              <option value="">{variants.length === 0 ? 'No variants / use base price' : 'Select variant…'}</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.price != null ? ` — $${v.price.toFixed(2)}` : ''}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Quantity</label>
              <Input name="count" type="number" min="1" defaultValue="1" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Customer name</label>
              <Input name="customerName" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Phone</label>
              <Input name="customerPhone" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium">Address</label>
              <Textarea name="customerAddress" rows={2} />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Link href={`/b/${businessId}/orders`} className="w-full sm:w-auto">
              <Button type="button" variant="outline" className="w-full">
                Cancel
              </Button>
            </Link>
            <Button type="submit" className="w-full sm:w-auto">Create order</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
