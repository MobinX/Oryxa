/**
 * How much a customer must pay before an order may exist, and how much is left for delivery.
 *
 * The store picks one default for every product; a product may override it. The override is
 * the only per-product part — everything else (which accounts exist, whether a receipt number
 * is demanded per method) stays with the payment methods list. This module is the one rule
 * the order write, the agent's tools and the prompt all read, so the three can never disagree
 * about whether cash on delivery is enough for a given product.
 */
import { CASH_ON_DELIVERY, matchPaymentMethod, type PaymentMethodConfig } from './payment-methods';

/** Everything is paid when the parcel arrives; nothing is needed to place the order. */
export type PaymentStrategy = 'cod' | 'delivery_prepaid' | 'full_prepaid';

export const PAYMENT_STRATEGIES: PaymentStrategy[] = ['cod', 'delivery_prepaid', 'full_prepaid'];

export const PAYMENT_STRATEGY_LABELS: Record<PaymentStrategy, string> = {
  cod: 'Cash on delivery',
  delivery_prepaid: 'Delivery charge prepaid',
  full_prepaid: 'Full payment prepaid',
};

/** One sentence a merchant, a customer or the agent can act on without reading code. */
export const PAYMENT_STRATEGY_DESCRIPTIONS: Record<PaymentStrategy, string> = {
  cod: 'The customer pays everything (product + delivery) when the parcel arrives. Nothing is needed before the order is placed.',
  delivery_prepaid:
    'The customer pays only the delivery charge before the order is placed, using any configured method other than cash on delivery. The product price is paid on delivery (cash or another method).',
  full_prepaid:
    'The customer pays the full amount (product + delivery) before the order is placed, using any configured method other than cash on delivery. Nothing is left to pay on delivery.',
};

export function isPaymentStrategy(value: unknown): value is PaymentStrategy {
  return value === 'cod' || value === 'delivery_prepaid' || value === 'full_prepaid';
}

/** What has to move before the order exists: nothing, the delivery charge, or everything. */
export type UpfrontKind = 'none' | 'delivery' | 'full';

export function upfrontKind(strategy: PaymentStrategy): UpfrontKind {
  if (strategy === 'delivery_prepaid') return 'delivery';
  if (strategy === 'full_prepaid') return 'full';
  return 'none';
}

/**
 * The strategy that governs one product: its own override when it has one, otherwise the
 * store default. `isOverride` is what the agent is alerted about — a product that quietly
 * follows the store is not news, one that breaks the store's rule is.
 */
export function resolvePaymentStrategy(
  storeDefault: PaymentStrategy | null | undefined,
  productOverride: PaymentStrategy | null | undefined,
): {
  effective: PaymentStrategy;
  storeDefault: PaymentStrategy;
  productOverride: PaymentStrategy | null;
  isOverride: boolean;
  source: 'product_override' | 'store_default';
} {
  const fallback: PaymentStrategy = isPaymentStrategy(storeDefault) ? storeDefault : 'cod';
  const override = isPaymentStrategy(productOverride) ? productOverride : null;
  const effective = override ?? fallback;
  return {
    effective,
    storeDefault: fallback,
    productOverride: override,
    isOverride: override !== null && override !== fallback,
    source: override !== null ? 'product_override' : 'store_default',
  };
}

/** True when the customer's words mean "pay when it arrives" rather than a configured method. */
export function isCashOnDelivery(words: string | null | undefined): boolean {
  const key = (words ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!key) return false;
  return key === CASH_ON_DELIVERY.toLowerCase().replace(/[^a-z0-9]/g, '') || key === 'cod';
}

/** The amount that has to move up front, in the order's currency units. Delivery charges are BDT. */
export function upfrontAmount(
  strategy: PaymentStrategy,
  amounts: { itemsTotal: number; shippingCost?: number | null },
): number {
  const shipping = typeof amounts.shippingCost === 'number' && Number.isFinite(amounts.shippingCost)
    ? amounts.shippingCost
    : 0;
  if (strategy === 'delivery_prepaid') return shipping;
  if (strategy === 'full_prepaid') return amounts.itemsTotal + shipping;
  return 0;
}

export type OrderPaymentFailureCode =
  | 'prepaid_method_required'
  | 'prepaid_method_unconfigured'
  | 'prepaid_transaction_required'
  | 'transaction_required';

export type OrderPaymentCheck =
  | {
      ok: true;
      strategy: PaymentStrategy;
      upfront: UpfrontKind;
      /** The configured method the customer's words resolved to, when they named one. */
      method: PaymentMethodConfig | null;
      isCod: boolean;
    }
  | {
      ok: false;
      strategy: PaymentStrategy;
      upfront: UpfrontKind;
      method: PaymentMethodConfig | null;
      isCod: boolean;
      code: OrderPaymentFailureCode;
      /** Form-field names a caller can point at, e.g. ['payment method', 'payment transaction id']. */
      missing: string[];
      message: string;
      /** Account details of the method that should have been paid, when one is known. */
      paymentInfo?: string | null;
    };

/**
 * Whether an order with these payment words may be created under this strategy.
 *
 * `cod` keeps the historic rule exactly: only a method the merchant marked as needing a
 * transaction id blocks, and naming no method blocks nothing. The prepaid strategies are
 * stricter, because "pay first" is meaningless without a receipt to point at: the customer
 * must name one of the store's configured non-COD methods and give its transaction id,
 * whatever that method's own flag says. A delivery-prepaid order whose delivery charge is
 * zero has nothing to collect, so it falls back to the `cod` rule rather than demanding
 * payment of nothing.
 */
export function checkOrderPayment(input: {
  strategy: PaymentStrategy;
  paymentMethod?: string | null;
  transactionId?: string | null;
  paymentMethods?: PaymentMethodConfig[] | null;
  shippingCost?: number | null;
}): OrderPaymentCheck {
  const strategy = input.strategy;
  const upfront = upfrontKind(strategy);
  const methods = input.paymentMethods ?? [];
  const words = input.paymentMethod?.trim() ? input.paymentMethod.trim() : null;
  const method = matchPaymentMethod(words, methods);
  const cod = words ? isCashOnDelivery(words) : false;
  const hasTxn = Boolean(input.transactionId?.trim());
  const shipping = typeof input.shippingCost === 'number' && Number.isFinite(input.shippingCost)
    ? input.shippingCost
    : 0;

  const needsUpfront = upfront === 'full' || (upfront === 'delivery' && shipping > 0);

  if (!needsUpfront) {
    if (method?.requiresTransactionId && !hasTxn) {
      return {
        ok: false,
        strategy,
        upfront,
        method,
        isCod: cod,
        code: 'transaction_required',
        missing: ['payment transaction id'],
        message:
          `${method.name} orders need the transaction id from the customer's payment `
          + 'confirmation before the order can be created.',
        paymentInfo: method.info ?? null,
      };
    }
    return { ok: true, strategy, upfront, method, isCod: cod };
  }

  // Money has to move before this order may exist.
  if (!methods.length) {
    return {
      ok: false,
      strategy,
      upfront,
      method,
      isCod: cod,
      code: 'prepaid_method_unconfigured',
      missing: ['payment method'],
      message:
        `This product requires ${upfront === 'full' ? 'full payment' : 'the delivery charge'} before ordering, `
        + 'but the store has not configured any payment method other than cash on delivery. '
        + 'Ask the merchant to add one on the Payments page.',
    };
  }
  if (!words || cod || !method) {
    return {
      ok: false,
      strategy,
      upfront,
      method,
      isCod: cod,
      code: 'prepaid_method_required',
      missing: ['payment method'],
      message:
        `This product requires ${upfront === 'full' ? 'full payment (product + delivery)' : 'the delivery charge'} `
        + 'before the order can be placed, paid with one of the store\'s configured methods '
        + `(${methods.map((m) => m.name).join(', ')}). Cash on delivery alone cannot place this order.`,
      paymentInfo: method?.info ?? methods[0]?.info ?? null,
    };
  }
  if (!hasTxn) {
    return {
      ok: false,
      strategy,
      upfront,
      method,
      isCod: cod,
      code: 'prepaid_transaction_required',
      missing: ['payment transaction id'],
      message:
        `${method.name} was chosen for the ${upfront === 'full' ? 'full upfront payment' : 'upfront delivery charge'}, `
        + 'so the transaction id from the customer\'s payment confirmation is needed before the order can be created.',
      paymentInfo: method.info ?? null,
    };
  }
  return { ok: true, strategy, upfront, method, isCod: cod };
}
