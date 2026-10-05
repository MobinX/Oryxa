import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { cachedBusinesses, cachedCompanies } from '@/app/_cache/queries';
import {
  assignBusinessAction,
  createCompanyAction,
  deleteCompanyAction,
  unassignBusinessAction,
  updateCompanyAction,
} from '@/app/actions/companies';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';

export default function CompaniesPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Companies</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          A company sits above your stores and owns the customer book they share.
        </p>
      </div>
      <Suspense fallback={null}>
        <Notice searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--muted)]" />}>
        <Roster params={params} />
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

async function Roster({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const token = await requireAuth();
  // The stores come from the same list the sidebar switcher already caches, so the
  // company → store mapping costs no extra request of its own.
  const [companies, owned] = await Promise.all([
    cachedCompanies(token),
    cachedBusinesses(token),
  ]);

  const byCompany = new Map<string, Array<{ id: string; name: string }>>();
  for (const business of owned.businesses) {
    if (!business.companyId) continue;
    const list = byCompany.get(business.companyId) ?? [];
    list.push({ id: business.id, name: business.name });
    byCompany.set(business.companyId, list);
  }

  const unassigned = owned.businesses.filter((b) => !b.companyId);

  return (
    <>
      <Card>
        <h2 className="text-lg font-semibold">Add company</h2>
        <form
          action={createCompanyAction.bind(null, businessId)}
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
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Description</label>
            <Textarea name="description" rows={2} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">Add company</Button>
          </div>
        </form>
      </Card>

      {companies.companies.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-[var(--muted-foreground)]">
            No companies yet. A company is what lets your stores share one customer book.
          </p>
        </Card>
      ) : (
        companies.companies.map((company) => {
          const stores = byCompany.get(company.id) ?? [];
          return (
            <Card key={company.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">{company.name}</h2>
                  {company.description && (
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">{company.description}</p>
                  )}
                  {company.phone && (
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">{company.phone}</p>
                  )}
                </div>
                <details>
                  <summary className="cursor-pointer list-none text-sm text-[var(--primary)] hover:underline">
                    Edit
                  </summary>
                  <form
                    action={updateCompanyAction.bind(null, businessId, company.id)}
                    className="mt-3 grid w-64 gap-2 rounded-xl border border-[var(--border)] p-3 shadow-sm"
                  >
                    <Input name="name" defaultValue={company.name} placeholder="Name" className="h-8 text-sm" />
                    <Input name="phone" defaultValue={company.phone ?? ''} placeholder="Phone" className="h-8 text-sm" />
                    <Input name="description" defaultValue={company.description ?? ''} placeholder="Description" className="h-8 text-sm" />
                    <Button type="submit" size="sm">
                      Save
                    </Button>
                  </form>
                </details>
              </div>

              <div className="mt-4">
                <p className="text-sm font-medium">Stores</p>
                {stores.length === 0 ? (
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    No store points here yet, so none of them can see this customer book.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {stores.map((store) => (
                      <li
                        key={store.id}
                        className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2 py-1 text-sm"
                      >
                        {store.id === businessId ? (
                          <span className="font-medium">{store.name}</span>
                        ) : (
                          <a
                            href={`/b/${store.id}/companies`}
                            className="font-medium text-[var(--primary)] hover:underline"
                          >
                            {store.name}
                          </a>
                        )}
                        <form action={unassignBusinessAction.bind(null, businessId, company.id, store.id)}>
                          <button
                            type="submit"
                            className="text-xs text-[var(--muted-foreground)] hover:text-red-600"
                          >
                            Remove
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {unassigned.length > 0 && (
                <form
                  action={assignBusinessAction.bind(null, businessId, company.id)}
                  className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
                >
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium">Assign a store</label>
                    <Select name="businessId">
                      {unassigned.map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button type="submit" variant="outline">
                    Assign
                  </Button>
                </form>
              )}

              <form action={deleteCompanyAction.bind(null, businessId, company.id)} className="mt-4 border-t border-border pt-4">
                <button type="submit" className="text-sm text-red-600 hover:underline">
                  Delete company
                </button>
                <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                  Removes this company and its whole customer book. The stores and their
                  products stay, they just lose the link.
                </span>
              </form>
            </Card>
          );
        })
      )}
    </>
  );
}
