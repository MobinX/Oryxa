'use client';

import { makeVariantId, slugify } from '@repo/utils';
import { parseShopifyCsv, type ParsedProduct, type ParsedVariant } from '@/lib/shopify-csv';
import { uploadVariantImageDirect } from '@/lib/uploads-client';

/**
 * Browser-side Shopify CSV import.
 *
 * Everything heavy happens here, in the tab: the CSV is streamed in chunks, every image is
 * downloaded, stamped with its variant's short label on a canvas, and pushed straight to B2
 * through a presigned PUT — the bytes never touch our servers. Only the finished object keys
 * travel to the API, one small page of products at a time.
 */

const BUCKET_LIMIT_BYTES = 4 * 1024 * 1024;
const QUALITIES = [0.9, 0.8, 0.68, 0.55];
const MAX_EDGE = 2048;
const CANVAS_LANES = 4;
const PAGE_SIZE = 25;

export interface ImportState {
  phase: 'parsing' | 'importing' | 'done' | 'error' | 'aborted';
  parseFraction: number;
  bytesRead: number;
  totalBytes: number;
  totalProducts: number;
  totalVariants: number;
  processedProducts: number;
  imagesUploaded: number;
  imagesFailed: number;
  createdProducts: number;
  failedProducts: Array<{ name: string; error: string }>;
  relabeledCount: number;
  currentName: string | null;
  errorMessage: string | null;
}

export const initialImportState: ImportState = {
  phase: 'parsing',
  parseFraction: 0,
  bytesRead: 0,
  totalBytes: 0,
  totalProducts: 0,
  totalVariants: 0,
  processedProducts: 0,
  imagesUploaded: 0,
  imagesFailed: 0,
  createdProducts: 0,
  failedProducts: [],
  relabeledCount: 0,
  currentName: null,
  errorMessage: null,
};

interface LabeledVariant extends ParsedVariant {
  label: string;
  imageKey: string | null;
}

interface LabeledProduct {
  handle: string;
  name: string;
  description: string | null;
  tags: string[];
  showInStorefront: boolean;
  sku: string;
  price: number | null;
  images: Array<{ url: string; position: number }>;
  variants: LabeledVariant[];
}

/** Draws the variant's short label top-right: white glyphs on a soft plate, readable on any photo. */
function stamp(canvas: HTMLCanvasElement, bitmap: ImageBitmap, text: string) {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw on the picture.');

  ctx.drawImage(bitmap, 0, 0, width, height);

  const side = Math.max(width, height);
  const fontSize = Math.round(Math.min(72, Math.max(16, side * 0.05)));
  const margin = Math.round(side * 0.03);
  const padX = Math.round(fontSize * 0.42);
  const padY = Math.round(fontSize * 0.26);

  ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  const textWidth = ctx.measureText(text).width;
  const boxWidth = textWidth + padX * 2;
  const boxHeight = fontSize + padY * 2;
  const x = width - margin - boxWidth;
  const y = margin;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = fontSize * 0.35;
  ctx.shadowOffsetY = Math.max(1, fontSize * 0.05);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.62)';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, boxWidth, boxHeight, Math.round(fontSize * 0.3));
  else ctx.rect(x, y, boxWidth, boxHeight);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, Math.round(x + padX), Math.round(y + padY));
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('This browser cannot encode the picture.'))),
      'image/jpeg',
      quality,
    );
  });
}

async function downloadBitmap(url: string, signal: AbortSignal): Promise<ImageBitmap> {
  const res = await fetch(url, { mode: 'cors', signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

/**
 * One image, one lane: download, stamp the label top-right, re-encode at falling quality until
 * the blob fits the bucket cap, push it straight to B2. Resolves to the stored object key, or
 * null when the picture could not be had — the variant then just has no photo.
 */
async function produceVariantImage(
  canvas: HTMLCanvasElement,
  url: string,
  label: string,
  businessId: string,
  signal: AbortSignal,
  onUploaded: () => void,
): Promise<string | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await downloadBitmap(url, signal);
  } catch {
    return null;
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    stamp(canvas, bitmap, label);

    let lastError: Error | null = null;
    for (const quality of QUALITIES) {
      const blob = await canvasToBlob(canvas, quality);
      if (blob.size > BUCKET_LIMIT_BYTES) {
        lastError = new Error('Image too large');
        continue;
      }
      const file = new File([blob], `${label}.jpg`, { type: 'image/jpeg' });
      try {
        const { key } = await uploadVariantImageDirect(businessId, file);
        onUploaded();
        return key;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Upload failed');
      }
    }
    throw lastError ?? new Error('Image too large');
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}

async function postImportPage(
  businessId: string,
  products: Array<ReturnType<typeof payloadFor>>,
  signal: AbortSignal,
): Promise<{ created: Array<{ id: string; name: string; slug: string; variantLabels: string[] }>; failed: Array<{ name: string; slug: string | null; error: string }>; relabeledCount: number }> {
  const res = await fetch(`/api/products/bulk-import?businessId=${encodeURIComponent(businessId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ products }),
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && typeof data.error === 'string' && data.error) || `Import page failed (${res.status})`);
  }
  return data;
}

function payloadFor(product: LabeledProduct) {
  return {
    name: product.name,
    description: product.description?.slice(0, 100000) ?? undefined,
    price: product.price ?? 0,
    slug: slugify(product.handle) || slugify(product.name) || undefined,
    sku: product.sku.slice(0, 100),
    tags: product.tags,
    showInStorefront: product.showInStorefront,
    variants: product.variants.map((v) => ({
      name: v.name.slice(0, 255),
      variantId: v.label,
      options: v.options,
      imageUrls: v.imageKey ? [v.imageKey] : [],
      ...(v.price !== null && v.price > 0 ? { price: v.price } : {}),
      stock: v.qty,
      isAvailable: true,
    })),
  };
}

export async function importShopifyCsv(opts: {
  file: File;
  businessId: string;
  onState: (state: ImportState) => void;
  signal: AbortSignal;
}): Promise<ImportState> {
  const { file, businessId, onState, signal } = opts;
  const state: ImportState = { ...initialImportState, totalBytes: file.size };
  const update = () => onState({ ...state });

  // Phase 1 — stream the CSV, keeping only product metas in memory.
  const products: ParsedProduct[] = [];
  await new Promise<void>((resolve, reject) => {
    const stopParser = parseShopifyCsv(file, {
      onProduct: (product) => {
        products.push(product);
        state.totalProducts = products.length;
        state.totalVariants += product.variants.length;
      },
      onProgress: (fraction, bytesRead) => {
        state.parseFraction = fraction;
        state.bytesRead = bytesRead;
        update();
      },
      onComplete: () => resolve(),
      onError: (err) => reject(err),
    });
    signal.addEventListener(
      'abort',
      () => {
        stopParser();
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  }).catch((err) => {
    if (err instanceof DOMException && err.name === 'AbortError') {
      state.phase = 'aborted';
      return Promise.resolve();
    }
    state.phase = 'error';
    state.errorMessage = err instanceof Error ? err.message : 'Could not read the CSV';
    return Promise.resolve();
  });

  if (state.phase !== 'parsing') return state;
  if (products.length === 0) {
    state.phase = 'error';
    state.errorMessage = 'No products found in this CSV.';
    return state;
  }
  state.parseFraction = 1;
  state.bytesRead = file.size;
  state.phase = 'importing';
  update();

  // The label each variant will carry is decided up front — the same generator the server's CRUD
  // uses — because the label has to be drawn onto the photo before anything is uploaded.
  const used = new Set<string>();
  const labeled: LabeledProduct[] = products.map((product) => ({
    ...product,
    variants: product.variants.map((variant) => {
      let label = makeVariantId();
      while (used.has(label)) label = makeVariantId();
      used.add(label);
      return { ...variant, label, imageKey: null };
    }),
  }));

  const canvases = Array.from({ length: CANVAS_LANES }, () => document.createElement('canvas'));
  const throwIfAborted = () => {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  };

  try {
    for (let pageStart = 0; pageStart < labeled.length; pageStart += PAGE_SIZE) {
      const page = labeled.slice(pageStart, pageStart + PAGE_SIZE);

      for (const product of page) {
        throwIfAborted();
        state.currentName = product.name;
        update();

        // Four lanes: variants needing a photo flow through four canvases in parallel.
        const jobs = product.variants
          .map((variant) => ({ variant, url: variant.imageUrl ?? product.images[0]?.url ?? null }))
          .filter((job): job is { variant: LabeledVariant; url: string } => !!job.url);
        let next = 0;
        const lanes = Array.from({ length: Math.min(CANVAS_LANES, jobs.length) }, (_, lane) =>
          (async () => {
            while (next < jobs.length) {
              const { variant, url } = jobs[next++];
              const key = await produceVariantImage(
                canvases[lane],
                url,
                variant.label,
                businessId,
                signal,
                () => {
                  state.imagesUploaded++;
                  update();
                },
              );
              variant.imageKey = key;
              if (!key) state.imagesFailed++;
            }
          })(),
        );
        await Promise.all(lanes);

        state.processedProducts++;
        update();
      }

      const result = await postImportPage(
        businessId,
        page.map(payloadFor),
        signal,
      );
      state.createdProducts += result.created.length;
      state.failedProducts.push(...result.failed);
      state.relabeledCount += result.relabeledCount;
      update();
    }

    state.phase = 'done';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      state.phase = 'aborted';
    } else {
      state.phase = 'error';
      state.errorMessage =
        err instanceof Error ? err.message : 'The import failed partway through';
    }
  }
  update();
  return state;
}
