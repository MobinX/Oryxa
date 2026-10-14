import { describe, it, expect } from 'vitest';
import { matchVariant, foldVariantName } from '@repo/db/crud/product';

/**
 * These are pure functions over rows the caller already holds, so no database is involved — which is
 * the point: a customer's word has to be answerable from what is already on screen, exactly as it was
 * said, with nothing to look up and no id to ask for.
 */
const rows = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Fg', variantId: 'DAA03' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Default', variantId: 'GAA06' },
  { id: '33333333-3333-3333-3333-333333333333', name: 'Black', variantId: 'HAA07' },
  { id: '44444444-4444-4444-4444-444444444444', name: 'Rose Gold', variantId: 'JAA09' },
];

describe('foldVariantName', () => {
  it('folds the ways a customer types a size, and nothing else', () => {
    expect(foldVariantName(' Fg ')).toBe('fg');
    expect(foldVariantName('"FG"')).toBe('fg');
    expect(foldVariantName('#rose   gold')).toBe('rose gold');
    expect(foldVariantName('Fg.')).toBe('fg');
    // The words around the size stay: a caller that needs them matches against them.
    expect(foldVariantName('Fg variant ta dekhao')).toBe('fg variant ta dekhao');
  });
});

describe('matchVariant', () => {
  it('takes the id a card tap carried, when there is one', () => {
    const found = matchVariant(rows, '22222222-2222-2222-2222-222222222222');
    expect({ via: found.via, ids: found.matches.map((r) => r.id) }).toEqual({
      via: 'id',
      ids: ['22222222-2222-2222-2222-222222222222'],
    });
  });

  it('takes the size word however it was written', () => {
    for (const word of ['Fg', 'fg', ' FG ', '"fg"', 'fg.', 'Fg variant']) {
      const found = matchVariant(rows, word);
      expect(found.matches.map((r) => r.name), `for "${word}"`).toEqual(['Fg']);
      expect(['name', 'word'], `for "${word}"`).toContain(found.via);
    }
  });

  it('takes the stamped label the merchant prints on the photo', () => {
    const found = matchVariant(rows, '#DAA03');
    expect({ via: found.via, ids: found.matches.map((r) => r.id) })
      .toEqual({ via: 'label', ids: ['11111111-1111-1111-1111-111111111111'] });
  });

  it('reads a five-letter size as a name, not as a label', () => {
    // "Black" is five characters and passes the label shape, and this store does stamp five-character
    // labels — resolving it by name first is what keeps a word the customer said from being read as a
    // code the merchant never issued.
    expect(matchVariant(rows, 'Black').via).toBe('name');
    expect(matchVariant(rows, 'black').matches.map((r) => r.name)).toEqual(['Black']);
  });

  it('matches two words of a size, in either direction', () => {
    expect(matchVariant(rows, 'rose gold').matches.map((r) => r.name)).toEqual(['Rose Gold']);
    expect(matchVariant(rows, 'the rose gold one please').matches.map((r) => r.name)).toEqual(['Rose Gold']);
  });

  it('says which sizes there are when the word answers to none of them', () => {
    const found = matchVariant(rows, 'purple');
    expect({ matches: found.matches, via: found.via }).toEqual({ matches: [], via: 'none' });
  });

  it('hands back every candidate when one word means two sizes', () => {
    const twins = [
      { id: 'a', name: 'Fg', variantId: 'DAA03' },
      { id: 'b', name: 'fg', variantId: 'DAA04' },
      { id: 'c', name: 'Default', variantId: 'GAA06' },
    ];
    // Two sizes a merchant can create today — nothing folds a variant name, and no uniqueness rule
    // exists — must both come back, so the model asks instead of picking one for the customer.
    const exact = matchVariant(twins, 'Fg');
    expect({ via: exact.via, ids: exact.matches.map((r) => r.id) }).toEqual({ via: 'name', ids: ['a', 'b'] });

    // A word that reaches exactly one size still resolves, even when a sibling shares its prefix.
    expect(matchVariant(twins, 'default').matches.map((r) => r.id)).toEqual(['c']);
  });

  it('refuses to let one letter match the whole catalog', () => {
    const odd = [{ id: 'x', name: 'A', variantId: null }, { id: 'y', name: 'Banana', variantId: null }];
    expect(matchVariant(odd, 'A').matches.map((r) => r.id)).toEqual(['x']);
    expect(matchVariant(odd, 'a a').matches).toEqual([]);
  });

  it('never mistakes a mangled id for anything', () => {
    // A real risk: a model quotes a UUID with its dashes stripped, which is 32 characters and matches
    // nothing by id. It must not be read as a label either.
    const mangled = matchVariant(rows, '11111111111111111111111111111111');
    expect(mangled.matches).toEqual([]);
  });
});
