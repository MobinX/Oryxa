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
/** Eight canvases edit in parallel; eight PUTs upload in parallel. */
const CANVAS_LANES = 8;
const UPLOAD_LANES = 8;
/** A batch is stamped whole before any of its bytes leave the tab — two pictures per lane. */
const IMAGE_WAVE = CANVAS_LANES * 2;
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
  /** One stored key per source image, in the CSV's order; holes are pictures that failed. */
  imageKeys: Array<string | null>;
}

interface LabeledProduct {
  handle: string;
  name: string;
  description: string | null;
  tags: string[];
  showInStorefront: boolean;
  category: string | null;
  slug: string | null;
  discountPercent: number;
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
 * One image, one canvas: download, stamp the label top-right, re-encode at falling quality until
 * the blob fits the bucket cap. Resolves to the finished bytes, or null when the picture could not
 * be had — the variant then just has one fewer photo.
 */
async function stampVariantImage(
  canvas: HTMLCanvasElement,
  url: string,
  label: string,
  signal: AbortSignal,
): Promise<Blob | null> {
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

    for (const quality of QUALITIES) {
      const blob = await canvasToBlob(canvas, quality);
      if (blob.size <= BUCKET_LIMIT_BYTES) return blob;
    }
    return null;
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}

/** Pushes one stamped picture straight to B2 and returns its object key. */
async function uploadStampedImage(
  businessId: string,
  label: string,
  slot: number,
  blob: Blob,
): Promise<string> {
  const file = new File([blob], `${label}-${slot + 1}.jpg`, { type: 'image/jpeg' });
  const { key } = await uploadVariantImageDirect(businessId, file);
  return key;
}

/** Runs `task` over `items` on at most `lanes` parallel workers. */
async function runPool<T>(
  items: T[],
  lanes: number,
  task: (item: T, lane: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(lanes, items.length) }, (_, lane) =>
      (async () => {
        while (next < items.length) {
          const item = items[next++];
          await task(item, lane);
        }
      })(),
    ),
  );
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
    // Only an explicit slug crosses the wire; without one the server derives it from the name
    // and walks suffixes until it is free.
    ...(product.slug ? { slug: slugify(product.slug) || undefined } : {}),
    sku: product.sku.slice(0, 100),
    tags: product.tags,
    showInStorefront: product.showInStorefront,
    ...(product.discountPercent > 0 ? { discountPercent: product.discountPercent } : {}),
    ...(product.category ? { categoryName: product.category.slice(0, 255) } : {}),
    variants: product.variants.map((v) => ({
      name: v.name.slice(0, 255),
      variantId: v.label,
      options: v.options,
      imageUrls: v.imageKeys.filter((key): key is string => !!key).slice(0, 10),
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
  const state: ImportState = {
    ...initialImportState,
    totalBytes: file.size,
    failedProducts: [],
  };
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
    } else {
      state.phase = 'error';
      state.errorMessage = err instanceof Error ? err.message : 'Could not read the CSV';
    }
    // The dialog only ever sees pulled states, so a terminal state has to be pushed too.
    update();
    return Promise.resolve();
  });

  if (state.phase !== 'parsing') return state;
  if (products.length === 0) {
    state.phase = 'error';
    state.errorMessage = 'No products found in this CSV.';
    update();
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
      return { ...variant, label, imageKeys: [] };
    }),
  }));

  const canvases = Array.from({ length: CANVAS_LANES }, () => document.createElement('canvas'));
  const throwIfAborted = () => {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  };

  try {
    for (let pageStart = 0; pageStart < labeled.length; pageStart += PAGE_SIZE) {
      const page = labeled.slice(pageStart, pageStart + PAGE_SIZE);

      // Every picture of the page, from every product and variant, in one queue. A variant's own
      // image list wins; otherwise the product's first image is its picture (the Shopify layout,
      // where one product photo serves all variants).
      const jobs = page.flatMap((product) =>
        product.variants.flatMap((variant) => {
          const sources =
            variant.imageUrls.length > 0
              ? variant.imageUrls
              : product.images[0]
                ? [product.images[0].url]
                : [];
          return sources.slice(0, 10).map((url, slot) => ({ product, variant, url, slot }));
        }),
      );

      // Edit-then-upload waves: a wave is stamped whole on the eight canvases in parallel, then
      // pushed to B2 on eight parallel PUTs. Only one wave's blobs are ever held in memory.
      for (let waveStart = 0; waveStart < jobs.length; waveStart += IMAGE_WAVE) {
        throwIfAborted();
        const wave = jobs.slice(waveStart, waveStart + IMAGE_WAVE);
        const stamped: Array<{ job: (typeof wave)[number]; blob: Blob }> = [];

        await runPool(wave, CANVAS_LANES, async (job, lane) => {
          state.currentName = job.product.name;
          const blob = await stampVariantImage(canvases[lane], job.url, job.variant.label, signal);
          if (blob) stamped.push({ job, blob });
          else state.imagesFailed++;
        });
        update();

        await runPool(stamped, UPLOAD_LANES, async ({ job, blob }) => {
          try {
            const key = await uploadStampedImage(businessId, job.variant.label, job.slot, blob);
            job.variant.imageKeys[job.slot] = key;
            state.imagesUploaded++;
          } catch {
            state.imagesFailed++;
          }
          update();
        });
      }

      state.processedProducts += page.length;
      state.currentName = page[page.length - 1]?.name ?? state.currentName;
      update();

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
