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
