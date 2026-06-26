'use client';

import { useState, useId } from 'react';

type VariantInitial = {
  id?: string;
  name: string;
  stock: number;
  price?: number;
  imageKey?: string | null;
  imagePreviewUrl?: string | null;
};

type VariantRow = VariantInitial & { _idx: number };

/**
 * Manages an unlimited number of variant rows on the product create/edit form.
 * Each row is a server-action-compatible set of named inputs
 * (`variant_<i>_name`, `variant_<i>_stock`, `variant_<i>_price`,
 * `variant_<i>_image`, `variant_<i>_imageKey`, `variant_<i>_id`). Rows can be
 * added and removed; indices are reassigned on submit by the server action so
 * gaps from removals don't matter.
 */
export function VariantEditor({ initial = [] }: { initial?: VariantInitial[] }) {
  const base = initial.length > 0 ? initial : [{ name: 'Default', stock: 0 }];
  const [rows, setRows] = useState<VariantRow[]>(
    base.map((v, i) => ({ ...v, _idx: i })),
  );
  const [counter, setCounter] = useState(base.length);
  const fileInputBase = useId();

  const addRow = () => {
    setRows((prev) => [...prev, { name: '', stock: 0, _idx: counter }]);
    setCounter((c) => c + 1);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((r) => r._idx !== idx));
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
        Add as many variants as you need. Leave the name empty to skip a row. If all rows are empty, a default variant is created automatically.
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
              <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--muted)] px-3 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]/70">
                <span className="truncate">{row.imagePreviewUrl ? 'Replace image' : 'Upload image'}</span>
                <input
                  type="file"
                  name={`variant_${i}_image`}
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  aria-label={`Variant ${i + 1} image`}
                />
              </label>
            </div>
            {row.imagePreviewUrl && (
              <img
                src={row.imagePreviewUrl}
                alt={row.name}
                className="h-16 w-16 rounded-lg object-cover"
              />
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
