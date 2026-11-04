'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { expireOrders, expireCustomer } from '@/app/_cache/tags';
import { requireAuth } from '@/lib/auth';
import {
  ApiError,
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
  expireOrders(businessId, orderId);
}

export async function createOrderAction(businessId: string, formData: FormData) {
  const token = await requireAuth();
  const productId = String(formData.get('productId') ?? '').trim();
  const variantId = String(formData.get('variantId') ?? '').trim() || undefined;
  const count = parseInt(String(formData.get('count') ?? '1'), 10) || 1;
  const customerName = String(formData.get('customerName') ?? '').trim();
  const customerPhone = String(formData.get('customerPhone') ?? '').trim();
  const customerAddress = String(formData.get('customerAddress') ?? '').trim();
  const shippingRaw = String(formData.get('shippingCost') ?? '').trim();
  const shippingCost = shippingRaw ? Number(shippingRaw) : undefined;
  const paymentMethod = String(formData.get('paymentMethod') ?? '').trim() || undefined;
  const transactionId = String(formData.get('transactionId') ?? '').trim() || undefined;

  if (!productId || !customerName) {
    redirect(`/b/${businessId}/orders/new?error=required`);
  }

  let order: Awaited<ReturnType<typeof createOrder>>;
  try {
    order = await createOrder(token, businessId, {
      productId,
      variantId,
      count,
      customerName,
      customerPhone: customerPhone || undefined,
      customerAddress: customerAddress || undefined,
      ...(typeof shippingCost === 'number' && Number.isFinite(shippingCost) && shippingCost >= 0
        ? { shippingCost }
        : {}),
      paymentMethod,
      transactionId,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      redirect(
        `/b/${businessId}/orders/new?productId=${encodeURIComponent(productId)}&error=${encodeURIComponent(err.message)}`,
      );
    }
    throw err;
  }

  revalidatePath(`/b/${businessId}/orders`);
  expireOrders(businessId, order.id, order.customerId);
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

  try {
    const result = await updateOrder(token, businessId, orderId, {
      count: Number.isFinite(count) && count > 0 ? count : undefined,
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      customerAddress: customerAddress || undefined,
      state: state || undefined,
    });

    revalidatePath(`/b/${businessId}/orders`);
    expireOrders(businessId, orderId, result.customerId);
    // A retyped number moves the sale off the card it used to point at; that history has to
    // drop as well, or the old customer keeps a purchase they no longer made.
    if (result.previousCustomerId && result.previousCustomerId !== result.customerId) {
      expireCustomer(result.previousCustomerId);
    }
  } catch (err) {
    if (err instanceof ApiError) {
      redirect(
        `/b/${businessId}/orders/${orderId}?error=${encodeURIComponent(err.message)}`,
      );
    }
    throw err;
  }

  redirect(`/b/${businessId}/orders`);
}

export async function deleteOrderAction(businessId: string, orderId: string) {
  const token = await requireAuth();
  await deleteOrder(token, businessId, orderId);
  revalidatePath(`/b/${businessId}/orders`);
  expireOrders(businessId, orderId);
}

export async function deleteOrdersBulkAction(businessId: string, formData: FormData) {
  const token = await requireAuth();
  const ids = formData.getAll('orderIds') as string[];
  await Promise.all(
    ids.map((id) => deleteOrder(token, businessId, id).catch(() => null)),
  );
  revalidatePath(`/b/${businessId}/orders`);
  expireOrders(businessId);
  for (const id of ids) expireOrders(businessId, id);
}
