export type MailFolder = 'inbox' | 'sent' | 'all';

export type RawMailParams = Record<string, string | string[] | undefined>;

export function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function readFolder(value: string | string[] | undefined): MailFolder {
  const raw = one(value);
  return raw === 'sent' ? 'sent' : raw === 'all' ? 'all' : 'inbox';
}

export function readOffset(value: string | string[] | undefined): number {
  const n = Number.parseInt(one(value) ?? '', 10);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Every link in the mail console goes through here so `/mails` stays the one route shape. */
export function mailHref(input: {
  folder?: MailFolder;
  id?: string;
  q?: string;
  offset?: number;
}): string {
  const path = input.id ? `/mails/${encodeURIComponent(input.id)}` : '/mails';
  const params = new URLSearchParams();
  if (input.folder && input.folder !== 'inbox') params.set('folder', input.folder);
  if (input.q) params.set('q', input.q);
  if (input.offset) params.set('offset', String(input.offset));
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}
