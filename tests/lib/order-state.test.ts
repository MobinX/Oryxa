import { describe, it, expect } from 'vitest';
import { normalizeOrderState, nextOrderState, prevOrderState, ORDER_STATE_LABEL, ORDER_STATES, formatTaka } from '../../apps/web/lib/order-state';

describe('web order-state helper', () => {
  it('normalizes any casing of onDelivery to the canonical camelCase key', () => {
    for (const raw of ['onDelivery', 'ondelivery', 'ONDELIVERY', 'on_delivery', 'On delivery']) {
      expect(normalizeOrderState(raw)).toBe('onDelivery');
    }
    expect(normalizeOrderState(undefined)).toBe('pending');
    expect(normalizeOrderState('weird')).toBe('pending');
  });
  it('advances and reverts through every stage, onDelivery included', () => {
    expect(nextOrderState('pending')).toBe('acknowledged');
    expect(nextOrderState('acknowledged')).toBe('onDelivery');
    expect(nextOrderState('onDelivery')).toBe('done');
    expect(nextOrderState('done')).toBeNull();
    expect(prevOrderState('onDelivery')).toBe('acknowledged');
    expect(prevOrderState('acknowledged')).toBe('pending');
    expect(prevOrderState('pending')).toBeNull();
    expect(prevOrderState('done')).toBeNull();
  });
  it('has a label for every state', () => {
    for (const s of ORDER_STATES) expect(ORDER_STATE_LABEL[s]).toBeTruthy();
    expect(ORDER_STATE_LABEL[normalizeOrderState('ondelivery')]).toBe('On Delivery');
  });
  it('formats Taka consistently', () => {
    expect(formatTaka(1250)).toBe('৳1250');
    expect(formatTaka('99.6')).toBe('৳100');
  });
});
