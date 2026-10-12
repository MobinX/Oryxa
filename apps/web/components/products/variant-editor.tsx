'use client';

import { useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { makeVariantId } from '@repo/utils';
import { VariantPhotoDialog } from '@/components/products/variant-photo-dialog';
import type { UploadedImage } from '@/lib/uploads-client';

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
  /** The short label this variant is read by, and the one stamped on every picture it holds. */
  variantId?: string | null;
  imageKey?: string | null;
  imagePreviewUrl?: string | null;
  images?: VariantImageInitial[];
};

type VariantImage = {
  id: string;
  /** The B2 object key the picture was stored under. */
  key: string;
  previewUrl: string | null;
};

type VariantRow = {
  id?: string;
  name: string;
  stock: number;
  price?: number;
  _idx: number;
  /** Null on a saved row whose shop never gave it a label: nothing is stamped on its pictures. */
  variantId: string | null;
  /** Whether the shelf held pictures before this merchant sat down: emptying it is then a clearing. */
  hadImages: boolean;
  images: VariantImage[];
};

/** The row's saved set, or the single cover it was saved with before sets existed. */
function initialImages(row: VariantInitial): VariantImage[] {
  const shots =
    row.images ?? (row.imageKey ? [{ key: row.imageKey, previewUrl: row.imagePreviewUrl }] : []);
  return shots.map((shot) => ({ id: shot.key, key: shot.key, previewUrl: shot.previewUrl ?? null }));
}

/**
 * Manages an unlimited number of variant rows on the product create/edit form.
 * Each row is a server-action-compatible set of named inputs
 * (`variant_<i>_name`, `variant_<i>_stock`, `variant_<i>_price`,
 * `variant_<i>_imageKey` once per picture in display order,
 * `variant_<i>_clearImage`, `variant_<i>_id`, `variant_<i>_variantId`).
 *
 * A picture never goes to storage straight from the file picker. Picking one opens
 * `VariantPhotoDialog`, which reads it into the page, stamps the row's short label into a corner
 * with the canvas API, and only then PUTs the edited JPEG to B2 through a presigned URL from
 * /api/uploads/sign. The resulting keys go to the server action as `variant_<i>_imageKey` on
 * submit — no file bytes ever flow through the Next.js server action.
 *
 * A row that has not been saved yet cannot be handed a label by the server, so the browser rolls
 * one here and submits it as `variant_<i>_variantId`; the catalog keeps it when the shop is not
 * already using it, which is what makes the label on the photo and the label in the row agree.
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
        variantId: v.variantId ?? (v.id ? null : makeVariantId()),
        hadImages: images.length > 0,
        images,
      };
    }),
  );
  const [counter, setCounter] = useState(base.length);
  /** The pictures picked for one row, still waiting their turn in front of the dialog. */
  const [dialog, setDialog] = useState<{ idx: number; files: File[] } | null>(null);
  const fileInputRefs = useRef<Map<number, HTMLInputElement | null>>(new Map());

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        name: '',
        stock: 0,
        _idx: counter,
        variantId: makeVariantId(),
        hadImages: false,
        images: [],
      },
    ]);
    setCounter((c) => c + 1);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => {
      const row = prev.find((r) => r._idx === idx);
      row?.images.forEach((img) => {
        if (img.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(img.previewUrl);
      });
      return prev.filter((r) => r._idx !== idx);
    });
  };

  const removeImage = (idx: number, imageId: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row._idx !== idx) return row;
        const target = row.images.find((img) => img.id === imageId);
        if (target?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl);
        return { ...row, images: row.images.filter((img) => img.id !== imageId) };
      }),
    );
  };

  function onPickImages(idx: number, files: File[]) {
    const input = fileInputRefs.current.get(idx);
    if (input) input.value = '';
    if (files.length === 0) return;

    const row = rows.find((r) => r._idx === idx);
    if (!row) return;
    const queue = files.slice(0, Math.max(0, MAX_IMAGES - row.images.length));
    if (queue.length === 0) return;

    setDialog({ idx, files: queue });
  }

  /** One picture stored: hang it on the row, and let the next one in the queue step forward. */
  function onStored(idx: number, image: UploadedImage) {
    setRows((prev) =>
      prev.map((row) =>
        row._idx === idx
          ? { ...row, images: [...row.images, { id: image.key, key: image.key, previewUrl: image.previewUrl }] }
          : row,
      ),
    );
    setDialog((current) =>
      current && current.idx === idx ? { ...current, files: current.files.slice(1) } : current,
    );
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
        Add as many variants as you need. Leave the name empty to skip a row. If all rows are empty, a default variant is created automatically. A variant holds up to {MAX_IMAGES} pictures and the first is the one shown on the shelf. Each picture is stamped with the variant's short id before it is stored, so a customer who sends that photo back can be read off it.
      </p>

      {rows.map((row) => {
        const i = row._idx;
        const keys = row.images.map((img) => img.key);
        const emptied = row.hadImages && keys.length === 0;
        const full = keys.length >= MAX_IMAGES;

        return (
          <div key={i} className="space-y-3 rounded-xl border border-border/80 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                Variant #{i + 1}
                {row.variantId && (
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-foreground">
                    #{row.variantId}
                  </span>
                )}
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
            {row.variantId && (
              <input type="hidden" name={`variant_${i}_variantId`} value={row.variantId} />
            )}
            {keys.map((key) => (
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
                  full && 'opacity-50 cursor-not-allowed',
                )}
              >
                <span className="truncate">
                  {full
                    ? `${MAX_IMAGES} of ${MAX_IMAGES} pictures`
                    : keys.length > 0
                      ? 'Add pictures'
                      : 'Upload pictures'}
                </span>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  aria-label={`Variant ${i + 1} pictures`}
                  disabled={full}
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
                    <div className="relative h-20 w-20 overflow-hidden rounded-xl border border-border bg-muted">
                      {img.previewUrl && (
                        <img
                          src={img.previewUrl}
                          alt={`${row.name || 'variant'} — picture ${position + 1}`}
                          className="h-full w-full object-cover"
                        />
                      )}
                      {position === 0 && (
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
                    </div>
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

      {dialog && dialog.files.length > 0 && (
        <VariantPhotoDialog
          businessId={businessId}
          file={dialog.files[0]}
          label={rows.find((row) => row._idx === dialog.idx)?.variantId ?? null}
          remaining={dialog.files.length - 1}
          onUploaded={(image) => onStored(dialog.idx, image)}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}
