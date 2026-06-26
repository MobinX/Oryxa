'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import {
  createProduct,
  updateProduct,
  deleteProduct,
  uploadVariantImage,
} from '@/lib/api';

const MAX_VARIANTS = 8;

async function parseVariants(
  token: string,
  businessId: string,
  formData: FormData,
): Promise<
  Array<{
    id?: string;
    name: string;
    stock: number;
    price?: number;
    isAvailable?: boolean;
    imageUrl?: string;
  }>
> {
  const variants: Array<{
    id?: string;
    name: string;
    stock: number;
    price?: number;
    isAvailable?: boolean;
    imageUrl?: string;
  }> = [];

  for (let i = 0; i < MAX_VARIANTS; i++) {
    const name = String(formData.get(`variant_${i}_name`) ?? '').trim();
    if (!name) continue;

    const stock = parseInt(String(formData.get(`variant_${i}_stock`) ?? '0'), 10) || 0;
    const priceRaw = String(formData.get(`variant_${i}_price`) ?? '').trim();
    const price = priceRaw ? parseFloat(priceRaw) : undefined;
    const id = String(formData.get(`variant_${i}_id`) ?? '').trim() || undefined;
    const keepImageKey = String(formData.get(`variant_${i}_imageKey`) ?? '').trim();

    let imageUrl = keepImageKey || undefined;
    const file = formData.get(`variant_${i}_image`);
    if (file instanceof File && file.size > 0) {
      const uploaded = await uploadVariantImage(token, businessId, file);
      imageUrl = uploaded.key;
    }

    variants.push({
      id,
      name,
      stock,
      price,
      isAvailable: true,
      imageUrl,
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
