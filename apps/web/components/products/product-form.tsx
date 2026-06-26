'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ImageUpload } from '@/components/image-upload';
import type { ProductVariant } from '@/lib/api';

type CategoryOption = { id: string; name: string };

type ProductFormProps = {
  mode: 'create' | 'edit';
  token: string;
  businessId: string;
  categories: CategoryOption[];
  initial?: {
    name: string;
    price: string;
    sku: string;
    description: string;
    categoryName: string;
    variants: ProductVariant[];
  };
  submitting?: boolean;
  onCancel: () => void;
  onSubmit: (data: {
    name: string;
    price: number;
    sku: string;
    description: string;
    categoryName?: string;
    variants: ProductVariant[];
  }) => Promise<void>;
};

const emptyVariant = (): ProductVariant => ({ name: 'Default', stock: 0 });

export function ProductForm({
  mode,
  token,
  businessId,
  categories,
  initial,
  submitting = false,
  onCancel,
  onSubmit,
}: ProductFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [price, setPrice] = useState(initial?.price ?? '');
  const [sku, setSku] = useState(initial?.sku ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [categoryName, setCategoryName] = useState(initial?.categoryName ?? '');
  const [variants, setVariants] = useState<ProductVariant[]>(
    initial?.variants?.length ? initial.variants : [emptyVariant()],
  );
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await onSubmit({
            name: name.trim(),
            price: parseFloat(price),
            sku: sku.trim(),
            description: description.trim(),
            categoryName: categoryName.trim() || undefined,
            variants: variants.map(({ imagePreviewUrl: _preview, imageUrl: _url, imageKey, ...variant }) => ({
              ...variant,
              imageUrl: imageKey ?? undefined,
            })),
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Something went wrong');
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Product name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Price ($)</label>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">SKU</label>
          <Input value={sku} onChange={(e) => setSku(e.target.value)} required />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Description</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Optional product description"
          />
        </div>
        {mode === 'create' && (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Category</label>
            <Input
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              list="product-categories"
              placeholder="New or existing category"
            />
            <datalist id="product-categories">
              {categories.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Variants</label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setVariants([...variants, { name: '', stock: 0 }])}
          >
            + Add variant
          </Button>
        </div>
        {variants.map((v, i) => (
          <div key={v.id ?? i} className="rounded-lg border border-[var(--border)] p-3">
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Variant name"
                value={v.name}
                onChange={(e) => {
                  const next = [...variants];
                  next[i] = { ...next[i], name: e.target.value };
                  setVariants(next);
                }}
              />
              <Input
                placeholder="Stock"
                type="number"
                min="0"
                value={v.stock}
                onChange={(e) => {
                  const next = [...variants];
                  next[i] = { ...next[i], stock: parseInt(e.target.value) || 0 };
                  setVariants(next);
                }}
              />
              <ImageUpload
                token={token}
                businessId={businessId}
                onUploaded={({ key, previewUrl }) => {
                  const next = [...variants];
                  next[i] = { ...next[i], imageKey: key, imagePreviewUrl: previewUrl };
                  setVariants(next);
                }}
              />
              {variants.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600"
                  onClick={() => setVariants(variants.filter((_, idx) => idx !== i))}
                >
                  Remove
                </Button>
              )}
            </div>
            {(v.imagePreviewUrl || v.imageKey) && (
              <img
                src={v.imagePreviewUrl ?? undefined}
                alt={v.name}
                className="mt-2 h-16 w-16 rounded-lg object-cover"
              />
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : mode === 'create' ? 'Create product' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
