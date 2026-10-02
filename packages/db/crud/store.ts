import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@db/client';
import { businesses } from '@db/schema';
import { listProducts } from './product';

export async function getBusinessBySlug(slug: string) {
  return db.query.businesses.findFirst({
    where: and(eq(businesses.slug, slug), isNull(businesses.deletedAt)),
  });
}

// Public storefront read: only for a business that has a slug and is published.
export async function getPublicStore(slug: string) {
  const business = await getBusinessBySlug(slug);
  if (!business || !business.storePublished) return null;

  const { products } = await listProducts(business.id, { limit: 100 });
  return {
    slug: business.slug as string,
    name: business.name,
    description: business.description ?? null,
    phone: business.phone ?? null,
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      description: p.description ?? null,
      categoryName: p.categoryName ?? null,
      thumbnailUrl: p.thumbnailUrl ?? null,
      variants: [] as Array<{
        id: string;
        name: string;
        price: number | null;
        stock: number;
        isAvailable: boolean;
        imageUrl: string | null;
      }>,
    })),
  };
}
