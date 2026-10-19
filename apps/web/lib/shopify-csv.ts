import Papa from 'papaparse';

/**
 * Streaming reader for Shopify product export CSVs.
 *
 * Shopify writes one product as a run of consecutive rows sharing a Handle: the first row carries
 * the product fields, every variant is a row of option values plus its own SKU/price, and any
 * extra images trail at the end as rows with only Handle + Image Src + Position. The current
 * export calls the image columns "Product Image URL" / "Variant Image URL"; older exports said
 * "Image Src" / "Variant Image" — both are accepted.
 *
 * The file is parsed in chunks and products are emitted as soon as their run of rows ends, so a
 * multi-hundred-megabyte export never has to sit in memory at once.
 */

export type ShopifyRow = Record<string, string | undefined>;

export interface ParsedVariant {
  name: string;
  sku: string;
  price: number | null;
  qty: number;
  options: Record<string, string>;
  imageUrl: string | null;
}

export interface ParsedProduct {
  handle: string;
  name: string;
  description: string | null;
  tags: string[];
  showInStorefront: boolean;
  sku: string;
  price: number | null;
  images: Array<{ url: string; position: number }>;
  variants: ParsedVariant[];
}

const HANDLE_ALIASES = ['handle'];
const TITLE_ALIASES = ['title'];
const BODY_ALIASES = ['bodyhtml', 'body'];
const TAGS_ALIASES = ['tags'];
const PUBLISHED_ALIASES = ['published'];
const STATUS_ALIASES = ['status'];
const VARIANT_SKU_ALIASES = ['variantsku'];
const VARIANT_PRICE_ALIASES = ['variantprice'];
const VARIANT_QTY_ALIASES = ['variantinventoryqty'];
const PRODUCT_IMAGE_ALIASES = ['productimageurl', 'imagesrc'];
const IMAGE_POSITION_ALIASES = ['imageposition', 'productimageposition'];
const VARIANT_IMAGE_ALIASES = ['variantimageurl', 'variantimage'];

function normalizeHeader(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cell(row: ShopifyRow, aliases: string[]): string {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value.trim() !== '') return value.trim();
  }
  return '';
}

function optionValue(row: ShopifyRow, index: number): string {
  const value = row[`option${index}value`];
  return value ? value.trim() : '';
}

function optionName(row: ShopifyRow, index: number): string {
  const name = row[`option${index}name`];
  return name ? name.trim() : '';
}

function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseQty(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function isVariantRow(row: ShopifyRow): boolean {
  return (
    optionValue(row, 1) !== '' ||
    optionValue(row, 2) !== '' ||
    optionValue(row, 3) !== '' ||
    cell(row, VARIANT_SKU_ALIASES) !== '' ||
    cell(row, VARIANT_PRICE_ALIASES) !== ''
  );
}

function variantFrom(row: ShopifyRow, productName: string): ParsedVariant {
  const options: Record<string, string> = {};
  const values: string[] = [];
  for (const i of [1, 2, 3]) {
    const name = optionName(row, i);
    const value = optionValue(row, i);
    if (!value) continue;
    // Shopify's single-variant products ship as Option1 Name "Title", Value "Default Title".
    if (name.toLowerCase() === 'title' || value.toLowerCase() === 'default title') continue;
    if (name) options[name] = value;
    values.push(value);
  }
  return {
    name: values.length > 0 ? values.join(' / ') : productName,
    sku: cell(row, VARIANT_SKU_ALIASES),
    price: parsePrice(cell(row, VARIANT_PRICE_ALIASES)),
    qty: parseQty(cell(row, VARIANT_QTY_ALIASES)),
    options,
    imageUrl: cell(row, VARIANT_IMAGE_ALIASES) || null,
  };
}

/** Folds one handle's run of rows into a product. Always yields at least one variant. */
export function groupProduct(rows: ShopifyRow[]): ParsedProduct {
  const meta = rows[0];
  const name = cell(meta, TITLE_ALIASES) || 'Untitled product';
  const status = cell(meta, STATUS_ALIASES).toLowerCase();
  const published = cell(meta, PUBLISHED_ALIASES).toLowerCase();
  const showInStorefront = status
    ? status === 'active'
    : published
      ? published === 'true' || published === '1'
      : true;

  const images: Array<{ url: string; position: number }> = [];
  const seenUrls = new Set<string>();
  const variants: ParsedVariant[] = [];

  for (const row of rows) {
    const imageUrl = cell(row, PRODUCT_IMAGE_ALIASES);
    if (imageUrl && !seenUrls.has(imageUrl)) {
      seenUrls.add(imageUrl);
      const position = Number.parseInt(cell(row, IMAGE_POSITION_ALIASES), 10);
      images.push({ url: imageUrl, position: Number.isFinite(position) ? position : images.length + 1 });
    }
    if (isVariantRow(row)) variants.push(variantFrom(row, name));
  }

  images.sort((a, b) => a.position - b.position);

  if (variants.length === 0) {
    variants.push({
      name,
      sku: cell(meta, VARIANT_SKU_ALIASES),
      price: parsePrice(cell(meta, VARIANT_PRICE_ALIASES)),
      qty: 0,
      options: {},
      imageUrl: images[0]?.url ?? null,
    });
  }

  return {
    handle: cell(meta, HANDLE_ALIASES),
    name: name.slice(0, 255),
    description: cell(meta, BODY_ALIASES) || null,
    tags: cell(meta, TAGS_ALIASES)
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .slice(0, 20),
    showInStorefront,
    sku: variants[0]?.sku ?? '',
    price: variants[0]?.price ?? null,
    images,
    variants,
  };
}

export interface ShopifyCsvHandlers {
  onProduct: (product: ParsedProduct) => void;
  onProgress?: (fraction: number) => void;
  onComplete: (summary: { products: number; variants: number }) => void;
  onError: (error: Error) => void;
}

/**
 * Parses a Shopify product CSV in chunks, calling `onProduct` as each handle's run of rows
 * completes. Returns an abort function that stops the underlying parser.
 */
export function parseShopifyCsv(file: File, handlers: ShopifyCsvHandlers): () => void {
  let currentHandle: string | null = null;
  let currentRows: ShopifyRow[] = [];
  let productCount = 0;
  let variantCount = 0;
  let failed = false;

  const flush = () => {
    if (currentRows.length === 0) return;
    const product = groupProduct(currentRows);
    currentRows = [];
    productCount++;
    variantCount += product.variants.length;
    handlers.onProduct(product);
  };

  // Chunk-mode parsing returns the parser handle at runtime, though the typings say `void`.
  const handle = Papa.parse<ShopifyRow>(file, {
    header: true,
    skipEmptyLines: 'greedy',
    chunkSize: 1024 * 1024,
    chunk(results) {
      if (failed) return;
      if (!results.data || results.data.length === 0) return;

      const first = results.data[0];
      if (currentHandle === null && !first) return;
      const sample = results.data.find((r) => r && Object.keys(r).length > 0);
      if (sample && !Object.keys(sample).some((key) => normalizeHeader(key) === 'handle')) {
        failed = true;
        handlers.onError(new Error('This file has no "Handle" column — is it a Shopify products CSV?'));
        // Papa stops when the chunk callback flags the meta; the flag exists at runtime only.
        (results.meta as Papa.ParseMeta & { abort?: boolean }).abort = true;
        return;
      }

      for (const row of results.data) {
        if (!row) continue;
        const handle = (row['Handle'] ?? row['handle'] ?? '').trim();
        if (!handle) continue;
        const normalized: ShopifyRow = {};
        for (const [key, value] of Object.entries(row)) normalized[normalizeHeader(key)] = value;
        if (handle !== currentHandle) {
          flush();
          currentHandle = handle;
        }
        currentRows.push(normalized);
      }

      const cursor = results.meta.cursor ?? 0;
      if (file.size > 0) handlers.onProgress?.(Math.min(0.99, cursor / file.size));
    },
    complete() {
      if (failed) return;
      flush();
      handlers.onProgress?.(1);
      handlers.onComplete({ products: productCount, variants: variantCount });
    },
    error(err) {
      if (failed) return;
      failed = true;
      handlers.onError(new Error(`Could not read the CSV: ${err.message}`));
    },
  }) as unknown as { abort(): void };

  return () => handle.abort();
}
