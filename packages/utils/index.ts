export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function parseNumeric(value: string | null | undefined): number {
  if (value == null) return 0;
  return parseFloat(value);
}

/**
 * The short id a variant is read by: three letters and two digits, shuffled so the letters are
 * not always in front. About 1.7 million shapes, and they are only unique inside one business —
 * two shops may hold the same label — so the caller holds a candidate against the business's own
 * list before keeping it.
 */
export function makeVariantId(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const chars: string[] = [];
  for (let i = 0; i < 3; i++) chars.push(letters[Math.floor(Math.random() * 26)]);
  for (let i = 0; i < 2; i++) chars.push(numbers[Math.floor(Math.random() * 10)]);

  // shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
