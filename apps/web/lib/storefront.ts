/**
 * Public storefront data layer.
 *
 * Every endpoint here is unauthenticated by design (`/api/v1/store/...`), so the
 * helpers are safe to import from both server components and client components:
 * `NEXT_PUBLIC_API_URL` is inlined into the browser bundle by Next.
 */

const DEFAULT_API_URL = 'http://localhost:3001';

function apiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = raw && raw.length > 0 ? raw : DEFAULT_API_URL;
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

/* ------------------------------------------------------------------ types */

export type StoreFont = 'sans' | 'serif' | 'mono';
export type StoreLayout = 'grid' | 'featured';

export type StoreTheme = {
  accentColor?: string | null;
  font?: StoreFont | null;
  tagline?: string | null;
  heroImageUrl?: string | null;
  logoUrl?: string | null;
  layout?: StoreLayout | null;
} | null;

export type PublicVariant = {
  id: string;
  name: string;
  /** Omitted (or null) when the variant inherits the product price. */
  price?: number | null;
  stock: number;
  isAvailable: boolean;
  /** Omitted when the variant has no photography. */
  imageUrl?: string | null;
};

export type PublicProduct = {
  id: string;
  name: string;
  price: number;
  description?: string | null;
  categoryName?: string | null;
  thumbnailUrl?: string | null;
  inStock: boolean;
  variants: PublicVariant[];
};

export type PublicStore = {
  slug: string;
  name: string;
  description?: string | null;
  phone?: string | null;
  theme: StoreTheme;
  categories: string[];
  products: PublicProduct[];
};

export type ProductSort = 'newest' | 'price_asc' | 'price_desc';

export type StoreFilters = {
  q?: string;
  category?: string;
  sort?: ProductSort;
  min?: number | '';
  max?: number | '';
};

/**
 * The UI/searchParams form of the filters: every value is a string so the same
 * object can seed the collection from the URL, live in React state and be sent
 * to the API after conversion.
 */
export type StoreFilterState = {
  q: string;
  category: string;
  sort: ProductSort;
  min: string;
  max: string;
};

export const EMPTY_FILTERS: StoreFilterState = {
  q: '',
  category: '',
  sort: 'newest',
  min: '',
  max: '',
};

const SORTS: ProductSort[] = ['newest', 'price_asc', 'price_desc'];

function firstParam(value: string | string[] | undefined): string {
  const single = Array.isArray(value) ? value[0] : value;
  return typeof single === 'string' ? single : '';
}

function numericParam(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? String(parsed) : '';
}

/** SearchParams → filter state, ignoring anything malformed. */
export function parseStoreFilters(
  raw: Record<string, string | string[] | undefined>,
): StoreFilterState {
  const sort = firstParam(raw.sort);
  const category = firstParam(raw.category);
  const min = numericParam(firstParam(raw.min));
  const max = numericParam(firstParam(raw.max));
  const priceAsc = min !== '' && max !== '' && Number(min) > Number(max);
  return {
    q: firstParam(raw.q).slice(0, 120),
    category: category.slice(0, 120),
    sort: SORTS.includes(sort as ProductSort) ? (sort as ProductSort) : 'newest',
    min: priceAsc ? max : min,
    max: priceAsc ? min : max,
  };
}

export function toStoreFilters(state: StoreFilterState): StoreFilters {
  const min = state.min === '' ? undefined : Number(state.min);
  const max = state.max === '' ? undefined : Number(state.max);
  return {
    q: state.q.trim(),
    category: state.category || undefined,
    sort: state.sort,
    min: min != null && Number.isFinite(min) ? min : undefined,
    max: max != null && Number.isFinite(max) ? max : undefined,
  };
}

export function toFilterState(filters?: StoreFilters): StoreFilterState {
  return {
    q: filters?.q ?? '',
    category: filters?.category ?? '',
    sort: filters?.sort ?? 'newest',
    min: filters?.min === undefined || filters?.min === '' ? '' : String(filters.min),
    max: filters?.max === undefined || filters?.max === '' ? '' : String(filters.max),
  };
}

export function hasActiveFilters(state: StoreFilterState): boolean {
  return (
    Boolean(state.q.trim()) ||
    Boolean(state.category) ||
    state.sort !== 'newest' ||
    Boolean(state.min) ||
    Boolean(state.max)
  );
}

/** Query string for the address bar — keeps collection views shareable. */
export function filtersToQuery(state: StoreFilterState): string {
  const params = new URLSearchParams();
  const q = state.q.trim();
  if (q) params.set('q', q);
  if (state.category) params.set('category', state.category);
  if (state.sort !== 'newest') params.set('sort', state.sort);
  if (state.min) params.set('min', state.min);
  if (state.max) params.set('max', state.max);
  return params.toString();
}

export function sameFilters(a: StoreFilterState, b: StoreFilterState): boolean {
  return (
    a.q.trim() === b.q.trim() &&
    a.category === b.category &&
    a.sort === b.sort &&
    a.min === b.min &&
    a.max === b.max
  );
}

export type CheckoutItem = {
  productId: string;
  variantId?: string;
  quantity: number;
};

export type CheckoutInput = {
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  items: CheckoutItem[];
};

export type CheckoutResult = {
  orderIds: string[];
  total: number;
  status: 'pending';
};

export class StorefrontError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'StorefrontError';
    this.status = status;
  }
}

/* ------------------------------------------------------------------ fetch */

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new StorefrontError(payload?.error || 'Unable to reach the store right now.', res.status);
  }

  return (await res.json()) as T;
}

/**
 * Public storefront data changes rarely and a page visit fans out several reads
 * (metadata, layout shell, collection). On the server we collapse concurrent and
 * near-concurrent identical reads into one request for a few seconds.
 */
const MEMO_TTL_MS = 4000;
const MEMO_MAX = 60;
const isServer = typeof window === 'undefined';
const memo = new Map<string, { at: number; promise: Promise<unknown> }>();

function memoized<T>(key: string, loader: () => Promise<T>): Promise<T> {
  if (!isServer) return loader();

  const now = Date.now();
  const cached = memo.get(key);
  if (cached && cached.at + MEMO_TTL_MS > now) return cached.promise as Promise<T>;

  const entry = {
    at: now,
    promise: loader().catch((error: unknown) => {
      if (memo.get(key) === entry) memo.delete(key);
      throw error;
    }),
  };
  memo.set(key, entry);
  if (memo.size > MEMO_MAX) {
    const oldest = memo.keys().next().value;
    if (oldest && oldest !== key) memo.delete(oldest);
  }
  return entry.promise as Promise<T>;
}

function buildQuery(filters?: StoreFilters): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  const q = filters.q?.trim();
  if (q) params.set('q', q);
  if (filters.category) params.set('category', filters.category);
  if (filters.sort && filters.sort !== 'newest') params.set('sort', filters.sort);
  if (filters.min !== undefined && filters.min !== '') params.set('min', String(filters.min));
  if (filters.max !== undefined && filters.max !== '') params.set('max', String(filters.max));
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function storePath(slug: string, filters?: StoreFilters): string {
  return `/api/v1/store/${encodeURIComponent(slug)}${buildQuery(filters)}`;
}

export function getStore(slug: string, filters?: StoreFilters): Promise<PublicStore> {
  const path = storePath(slug, filters);
  return memoized(path, () => request<PublicStore>(path, { cache: 'no-store' }));
}

export function getProduct(slug: string, productId: string): Promise<PublicProduct> {
  const path = `/api/v1/store/${encodeURIComponent(slug)}/products/${encodeURIComponent(productId)}`;
  return memoized(path, () => request<PublicProduct>(path, { cache: 'no-store' }));
}

export function checkout(slug: string, body: CheckoutInput): Promise<CheckoutResult> {
  return request<CheckoutResult>(`/api/v1/store/${encodeURIComponent(slug)}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: body.customerName.trim(),
      ...(body.customerPhone?.trim() ? { customerPhone: body.customerPhone.trim() } : {}),
      ...(body.customerAddress?.trim() ? { customerAddress: body.customerAddress.trim() } : {}),
      items: body.items,
    }),
  });
}

/* ------------------------------------------------------------------ format */

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPrice(value: number): string {
  return currency.format(Number.isFinite(value) ? value : 0);
}

/** The price actually charged for a variant: its own price, else the product price. */
export function variantPrice(product: PublicProduct, variant: PublicVariant | null): number {
  return variant?.price != null ? variant.price : product.price;
}

/** The first purchasable variant, used by "quick add" on product cards. */
export function defaultVariant(product: PublicProduct): PublicVariant | null {
  const available = product.variants.find((v) => v.isAvailable && v.stock > 0);
  return available ?? product.variants[0] ?? null;
}

/* ------------------------------------------------------------------ theme */

export const SERIF_STACK = 'Georgia, "Times New Roman", Times, serif';
export const MONO_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
export const SANS_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif';

export const ACCENT_FALLBACK = '#111111';

/**
 * Maps the store theme onto CSS custom properties consumed by the storefront
 * shell. Inline values are sanitised: only `#hex`, `rgb()/hsl()` colors and a
 * small set of named colors are allowed through, so a malformed theme value can
 * never break out of the declaration.
 */
export function themeVars(theme: StoreTheme): Record<string, string> {
  const accent = sanitizeColor(theme?.accentColor);
  return {
    '--store-accent': accent ?? ACCENT_FALLBACK,
    '--store-accent-fg': readableOn(accent),
    '--store-accent-soft': accent ? `color-mix(in srgb, ${accent} 12%, #ffffff)` : '#f1f0ee',
    '--store-accent-line': accent ? `color-mix(in srgb, ${accent} 32%, #ffffff)` : '#c9c7c3',
    '--store-font': fontStack(theme?.font),
    '--store-font-ui': SANS_STACK,
  };
}

function fontStack(font?: StoreFont | null): string {
  switch (font) {
    case 'serif':
      return SERIF_STACK;
    case 'mono':
      return MONO_STACK;
    default:
      return SANS_STACK;
  }
}

const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([^"'()]*\)|hsla?\([^"'()]*\)|[a-z]{3,20})$/i;

function sanitizeColor(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !SAFE_COLOR.test(trimmed)) return null;
  return trimmed;
}

const DARK_INK_ON_ACCENT = '#111111';
const LIGHT_INK_ON_ACCENT = '#FBFAF8';
/** Relative luminance of #111111, the dark ink candidate. */
const DARK_INK_LUMINANCE = 0.0057;

/**
 * Picks the more legible text color for a solid accent background by comparing
 * WCAG contrast against both inks. Only hex accents can be measured, so anything
 * else falls back to the light ink (accents default to near-black).
 */
function readableOn(accent: string | null): string {
  const rgb = parseHex(accent);
  if (!rgb) return LIGHT_INK_ON_ACCENT;

  const linear = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];

  const contrastWithLightInk = 1.05 / (luminance + 0.05);
  const contrastWithDarkInk = (luminance + 0.05) / (DARK_INK_LUMINANCE + 0.05);

  return contrastWithDarkInk > contrastWithLightInk ? DARK_INK_ON_ACCENT : LIGHT_INK_ON_ACCENT;
}

function parseHex(value: string | null): [number, number, number] | null {
  if (!value?.startsWith('#')) return null;
  const body = value.slice(1);
  if (body.length === 3) {
    return body.split('').map((pair) => parseInt(pair + pair, 16)) as [number, number, number];
  }
  if (body.length >= 6) {
    return [
      parseInt(body.slice(0, 2), 16),
      parseInt(body.slice(2, 4), 16),
      parseInt(body.slice(4, 6), 16),
    ];
  }
  return null;
}
