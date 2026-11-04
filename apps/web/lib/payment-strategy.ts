import type { PaymentStrategy } from '@/lib/api';

/**
 * The web mirror of the shared payment-strategy rule. This app has no `@repo/shared`
 * dependency (see lib/api.ts), so the labels and the one resolution rule live here and the
 * API remains the enforcer — these helpers only decide what the forms show and require.
 */
export type { PaymentStrategy };

export const PAYMENT_STRATEGY_OPTIONS: Array<{
  value: PaymentStrategy;
  label: string;
  description: string;
}> = [
  {
    value: 'cod',
    label: 'Cash on delivery',
    description:
      'Customer pays everything (product + delivery) when the parcel arrives. Nothing is needed to place the order.',
  },
  {
    value: 'delivery_prepaid',
    label: 'Delivery charge prepaid',
    description:
      'Customer pays only the delivery charge before the order is placed, by any method except cash on delivery. The product price is paid on delivery.',
  },
  {
    value: 'full_prepaid',
    label: 'Full payment prepaid',
    description:
      'Customer pays the full amount (product + delivery) before the order is placed, by any method except cash on delivery. Nothing remains on delivery.',
  },
];

export function paymentStrategyLabel(value: string | null | undefined): string {
  return PAYMENT_STRATEGY_OPTIONS.find((option) => option.value === value)?.label ?? 'Cash on delivery';
}

export function paymentStrategyDescription(value: string | null | undefined): string {
  return PAYMENT_STRATEGY_OPTIONS.find((option) => option.value === value)?.description ?? PAYMENT_STRATEGY_OPTIONS[0]!.description;
}

/** The strategy that governs one product: its override when set, otherwise the store default. */
export function resolvePaymentStrategy(
  storeDefault: string | null | undefined,
  productOverride: string | null | undefined,
): { effective: PaymentStrategy; isOverride: boolean } {
  const fallback: PaymentStrategy =
    storeDefault === 'delivery_prepaid' || storeDefault === 'full_prepaid' ? storeDefault : 'cod';
  const override: PaymentStrategy | null =
    productOverride === 'cod' || productOverride === 'delivery_prepaid' || productOverride === 'full_prepaid'
      ? productOverride
      : null;
  return { effective: override ?? fallback, isOverride: override !== null && override !== fallback };
}

/** True when money must move before the order exists (a zero delivery charge collects nothing). */
export function requiresUpfrontPayment(strategy: PaymentStrategy, shippingCost?: number | null): boolean {
  if (strategy === 'full_prepaid') return true;
  if (strategy === 'delivery_prepaid') return typeof shippingCost === 'number' && shippingCost > 0;
  return false;
}
