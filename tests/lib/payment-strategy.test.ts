import { describe, it, expect } from 'vitest';
import {
  checkOrderPayment,
  isCashOnDelivery,
  resolvePaymentStrategy,
  upfrontAmount,
} from '@repo/shared';

const METHODS = [
  { name: 'bKash Personal', info: '01712-345678', requiresTransactionId: true },
  { name: 'Bank transfer', info: 'AC 123' },
];

describe('payment strategy resolution', () => {
  it('follows the store default unless the product overrides it', () => {
    expect(resolvePaymentStrategy('cod', null).effective).toBe('cod');
    expect(resolvePaymentStrategy('full_prepaid', null)).toMatchObject({
      effective: 'full_prepaid',
      source: 'store_default',
      isOverride: false,
    });
    expect(resolvePaymentStrategy('cod', 'delivery_prepaid')).toMatchObject({
      effective: 'delivery_prepaid',
      source: 'product_override',
      isOverride: true,
    });
    // An override equal to the default is a product choice, not news.
    expect(resolvePaymentStrategy('cod', 'cod').isOverride).toBe(false);
    expect(resolvePaymentStrategy(undefined, undefined).effective).toBe('cod');
  });

  it('recognises cash on delivery however it is written', () => {
    expect(isCashOnDelivery('Cash on delivery')).toBe(true);
    expect(isCashOnDelivery('cash-on-delivery!')).toBe(true);
    expect(isCashOnDelivery('COD')).toBe(true);
    expect(isCashOnDelivery('bKash')).toBe(false);
    expect(isCashOnDelivery(null)).toBe(false);
  });

  it('prices the upfront amount from the strategy', () => {
    expect(upfrontAmount('cod', { itemsTotal: 1000, shippingCost: 60 })).toBe(0);
    expect(upfrontAmount('delivery_prepaid', { itemsTotal: 1000, shippingCost: 60 })).toBe(60);
    expect(upfrontAmount('full_prepaid', { itemsTotal: 1000, shippingCost: 60 })).toBe(1060);
  });
});

describe('order payment check', () => {
  it('keeps cash on delivery open: no method, COD, and unmarked methods all pass', () => {
    expect(checkOrderPayment({ strategy: 'cod', paymentMethods: METHODS }).ok).toBe(true);
    expect(
      checkOrderPayment({ strategy: 'cod', paymentMethod: 'Cash on delivery', paymentMethods: METHODS }).ok,
    ).toBe(true);
    expect(
      checkOrderPayment({ strategy: 'cod', paymentMethod: 'Bank transfer', paymentMethods: METHODS }).ok,
    ).toBe(true);
  });

  it('still blocks a marked method without its transaction id under cod', () => {
    const check = checkOrderPayment({ strategy: 'cod', paymentMethod: 'bKash', paymentMethods: METHODS });
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.code).toBe('transaction_required');
      expect(check.missing).toContain('payment transaction id');
    }
  });

  it('full prepaid refuses cash on delivery and demands a configured method with its id', () => {
    const cod = checkOrderPayment({
      strategy: 'full_prepaid',
      paymentMethod: 'Cash on delivery',
      paymentMethods: METHODS,
      shippingCost: 60,
    });
    expect(cod.ok).toBe(false);
    if (!cod.ok) expect(cod.code).toBe('prepaid_method_required');

    const noTxn = checkOrderPayment({
      strategy: 'full_prepaid',
      paymentMethod: 'Bank transfer',
      paymentMethods: METHODS,
      shippingCost: 60,
    });
    expect(noTxn.ok).toBe(false);
    if (!noTxn.ok) expect(noTxn.code).toBe('prepaid_transaction_required');

    expect(
      checkOrderPayment({
        strategy: 'full_prepaid',
        paymentMethod: 'Bank transfer',
        transactionId: 'TRX-1',
        paymentMethods: METHODS,
        shippingCost: 60,
      }).ok,
    ).toBe(true);
  });

  it('delivery prepaid needs the delivery payment only while a charge applies', () => {
    expect(
      checkOrderPayment({
        strategy: 'delivery_prepaid',
        paymentMethod: 'Cash on delivery',
        paymentMethods: METHODS,
        shippingCost: 60,
      }).ok,
    ).toBe(false);
    expect(
      checkOrderPayment({
        strategy: 'delivery_prepaid',
        paymentMethod: 'bKash Personal',
        transactionId: 'TRX-2',
        paymentMethods: METHODS,
        shippingCost: 60,
      }).ok,
    ).toBe(true);
    // Nothing to collect, nothing demanded.
    expect(
      checkOrderPayment({
        strategy: 'delivery_prepaid',
        paymentMethod: 'Cash on delivery',
        paymentMethods: METHODS,
        shippingCost: 0,
      }).ok,
    ).toBe(true);
  });

  it('says plainly when a prepaid store never configured a prepaid method', () => {
    const check = checkOrderPayment({
      strategy: 'full_prepaid',
      paymentMethod: 'bKash',
      transactionId: 'TRX-3',
      paymentMethods: [],
    });
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.code).toBe('prepaid_method_unconfigured');
      expect(check.message).toContain('Payments page');
    }
  });
});
