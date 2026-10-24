import { Suspense } from 'react';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { cachedBusiness, cachedProducts } from '@/app/_cache/queries';
import { applyPresetAction, updateStoreAction } from '@/app/actions/business';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StorefrontPreview } from '@/components/storefront/storefront-preview';
import { buildPreviewStore } from '@/lib/storefront-preview-data';
import { STORE_STRUCTURES, type StoreStructure } from '@/lib/storefront';
import {
  STORE_PRESETS,
  isStorePresetId,
  presetTheme,
  selectedPresetId,
  type StorePresetDef,
} from '@/lib/storefront-presets';
import { cn } from '@/lib/utils';

/** The five templates, named the way the preset tiles name them. */
const TEMPLATE_OPTIONS: [StoreStructure, string][] = [
  ['classic', 'Classic gallery — warm paper, black ink, square cards'],
  ['editorial', 'Editorial — olive paper, serif masthead, ruled cards'],
  ['market', 'Market — cream and clay, rounded tiles, centred hero'],
  ['terminal', 'Terminal — dark ink, boxed square tiles, uppercase'],
  ['atelier', 'Atelier — espresso and gold, centred captions'],
];

const ERROR_COPY: Record<string, string> = {
  'unknown-theme': 'That theme is not one of the five we offer.',
  'store-unavailable': 'Could not read your store, so the theme was left alone. Try again.',
};

type Frame = 'wide' | 'phone';

export default function StorefrontPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ preset?: string; frame?: string; saved?: string; error?: string }>;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Storefront</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Pick how your public store looks. The preview below is your real catalogue, and nothing changes
          until you press Use this theme.
        </p>
      </div>

      <Suspense fallback={null}>
        <Notice searchParams={searchParams} />
      </Suspense>

      <Suspense
        fallback={<div className="h-64 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--muted)]" />}
      >
        <Studio params={params} searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--muted)]" />}>
        <StorefrontContent params={params} />
      </Suspense>
    </div>
  );
}

async function StorefrontContent({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const token = await requireAuth();
  let business: Awaited<ReturnType<typeof cachedBusiness>>;
  try {
    business = await cachedBusiness(token, businessId);
  } catch {
    return (
      <Card className="py-10 text-center">
        <p className="text-[var(--muted-foreground)]">
          Your storefront content could not be read right now. Try again shortly.
        </p>
      </Card>
    );
  }

  return (
    <div id="storefront-content">
      <Card>
      <h2 className="text-lg font-semibold">Storefront content</h2>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        The link, wording and imagery customers see. Theme presets live above; these details
        survive a theme change.
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
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium">Tagline</label>
            <Input
              name="tagline"
              defaultValue={business.storeTheme?.tagline ?? ''}
              placeholder="Quality books, delivered fast"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Accent color</label>
            <Input
              name="accentColor"
              type="color"
              defaultValue={business.storeTheme?.accentColor ?? '#111111'}
              className="mt-1 h-10 p-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Font</label>
            <select
              name="font"
              defaultValue={business.storeTheme?.font ?? 'sans'}
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm dark:bg-neutral-900"
            >
              <option value="sans">Sans (modern)</option>
              <option value="serif">Serif (elegant)</option>
              <option value="mono">Mono</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Layout</label>
            <select
              name="layout"
              defaultValue={business.storeTheme?.layout ?? 'grid'}
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm dark:bg-neutral-900"
            >
              <option value="grid">Grid</option>
              <option value="featured">Featured</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Hero image URL</label>
            <Input
              name="heroImageUrl"
              defaultValue={business.storeTheme?.heroImageUrl ?? ''}
              placeholder="https://…"
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium">Logo image URL</label>
            <Input
              name="logoUrl"
              defaultValue={business.storeTheme?.logoUrl ?? ''}
              placeholder="https://…"
              className="mt-1"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="storePublished"
            defaultChecked={business.storePublished}
            className="h-4 w-4"
          />
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
    </div>
  );
}

async function Notice({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  if (error) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        {ERROR_COPY[error] ?? error}
      </p>
    );
  }
  if (!saved) return null;
  return (
    <Card className="border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
      Storefront saved. Your store shows it within a few seconds.
    </Card>
  );
}

async function Studio({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ preset?: string; frame?: string }>;
}) {
  const { businessId } = await params;
  const { preset: presetParam, frame: frameParam } = await searchParams;
  const token = await requireAuth();

  // cachedBusiness / cachedProducts throw on an API outage, and a throw reaching the
  // prerender is a build failure rather than a page — so the reads answer with a notice.
  let business: Awaited<ReturnType<typeof cachedBusiness>>;
  let listed: Awaited<ReturnType<typeof cachedProducts>>;
  try {
    [business, listed] = await Promise.all([
      cachedBusiness(token, businessId),
      cachedProducts(token, businessId, { limit: 8 }),
    ]);
  } catch {
    return (
      <Card className="py-12 text-center">
        <p className="text-[var(--muted-foreground)]">
          Your store could not be read right now, so there is nothing to preview.
        </p>
      </Card>
    );
  }

  const saved = selectedPresetId(business.storeTheme ?? null);
  const requested = isStorePresetId(presetParam)
    ? STORE_PRESETS.find((p) => p.id === presetParam)
    : undefined;
  const chosen: StorePresetDef = requested ?? saved ?? STORE_PRESETS[0];
  const frame: Frame = frameParam === 'phone' ? 'phone' : 'wide';
  // A hand-edited theme matches no preset. Preview what the store actually renders instead
  // of snapping the merchant back to Gallery just because they tuned an accent by hand.
  const previewTheme = requested || saved ? presetTheme(chosen) : business.storeTheme ?? presetTheme(chosen);
  const store = buildPreviewStore(business, previewTheme, listed.products);

  const linkFor = (id: string) => `/b/${businessId}/storefront?preset=${id}&frame=${frame}`;
  const frameLink = (value: Frame) =>
    `/b/${businessId}/storefront?preset=${chosen.id}&frame=${value}`;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="w-full lg:w-80 lg:shrink-0">
        <p className="mb-2 text-xs uppercase tracking-wide text-[var(--muted-foreground)]">Theme</p>
        {/* On a phone the picker is a bar you swipe through, so the preview can take the
            full width — the viewport is already the device being previewed. */}
        <div className="flex snap-x gap-3 overflow-x-auto pb-2 lg:grid lg:gap-4 lg:overflow-visible lg:pb-0">
          {STORE_PRESETS.map((preset) => {
            const active = preset.id === chosen.id;
            return (
              <Link
                key={preset.id}
                href={linkFor(preset.id)}
                className={cn(
                  'w-44 shrink-0 rounded-xl border p-3 transition-colors snap-start lg:w-full',
                  active
                    ? 'border-[var(--primary)] bg-[var(--muted)]'
                    : 'border-[var(--border)] hover:bg-[var(--muted)]',
                )}
              >
                {/* Five bands, not one: the tile previews the whole palette, because a
                    theme is a paper, an ink and a layout — not a button color. */}
                <span
                  className="flex h-8 overflow-hidden rounded-md border border-[var(--border)]"
                  style={{ borderRadius: STORE_STRUCTURES[preset.structure].radius }}
                  aria-hidden
                >
                  <span className="flex-1" style={{ background: STORE_STRUCTURES[preset.structure].paper }} />
                  <span className="flex-1" style={{ background: STORE_STRUCTURES[preset.structure].surface }} />
                  <span className="flex-1" style={{ background: STORE_STRUCTURES[preset.structure].plate }} />
                  <span className="flex-1" style={{ background: STORE_STRUCTURES[preset.structure].ink }} />
                  <span className="w-4" style={{ background: preset.accentColor }} />
                </span>
                <span className="mt-2 block text-sm font-medium">{preset.name}</span>
                <span className="mt-0.5 block text-xs leading-snug text-[var(--muted-foreground)]">
                  {preset.blurb}
                </span>
                <span className="mt-1.5 block text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                  {preset.structure} · {preset.font} · {preset.layout}
                </span>
                {preset.id === saved?.id ? (
                  <span className="mt-2 inline-block rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-white">
                    In use
                  </span>
                ) : null}
                {active && preset.id !== saved?.id ? (
                  <span className="mt-2 inline-block rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                    Not saved yet
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>

        <div className="mt-4 flex gap-2">
          {(['wide', 'phone'] as const).map((value) => (
            <Link
              key={value}
              href={frameLink(value)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs capitalize',
                value === frame
                  ? 'border-[var(--primary)] bg-[var(--muted)]'
                  : 'border-[var(--border)] text-[var(--muted-foreground)]',
              )}
            >
              {value === 'wide' ? 'Desktop' : 'Phone'}
            </Link>
          ))}
        </div>

        <form action={applyPresetAction.bind(null, businessId, chosen.id)} className="mt-4">
          <Button type="submit" disabled={chosen.id === saved?.id} className="w-full">
            {chosen.id === saved?.id ? 'This theme is live' : 'Use this theme'}
          </Button>
        </form>

        <p className="mt-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
          Tagline, hero photo, logo and the public link are edited in{' '}
          <a href="#storefront-content" className="text-[var(--primary)] hover:underline">
            Storefront content
          </a>{' '}
          below and survive a theme change.
        </p>

        {business.slug && business.storePublished ? (
          <p className="mt-2 text-xs">
            <a
              href={`/store/${business.slug}`}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--primary)] hover:underline"
            >
              Open your live store
            </a>
          </p>
        ) : (
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Your store is not public yet — set a link and publish it in{' '}
            <a href="#storefront-content" className="text-[var(--primary)] hover:underline">
              Storefront content
            </a>{' '}
            below.
          </p>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {frame === 'phone' ? (
          <div className="mx-auto isolate h-[720px] w-[390px] shrink-0 overflow-hidden rounded-[2.5rem] border-[10px] border-[#141414] bg-[#141414] shadow-xl">
            <div className="h-full overflow-y-auto overscroll-contain [contain:paint]">
              <StorefrontPreview store={store} frame="phone" />
            </div>
          </div>
        ) : (
          <Card className="overflow-hidden p-0">
            <StorefrontPreview store={store} frame="wide" />
          </Card>
        )}
      </div>
    </div>
  );
}
