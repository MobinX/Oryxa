import Link from 'next/link';
import { getBusinessForRequest } from '@/lib/server-data';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { updateBusinessAction, deleteBusinessAction } from '@/app/actions/business';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusinessForRequest(businessId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Business settings</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Update details or remove this business.
        </p>
      </div>

      <Card>
        <h2 className="text-lg font-semibold">Details</h2>
        <form action={updateBusinessAction.bind(null, businessId)} className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium">Business name</label>
            <input
              name="name"
              defaultValue={business.name}
              required
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea
              name="description"
              rows={3}
              defaultValue={business.description ?? ''}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Type</label>
              <input
                name="type"
                defaultValue={business.type ?? ''}
                className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Phone</label>
              <input
                name="phone"
                defaultValue={business.phone ?? ''}
                className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Employees</label>
              <input
                name="employeeCount"
                type="number"
                min="1"
                defaultValue={business.employeeCount ? String(business.employeeCount) : ''}
                className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end border-t border-[var(--border)] pt-4">
            <Button type="submit">Save changes</Button>
          </div>
        </form>
        <form
          action={deleteBusinessAction.bind(null, businessId)}
          className="border-t border-[var(--border)] pt-4"
        >
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete business
          </button>
        </form>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Quick links</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link href={`/b/${businessId}/products`}>
            <Button variant="outline" size="sm">Products</Button>
          </Link>
          <Link href={`/b/${businessId}/orders`}>
            <Button variant="outline" size="sm">Orders</Button>
          </Link>
          <Link href={`/b/${businessId}/channels`}>
            <Button variant="outline" size="sm">Channels</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
