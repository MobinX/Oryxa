'use client';

import { useState, useRef } from 'react';
import {
  uploadVariantImageDirect,
  ImageUploadError,
} from '@/lib/uploads-client';

type VariantInitial = {
  id?: string;
  name: string;
  stock: number;
  price?: number;
  imageKey?: string | null;
  imagePreviewUrl?: string | null;
};

type VariantRow = VariantInitial & {
  _idx: number;
  imageRemoved?: boolean;
  uploading?: boolean;
  uploadError?: string | null;
};

/**
 * Manages an unlimited number of variant rows on the product create/edit form.
 * Each row is a server-action-compatible set of named inputs
 * (`variant_<i>_name`, `variant_<i>_stock`, `variant_<i>_price`,
 * `variant_<i>_imageKey`, `variant_<i>_clearImage`, `variant_<i>_id`).
 *
 * Image upload happens directly from the browser to B2 via a presigned PUT
 * URL obtained from /api/uploads/sign. The resulting B2 object key is sent
 * to the server action as `variant_<i>_imageKey` on form submit — no file
 * bytes flow through the Next.js server action.
 */
export function VariantEditor({
  initial = [],
  businessId,
}: {
  initial?: VariantInitial[];
  businessId: string;
}) {
  const base = initial.length > 0 ? initial : [{ name: 'Default', stock: 0 }];
  const [rows, setRows] = useState<VariantRow[]>(
    base.map((v, i) => ({ ...v, _idx: i })),
  );
  const [counter, setCounter] = useState(base.length);
  const fileInputRefs = useRef<Map<number, HTMLInputElement | null>>(new Map());

  const addRow = () => {
    setRows((prev) => [...prev, { name: '', stock: 0, _idx: counter }]);
    setCounter((c) => c + 1);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => {
      const row = prev.find((r) => r._idx === idx);
      if (row?.imagePreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(row.imagePreviewUrl);
      return prev.filter((r) => r._idx !== idx);
    });
  };

  const onPickImage = async (idx: number, file: File | null) => {
    if (!file) {
      setRows((prev) =>
        prev.map((row) => {
          if (row._idx !== idx) return row;
          const input = fileInputRefs.current.get(idx);
          if (input) input.value = '';
          return {
            ...row,
            imagePreviewUrl: null,
            imageKey: null,
            imageRemoved: true,
            uploadError: null,
          };
        }),
      );
      return;
    }

    // Show an immediate local preview while the upload runs.
    const localPreview = URL.createObjectURL(file);
    setRows((prev) =>
      prev.map((row) =>
        row._idx === idx
          ? {
              ...row,
              imagePreviewUrl: localPreview,
              uploading: true,
              uploadError: null,
              imageRemoved: false,
            }
          : row,
      ),
    );

    try {
      const result = await uploadVariantImageDirect(businessId, file);
      setRows((prev) =>
        prev.map((row) => {
          if (row._idx !== idx) return row;
          if (row.imagePreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(row.imagePreviewUrl);
          return {
            ...row,
            imageKey: result.key,
            imagePreviewUrl: result.previewUrl,
            uploading: false,
            uploadError: null,
          };
        }),
      );
    } catch (err) {
      const message =
        err instanceof ImageUploadError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Upload failed';
      setRows((prev) =>
        prev.map((row) => {
          if (row._idx !== idx) return row;
          if (row.imagePreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(row.imagePreviewUrl);
          return {
            ...row,
            imageKey: null,
            imagePreviewUrl: null,
            uploading: false,
            uploadError: message,
          };
        }),
      );
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Variants</label>
        <button
          type="button"
          onClick={addRow}
          className="text-sm text-[var(--primary)] hover:underline"
        >
          + Add variant
        </button>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        Add as many variants as you need. Leave the name empty to skip a row. If all rows are empty, a default variant is created automatically. Images upload directly to storage as you pick them.
      </p>

      {rows.map((row) => {
        const i = row._idx;
        return (
          <div key={i} className="space-y-2 rounded-lg border border-[var(--border)] p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">
                Variant #{i + 1}
              </span>
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="text-xs text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
            {row.id && <input type="hidden" name={`variant_${i}_id`} value={row.id} />}
            {row.imageKey && (
              <input type="hidden" name={`variant_${i}_imageKey`} value={row.imageKey} />
            )}
            {row.imageRemoved && (
              <input type="hidden" name={`variant_${i}_clearImage`} value="1" />
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                name={`variant_${i}_name`}
                placeholder="Variant name"
                defaultValue={row.name}
                className="h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm"
              />
              <input
                name={`variant_${i}_stock`}
                type="number"
                min="0"
                placeholder="Stock"
                defaultValue={String(row.stock ?? 0)}
                className="h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm"
              />
              <input
                name={`variant_${i}_price`}
                type="number"
                step="0.01"
                min="0"
                placeholder="Price override"
                defaultValue={row.price != null ? String(row.price) : ''}
                className="h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm"
              />
              <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--muted)] px-3 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]/70 disabled:cursor-not-allowed disabled:opacity-50">
                <span className="truncate">
                  {row.uploading
                    ? 'Uploading…'
                    : row.imagePreviewUrl
                      ? 'Replace image'
                      : 'Upload image'}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  aria-label={`Variant ${i + 1} image`}
                  disabled={row.uploading}
                  ref={(el) => {
                    if (el) fileInputRefs.current.set(i, el);
                    else fileInputRefs.current.delete(i);
                  }}
                  onChange={(e) => onPickImage(i, e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            {row.uploadError && (
              <p className="text-xs text-red-600">Image upload failed: {row.uploadError}</p>
            )}
            {row.imagePreviewUrl && (
              <div className="flex items-center gap-3">
                <img
                  src={row.imagePreviewUrl}
                  alt={row.name}
                  className="h-16 w-16 rounded-lg object-cover"
                />
                <button
                  type="button"
                  onClick={() => onPickImage(i, null)}
                  disabled={row.uploading}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  Remove image
                </button>
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={addRow}
        className="w-full rounded-lg border border-dashed border-[var(--border)] py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
      >
        + Add another variant
      </button>
    </div>
  );
}
