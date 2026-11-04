/** Canonical order states, exactly as the API stores them (camelCase `onDelivery`). */
export const ORDER_STATES = ['pending', 'acknowledged', 'onDelivery', 'done'] as const;
export type OrderState = (typeof ORDER_STATES)[number];

/** Accepts any casing ('ondelivery', 'ON_DELIVERY', 'On delivery') and returns the canonical state. */
export function normalizeOrderState(raw: unknown): OrderState {
  const key = String(raw ?? '').toLowerCase().replace(/[\s_-]/g, '');
  return ORDER_STATES.find((s) => s.toLowerCase() === key) ?? 'pending';
}

export function nextOrderState(state: OrderState): OrderState | null {
  const i = ORDER_STATES.indexOf(state);
  return i >= 0 && i < ORDER_STATES.length - 1 ? ORDER_STATES[i + 1] : null;
}

/** `done` is final: the API refuses to move a delivered order back. */
export function prevOrderState(state: OrderState): OrderState | null {
  if (state === 'done') return null;
  const i = ORDER_STATES.indexOf(state);
  return i > 0 ? ORDER_STATES[i - 1] : null;
}

/**
 * Mirrors the API's ALLOWED_TRANSITIONS (packages/db/crud/order.ts). The API is the
 * authority — this copy only lets the UI grey out a move it would reject with 409.
 */
export const ORDER_STATE_TRANSITIONS: Record<OrderState, readonly OrderState[]> = {
  pending: ['acknowledged', 'onDelivery', 'done'],
  acknowledged: ['onDelivery', 'pending'],
  onDelivery: ['done', 'acknowledged'],
  done: [],
};

export function canTransition(from: OrderState, to: OrderState): boolean {
  return ORDER_STATE_TRANSITIONS[from].includes(to);
}

export const ORDER_STATE_LABEL: Record<OrderState, string> = {
  pending: 'Pending',
  acknowledged: 'Confirmed',
  onDelivery: 'On Delivery',
  done: 'Delivered',
};

/**
 * The order's currency, whole units for Taka and the ISO code for anything else. The name
 * is historic: callers that pass no currency are Taka amounts (delivery charges included).
 */
export function formatTaka(
  value: number | string | null | undefined,
  currency = 'BDT',
): string {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '0')) || 0;
  const code = (currency || 'BDT').toUpperCase();
  if (code === 'BDT') return `৳${n.toFixed(0)}`;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'code',
    }).format(n);
  } catch {
    return `${code} ${n.toFixed(2)}`;
  }
}
