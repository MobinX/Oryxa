import { requireAuth } from '@/lib/auth';
import { listCategories, type Category } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/data-table';
import {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  deleteCategoriesBulkAction,
} from '@/app/actions/products';

export default async function CategoriesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const token = await requireAuth();
  const categories = await listCategories(token, businessId);

  const columns: Column<Category>[] = [
    { key: 'name', header: 'Name', render: (c) => <span className="font-medium">{c.name}</span> },
    { key: 'slug', header: 'Slug', render: (c) => <span className="text-[var(--muted-foreground)]">{c.slug}</span> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Categories</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Organize your products into categories — {categories.length} total
        </p>
      </div>

      <Card>
        <h2 className="text-lg font-semibold">Add category</h2>
        <form action={createCategoryAction.bind(null, businessId)} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium">Name</label>
            <Input name="name" placeholder="e.g. Clothing, Electronics" required />
          </div>
          <Button type="submit" className="w-full sm:w-auto">Create category</Button>
        </form>
      </Card>

      <DataTable
        rows={categories}
        getRowId={(c) => c.id}
        columns={columns}
        bulkDeleteAction={deleteCategoriesBulkAction.bind(null, businessId) as unknown as (fd: FormData) => Promise<void>}
        bulkDeleteIdField="categoryIds"
        hasRowActions
        rowActions={(c) => (
          <>
            <form action={updateCategoryAction.bind(null, businessId, c.id)} className="flex items-center gap-2">
              <Input
                name="name"
                defaultValue={c.name}
                className="h-8 w-32 text-sm"
                required
              />
              <button type="submit" className="text-sm text-[var(--primary)] hover:underline">
                Save
              </button>
            </form>
            <form action={deleteCategoryAction.bind(null, businessId, c.id)}>
              <button type="submit" className="text-sm text-red-600 hover:underline">
                Delete
              </button>
            </form>
          </>
        )}
      />
    </div>
  );
}
