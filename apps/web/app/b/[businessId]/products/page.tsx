import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import {
  listProducts,
  listCategories,
  toCsv,
  csvColumnsForProducts,
  type ProductListItem,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge, Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/data-table';
import { CsvDownloadButton } from '@/components/csv-download-button';
import { deleteProductAction, deleteProductsBulkAction } from '@/app/actions/products';

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
    listProducts(token, businessId, { categoryId: categoryId || undefined, limit: 100 }),
    listCategories(token, businessId),
  ]);

  const query = q.trim().toLowerCase();
  const filtered: ProductListItem[] = query
    ? products.filter(
        (p) => p.name.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query),
      )
    : products;

  const columns: Column<ProductListItem>[] = [
    {
      key: 'name',
      header: 'Product',
      render: (p) => (
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--muted)]">
            {p.thumbnailUrl ? (
              <img src={p.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-[var(--muted-foreground)]">No img</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{p.name}</p>
            <p className="truncate text-xs text-[var(--muted-foreground)] md:hidden">{p.sku}</p>
          </div>
        </div>
      ),
    },
    { key: 'sku', header: 'SKU', className: 'hidden md:table-cell text-[var(--muted-foreground)]' },
    {
      key: 'categoryName',
      header: 'Category',
      className: 'hidden lg:table-cell',
      render: (p) =>
        p.categoryName ? <Badge>{p.categoryName}</Badge> : <span className="text-[var(--muted-foreground)]">—</span>,
    },
    { key: 'price', header: 'Price', render: (p) => <span className="font-medium">{formatPrice(p.price)}</span> },
    {
      key: 'variantCount',
      header: 'Variants',
      className: 'hidden sm:table-cell',
      render: (p) => String(p.variantCount ?? 0),
    },
  ];

  const csv = toCsv(filtered as unknown as Record<string, unknown>[], csvColumnsForProducts());

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Products</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Manage your catalog — {totalCount} total
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <CsvDownloadButton csv={csv} filename={`products-${businessId}.csv`} />
          <Link href={`/b/${businessId}/products/new`}>
            <Button>Add product</Button>
          </Link>
        </div>
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
        <DataTable
          rows={filtered}
          getRowId={(p) => p.id}
          columns={columns}
          bulkDeleteAction={deleteProductsBulkAction.bind(null, businessId) as unknown as (fd: FormData) => Promise<void>}
          bulkDeleteIdField="productIds"
          hasRowActions
          rowActions={(p) => (
            <>
              <Link
                href={`/b/${businessId}/products/${p.id}/edit`}
                className="text-sm text-[var(--primary)] hover:underline"
              >
                Edit
              </Link>
              <form action={deleteProductAction.bind(null, businessId, p.id)}>
                <button type="submit" className="text-sm text-red-600 hover:underline">
                  Delete
                </button>
              </form>
            </>
          )}
        />
      )}
    </div>
  );
}
