/**
 * Payment methods are merchant-defined: the store names each way it takes money, gives the
 * account or number the customer pays into, and decides whether an order using it must carry a
 * transaction id. This module is the one matching rule, so the order save, the agent's tool and
 * the prompt all agree on which method a customer's words describe.
 */

export type PaymentMethodConfig = {
  name: string;
  /** The number or account detail the customer sends money to, exactly as the merchant typed it. */
  info?: string;
  requiresTransactionId?: boolean;
};

/** Always available, needs nothing up front, and is never a configured method. */
export const CASH_ON_DELIVERY = 'Cash on delivery';

/** Case-, spacing- and punctuation-insensitive key, so "bKash Personal" matches "bkash personal". */
function methodKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The method the buyer's words refer to, or null when they named nothing configured. An exact
 * name wins first; otherwise a name is matched by containment, because customers write "bkash"
 * for "bKash Personal" or "pay by bKash personal number". Among containment hits the longer name
 * wins, so "bKash Personal" is not claimed by a bare "bKash" row and vice versa.
 */
export function matchPaymentMethod(
  words: string | null | undefined,
  methods: PaymentMethodConfig[] | null | undefined,
): PaymentMethodConfig | null {
  const key = methodKey(words ?? '');
  if (!key || !methods?.length) return null;
  const exact = methods.find((method) => methodKey(method.name) === key);
  if (exact) return exact;
  const hits = methods.filter((method) => {
    const name = methodKey(method.name);
    return name.length > 0 && (key.includes(name) || name.includes(key));
  });
  if (!hits.length) return null;
  return hits.reduce((longest, method) =>
    methodKey(method.name).length >= methodKey(longest.name).length ? method : longest,
  );
}

/** True when this order must not exist before the buyer supplies a transaction id. */
export function requiresTransactionId(
  words: string | null | undefined,
  methods: PaymentMethodConfig[] | null | undefined,
): boolean {
  const method = matchPaymentMethod(words, methods);
  return Boolean(method?.requiresTransactionId);
}
