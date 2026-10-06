import type { StoreFont, StoreLayout, StorePreset, StoreStructure, StoreTheme } from '@/lib/storefront';

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
  /** The template — paper, ink, card framing and hero composition all come from this. */
  structure: StoreStructure;
};

/**
 * Each preset names a `structure`, so picking one swaps the whole page and not just a
 * button: the palette lives in `STORE_STRUCTURES` and the layout deltas in the
 * `[data-structure=...]` blocks of `STORE_CSS`. Every accent is a plain `#rrggbb` so it
 * passes `sanitizeColor` and can be measured by `readableOn`, and `gallery` deliberately
 * keeps the literals a store with no theme renders today — opening this page must not be
 * the thing that changed a store.
 */
export const STORE_PRESETS: StorePresetDef[] = [
  {
    id: 'gallery',
    name: 'Gallery',
    blurb: 'Warm paper, black ink, square cards on a wide four-up grid. Today.',
    accentColor: '#141414',
    font: 'sans',
    layout: 'grid',
    structure: 'classic',
  },
  {
    id: 'pine',
    name: 'Pine',
    blurb: 'Olive paper and serif masthead, ruled three-up cards with the price under the name.',
    accentColor: '#1F3B32',
    font: 'serif',
    layout: 'featured',
    structure: 'editorial',
  },
  {
    id: 'terracotta',
    name: 'Terracotta',
    blurb: 'Cream and clay, rounded tiles, centred hero and pill prices.',
    accentColor: '#B4553C',
    font: 'sans',
    layout: 'grid',
    structure: 'market',
  },
  {
    id: 'petrol',
    name: 'Petrol',
    blurb: 'Dark ink, monospaced detail, boxed one-to-one tiles and an uppercase hero.',
    accentColor: '#1E4D6B',
    font: 'mono',
    layout: 'grid',
    structure: 'terminal',
  },
  {
    id: 'atelier',
    name: 'Atelier',
    blurb: 'Espresso and gold, serif centre-stage, captions centred under every piece.',
    accentColor: '#C7A24B',
    font: 'serif',
    layout: 'featured',
    structure: 'atelier',
  },
];

export const isStorePresetId = (value: unknown): value is StorePreset =>
  typeof value === 'string' && STORE_PRESETS.some((p) => p.id === value);

export const findPreset = (id: StorePreset | null): StorePresetDef | undefined =>
  STORE_PRESETS.find((p) => p.id === id);

/** The four values a preset actually controls — everything else on the theme survives. */
export const presetTheme = (preset: StorePresetDef): StoreTheme => ({
  accentColor: preset.accentColor,
  font: preset.font,
  layout: preset.layout,
  structure: preset.structure,
  preset: preset.id,
});

/**
 * Which tile to light up for a saved store. A theme whose values no longer match any
 * preset is reported as custom rather than snapped to the nearest one, because the accent
 * can still be edited by hand on the Settings page and pretending otherwise would show a
 * preview the merchant is not running.
 */
export function selectedPresetId(theme: StoreTheme): StorePresetDef | undefined {
  // Hoisted because narrowing `theme.accentColor` does not survive into the find callback,
  // and `?.` on the property again inside it would keep the union alive.
  const accent = theme?.accentColor?.toUpperCase();
  const font = theme?.font;
  const layout = theme?.layout;
  const structure = theme?.structure;
  if (!accent || !font || !layout || !structure) return undefined;
  return STORE_PRESETS.find(
    (p) =>
      p.accentColor.toUpperCase() === accent &&
      p.font === font &&
      p.layout === layout &&
      p.structure === structure,
  );
}
