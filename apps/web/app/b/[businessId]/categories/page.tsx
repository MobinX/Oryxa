import { Suspense } from 'react';
import { Check } from 'lucide-react';
import { requireAuth } from '@/lib/auth';
import { cachedCategories } from '@/app/_cache/queries';
import type { Category } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { DataTable, type DataTableHeader } from '@/components/data-table';
import { DeleteCategoryButton } from '@/components/products/delete-category-button';
import {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  deleteCategoriesBulkAction,
} from '@/app/actions/products';
import CategoriesSkeleton from './skeleton';

const headers: DataTableHeader[] = [
  { key: 'name', header: 'Name', className: 'w-full min-w-[150px]' },
  { key: 'slug', header: 'Slug' },
  { key: 'products', header: 'Products' },
];

export default function CategoriesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Categories</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Organize your products into categories
        </p>
      </div>
      <Card>
        <h2 className="text-lg font-semibold">Add category</h2>
        <Suspense fallback={<div className="mt-4 h-10 animate-pulse rounded-xl bg-muted" />}>
          <CreateCategoryForm params={params} />
        </Suspense>
      </Card>
      <Suspense fallback={<CategoriesSkeleton />}>
        <CategoriesTable params={params} />
      </Suspense>
    </div>
  );
}

async function CreateCategoryForm({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  return (
    <form action={createCategoryAction.bind(null, businessId)} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className="mb-1 block text-sm font-medium">Name</label>
        <Input name="name" placeholder="e.g. Clothing, Electronics" required />
      </div>
      <Button type="submit" className="w-full sm:w-auto">
        Create category
      </Button>
    </form>
  );
}

async function CategoriesTable({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const token = await requireAuth();
  const categories = await cachedCategories(token, businessId);

  const bulkDeleteMeta = Object.fromEntries(
    categories.map((c) => [c.id, { name: c.name, productCount: c.productCount ?? 0 }]),
  );

  const tableRows = categories.map((category: Category) => ({
    id: category.id,
    cells: [
      <span key="name" className="font-medium">
        {category.name}
      </span>,
      <span key="slug" className="text-[var(--muted-foreground)]">
        {category.slug}
      </span>,
      <span key="products">{category.productCount ?? 0}</span>,
    ],
    actions: (
      <>
        <form action={updateCategoryAction.bind(null, businessId, category.id)} className="flex items-center gap-2">
          <Input name="name" defaultValue={category.name} className="h-8 w-32 text-sm" required />
          <button
            type="submit"
            className="inline-flex items-center justify-center text-sm text-[var(--primary)] hover:underline font-semibold"
            title="Save"
          >
            <Check className="h-4 w-4 sm:hidden" />
            <span className="hidden sm:inline">Save</span>
          </button>
        </form>
        <DeleteCategoryButton
          categoryName={category.name}
          productCount={category.productCount ?? 0}
          onDelete={deleteCategoryAction.bind(null, businessId, category.id)}
        />
      </>
    ),
  }));

  return (
    <DataTable
      headers={headers}
      rows={tableRows}
      bulkDeleteAction={deleteCategoriesBulkAction.bind(null, businessId) as unknown as (fd: FormData) => Promise<void>}
      bulkDeleteIdField="categoryIds"
      bulkDeleteMeta={bulkDeleteMeta}
      hasRowActions
    />
  );
}
