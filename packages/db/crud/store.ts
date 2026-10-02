import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@db/client';
import { businesses, products, variants } from '@db/schema';
import { resolveStoredImageUrl } from '@repo/integrations/b2';
import { createOrder } from './order';

export async function getBusinessBySlug(slug: string) {
  return db.query.businesses.findFirst({
    where: and(eq(businesses.slug, slug), isNull(businesses.deletedAt)),
  });
}

export type StoreFilters = {
  q?: string;
  category?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc';
  min?: number;
  max?: number;
};

async function mapProduct(p: {
  id: string;
  name: string;
  price: string;
  description: string | null;
  createdAt: Date;
  category: { name: string } | null;
  variants: Array<{
    id: string;
    name: string;
    price: string | null;
    stock: number;
    isAvailable: boolean;
    imageUrl: string | null;
  }>;
}) {
  const mappedVariants = await Promise.all(
    p.variants.map(async (v) => ({
      id: v.id,
      name: v.name,
      price: v.price ? parseFloat(v.price) : null,
      stock: v.stock,
      isAvailable: v.isAvailable,
      imageUrl: await resolveStoredImageUrl(v.imageUrl),
    })),
  );
  const firstImage = p.variants.find((v) => v.imageUrl)?.imageUrl ?? null;
  return {
    id: p.id,
    name: p.name,
    price: parseFloat(p.price),
    description: p.description,
    categoryName: p.category?.name ?? null,
    thumbnailUrl: await resolveStoredImageUrl(firstImage),
    inStock: p.variants.length === 0 ? true : p.variants.some((v) => v.isAvailable && v.stock > 0),
    variants: mappedVariants,
    _createdAt: p.createdAt,
  };
}

async function loadStoreProducts(businessId: string) {
  const rows = await db.query.products.findMany({
    where: and(eq(products.businessId, businessId), isNull(products.deletedAt)),
    with: {
      category: true,
      variants: { where: isNull(variants.deletedAt) },
    },
  });
  return Promise.all(rows.map(mapProduct));
}

function applyFilters(
  items: Awaited<ReturnType<typeof mapProduct>>[],
  f: StoreFilters,
) {
  let out = items;
  const q = f.q?.trim().toLowerCase();
  if (q) {
    out = out.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false) ||
        (p.categoryName?.toLowerCase().includes(q) ?? false),
    );
  }
  if (f.category) {
    out = out.filter((p) => p.categoryName?.toLowerCase() === f.category!.toLowerCase());
  }
  if (f.min != null) out = out.filter((p) => p.price >= f.min!);
  if (f.max != null) out = out.filter((p) => p.price <= f.max!);
  if (f.sort === 'price_asc') out = [...out].sort((a, b) => a.price - b.price);
  else if (f.sort === 'price_desc') out = [...out].sort((a, b) => b.price - a.price);
  else out = [...out].sort((a, b) => b._createdAt.getTime() - a._createdAt.getTime());
  return out;
}

export async function getPublicStore(slug: string, filters: StoreFilters = {}) {
  const business = await getBusinessBySlug(slug);
  if (!business || !business.storePublished) return null;

  const all = await loadStoreProducts(business.id);
  const categories = Array.from(
    new Set(all.map((p) => p.categoryName).filter((c): c is string => !!c)),
  ).sort();
  const filtered = applyFilters(all, filters);

  return {
    slug: business.slug as string,
    name: business.name,
    description: business.description ?? null,
    phone: business.phone ?? null,
    theme: business.storeTheme ?? null,
    categories,
    products: filtered.map(({ _createdAt, ...rest }) => rest),
  };
}

export async function getPublicProduct(slug: string, productId: string) {
  const business = await getBusinessBySlug(slug);
  if (!business || !business.storePublished) return null;

  const rows = await db.query.products.findMany({
    where: and(eq(products.businessId, business.id), eq(products.id, productId), isNull(products.deletedAt)),
    with: { category: true, variants: { where: isNull(variants.deletedAt) } },
    limit: 1,
  });
  if (!rows.length) return null;
  const { _createdAt, ...product } = await mapProduct(rows[0]);
  return product;
}

export class CheckoutError extends Error {}

export async function createPublicCheckout(
  slug: string,
  input: {
    customerName: string;
    customerPhone?: string;
    customerAddress?: string;
    items: Array<{ productId: string; variantId?: string; quantity: number }>;
  },
) {
  const business = await getBusinessBySlug(slug);
  if (!business || !business.storePublished) return null;

  const orderIds: string[] = [];
  let total = 0;
  for (const item of input.items) {
    try {
      // createOrder validates the product belongs to this business, checks stock,
      // and computes the price server-side (client cannot tamper with price).
      const order = await createOrder({
        businessId: business.id,
        productId: item.productId,
        variantId: item.variantId,
        count: item.quantity,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerAddress: input.customerAddress,
      });
      orderIds.push(order.id);
      total += parseFloat(order.totalPrice);
    } catch (e) {
      throw new CheckoutError((e as Error).message);
    }
  }
  return { orderIds, total: Math.round(total * 100) / 100, status: 'pending' as const };
}
