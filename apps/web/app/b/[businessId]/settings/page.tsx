import Link from 'next/link';
import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { cachedBusiness } from '@/app/_cache/queries';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { updateBusinessAction, updateStoreAction } from '@/app/actions/business';
import { DeleteDataDialog } from '@/components/delete-data-dialog';
import type { StoreStructure } from '@/lib/storefront';
import SettingsSkeleton from './skeleton';

/** The five templates, named the way the Storefront page names their presets. */
const TEMPLATE_OPTIONS: [StoreStructure, string][] = [
  ['classic', 'Classic gallery — warm paper, black ink, square cards'],
  ['editorial', 'Editorial — olive paper, serif masthead, ruled cards'],
  ['market', 'Market — cream and clay, rounded tiles, centred hero'],
  ['terminal', 'Terminal — dark ink, boxed square tiles, uppercase'],
  ['atelier', 'Atelier — espresso and gold, centred captions'],
];

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
          <div className="flex flex-col sm:flex-row sm:justify-end border-t border-border pt-4">
            <Button type="submit" className="w-full sm:w-auto">Save changes</Button>
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Public storefront</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Give your store a link customers can visit to browse your products. For colours,
          typefaces and a live preview, use the{' '}
          <Link href={`/b/${businessId}/storefront`} className="text-[var(--primary)] hover:underline">
            Storefront
          </Link>{' '}
          page.
        </p>
        <form action={updateStoreAction.bind(null, businessId)} className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium">Store link</label>
            <div className="mt-1 flex items-center gap-1 text-sm">
              <span className="text-[var(--muted-foreground)]">/store/</span>
              <Input
                name="slug"
                defaultValue={business.slug ?? ''}
                placeholder="my-book-store"
                className="flex-1"
                pattern="[a-z0-9-]*"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Template</label>
              <input type="hidden" name="preset" defaultValue={business.storeTheme?.preset ?? ''} />
              <select
                name="structure"
                defaultValue={business.storeTheme?.structure ?? 'classic'}
                className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm dark:bg-neutral-900"
              >
                {TEMPLATE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                The template paints the whole store — paper, ink and how a product card is framed.
                Or pick one with a live preview on{' '}
                <Link href={`/b/${businessId}/storefront`} className="text-[var(--primary)] hover:underline">
                  Storefront
                </Link>
                .
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Tagline</label>
              <Input name="tagline" defaultValue={business.storeTheme?.tagline ?? ''} placeholder="Quality books, delivered fast" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Accent color</label>
              <Input name="accentColor" type="color" defaultValue={business.storeTheme?.accentColor ?? '#111111'} className="mt-1 h-10 p-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Font</label>
              <select name="font" defaultValue={business.storeTheme?.font ?? 'sans'} className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm dark:bg-neutral-900">
                <option value="sans">Sans (modern)</option>
                <option value="serif">Serif (elegant)</option>
                <option value="mono">Mono</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Layout</label>
              <select name="layout" defaultValue={business.storeTheme?.layout ?? 'grid'} className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm dark:bg-neutral-900">
                <option value="grid">Grid</option>
                <option value="featured">Featured</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Hero image URL</label>
              <Input name="heroImageUrl" defaultValue={business.storeTheme?.heroImageUrl ?? ''} placeholder="https://…" className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Logo image URL</label>
              <Input name="logoUrl" defaultValue={business.storeTheme?.logoUrl ?? ''} placeholder="https://…" className="mt-1" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="storePublished" defaultChecked={business.storePublished} className="h-4 w-4" />
            Publish my storefront (make it visible to customers)
          </label>
          {business.slug && business.storePublished && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3 text-sm">
              <span className="text-[var(--muted-foreground)]">Live at: </span>
              <Link href={`/store/${business.slug}`} className="font-medium text-[var(--primary)] underline">
                /store/{business.slug}
              </Link>
            </div>
          )}
          <div className="flex justify-end border-t border-border pt-4">
            <Button type="submit">Save storefront</Button>
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
