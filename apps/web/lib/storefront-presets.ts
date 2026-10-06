import type { StoreFont, StoreLayout, StorePreset, StoreTheme } from '@/lib/storefront';

/**
 * Named look-and-feel bundles offered on the Storefront page.
 *
 * This table lives in apps/web on purpose: the app has no `@repo/shared` dependency and
 * `transpilePackages: []`, so importing the zod enum from the workspace would mean adding
 * a live production build a new workspace edge to satisfy a five-line list (same trade
 * already struck in `lib/logs-session.ts`). The ids must stay in lockstep with
 * `storePresetSchema` in packages/shared/schemas/store.ts — that schema is what lets the
 * key survive the write, since a plain z.object strips anything it does not know.
 */
export type StorePresetDef = {
  id: StorePreset;
  name: string;
  blurb: string;
  accentColor: string;
  font: StoreFont;
  layout: StoreLayout;
};

/**
 * Every accent is a plain `#rrggbb` so it passes `sanitizeColor` and can be measured by
 * `readableOn`, and `gallery` deliberately matches the `ACCENT_FALLBACK` a store with no
 * theme renders today — opening this page must not be the thing that changed a store.
 */
export const STORE_PRESETS: StorePresetDef[] = [
  {
    id: 'gallery',
    name: 'Gallery',
    blurb: 'Quiet black, wide grid. The way your store looks today.',
    accentColor: '#141414',
    font: 'sans',
    layout: 'grid',
  },
  {
    id: 'pine',
    name: 'Pine',
    blurb: 'Deep green with serif headings and one featured piece.',
    accentColor: '#1F3B32',
    font: 'serif',
    layout: 'featured',
  },
  {
    id: 'terracotta',
    name: 'Terracotta',
    blurb: 'Warm clay, friendly sans, product-first grid.',
    accentColor: '#B4553C',
    font: 'sans',
    layout: 'grid',
  },
  {
    id: 'petrol',
    name: 'Petrol',
    blurb: 'Cool blue with monospaced detail, for kit and tech.',
    accentColor: '#1E4D6B',
    font: 'mono',
    layout: 'grid',
  },
  {
    id: 'atelier',
    name: 'Atelier',
    blurb: 'Soft gold on dark ink, editorial and featured.',
    accentColor: '#C7A24B',
    font: 'serif',
    layout: 'featured',
  },
];

export const isStorePresetId = (value: unknown): value is StorePreset =>
  typeof value === 'string' && STORE_PRESETS.some((p) => p.id === value);

export const findPreset = (id: StorePreset | null): StorePresetDef | undefined =>
  STORE_PRESETS.find((p) => p.id === id);

/** The three values a preset actually controls — everything else on the theme survives. */
export const presetTheme = (preset: StorePresetDef): StoreTheme => ({
  accentColor: preset.accentColor,
  font: preset.font,
  layout: preset.layout,
  preset: preset.id,
});

/**
 * Which tile to light up for a saved store. A theme whose values no longer match any
 * preset is reported as custom rather than snapped to the nearest one, because the accent
 * can still be edited by hand on the Settings page and pretending otherwise would show a
 * preview the merchant is not running.
 */
export function selectedPresetId(theme: StoreTheme): StorePresetDef | undefined {
  // Hoisted because a narrowing of `theme.accentColor` does not survive into the find
  // callback, and `?.` on the property again inside it would keep the union alive.
  const accent = theme?.accentColor?.toUpperCase();
  const font = theme?.font;
  const layout = theme?.layout;
  if (!accent || !font || !layout) return undefined;
  return STORE_PRESETS.find(
    (p) => p.accentColor.toUpperCase() === accent && p.font === font && p.layout === layout,
  );
}
