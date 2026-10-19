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

function variantFrom(row: ShopifyRow, productName: string, optionNames: string[]): ParsedVariant {
  const options: Record<string, string> = {};
  const values: string[] = [];
  for (const i of [1, 2, 3]) {
    const value = optionValue(row, i);
    if (!value) continue;
    // Shopify's single-variant products ship as Option1 Name "Title", Value "Default Title".
    if (value.toLowerCase() === 'default title') continue;
    // Option names are only guaranteed on the product's first row; later variant rows can carry
    // values with blank names, so the name is inherited from there.
    const name = optionName(row, i) || optionNames[i - 1] || `Option ${i}`;
    if (name.toLowerCase() === 'title') continue;
    options[name] = value;
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
  const optionNames = [1, 2, 3].map((i) => optionName(meta, i));
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
    if (isVariantRow(row)) variants.push(variantFrom(row, name, optionNames));
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
  onProgress?: (fraction: number, bytesRead: number) => void;
  onComplete: (summary: { products: number; variants: number }) => void;
  onError: (error: Error) => void;
}

/**
 * Parses a Shopify product CSV by streaming the file through a quote-aware state machine,
 * calling `onProduct` as each handle's run of rows completes. Built in-house rather than on
 * Papa's chunk mode on purpose: Papa defers an unterminated row into an ever-growing partial
 * buffer and re-scans it on every chunk, so one stray quote in a merchant's copy makes a large
 * export stall mid-file. This reader degrades instead — an unclosed quoted field just ends at
 * the file's end — so dirty data costs one odd row, never the whole import. Memory stays
 * bounded: only the current field, the current row, and the current handle's rows are held.
 *
 * Returns an abort function that cancels the underlying stream.
 */
export function parseShopifyCsv(file: File, handlers: ShopifyCsvHandlers): () => void {
  let currentHandle: string | null = null;
  let currentRows: ShopifyRow[] = [];
  let productCount = 0;
  let variantCount = 0;
  let failed = false;
  let stopped = false;
  let headers: string[] | null = null;

  const flush = () => {
    if (currentRows.length === 0) return;
    const product = groupProduct(currentRows);
    currentRows = [];
    productCount++;
    variantCount += product.variants.length;
    handlers.onProduct(product);
  };

  /** Hands one complete data row to the handle-grouping logic. */
  const emitRow = (row: string[]) => {
    if (stopped || failed) return;
    if (row.every((value) => value === '')) return;
    if (headers === null) {
      headers = row.map(normalizeHeader);
      if (!headers.includes('handle')) {
        failed = true;
        handlers.onError(new Error('This file has no "Handle" column — is it a Shopify products CSV?'));
      }
      return;
    }
    const normalized: ShopifyRow = {};
    for (let i = 0; i < headers.length && i < row.length; i++) {
      if (headers[i] !== '') normalized[headers[i]] = row[i] ?? '';
    }
    const rowHandle = (normalized['handle'] ?? '').trim();
    if (!rowHandle) return;
    if (rowHandle !== currentHandle) {
      flush();
      currentHandle = rowHandle;
    }
    currentRows.push(normalized);
  };

  const enum FieldState {
    Start,
    Unquoted,
    Quoted,
    QuoteClosed,
  }
  let state: FieldState = FieldState.Start;
  let field = '';
  let row: string[] = [];
  let pendingCR = false;

  const endRow = () => {
    row.push(field);
    field = '';
    state = FieldState.Start;
    emitRow(row);
    row = [];
  };

  /** Nearest delimiter or newline at or after `from`, or past-the-end when the chunk ends first. */
  const nextTerm = (text: string, from: number): number => {
    const delim = text.indexOf(',', from);
    const nl = text.indexOf('\n', from);
    const cr = text.indexOf('\r', from);
    return Math.min(delim === -1 ? text.length : delim, nl === -1 ? text.length : nl, cr === -1 ? text.length : cr);
  };

  const feed = (text: string) => {
    let i = 0;
    const n = text.length;
    // A CR that ended the last chunk may be the first half of a CRLF pair.
    if (pendingCR) {
      pendingCR = false;
      if (text[0] === '\n') i = 1;
    }
    while (i < n) {
      if (state === FieldState.Quoted) {
        const q = text.indexOf('"', i);
        if (q === -1) {
          field += text.slice(i);
          i = n;
          break;
        }
        if (text[q + 1] === '"') {
          field += text.slice(i, q + 1);
          i = q + 2;
          continue;
        }
        field += text.slice(i, q);
        state = FieldState.QuoteClosed;
        i = q + 1;
        continue;
      }
      // A quote the field starts with opens a quoted field (that quote is not data).
      if (state === FieldState.Start && text[i] === '"') {
        state = FieldState.Quoted;
        i++;
        continue;
      }
      const d = nextTerm(text, i);
      if (d >= n) {
        if (state !== FieldState.QuoteClosed) field += text.slice(i);
        i = n;
        break;
      }
      // Anything between a closing quote and the delimiter is tolerated junk, not data.
      if (state !== FieldState.QuoteClosed) field += text.slice(i, d);
      if (text[d] === '\r' || text[d] === '\n') {
        endRow();
        if (text[d] === '\r') pendingCR = true;
      } else {
        row.push(field);
        field = '';
        state = FieldState.Start;
      }
      i = d + 1;
    }
  };

  const finish = () => {
    // A file ending inside a quoted field just loses the closing quote; the field still lands.
    if (state === FieldState.Quoted || state === FieldState.QuoteClosed || field !== '' || row.length > 0) {
      row.push(field);
      field = '';
      state = FieldState.Start;
      emitRow(row);
      row = [];
    }
    flush();
    handlers.onProgress?.(1, bytes);
    handlers.onComplete({ products: productCount, variants: variantCount });
  };

  // Sliced Blob reads rather than file.stream(): every browser with a File can slice and decode a
  // buffer, and a bad content-provider stream cannot wedge the import. One megabyte is the whole
  // read window, so memory stays flat whatever the export's size.
  const SLICE_BYTES = 1024 * 1024;
  const STALL_MS = 20_000;
  const decoder = new TextDecoder('utf-8');
  let bytes = 0;
  let bomStripped = false;
  let lastActivity = Date.now();

  const watchdog = setInterval(() => {
    if (stopped || failed) return;
    if (Date.now() - lastActivity <= STALL_MS) return;
    failed = true;
    clearInterval(watchdog);
    handlers.onError(
      new Error(
        `The browser stopped reading the file after ${(bytes / (1024 * 1024)).toFixed(1)} MB. Re-save the CSV on the device and pick it again — a locally stored copy avoids provider-backed files that stall.`,
      ),
    );
  }, 2000);

  const pump = async () => {
    try {
      while (bytes < file.size && !stopped && !failed) {
        const slice = file.slice(bytes, Math.min(bytes + SLICE_BYTES, file.size));
        const buffer = await slice.arrayBuffer();
        if (stopped || failed) break;
        if (buffer.byteLength === 0) break;
        bytes += buffer.byteLength;
        lastActivity = Date.now();
        let text = decoder.decode(new Uint8Array(buffer), { stream: true });
        if (!bomStripped) {
          bomStripped = true;
          if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
        }
        feed(text);
        if (file.size > 0) handlers.onProgress?.(Math.min(0.99, bytes / file.size), bytes);
      }
      clearInterval(watchdog);
      if (stopped || failed) return;
      feed(decoder.decode());
      finish();
    } catch (err) {
      clearInterval(watchdog);
      if (stopped || failed) return;
      failed = true;
      handlers.onError(new Error(`Could not read the CSV: ${err instanceof Error ? err.message : 'read failed'}`));
    }
  };
  void pump();

  return () => {
    stopped = true;
    clearInterval(watchdog);
  };
}
