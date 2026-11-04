import { describe, it, expect } from 'vitest';
import { isRepeatAnswer, repeatKey, repeatsAnyAnswer, repeatAlert } from '@repo/shared';

/**
 * Real strings from the Acme thread that started this: the agent answered "What you hve" with the
 * category list, the customer typed the fragment "Have" six seconds later, and the agent said the
 * same sentence again — this time without the chip row, because the chips had already been offered.
 * The two do not match as raw strings, so the comparison has to see through the chip list.
 */
const WITH_CHIPS =
  'We have these categories. Which would you like to browse? (Accessories / Apparel / Beauty / Electronics / Footwear / Home / Sleeping Med / Sports)';
const WITHOUT_CHIPS = 'We have these categories. Which would you like to browse?';

describe('reply repeat detection', () => {
  it('catches the incident in both directions', () => {
    expect(isRepeatAnswer(WITHOUT_CHIPS, WITH_CHIPS)).toBe(true);
    expect(isRepeatAnswer(WITH_CHIPS, WITHOUT_CHIPS)).toBe(true);
    expect(repeatKey(WITH_CHIPS)).toBe(repeatKey(WITHOUT_CHIPS));
  });

  it('leaves genuinely different answers alone', () => {
    expect(isRepeatAnswer(
      'Electronics has 8 products, including the Bluetooth Speaker at BDT 59.99. Which one?',
      'Electronics has 8 products, including the Bluetooth Speaker at BDT 59.99 with 168 in stock. Which one are you interested in?',
    )).toBe(false);
    expect(isRepeatAnswer(
      'Sorry, we don’t have a doll in our catalog. What else are you looking for?',
      'There are no Mobile products in our catalog. What else are you looking for?',
    )).toBe(false);
  });

  it('ignores case, quotes and spacing, but not short courtesies', () => {
    expect(isRepeatAnswer(
      'I\'m the sales and support assistant for Acme store.',
      'I’m  the Sales And Support Assistant For ACME STORE',
    )).toBe(true);
    // "Ok" twice costs nobody; a repeated sentence of substance is the bug.
    expect(isRepeatAnswer('Thank you!', 'Thank you!')).toBe(false);
    expect(isRepeatAnswer('', WITH_CHIPS)).toBe(false);
    expect(isRepeatAnswer(WITH_CHIPS, null)).toBe(false);
  });

  it('searches the whole recent list and reports what was already said', () => {
    const recent = ['Something else entirely about delivery times.', WITHOUT_CHIPS];
    expect(repeatsAnyAnswer(WITH_CHIPS, recent)).toBe(WITHOUT_CHIPS);
    expect(repeatsAnyAnswer('Do you ship to Chattogram?', recent)).toBeNull();
  });

  it('alerts the agent with the words it already used and a way forward', () => {
    const alert = repeatAlert(WITH_CHIPS);
    expect(alert).toContain('NOT sent');
    expect(alert).toContain('We have these categories');
    expect(alert).toContain('SILENT');
  });
});
