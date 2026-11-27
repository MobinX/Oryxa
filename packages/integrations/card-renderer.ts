import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { getB2ObjectBytes, isB2ObjectKey, putImageAtKey } from './b2';

const require = createRequire(import.meta.url);

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1080;

export interface ProductCardRenderInput {
  name: string;
  price: number | string;
  currency?: string;
  hasDiscount?: boolean;
  discountPercent?: number | string;
  variantSummary?: string;
  highlight?: string;
  stockStatus?: string;
  inStock?: boolean;
  accentColor?: string | null;
  imageKeyOrUrl?: string | null;
  imageDataUrl?: string | null;
}

export interface RenderedCardResult {
  buffer: Buffer;
  contentHash: string;
}

export interface UploadedCardResult {
  key: string;
  contentHash: string;
  skipped: boolean;
}

type SatoriFont = {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: 'normal';
};

let cachedFonts: SatoriFont[] | null = null;

function loadFonts(): SatoriFont[] {
  if (cachedFonts) return cachedFonts;
  const fonts: SatoriFont[] = [];
  const load = (specifier: string, name: string, weight: 400 | 700) => {
    try {
      const resolved = require.resolve(specifier);
      fonts.push({ name, data: readFileSync(resolved), weight, style: 'normal' });
    } catch {
      /* font optional if not resolved in environment */
    }
  };
  load('@fontsource/inter/files/inter-latin-400-normal.woff', 'Inter', 400);
  load('@fontsource/inter/files/inter-latin-700-normal.woff', 'Inter', 700);
  load('@fontsource/noto-sans-bengali/files/noto-sans-bengali-bengali-400-normal.woff', 'Noto Sans Bengali', 400);
  load('@fontsource/noto-sans-bengali/files/noto-sans-bengali-bengali-700-normal.woff', 'Noto Sans Bengali', 700);
  cachedFonts = fonts;
  return fonts;
}

function formatMoney(price: number | string, currency = 'BDT'): string {
  const num = typeof price === 'number' ? price : Number.parseFloat(String(price));
  if (!Number.isFinite(num)) return String(price);
  const code = (currency || 'BDT').toUpperCase();
  if (code === 'BDT') return `BDT ${Math.round(num).toLocaleString('en-US')}`;
  if (code === 'USD') return `$${num.toFixed(2)}`;
  return `${code} ${num.toFixed(2)}`;
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function normalizeHexColor(color: string | null | undefined): string {
  if (color && /^#[0-9a-fA-F]{6}$/.test(color.trim())) return color.trim();
  return '#0F172A';
}

export function computeCardContentHash(input: ProductCardRenderInput): string {
  const payload = JSON.stringify({
    name: input.name.trim(),
    price: String(input.price),
    currency: (input.currency ?? 'BDT').toUpperCase(),
    hasDiscount: Boolean(input.hasDiscount),
    discountPercent: Number(input.discountPercent ?? 0),
    variantSummary: input.variantSummary ?? '',
    highlight: input.highlight ?? '',
    stockStatus: input.stockStatus ?? '',
    inStock: input.inStock ?? true,
    accentColor: normalizeHexColor(input.accentColor),
    image: input.imageKeyOrUrl ?? '',
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

export function buildCardImageKey(
  businessId: string,
  productId: string,
  contentHash: string,
  variantId?: string | null,
): string {
  return variantId
    ? `cards/${businessId}/${productId}-${variantId}-${contentHash}.png`
    : `cards/${businessId}/${productId}-${contentHash}.png`;
}

async function resolveImageDataUrl(input: ProductCardRenderInput): Promise<string | null> {
  if (input.imageDataUrl) return input.imageDataUrl;
  const src = input.imageKeyOrUrl?.trim();
  if (!src) return null;

  if (src.startsWith('data:image/')) return src;

  try {
    if (isB2ObjectKey(src)) {
      const obj = await getB2ObjectBytes(src);
      return `data:${obj.contentType};base64,${obj.buffer.toString('base64')}`;
    }
    if (src.startsWith('http://') || src.startsWith('https://')) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(src, { signal: controller.signal }).finally(() => clearTimeout(timer));
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') || 'image/jpeg';
      return `data:${contentType};base64,${buf.toString('base64')}`;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Renders a 1080x1080 reusable product card PNG using Satori + @resvg/resvg-js.
 */
export async function renderProductCardPng(input: ProductCardRenderInput): Promise<RenderedCardResult> {
  const fonts = loadFonts();
  const contentHash = computeCardContentHash(input);
  const accent = normalizeHexColor(input.accentColor);
  const imageDataUrl = await resolveImageDataUrl(input);

  const rawPrice = typeof input.price === 'number' ? input.price : Number.parseFloat(String(input.price));
  const discountPct = Number(input.discountPercent ?? 0);
  const showDiscount = Boolean(input.hasDiscount) && Number.isFinite(discountPct) && discountPct > 0;
  const discountedPrice = showDiscount && Number.isFinite(rawPrice)
    ? Math.max(0, rawPrice * (1 - discountPct / 100))
    : rawPrice;

  const priceText = formatMoney(discountedPrice, input.currency);
  const oldPriceText = showDiscount ? formatMoney(rawPrice, input.currency) : null;
  const title = truncate(input.name, 52);
  const variantLine = truncate(input.variantSummary || 'Standard Edition', 48);
  const highlightLine = truncate(input.highlight || 'Premium quality · Checked before dispatch', 64);
  const inStock = input.inStock !== false;
  const stockBadge = input.stockStatus || (inStock ? 'In Stock' : 'Out of Stock');

  const node = {
    type: 'div',
    props: {
      style: {
        width: `${CARD_WIDTH}px`,
        height: `${CARD_HEIGHT}px`,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#F8FAFC',
        fontFamily: 'Inter, Noto Sans Bengali, sans-serif',
        color: '#0F172A',
      },
      children: [
        // Top hero product image container
        {
          type: 'div',
          props: {
            style: {
              width: '1080px',
              height: '660px',
              display: 'flex',
              position: 'relative',
              backgroundColor: '#E2E8F0',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            },
            children: [
              imageDataUrl
                ? {
                    type: 'img',
                    props: {
                      src: imageDataUrl,
                      style: {
                        width: '1080px',
                        height: '660px',
                        objectFit: 'cover',
                      },
                    },
                  }
                : {
                    type: 'div',
                    props: {
                      style: {
                        width: '1080px',
                        height: '660px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: accent,
                        color: '#FFFFFF',
                        fontSize: '72px',
                        fontWeight: 700,
                      },
                      children: title.slice(0, 2).toUpperCase(),
                    },
                  },
              // Price pill overlay bottom-left
              {
                type: 'div',
                props: {
                  style: {
                    position: 'absolute',
                    bottom: '28px',
                    left: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    backgroundColor: accent,
                    color: '#FFFFFF',
                    padding: '16px 28px',
                    borderRadius: '20px',
                  },
                  children: [
                    {
                      type: 'span',
                      props: {
                        style: { fontSize: '42px', fontWeight: 700 },
                        children: priceText,
                      },
                    },
                    ...(oldPriceText
                      ? [
                          {
                            type: 'span',
                            props: {
                              style: {
                                fontSize: '26px',
                                color: '#CBD5E1',
                                textDecoration: 'line-through',
                              },
                              children: oldPriceText,
                            },
                          },
                        ]
                      : []),
                  ],
                },
              },
              // Discount pill top-right if discounted
              ...(showDiscount
                ? [
                    {
                      type: 'div',
                      props: {
                        style: {
                          position: 'absolute',
                          top: '28px',
                          right: '36px',
                          display: 'flex',
                          backgroundColor: '#DC2626',
                          color: '#FFFFFF',
                          padding: '12px 24px',
                          borderRadius: '999px',
                          fontSize: '28px',
                          fontWeight: 700,
                        },
                        children: `${Math.round(discountPct)}% OFF`,
                      },
                    },
                  ]
                : []),
            ],
          },
        },
        // Middle details panel
        {
          type: 'div',
          props: {
            style: {
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '32px 42px 28px 42px',
              backgroundColor: '#FFFFFF',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'column', gap: '12px' },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '16px',
                        },
                        children: [
                          {
                            type: 'span',
                            props: {
                              style: { fontSize: '44px', fontWeight: 700, color: '#0F172A' },
                              children: title,
                            },
                          },
                          {
                            type: 'span',
                            props: {
                              style: {
                                fontSize: '24px',
                                fontWeight: 700,
                                padding: '8px 18px',
                                borderRadius: '999px',
                                backgroundColor: inStock ? '#DCFCE7' : '#FEE2E2',
                                color: inStock ? '#166534' : '#991B1B',
                              },
                              children: stockBadge,
                            },
                          },
                        ],
                      },
                    },
                    {
                      type: 'span',
                      props: {
                        style: { fontSize: '30px', fontWeight: 700, color: accent },
                        children: variantLine,
                      },
                    },
                    {
                      type: 'span',
                      props: {
                        style: { fontSize: '26px', color: '#475569' },
                        children: highlightLine,
                      },
                    },
                  ],
                },
              },
              // Footer strip
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderTop: '2px solid #E2E8F0',
                    paddingTop: '18px',
                    fontSize: '24px',
                    fontWeight: 700,
                    color: '#334155',
                  },
                  children: [
                    { type: 'span', props: { children: 'Cash on Delivery · Inbox to Order' } },
                    { type: 'span', props: { style: { color: accent }, children: 'Tap Order Below' } },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  };

  const svg = await satori(node as any, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: fonts.length > 0 ? fonts : [],
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: CARD_WIDTH },
  });
  const pngData = resvg.render();
  return {
    buffer: Buffer.from(pngData.asPng()),
    contentHash,
  };
}

/**
 * Renders and uploads a reusable product card PNG to B2 if its contentHash changed.
 */
export async function renderAndUploadProductCard(
  input: ProductCardRenderInput & {
    businessId: string;
    productId: string;
    variantId?: string | null;
    existingCardKey?: string | null;
  },
): Promise<UploadedCardResult> {
  const contentHash = computeCardContentHash(input);
  const key = buildCardImageKey(input.businessId, input.productId, contentHash, input.variantId);
  if (input.existingCardKey && input.existingCardKey === key) {
    return { key, contentHash, skipped: true };
  }

  const rendered = await renderProductCardPng(input);
  await putImageAtKey({
    key,
    buffer: rendered.buffer,
    contentType: 'image/png',
  });
  return { key, contentHash, skipped: false };
}
