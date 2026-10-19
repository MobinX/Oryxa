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

/**
 * The compact template's header, in order. Shared with the import dialog so a merchant sees the
 * exact columns before picking a file. One row per variant; product fields live on the product's
 * first row, continuation rows leave them blank; variant images are `|`-separated URLs.
 */
export const COMPACT_CSV_HEADERS = [
  'Product Name',
  'URL Slug',
  'SKU',
  'Price',
  'Discount Percent',
  'Description',
  'Tags',
  'Category',
  'Show In Store',
  'Option 1 Name',
  'Option 1 Values',
  'Option 2 Name',
  'Option 2 Values',
  'Option 3 Name',
  'Option 3 Values',
  'Variant SKU',
  'Option 1 Value',
  'Option 2 Value',
  'Option 3 Value',
  'Variant Price',
  'Variant Stock',
  'Variant Images',
] as const;

/** Which compact columns a merchant must fill, and what happens when they leave one empty. */
export const COMPACT_CSV_GUIDE: Array<{
  name: (typeof COMPACT_CSV_HEADERS)[number];
  requirement: 'required' | 'optional';
  note: string;
}> = [
  { name: 'Product Name', requirement: 'required', note: 'Opens a product; blank on continuation rows.' },
  { name: 'URL Slug', requirement: 'optional', note: 'From the name when empty; -2, -3… if taken.' },
  { name: 'SKU', requirement: 'optional', note: "Falls back to the first variant's SKU." },
  { name: 'Price', requirement: 'required', note: 'Product price; variants may override.' },
  { name: 'Discount Percent', requirement: 'optional', note: 'Default 0 — no discount.' },
  { name: 'Description', requirement: 'optional', note: 'Plain text or HTML.' },
  { name: 'Tags', requirement: 'optional', note: 'Comma-separated.' },
  { name: 'Category', requirement: 'optional', note: 'Created automatically when missing.' },
  { name: 'Show In Store', requirement: 'optional', note: 'Default TRUE.' },
  { name: 'Option 1 Name', requirement: 'optional', note: 'Up to three options per product.' },
  { name: 'Option 1 Values', requirement: 'optional', note: 'Values separated by |.' },
  { name: 'Option 2 Name', requirement: 'optional', note: '' },
  { name: 'Option 2 Values', requirement: 'optional', note: 'Values separated by |.' },
  { name: 'Option 3 Name', requirement: 'optional', note: '' },
  { name: 'Option 3 Values', requirement: 'optional', note: 'Values separated by |.' },
  { name: 'Variant SKU', requirement: 'optional', note: '' },
  { name: 'Option 1 Value', requirement: 'optional', note: "This variant's value for option 1." },
  { name: 'Option 2 Value', requirement: 'optional', note: "This variant's value for option 2." },
  { name: 'Option 3 Value', requirement: 'optional', note: "This variant's value for option 3." },
  { name: 'Variant Price', requirement: 'optional', note: 'Default: the product Price.' },
  { name: 'Variant Stock', requirement: 'optional', note: 'Default 0.' },
  { name: 'Variant Images', requirement: 'optional', note: 'URLs separated by |; each gets the short id.' },
];

function exampleLine(cells: readonly string[]): string {
  return cells
    .map((cell) => (/[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
    .join(',');
}

/** A paste-ready sample: one two-variant product, then one minimal product showing the defaults. */
export const COMPACT_CSV_EXAMPLE = [
  exampleLine(COMPACT_CSV_HEADERS),
  exampleLine([
    'Classic Tee', '', 'TEE-1', '25', '10', 'A soft cotton tee', 'clothing, men', 'Apparel', 'TRUE',
    'Size', 'Small | Large', 'Color', 'Red | Blue', '', '',
    'TEE-S-R', 'Small', 'Red', '', '24', '10',
    'https://cdn.example.com/tee-red-front.jpg | https://cdn.example.com/tee-red-back.jpg',
  ]),
  exampleLine([
    '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
    'TEE-L-B', 'Large', 'Blue', '', '', '5', 'https://cdn.example.com/tee-blue.jpg',
  ]),
  exampleLine([
    'Poster', '', 'POS-1', '15', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
  ]),
].join('\n');

/**
 * A paste-ready instruction for an assistant holding a merchant's own CSV: convert it into the
 * compact template and reply with nothing else. Built from the same header, guide and example the
 * importer reads, so it cannot describe a column the parser does not understand.
 */
export const COMPACT_CSV_PROMPT = [
  'Convert my attached product CSV into a single CSV using the exact format below.',
  'Reply with only the converted CSV — no explanations and no markdown fences.',
  '',
  'Header (exact column names, in this order):',
  COMPACT_CSV_HEADERS.join(','),
  '',
  'Rules:',
  '- One row per variant. Product fields (Product Name through Option 3 Values) appear only on the first row of each product; continuation rows leave those cells empty.',
  '- Product Name and Price are required; every other cell may be left empty.',
  '- Option values in "Option N Values" and image URLs in "Variant Images" are separated by " | " (space-pipe-space).',
  '- Write each variant\'s choices in "Option N Value"; a product with no options contributes a single row with the option columns empty.',
  '- Quote any cell containing a comma, double quote, or newline, and escape a double quote by doubling it.',
  '- Never invent data: leave a cell empty when the source has no value, and keep every product from the source.',
  '- Empty cells fall back to these defaults: URL Slug is generated from Product Name (made unique); SKU falls back to the first variant SKU; Discount Percent = 0; Category is created if missing; Show In Store = TRUE; Variant Price = product Price; Variant Stock = 0.',
  '',
  'Column guide:',
  ...COMPACT_CSV_GUIDE.map(
    (column) => `- ${column.name} (${column.requirement})${column.note ? `: ${column.note}` : ''}`,
  ),
  '',
  'Example:',
  COMPACT_CSV_EXAMPLE,
].join('\n');

export interface ParsedVariant {
  name: string;
  sku: string;
  price: number | null;
  qty: number;
  options: Record<string, string>;
  /** Every picture for this variant, cover first. The importer stamps each with the short id. */
  imageUrls: string[];
}

export interface ParsedProduct {
  handle: string;
  name: string;
  description: string | null;
  tags: string[];
  showInStorefront: boolean;
  /** The merchant's Type when present, else the leaf of Shopify's product category taxonomy. */
  category: string | null;
  /** An explicit slug (Shopify handle or compact URL Slug); null means "derive and make unique". */
  slug: string | null;
  discountPercent: number;
  sku: string;
  price: number | null;
  images: Array<{ url: string; position: number }>;
  variants: ParsedVariant[];
}

// Shopify's 2025+ export template leads with Title and calls the handle "URL handle"; older
// exports lead with Handle. Both are read, along with both vintages of every renamed column.
const HANDLE_ALIASES = ['urlhandle', 'handle'];
const TITLE_ALIASES = ['title'];
const BODY_ALIASES = ['description', 'bodyhtml', 'body'];
const TAGS_ALIASES = ['tags'];
const PUBLISHED_ALIASES = ['publishedononlinestore', 'published'];
const STATUS_ALIASES = ['status'];
const TYPE_ALIASES = ['type'];
const PRODUCT_CATEGORY_ALIASES = ['productcategory'];
const VARIANT_SKU_ALIASES = ['sku', 'variantsku'];
const VARIANT_PRICE_ALIASES = ['price', 'variantprice'];
const VARIANT_QTY_ALIASES = ['inventoryquantity', 'variantinventoryqty'];
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
  let cleaned = raw.trim();
  if (cleaned.includes(',')) {
    if (cleaned.includes('.')) {
      // Both separators: dotted thousands and comma decimals ("1.234,56"), or a comma group.
      cleaned = /,\d{1,2}$/.test(cleaned)
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
    } else {
      // Comma alone is a decimal comma ("10,50") unless it is a thousands group ("1,234").
      cleaned = /,\d{2}$/.test(cleaned) ? cleaned.replace(/,/g, '.') : cleaned.replace(/,/g, '');
    }
  }
  cleaned = cleaned.replace(/[^0-9.]/g, '');
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
    imageUrls: cell(row, VARIANT_IMAGE_ALIASES) ? [cell(row, VARIANT_IMAGE_ALIASES)] : [],
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
      imageUrls: images[0] ? [images[0].url] : [],
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
    // "Type" is the merchant's own word for the shelf ("Graphic shirt"); the taxonomy is the
    // fallback, boiled down to its last stop ("... > T-Shirts" → "T-Shirts") so the shelf is a
    // name a human would use.
    category:
      cell(meta, TYPE_ALIASES).slice(0, 255) ||
      cell(meta, PRODUCT_CATEGORY_ALIASES)
        .split('>')
        .map((part) => part.trim())
        .filter(Boolean)
        .pop()
        ?.slice(0, 255) ||
      null,
    slug: cell(meta, HANDLE_ALIASES) || null,
    discountPercent: 0,
    sku: variants[0]?.sku ?? '',
    price: variants[0]?.price ?? null,
    images,
    variants,
  };
}

/**
 * Which compact-template row carries a variant: any variant cell is filled. Product-only rows
 * (the head of a product that itemizes no variant) are not variants on their own.
 */
function isCompactVariantRow(row: ShopifyRow): boolean {
  return (
    [
      'variantsku',
      'option1value',
      'option2value',
      'option3value',
      'variantprice',
      'variantstock',
      'variantimages',
    ].some((key) => (row[key] ?? '').trim() !== '')
  );
}

/**
 * Folds one product's compact rows into the same shape the Shopify reader produces. Option names
 * come from the product row (`Option 1 Name`); values come from each variant row, and image cells
 * hold one or more `|`-separated URLs.
 */
export function groupCompactProduct(rows: ShopifyRow[]): ParsedProduct {
  const meta = rows.find((row) => (row['productname'] ?? '').trim() !== '') ?? rows[0];
  const name = (meta['productname'] ?? '').trim() || 'Untitled product';
  const optionNames = [1, 2, 3].map((i) => (meta[`option${i}name`] ?? '').trim());

  const variants: ParsedVariant[] = [];
  for (const row of rows) {
    if (!isCompactVariantRow(row)) continue;
    const options: Record<string, string> = {};
    const values: string[] = [];
    for (const i of [1, 2, 3]) {
      const value = (row[`option${i}value`] ?? '').trim();
      if (!value) continue;
      if (value.toLowerCase() === 'default title') continue;
      const optionName = (row[`option${i}name`] ?? '').trim() || optionNames[i - 1] || `Option ${i}`;
      if (optionName.toLowerCase() === 'title') continue;
      options[optionName] = value;
      values.push(value);
    }
    variants.push({
      name: values.length > 0 ? values.join(' / ') : name,
      sku: (row['variantsku'] ?? '').trim(),
      price: parsePrice(row['variantprice'] ?? ''),
      qty: parseQty(row['variantstock'] ?? ''),
      options,
      imageUrls: (row['variantimages'] ?? '')
        .split('|')
        .map((url) => url.trim())
        .filter((url) => /^https?:\/\//i.test(url)),
    });
  }

  if (variants.length === 0) {
    variants.push({ name, sku: '', price: null, qty: 0, options: {}, imageUrls: [] });
  }

  const showRaw = (meta['showinstore'] ?? '').trim().toLowerCase();
  const showInStorefront = showRaw ? ['true', '1', 'yes', 'y'].includes(showRaw) : true;
  const discount = Number.parseFloat((meta['discountpercent'] ?? '').replace(/[^0-9.]/g, ''));
  const price = parsePrice(meta['price'] ?? '');

  return {
    handle: '',
    name: name.slice(0, 255),
    description: (meta['description'] ?? '').trim() || null,
    tags: (meta['tags'] ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .slice(0, 20),
    showInStorefront,
    category: (meta['category'] ?? '').trim().slice(0, 255) || null,
    slug: (meta['urlslug'] ?? '').trim() || null,
    discountPercent: Number.isFinite(discount) ? Math.max(0, Math.min(100, discount)) : 0,
    sku: ((meta['sku'] ?? '').trim() || variants[0]?.sku || '').slice(0, 100),
    price: price ?? variants[0]?.price ?? null,
    images: [],
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
  let compactName: string | null = null;
  let compactRows: ShopifyRow[] = [];
  let format: 'shopify' | 'compact' | null = null;
  let productCount = 0;
  let variantCount = 0;
  let failed = false;
  let stopped = false;
  let headers: string[] | null = null;

  const flush = () => {
    const rows = format === 'compact' ? compactRows : currentRows;
    if (rows.length === 0) return;
    const product = format === 'compact' ? groupCompactProduct(rows) : groupProduct(rows);
    if (format === 'compact') {
      compactRows = [];
      compactName = null;
    } else {
      currentRows = [];
    }
    productCount++;
    variantCount += product.variants.length;
    handlers.onProduct(product);
  };

  /**
   * Hands one complete data row to the handle-grouping logic. A first row that is not a header
   * names exactly what was found, because "no Handle" usually means the file was re-saved with
   * another delimiter or is not a Products export at all.
   */
  const emitRow = (row: string[]) => {
    if (stopped || failed) return;
    if (row.every((value) => value === '')) return;
    if (headers === null) {
      // Excel sometimes prefixes CSV with its own separator hint ("sep=," or "sep=;") — the
      // delimiter itself is consumed by the split, so the cell usually reads "sep=".
      if (/^sep=[,;\t]?$/i.test(row[0].trim()) && row.slice(1).every((value) => value === '')) return;
      headers = row.map(normalizeHeader);
      if (headers.includes('handle') || headers.includes('urlhandle')) format = 'shopify';
      else if (headers.includes('productname')) format = 'compact';
      if (format === null) {
        failed = true;
        const seen = row.slice(0, 6).map((value) => value.trim()).filter(Boolean).join(', ').slice(0, 140);
        handlers.onError(
          new Error(
            `This CSV is not a supported format. Upload a Shopify product export (a "Handle" or "URL handle" column) or the compact Oryxa template (a "Product Name" column — its header is shown in the import dialog). Its first row reads: "${seen}".`,
          ),
        );
      }
      return;
    }
    const normalized: ShopifyRow = {};
    for (let i = 0; i < headers.length && i < row.length; i++) {
      if (headers[i] !== '') normalized[headers[i]] = row[i] ?? '';
    }
    if (format === 'compact') {
      // A named row opens a product; unnamed rows continue it. Repeating the name on every row
      // works too — consecutive rows of the same product are one group either way.
      const rowName = (normalized['productname'] ?? '').trim();
      if (!rowName && compactRows.length === 0) return;
      if (rowName && compactRows.length > 0 && rowName !== compactName) flush();
      if (rowName) compactName = rowName;
      compactRows.push(normalized);
      return;
    }
    const rowHandle = (normalized['handle'] ?? normalized['urlhandle'] ?? '').trim();
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
  // Shopify writes commas, but a file that went through Excel/Sheets often comes back with the
  // separator of the machine's locale — semicolons in much of Europe, tabs from a "text" save.
  let delimiter = ',';

  const endRow = () => {
    row.push(field);
    field = '';
    state = FieldState.Start;
    emitRow(row);
    row = [];
  };

  /** Nearest delimiter or newline at or after `from`, or past-the-end when the chunk ends first. */
  const nextTerm = (text: string, from: number): number => {
    const delim = text.indexOf(delimiter, from);
    const nl = text.indexOf('\n', from);
    const cr = text.indexOf('\r', from);
    return Math.min(delim === -1 ? text.length : delim, nl === -1 ? text.length : nl, cr === -1 ? text.length : cr);
  };

  /** Picks the separator from the first line, counting only characters outside quotes. */
  const sniffDelimiter = (text: string): void => {
    const end = text.search(/[\r\n]/);
    const line = end === -1 ? text : text.slice(0, end);
    let comma = 0;
    let semicolon = 0;
    let tab = 0;
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') quoted = !quoted;
      else if (!quoted && ch === ',') comma++;
      else if (!quoted && ch === ';') semicolon++;
      else if (!quoted && ch === '\t') tab++;
    }
    if (comma >= semicolon && comma >= tab && comma > 0) delimiter = ',';
    else if (semicolon >= tab && semicolon > 0) delimiter = ';';
    else if (tab > 0) delimiter = '\t';
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
  let decoder = new TextDecoder('utf-8');
  let encodingChosen = false;
  let sniffed = false;
  let prelude = '';
  let headerDone = false;
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
        if (!encodingChosen) {
          encodingChosen = true;
          const head = new Uint8Array(buffer);
          // Excel's "Unicode text" save: UTF-16 with a byte-order mark.
          if (head[0] === 0xff && head[1] === 0xfe) decoder = new TextDecoder('utf-16le');
          else if (head[0] === 0xfe && head[1] === 0xff) decoder = new TextDecoder('utf-16be');
        }
        let text = decoder.decode(new Uint8Array(buffer), { stream: true });
        if (!bomStripped) {
          bomStripped = true;
          if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
        }
        if (!sniffed && text.length > 0) {
          sniffed = true;
          sniffDelimiter(text);
        }
        let toFeed = text;
        if (!headerDone) {
          prelude += text;
          const nl = prelude.search(/[\r\n]/);
          if (nl === -1 && prelude.length < 1_000_000) {
            if (file.size > 0) handlers.onProgress?.(Math.min(0.99, bytes / file.size), bytes);
            continue;
          }
          headerDone = true;
          const headerLine = nl === -1 ? prelude : prelude.slice(0, nl);
          toFeed = nl === -1 ? '' : prelude.slice(nl);
          prelude = '';
          // Header cells never contain the delimiter, so quote characters on this line are
          // artifacts of an export that wrapped or escaped the first cell oddly
          // (`"""""""" Title,URL handle,...`) — dropping them recovers the real names.
          emitRow(headerLine.replace(/"/g, '').split(delimiter).map((cell) => cell.trim()));
        }
        if (toFeed) feed(toFeed);
        if (file.size > 0) handlers.onProgress?.(Math.min(0.99, bytes / file.size), bytes);
      }
      clearInterval(watchdog);
      if (stopped || failed) return;
      if (!headerDone && prelude) {
        emitRow(prelude.replace(/"/g, '').split(delimiter).map((cell) => cell.trim()));
        prelude = '';
      }
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
