import type { ExportProduct } from '@repo/db/crud/product';
import { toCsv } from '@/lib/api';
import { COMPACT_CSV_HEADERS } from '@/lib/shopify-csv';

/** The compact template as toCsv columns — header labels double as row keys. */
export function compactCsvColumns() {
  return COMPACT_CSV_HEADERS.map((header) => ({ key: header, label: header }));
}

/**
 * Flattens the catalog into the compact template: one row per variant, product fields on the
 * product's first row and blank on continuation rows (the importer joins blank-name rows to the
 * product above), variant images `|`-separated.
 */
export function compactCsvRows(products: ExportProduct[]): Record<string, unknown>[] {
  return products.flatMap((product) => {
    const names = product.options.map((option) => option.name).slice(0, 3);
    const values = names.map((_, i) => product.options[i]?.values.join(' | ') ?? '');
    const variants = product.variants.length > 0 ? product.variants : [null];

    return variants.map((variant, index) => ({
      'Product Name': index === 0 ? product.name : '',
      'URL Slug': index === 0 ? product.slug : '',
      SKU: index === 0 ? product.sku : '',
      Price: index === 0 ? product.price : '',
      'Discount Percent': index === 0 && product.discountPercent > 0 ? product.discountPercent : '',
      Description: index === 0 ? product.description ?? '' : '',
      Tags: index === 0 ? product.tags.join(', ') : '',
      Category: index === 0 ? product.categoryName ?? '' : '',
      'Show In Store': index === 0 ? (product.showInStorefront ? 'TRUE' : 'FALSE') : '',
      'Option 1 Name': index === 0 ? names[0] ?? '' : '',
      'Option 1 Values': index === 0 ? values[0] ?? '' : '',
      'Option 2 Name': index === 0 ? names[1] ?? '' : '',
      'Option 2 Values': index === 0 ? values[1] ?? '' : '',
      'Option 3 Name': index === 0 ? names[2] ?? '' : '',
      'Option 3 Values': index === 0 ? values[2] ?? '' : '',
      'Variant SKU': '',
      'Option 1 Value': variant && names[0] ? variant.options[names[0]] ?? '' : '',
      'Option 2 Value': variant && names[1] ? variant.options[names[1]] ?? '' : '',
      'Option 3 Value': variant && names[2] ? variant.options[names[2]] ?? '' : '',
      'Variant Price': variant?.price ?? '',
      'Variant Stock': variant?.stock ?? 0,
      'Variant Images': variant ? variant.images.join(' | ') : '',
    }));
  });
}

export function compactProductsCsv(products: ExportProduct[]): string {
  return toCsv(compactCsvRows(products), compactCsvColumns());
}
