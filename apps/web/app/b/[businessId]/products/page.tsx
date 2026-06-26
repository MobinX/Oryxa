import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { listProducts, listCategories } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge, Card } from '@/components/ui/card';
import { deleteProductAction } from '@/app/actions/products';

function formatPrice(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ q?: string; categoryId?: string }>;
}) {
  const { businessId } = await params;
  const { q = '', categoryId = '' } = await searchParams;
  const token = await requireAuth();

  const [{ products, totalCount }, categories] = await Promise.all([
    listProducts(token, businessId, {
      categoryId: categoryId || undefined,
      limit: 100,
    }),
    listCategories(token, businessId),
  ]);

  const query = q.trim().toLowerCase();
  const filtered = query
    ? products.filter(
        (p) => p.name.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query),
      )
    : products;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Products</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Manage your catalog — {totalCount} total
          </p>
        </div>
        <Link href={`/b/${businessId}/products/new`}>
          <Button>Add product</Button>
        </Link>
      </div>

      <form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center" method="get">
        <Input
          name="q"
          placeholder="Search by name or SKU…"
          defaultValue={q}
          className="w-full sm:max-w-xs"
        />
        <Select name="categoryId" defaultValue={categoryId} className="w-full sm:w-auto sm:min-w-[180px]">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="outline" className="w-full sm:w-auto">
          Filter
        </Button>
      </form>

      {filtered.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-[var(--muted-foreground)]">
            {q || categoryId
              ? 'No products match your filters.'
              : 'No products yet. Add your first product to get started.'}
          </p>
          {!q && !categoryId && (
            <Link href={`/b/${businessId}/products/new`} className="mt-4 inline-block">
              <Button>Add product</Button>
            </Link>
          )}
        </Card>
      ) : (
        <div className="table-wrap rounded-xl border border-[var(--border)] bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Product</th>
                <th className="hidden px-4 py-3 text-left font-medium md:table-cell">SKU</th>
                <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Category</th>
                <th className="px-4 py-3 text-left font-medium">Price</th>
                <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">Variants</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <tr key={product.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--muted)]">
                        {product.thumbnailUrl ? (
                          <img
                            src={product.thumbnailUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-xs text-[var(--muted-foreground)]">No img</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{product.name}</p>
                        <p className="truncate text-xs text-[var(--muted-foreground)] md:hidden">
                          {product.sku}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-[var(--muted-foreground)] md:table-cell">
                    {product.sku}
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    {product.categoryName ? (
                      <Badge>{product.categoryName}</Badge>
                    ) : (
                      <span className="text-[var(--muted-foreground)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">{formatPrice(product.price)}</td>
                  <td className="hidden px-4 py-3 sm:table-cell">{product.variantCount ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/b/${businessId}/products/${product.id}/edit`}
                        className="text-sm text-[var(--primary)] hover:underline"
                      >
                        Edit
                      </Link>
                      <form action={deleteProductAction.bind(null, businessId, product.id)}>
                        <button
                          type="submit"
                          className="text-sm text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
