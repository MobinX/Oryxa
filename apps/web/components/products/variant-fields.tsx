import { Input } from '@/components/ui/input';

type VariantInitial = {
  id?: string;
  name: string;
  stock: number;
  price?: number;
  imageKey?: string | null;
  imagePreviewUrl?: string | null;
};

export function VariantFields({
  slots,
  initial = [],
}: {
  slots: number;
  initial?: VariantInitial[];
}) {
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">Variants</label>
      <p className="text-xs text-[var(--muted-foreground)]">
        Leave variant name empty to skip a row. First row defaults to &quot;Default&quot; if all empty.
      </p>
      {Array.from({ length: slots }, (_, i) => {
        const v = initial[i];
        return (
          <div key={i} className="rounded-lg border border-[var(--border)] p-3 space-y-2">
            {v?.id && <input type="hidden" name={`variant_${i}_id`} value={v.id} />}
            {v?.imageKey && (
              <input type="hidden" name={`variant_${i}_imageKey`} value={v.imageKey} />
            )}
            <div className="flex flex-wrap gap-2">
              <Input
                name={`variant_${i}_name`}
                placeholder="Variant name"
                defaultValue={v?.name ?? (i === 0 ? 'Default' : '')}
              />
              <Input
                name={`variant_${i}_stock`}
                type="number"
                min="0"
                placeholder="Stock"
                defaultValue={String(v?.stock ?? 0)}
              />
              <Input
                name={`variant_${i}_price`}
                type="number"
                step="0.01"
                min="0"
                placeholder="Price override"
                defaultValue={v?.price != null ? String(v.price) : ''}
              />
              <input
                type="file"
                name={`variant_${i}_image`}
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="text-sm"
              />
            </div>
            {v?.imagePreviewUrl && (
              <img
                src={v.imagePreviewUrl}
                alt={v.name}
                className="h-16 w-16 rounded-lg object-cover"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
