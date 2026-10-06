import type { Business, ProductListItem } from '@/lib/api';
import type { PublicProduct, PublicStore, StoreTheme } from '@/lib/storefront';

/**
 * The merchant product list carries no aggregate stock, so a preview treats everything as
 * buyable. That is the honest trade against showing the merchant their own catalogue: the
 * alternative is a invented sample store that flatters the theme and hides their real gaps.
 * A preview cart only ever writes localStorage, so nothing can be ordered from here.
 */
export const toPreviewProduct = (product: ProductListItem): PublicProduct => ({
  id: product.id,
  name: product.name,
  price: product.price,
  description: product.description ?? null,
  categoryName: product.categoryName ?? null,
  thumbnailUrl: product.thumbnailUrl ?? null,
  inStock: true,
  variants: [],
});

export function buildPreviewStore(
  business: Business,
  theme: StoreTheme,
  products: ProductListItem[],
): PublicStore {
  const previewProducts = products.map(toPreviewProduct);
  return {
    slug: business.slug ?? 'unset',
    name: business.name,
    description: business.description ?? null,
    phone: business.phone ?? null,
    theme,
    categories: Array.from(
      new Set(previewProducts.map((p) => p.categoryName).filter((c): c is string => !!c)),
    ).sort(),
    products: previewProducts,
  };
}
