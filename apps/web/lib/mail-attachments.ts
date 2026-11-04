export type UploadedAttachmentRef = {
  key: string;
  filename: string;
  contentType: string;
  size: number;
};

/**
 * Reads the uploader's hidden field. Keys are minted by the API under the signed-in
 * mailbox; the Worker re-checks them against that mailbox before reading the bytes.
 */
export function parseUploadedAttachmentsField(form: FormData): UploadedAttachmentRef[] {
  const raw = form.get('uploaded_attachments');
  if (typeof raw !== 'string' || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const attachments: UploadedAttachmentRef[] = [];
  for (const item of parsed.slice(0, 20)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const key = typeof record.key === 'string' ? record.key.trim() : '';
    if (!/^emails\/attachments\/[^/]+\/[^/]+$/.test(key)) continue;
    const filename =
      typeof record.filename === 'string' ? record.filename.trim().slice(0, 300) : '';
    if (!filename) continue;
    const contentType =
      typeof record.contentType === 'string' && record.contentType.trim()
        ? record.contentType.trim().slice(0, 200)
        : 'application/octet-stream';
    const size = Number(record.size);
    if (!Number.isInteger(size) || size <= 0) continue;
    attachments.push({ key, filename, contentType, size });
  }
  return attachments;
}
