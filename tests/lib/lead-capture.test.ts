import { describe, it, expect } from 'vitest';
import { extractLeadFields, reconcileLeadFromReply, captureLeadFromTurn } from '@api/lib/lead-capture';

describe('extractLeadFields', () => {
  it('captures a phone only when the customer offers one to be reached on', () => {
    expect(extractLeadFields('My order total is 1200 and my card number is 1234567890').phone).toBeUndefined();
    expect(extractLeadFields('You can call me on 017 1234 5678 tomorrow').phone).toBe('017 1234 5678');
  });

  it('captures an email wherever it appears', () => {
    expect(extractLeadFields('please send the quote to rina@example.com thanks').email).toBe(
      'rina@example.com',
    );
  });

  it('interest comes from interested-in / looking-for phrasing', () => {
    expect(extractLeadFields("I'm interested in bulk t-shirts for our staff").interest).toBe(
      'bulk t-shirts for our staff',
    );
  });

  it('a platform profile name is used as the name until the customer gives one', () => {
    expect(extractLeadFields('what are your prices?', 'WA Customer').name).toBe('WA Customer');
    expect(extractLeadFields('my name is Rina Rahman', 'WA Customer').name).toBe('Rina Rahman');
  });

  it('never invents contact details — an info question only yields a soft interest', () => {
    const fields = extractLeadFields('how much does the large one cost?');
    expect(fields.name).toBeUndefined();
    expect(fields.phone).toBeUndefined();
    expect(fields.email).toBeUndefined();
    expect(fields.interest).toBeTruthy();
  });

  it('a pure info-opening question still becomes a soft interest', () => {
    expect(extractLeadFields('when can you deliver to Gazipur?').interest).toBeTruthy();
  });
});

describe('reconcileLeadFromReply / captureLeadFromTurn', () => {
  it('are exported and take the documented shapes', () => {
    // The deterministic side only fills from what was observed; reconcile never
    // overwrites an already-captured field (the crud test covers the row behavior).
    expect(typeof extractLeadFields('x')).toBe('object');
    expect(reconcileLeadFromReply).toBeTypeOf('function');
    expect(captureLeadFromTurn).toBeTypeOf('function');
  });
});
