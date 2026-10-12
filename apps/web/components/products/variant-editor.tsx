'use client';

import { useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUploadGate } from '@/components/products/upload-gate';
import {
  uploadVariantImageDirect,
  ImageUploadError,
} from '@/lib/uploads-client';

/** A variant holds as many shots as a merchant has; past this the strip is a gallery nobody scrolls. */
const MAX_IMAGES = 8;

type VariantImageInitial = {
  key: string;
  previewUrl?: string | null;
};

type VariantInitial = {
  id?: string;
  name: string;
  stock: number;
  price?: number;
  imageKey?: string | null;
  imagePreviewUrl?: string | null;
  images?: VariantImageInitial[];
};

type VariantImage = {
  id: string;
  /** Empty while the bytes are still on their way; the key comes back with the storage response. */
  key: string;
  previewUrl: string | null;
  uploading: boolean;
  progress: number;
  error: string | null;
};

type VariantRow = {
  id?: string;
  name: string;
  stock: number;
  price?: number;
  _idx: number;
  /** Whether the shelf held pictures before this merchant sat down: emptying it is then a clearing. */
  hadImages: boolean;
  images: VariantImage[];
};

/** The row's saved set, or the single cover it was saved with before sets existed. */
function initialImages(row: VariantInitial): VariantImage[] {
  const shots =
    row.images ?? (row.imageKey ? [{ key: row.imageKey, previewUrl: row.imagePreviewUrl }] : []);
  return shots.map((shot) => ({
    id: shot.key,
    key: shot.key,
    previewUrl: shot.previewUrl ?? null,
    uploading: false,
    progress: 100,
    error: null,
  }));
}

/**
 * Manages an unlimited number of variant rows on the product create/edit form.
 * Each row is a server-action-compatible set of named inputs
 * (`variant_<i>_name`, `variant_<i>_stock`, `variant_<i>_price`,
 * `variant_<i>_imageKey` once per picture in display order,
 * `variant_<i>_clearImage`, `variant_<i>_id`).
 *
 * Pictures upload directly from the browser to B2 via a presigned PUT URL obtained
 * from /api/uploads/sign. The resulting B2 object keys go to the server action as
 * `variant_<i>_imageKey` on form submit — no file bytes flow through the Next.js
 * server action.
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
    base.map((v, i) => {
      const images = initialImages(v);
      return {
        id: v.id,
        name: v.name,
        stock: v.stock,
        price: v.price,
        _idx: i,
        hadImages: images.length > 0,
        images,
      };
    }),
  );
  const [counter, setCounter] = useState(base.length);
  const fileInputRefs = useRef<Map<number, HTMLInputElement | null>>(new Map());
  const gate = useUploadGate();

  const patchRow = (idx: number, changes: Partial<VariantRow>) =>
    setRows((prev) => prev.map((row) => (row._idx === idx ? { ...row, ...changes } : row)));

  const patchImage = (idx: number, imageId: string, changes: Partial<VariantImage>) =>
    setRows((prev) =>
      prev.map((row) =>
        row._idx === idx
          ? {
              ...row,
              images: row.images.map((img) =>
                img.id === imageId ? { ...img, ...changes } : img,
              ),
            }
          : row,
      ),
    );

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { name: '', stock: 0, _idx: counter, hadImages: false, images: [] },
    ]);
    setCounter((c) => c + 1);
  };

  const revoke = (img: VariantImage) => {
    if (img.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(img.previewUrl);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => {
      const row = prev.find((r) => r._idx === idx);
      row?.images.forEach(revoke);
      return prev.filter((r) => r._idx !== idx);
    });
  };

  const removeImage = (idx: number, imageId: string) => {
    const input = fileInputRefs.current.get(idx);
    if (input) input.value = '';
    setRows((prev) =>
      prev.map((row) => {
        if (row._idx !== idx) return row;
        const target = row.images.find((img) => img.id === imageId);
        if (target) revoke(target);
        return { ...row, images: row.images.filter((img) => img.id !== imageId) };
      }),
    );
  };

  async function uploadOne(idx: number, imageId: string, file: File) {
    gate?.begin();
    try {
      const result = await uploadVariantImageDirect(businessId, file, (percent) =>
        patchImage(idx, imageId, { progress: percent }),
      );
      setRows((prev) =>
        prev.map((row) =>
          row._idx === idx
            ? {
                ...row,
                images: row.images.map((img) => {
                  if (img.id !== imageId) return img;
                  revoke(img);
                  return {
                    ...img,
                    key: result.key,
                    previewUrl: result.previewUrl,
                    uploading: false,
                    progress: 100,
                    error: null,
                  };
                }),
              }
            : row,
        ),
      );
    } catch (err) {
      const message =
        err instanceof ImageUploadError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Upload failed';
      // The tile stays so the merchant can see which picture did not land and pick it again.
      patchImage(idx, imageId, { uploading: false, progress: 0, error: message });
    } finally {
      gate?.end();
    }
  }

  function onPickImages(idx: number, files: File[]) {
    const input = fileInputRefs.current.get(idx);
    if (input) input.value = '';
    if (files.length === 0) return;

    const row = rows.find((r) => r._idx === idx);
    if (!row) return;
    const queue = files.slice(0, Math.max(0, MAX_IMAGES - row.images.length));
    if (queue.length === 0) return;

    const pending = queue.map((file, n) => ({
      id: `up-${idx}-${Date.now()}-${n}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    patchRow(idx, {
      images: [
        ...row.images,
        ...pending.map((p) => ({
          id: p.id,
          key: '',
          previewUrl: p.previewUrl,
          uploading: true,
          progress: 0,
          error: null,
        })),
      ],
    });

    void Promise.all(pending.map((p) => uploadOne(idx, p.id, p.file)));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b border-border/40 pb-2">
        <label className="text-sm font-semibold font-geist text-foreground">Variants</label>
        <button
          type="button"
          onClick={addRow}
          className="text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1"
        >
          <Plus className="h-4 w-4" /> Add variant
        </button>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Add as many variants as you need. Leave the name empty to skip a row. If all rows are empty, a default variant is created automatically. A variant holds up to {MAX_IMAGES} pictures and the first is the one shown on the shelf. Images upload directly to storage as you pick them.
      </p>

      {rows.map((row) => {
        const i = row._idx;
        const uploading = row.images.some((img) => img.uploading);
        const settledKeys = row.images
          .filter((img) => img.key && !img.error)
          .map((img) => img.key);
        const emptied = row.hadImages && settledKeys.length === 0 && !uploading;
        const firstUploading = row.images.find((img) => img.uploading);
        const full = settledKeys.length >= MAX_IMAGES;

        return (
          <div key={i} className="space-y-3 rounded-xl border border-border/80 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">
                Variant #{i + 1}
              </span>
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="text-xs font-semibold text-red-500 hover:text-red-600 inline-flex items-center gap-1"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            </div>
            {row.id && <input type="hidden" name={`variant_${i}_id`} value={row.id} />}
            {settledKeys.map((key) => (
              <input key={key} type="hidden" name={`variant_${i}_imageKey`} value={key} />
            ))}
            {emptied && <input type="hidden" name={`variant_${i}_clearImage`} value="1" />}
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                name={`variant_${i}_name`}
                placeholder="Variant name"
                defaultValue={row.name}
              />
              <Input
                name={`variant_${i}_stock`}
                type="number"
                min="0"
                placeholder="Stock"
                defaultValue={String(row.stock ?? 0)}
              />
              <Input
                name={`variant_${i}_price`}
                type="number"
                step="0.01"
                min="0"
                placeholder="Price override"
                defaultValue={row.price != null ? String(row.price) : ''}
              />
              <label
                className={cn(
                  'inline-flex h-10 cursor-pointer items-center justify-center rounded-element border border-dashed border-border bg-muted/50 px-3 text-sm text-muted-foreground hover:bg-muted transition-colors',
                  (uploading || full) && 'opacity-50 cursor-not-allowed',
                )}
              >
                <span className="truncate">
                  {uploading
                    ? `Uploading… ${firstUploading?.progress ?? 0}%`
                    : full
                      ? `${MAX_IMAGES} of ${MAX_IMAGES} pictures`
                      : settledKeys.length > 0
                        ? 'Add pictures'
                        : 'Upload pictures'}
                </span>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  aria-label={`Variant ${i + 1} pictures`}
                  disabled={uploading || full}
                  ref={(el) => {
                    if (el) fileInputRefs.current.set(i, el);
                    else fileInputRefs.current.delete(i);
                  }}
                  onChange={(e) => onPickImages(i, Array.from(e.target.files ?? []))}
                />
              </label>
            </div>

            {row.images.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {row.images.map((img, position) => (
                  <div key={img.id} className="space-y-1">
                    <div
                      className={cn(
                        'relative h-20 w-20 overflow-hidden rounded-xl border border-border bg-muted',
                        img.error && 'border-red-400',
                      )}
                    >
                      {img.previewUrl && (
                        <img
                          src={img.previewUrl}
                          alt={`${row.name || 'variant'} — picture ${position + 1}`}
                          className="h-full w-full object-cover"
                        />
                      )}
                      {position === 0 && img.key && !img.uploading && (
                        <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] font-semibold uppercase tracking-wide text-white">
                          Cover
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeImage(i, img.id)}
                        aria-label={`Remove picture ${position + 1}`}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      {img.uploading && (
                        <div
                          role="progressbar"
                          aria-label="Picture upload progress"
                          aria-valuenow={img.progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          className="absolute inset-x-0 bottom-0 h-1 bg-muted"
                        >
                          <div
                            className="h-full bg-primary transition-[width] duration-200"
                            style={{ width: `${img.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                    {img.error && (
                      <p className="w-20 text-[10px] leading-tight text-red-600">{img.error}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        onClick={addRow}
        className="w-full border-dashed border-border text-muted-foreground hover:text-foreground"
      >
        + Add another variant
      </Button>
    </div>
  );
}
