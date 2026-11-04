import { describe, it, expect } from 'vitest';
import { matchPaymentMethod, requiresTransactionId } from '@repo/shared';

const METHODS = [
  { name: 'bKash Personal', info: '01712-345678', requiresTransactionId: true },
  { name: 'bKash', requiresTransactionId: true },
  { name: 'Nogad Agent' },
  { name: 'Bank transfer' },
];

describe('payment method matching', () => {
  it('resolves the customer\'s loose wording to the configured method', () => {
    expect(matchPaymentMethod('bkash', METHODS)?.name).toBe('bKash');
    expect(matchPaymentMethod('Bkash Personal number', METHODS)?.name).toBe('bKash Personal');
    expect(matchPaymentMethod('i will pay by BANK TRANSFER', METHODS)?.name).toBe('Bank transfer');
  });

  it('prefers the longer name so a specific account is not claimed by a shorter one', () => {
    expect(matchPaymentMethod('bkash personal', METHODS)?.name).toBe('bKash Personal');
  });

  it('names nothing when the words match no method, and when nothing is configured', () => {
    expect(matchPaymentMethod('cash on delivery', METHODS)).toBeNull();
    expect(matchPaymentMethod('', METHODS)).toBeNull();
    expect(matchPaymentMethod(null, METHODS)).toBeNull();
    expect(matchPaymentMethod('bkash', [])).toBeNull();
    expect(matchPaymentMethod('bkash', undefined)).toBeNull();
  });

  it('only a marked method blocks an order for a missing transaction id', () => {
    expect(requiresTransactionId('bKash', METHODS)).toBe(true);
    expect(requiresTransactionId('Nogad Agent', METHODS)).toBe(false);
    expect(requiresTransactionId('Cash on delivery', METHODS)).toBe(false);
    expect(requiresTransactionId('bKash', [])).toBe(false);
  });
});
