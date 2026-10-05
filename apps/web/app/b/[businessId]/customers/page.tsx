import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { cachedCustomers } from '@/app/_cache/queries';
import {
  createCustomerAction,
  deleteCustomerAction,
  updateCustomerAction,
} from '@/app/actions/customers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { DataTable, type DataTableHeader } from '@/components/data-table';

const headers: DataTableHeader[] = [
  { key: 'name', header: 'Name', className: 'w-full min-w-[160px]' },
  { key: 'phone', header: 'Phone', className: 'hidden md:table-cell text-[var(--muted-foreground)]' },
  { key: 'email', header: 'Email', className: 'hidden lg:table-cell text-[var(--muted-foreground)]' },
];

export default function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ q?: string; error?: string }>;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Customers</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          The customer book your company keeps, and can link products to.
        </p>
      </div>
      <Suspense fallback={null}>
        <Notice searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--muted)]" />}>
        <Book params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Notice({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!error) return null;
  return (
    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      {error}
    </p>
  );
}

async function Book({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { businessId } = await params;
  const { q = '' } = await searchParams;
  const token = await requireAuth();
  const { customers, hasCompany } = await cachedCustomers(token, businessId);

  if (!hasCompany) {
    return (
      <Card className="py-12 text-center">
        <p className="text-[var(--muted-foreground)]">
          This store is not linked to a company yet, so it has no customer book.
        </p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Create a company and assign this store to it on the{' '}
          <a href={`/b/${businessId}/companies`} className="text-[var(--primary)] hover:underline">
            Companies
          </a>{' '}
          page.
        </p>
      </Card>
    );
  }

  const query = q.trim().toLowerCase();
  const filtered = query
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          (c.phone ?? '').includes(query) ||
          (c.email ?? '').toLowerCase().includes(query),
      )
    : customers;

  return (
    <>
      <Card>
        <h2 className="text-lg font-semibold">Add customer</h2>
        <form
          action={createCustomerAction.bind(null, businessId)}
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <Input name="name" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Phone</label>
            <Input name="phone" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <Input name="email" type="email" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Photo URL</label>
            <Input name="avatar" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Address</label>
            <Textarea name="address" rows={2} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">Add customer</Button>
          </div>
        </form>
      </Card>

      <form className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input name="q" defaultValue={q} placeholder="Search by name, phone or email" className="sm:max-w-xs" />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {filtered.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-[var(--muted-foreground)]">
            {query ? 'No customers match your search.' : 'No customers yet. Add your first one above.'}
          </p>
        </Card>
      ) : (
        <DataTable
          headers={headers}
          rows={filtered.map((customer) => ({
            id: customer.id,
            cells: [
              <div key="name" className="min-w-0">
                <p className="truncate font-medium">{customer.name}</p>
                {customer.address && (
                  <p className="truncate text-xs text-[var(--muted-foreground)]">{customer.address}</p>
                )}
              </div>,
              customer.phone ?? <span className="text-[var(--muted-foreground)]">—</span>,
              customer.email ?? <span className="text-[var(--muted-foreground)]">—</span>,
            ],
            actions: (
              <details>
                <summary className="cursor-pointer list-none text-sm text-[var(--primary)] hover:underline">
                  Edit
                </summary>
                <form
                  action={updateCustomerAction.bind(null, businessId, customer.id)}
                  className="mt-3 grid w-64 gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm"
                >
                  <Input name="name" defaultValue={customer.name} placeholder="Name" className="h-8 text-sm" />
                  <Input name="phone" defaultValue={customer.phone ?? ''} placeholder="Phone" className="h-8 text-sm" />
                  <Input name="email" type="email" defaultValue={customer.email ?? ''} placeholder="Email" className="h-8 text-sm" />
                  <Input name="avatar" defaultValue={customer.avatar ?? ''} placeholder="Photo URL" className="h-8 text-sm" />
                  <Input name="address" defaultValue={customer.address ?? ''} placeholder="Address" className="h-8 text-sm" />
                  <div className="flex items-center gap-2">
                    <Button type="submit" size="sm">
                      Save
                    </Button>
                    <button
                      type="submit"
                      formAction={deleteCustomerAction.bind(null, businessId, customer.id)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </form>
              </details>
            ),
          }))}
        />
      )}
    </>
  );
}
