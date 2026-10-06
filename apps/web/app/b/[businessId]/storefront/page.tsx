import { Suspense } from 'react';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { cachedBusiness, cachedProducts } from '@/app/_cache/queries';
import { applyPresetAction } from '@/app/actions/business';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StorefrontPreview } from '@/components/storefront/storefront-preview';
import { buildPreviewStore } from '@/lib/storefront-preview-data';
import { STORE_STRUCTURES } from '@/lib/storefront';
import {
  STORE_PRESETS,
  isStorePresetId,
  presetTheme,
  selectedPresetId,
  type StorePresetDef,
} from '@/lib/storefront-presets';
import { cn } from '@/lib/utils';

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
      Theme saved. Your store shows it within a few seconds.
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
          Tagline, hero photo and logo are edited on the{' '}
          <Link href={`/b/${businessId}/settings`} className="text-[var(--primary)] hover:underline">
            Settings
          </Link>{' '}
          page and survive a theme change.
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
            Your store is not public yet — set a link and publish it on{' '}
            <Link href={`/b/${businessId}/settings`} className="text-[var(--primary)] hover:underline">
              Settings
            </Link>
            .
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
