import Link from 'next/link';
import { Building2, Plus, ArrowRight, Pencil, Trash2 } from 'lucide-react';
import { requireAuth } from '@/lib/auth';
import { listBusinesses, type Business } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type DataTableHeader } from '@/components/data-table';
import {
  deleteBusinessAction,
  deleteBusinessesBulkAction,
} from '@/app/actions/business';

const headers: DataTableHeader[] = [
  { key: 'name', header: 'Business' },
  { key: 'createdAt', header: 'Created', className: 'hidden sm:table-cell text-[var(--muted-foreground)]' },
];

export default async function BusinessesPage() {
  const token = await requireAuth();
  const { businesses } = await listBusinesses(token);

  const tableRows = businesses.map((business: Business) => ({
    id: business.id,
    cells: [
      <div key="name" className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{business.name}</p>
          {business.description && (
            <p className="mt-0.5 line-clamp-1 text-sm text-[var(--muted-foreground)]">
              {business.description}
            </p>
          )}
        </div>
      </div>,
      new Date(business.createdAt).toLocaleDateString(),
    ],
    actions: (
      <>
        <Link
          href={`/b/${business.id}/dashboard`}
          className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline"
        >
          Open <ArrowRight className="h-3 w-3" />
        </Link>
        <Link
          href={`/businesses/${business.id}/edit`}
          className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline"
        >
          <Pencil className="h-3 w-3" /> Edit
        </Link>
        <form action={deleteBusinessAction.bind(null, business.id)}>
          <button
            type="submit"
            className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </form>
      </>
    ),
  }));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Your businesses</h1>
          <p className="mt-1 text-[var(--muted-foreground)]">
            Select a business or create a new one.
          </p>
        </div>
        <Link href="/businesses/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New business
          </Button>
        </Link>
      </div>

      {businesses.length === 0 ? (
        <Card className="mt-12 text-center">
          <Building2 className="mx-auto h-12 w-12 text-[var(--muted-foreground)]" />
          <h2 className="mt-4 text-lg font-semibold">No businesses yet</h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Create your first business to manage products, orders, and channels.
          </p>
          <Link href="/businesses/new" className="mt-6 inline-block">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create your first business
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="mt-8">
          <DataTable
            headers={headers}
            rows={tableRows}
            bulkDeleteAction={deleteBusinessesBulkAction as unknown as (fd: FormData) => Promise<void>}
            bulkDeleteIdField="businessIds"
            hasRowActions
          />
        </div>
      )}
    </div>
  );
}
