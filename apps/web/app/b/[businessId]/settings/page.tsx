import Link from 'next/link';
import { getBusinessForRequest } from '@/lib/server-data';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { updateBusinessAction } from '@/app/actions/business';
import { DeleteDataDialog } from '@/components/delete-data-dialog';

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { businessId } = await params;
  const { saved } = await searchParams;
  const business = await getBusinessForRequest(businessId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Business settings</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Update your business details or manage your data.
        </p>
      </div>

      {saved === '1' && (
        <Card className="border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          ✓ Settings saved successfully.
        </Card>
      )}

      {/* Business Details */}
      <Card>
        <h2 className="text-lg font-semibold">Business details</h2>
        <form action={updateBusinessAction.bind(null, businessId)} className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium">Business name</label>
            <Input
              name="name"
              defaultValue={business.name}
              required
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <Textarea
              name="description"
              rows={3}
              defaultValue={business.description ?? ''}
              placeholder="Describe your business, products, and services…"
              className="mt-1"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Business type</label>
              <Input
                name="type"
                defaultValue={business.type ?? ''}
                placeholder="e.g. Retail, Restaurant, Services…"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Phone</label>
              <Input
                name="phone"
                defaultValue={business.phone ?? ''}
                placeholder="+1 (555) 000-0000"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Employee count</label>
              <Input
                name="employeeCount"
                type="number"
                min="1"
                defaultValue={business.employeeCount ? String(business.employeeCount) : ''}
                placeholder="e.g. 10"
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-end border-t border-border pt-4">
            <Button type="submit" className="w-full sm:w-auto">Save changes</Button>
          </div>
        </form>
      </Card>

      {/* Quick links */}
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

      {/* Danger Zone */}
      <div>
        <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-3">Danger zone</h2>
        <DeleteDataDialog businessId={businessId} businessName={business.name} />
      </div>
    </div>
  );
}
