'use client';

import { useState, useId } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';

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
        Add as many variants as you need. Leave the name empty to skip a row. If all rows are empty, a default variant is created automatically.
      </p>

      {rows.map((row) => {
        const i = row._idx;
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
            {row.imageKey && (
              <input type="hidden" name={`variant_${i}_imageKey`} value={row.imageKey} />
            )}
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
              <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-element border border-dashed border-border bg-muted/50 px-3 text-sm text-muted-foreground hover:bg-muted transition-colors">
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
              <div className="flex items-center gap-2">
                <img
                  src={row.imagePreviewUrl}
                  alt={row.name}
                  className="h-16 w-16 rounded-xl object-cover border border-border"
                />
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
