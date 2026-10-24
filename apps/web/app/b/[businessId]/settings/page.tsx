import Link from 'next/link';
import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { cachedBusiness } from '@/app/_cache/queries';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { updateBusinessAction } from '@/app/actions/business';
import { DeleteDataDialog } from '@/components/delete-data-dialog';
import SettingsSkeleton from './skeleton';

export default function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Business settings</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Update your business details or manage your data.
        </p>
      </div>
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SettingsContent({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { businessId } = await params;
  const { saved } = await searchParams;
  const token = await requireAuth();
  const business = await cachedBusiness(token, businessId);

  return (
    <>
      {saved === '1' && (
        <Card className="border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          ✓ Settings saved successfully.
        </Card>
      )}

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

          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Sales agent instructions</h3>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              These words are added to the prompt for Messenger, Instagram Direct and comment
              replies. Leave a box empty to use the default behaviour.
            </p>
            <div className="mt-4 grid gap-4">
              <div>
                <label className="text-sm font-medium">
                  How to respond if a customer asks about a product
                </label>
                <Textarea
                  name="agentProductGuidance"
                  rows={4}
                  defaultValue={business.agentProductGuidance ?? ''}
                  placeholder="e.g. Always mention the material and the care instructions. If the exact item is out of stock, offer the closest alternative instead of saying no."
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">
                  What to do if a customer wants to bargain
                </label>
                <Textarea
                  name="agentBargainGuidance"
                  rows={4}
                  defaultValue={business.agentBargainGuidance ?? ''}
                  placeholder="e.g. Prices are fixed. Offer free delivery on orders above 2000 Taka instead of lowering the price."
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:justify-end border-t border-border pt-4">
            <Button type="submit" className="w-full sm:w-auto">Save changes</Button>
          </div>
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

      <div>
        <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-3">Danger zone</h2>
        <DeleteDataDialog businessId={businessId} businessName={business.name} />
      </div>
    </>
  );
}
