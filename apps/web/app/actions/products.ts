'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import {
  createProduct,
  updateProduct,
  deleteProduct,
  uploadVariantImage,
  createCategory,
  updateCategory,
  deleteCategory,
} from '@/lib/api';

type ParsedVariant = {
  id?: string;
  name: string;
  stock: number;
  price?: number;
  isAvailable?: boolean;
  imageUrl?: string;
  clearImage?: boolean;
};

/**
 * Parses an arbitrary number of variant rows from FormData.
 * Each variant is identified by a numeric index suffix on its field names:
 *   variant_<i>_name, variant_<i>_stock, variant_<i>_price,
 *   variant_<i>_image, variant_<i>_imageKey, variant_<i>_id
 * Rows with an empty name are skipped. Image upload failures are tolerated
 * (the variant is still saved without an image) instead of failing the whole
 * product create/update.
 */
async function parseVariants(
  token: string,
  businessId: string,
  formData: FormData,
): Promise<ParsedVariant[]> {
  const indices = new Set<number>();
  for (const key of formData.keys()) {
    const match = key.match(/^variant_(\d+)_/);
    if (match) indices.add(Number(match[1]));
  }

  const variants: ParsedVariant[] = [];

  for (const i of [...indices].sort((a, b) => a - b)) {
    const name = String(formData.get(`variant_${i}_name`) ?? '').trim();
    if (!name) continue;

    const stock = parseInt(String(formData.get(`variant_${i}_stock`) ?? '0'), 10) || 0;
    const priceRaw = String(formData.get(`variant_${i}_price`) ?? '').trim();
    const price = priceRaw ? parseFloat(priceRaw) : undefined;
    const id = String(formData.get(`variant_${i}_id`) ?? '').trim() || undefined;
    const keepImageKey = String(formData.get(`variant_${i}_imageKey`) ?? '').trim();
    const clearImage = formData.get(`variant_${i}_clearImage`) === '1';

    let imageUrl = keepImageKey || undefined;
    const file = formData.get(`variant_${i}_image`);
    if (file instanceof File && file.size > 0) {
      const uploaded = await uploadVariantImage(token, businessId, file);
      if (uploaded) imageUrl = uploaded.key;
      // If upload returns null (B2 not configured / rejected), keep going.
    }

    variants.push({
      id,
      name,
      stock,
      price,
      isAvailable: true,
      imageUrl,
      clearImage: clearImage && !imageUrl,
    });
  }

  if (variants.length === 0) {
    variants.push({ name: 'Default', stock: 0, isAvailable: true });
  }

  return variants;
}

export async function createProductAction(businessId: string, formData: FormData) {
  const token = await requireAuth();
  const name = String(formData.get('name') ?? '').trim();
  const sku = String(formData.get('sku') ?? '').trim();
  const price = parseFloat(String(formData.get('price') ?? ''));
  const description = String(formData.get('description') ?? '').trim();
  const categoryId = String(formData.get('categoryId') ?? '').trim();
  const categoryName = String(formData.get('categoryName') ?? '').trim();

  if (!name || !sku || !price) {
    redirect(`/b/${businessId}/products/new?error=required`);
  }

  const variants = await parseVariants(token, businessId, formData);

  await createProduct(token, businessId, {
    name,
    sku,
    price,
    description: description || undefined,
    categoryId: categoryId || undefined,
    categoryName: !categoryId && categoryName ? categoryName : undefined,
    variants,
  });

  revalidatePath(`/b/${businessId}/products`);
  redirect(`/b/${businessId}/products`);
}

export async function updateProductAction(
  businessId: string,
  productId: string,
  formData: FormData,
) {
  const token = await requireAuth();
  const name = String(formData.get('name') ?? '').trim();
  const sku = String(formData.get('sku') ?? '').trim();
  const price = parseFloat(String(formData.get('price') ?? ''));
  const description = String(formData.get('description') ?? '').trim();

  const variants = await parseVariants(token, businessId, formData);

  await updateProduct(token, businessId, productId, {
    name: name || undefined,
    sku: sku || undefined,
    price: price || undefined,
    description,
    variants,
  });

  revalidatePath(`/b/${businessId}/products`);
  redirect(`/b/${businessId}/products`);
}

export async function deleteProductAction(businessId: string, productId: string) {
  const token = await requireAuth();
  await deleteProduct(token, businessId, productId);
  revalidatePath(`/b/${businessId}/products`);
}

export async function deleteProductsBulkAction(
  businessId: string,
  formData: FormData,
) {
  const token = await requireAuth();
  const ids = formData.getAll('productIds') as string[];
  await Promise.all(
    ids.map((id) => deleteProduct(token, businessId, id).catch(() => null)),
  );
  revalidatePath(`/b/${businessId}/products`);
}

export async function createCategoryAction(businessId: string, formData: FormData) {
  const token = await requireAuth();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;
  await createCategory(token, businessId, name);
  revalidatePath(`/b/${businessId}/products`);
  revalidatePath(`/b/${businessId}/categories`);
}

export async function updateCategoryAction(
  businessId: string,
  categoryId: string,
  formData: FormData,
) {
  const token = await requireAuth();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;
  await updateCategory(token, businessId, categoryId, name);
  revalidatePath(`/b/${businessId}/products`);
  revalidatePath(`/b/${businessId}/categories`);
}

export async function deleteCategoryAction(businessId: string, categoryId: string) {
  const token = await requireAuth();
  await deleteCategory(token, businessId, categoryId);
  revalidatePath(`/b/${businessId}/products`);
  revalidatePath(`/b/${businessId}/categories`);
}

export async function deleteCategoriesBulkAction(
  businessId: string,
  formData: FormData,
) {
  const token = await requireAuth();
  const ids = formData.getAll('categoryIds') as string[];
  await Promise.all(
    ids.map((id) => deleteCategory(token, businessId, id).catch(() => null)),
  );
  revalidatePath(`/b/${businessId}/products`);
  revalidatePath(`/b/${businessId}/categories`);
}
