'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import {
  createOrder,
  updateOrder,
  updateOrderState,
  deleteOrder,
} from '@/lib/api';

export async function advanceOrderStateAction(
  businessId: string,
  orderId: string,
  nextState: string,
) {
  const token = await requireAuth();
  await updateOrderState(token, businessId, orderId, nextState);
  revalidatePath(`/b/${businessId}/orders`);
}

export async function createOrderAction(businessId: string, formData: FormData) {
  const token = await requireAuth();
  const productId = String(formData.get('productId') ?? '').trim();
  const variantId = String(formData.get('variantId') ?? '').trim() || undefined;
  const count = parseInt(String(formData.get('count') ?? '1'), 10) || 1;
  const customerName = String(formData.get('customerName') ?? '').trim();
  const customerPhone = String(formData.get('customerPhone') ?? '').trim();
  const customerAddress = String(formData.get('customerAddress') ?? '').trim();

  if (!productId || !customerName) {
    redirect(`/b/${businessId}/orders/new?error=required`);
  }

  await createOrder(token, businessId, {
    productId,
    variantId,
    count,
    customerName,
    customerPhone: customerPhone || undefined,
    customerAddress: customerAddress || undefined,
  });

  revalidatePath(`/b/${businessId}/orders`);
  redirect(`/b/${businessId}/orders`);
}

export async function updateOrderAction(
  businessId: string,
  orderId: string,
  formData: FormData,
) {
  const token = await requireAuth();
  const count = parseInt(String(formData.get('count') ?? ''), 10);
  const customerName = String(formData.get('customerName') ?? '').trim();
  const customerPhone = String(formData.get('customerPhone') ?? '').trim();
  const customerAddress = String(formData.get('customerAddress') ?? '').trim();
  const state = String(formData.get('state') ?? '').trim();

  await updateOrder(token, businessId, orderId, {
    count: Number.isFinite(count) && count > 0 ? count : undefined,
    customerName: customerName || undefined,
    customerPhone: customerPhone || undefined,
    customerAddress: customerAddress || undefined,
    state: state || undefined,
  });

  revalidatePath(`/b/${businessId}/orders`);
  redirect(`/b/${businessId}/orders`);
}

export async function deleteOrderAction(businessId: string, orderId: string) {
  const token = await requireAuth();
  await deleteOrder(token, businessId, orderId);
  revalidatePath(`/b/${businessId}/orders`);
}

export async function deleteOrdersBulkAction(businessId: string, formData: FormData) {
  const token = await requireAuth();
  const ids = formData.getAll('orderIds') as string[];
  await Promise.all(
    ids.map((id) => deleteOrder(token, businessId, id).catch(() => null)),
  );
  revalidatePath(`/b/${businessId}/orders`);
}
