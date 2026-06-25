'use client';

import { use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth-provider';
import { listProducts, createProduct, listCategories } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { ImageUpload } from '@/components/image-upload';

type Variant = {
  name: string;
  imageUrl?: string;
  price?: number;
  stock: number;
};

export default function ProductsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = use(params);
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['products', businessId],
    queryFn: () => listProducts(token!, businessId),
    enabled: !!token,
  });

  const { data: categories } = useQuery({
    queryKey: ['categories', businessId],
    queryFn: () => listCategories(token!, businessId),
    enabled: !!token,
  });

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [variants, setVariants] = useState<Variant[]>([{ name: 'Default', stock: 0 }]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Products</h1>
        <Button onClick={() => setShowModal(true)}>Add Product</Button>
      </div>

      {isLoading ? (
        <p className="mt-8 text-[var(--muted-foreground)]">Loading...</p>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data?.products.map((p) => (
            <Card key={p.id as string}>
              <h3 className="font-semibold">{p.name as string}</h3>
              <p className="text-sm text-[var(--muted-foreground)]">SKU: {p.sku as string}</p>
              <p className="mt-2 text-lg font-bold">${p.price as number}</p>
            </Card>
          ))}
          {data?.products.length === 0 && (
            <p className="text-[var(--muted-foreground)]">No products yet. Add your first product.</p>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto">
            <h2 className="text-xl font-bold">Add Product</h2>
            <form
              className="mt-4 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                await createProduct(token!, businessId, {
                  name,
                  price: parseFloat(price),
                  sku,
                  description,
                  categoryName: categoryName || undefined,
                  variants,
                });
                queryClient.invalidateQueries({ queryKey: ['products', businessId] });
                setShowModal(false);
                setName('');
                setPrice('');
                setSku('');
                setDescription('');
                setVariants([{ name: 'Default', stock: 0 }]);
              }}
            >
              <Input placeholder="Product name" value={name} onChange={(e) => setName(e.target.value)} required />
              <Input placeholder="Price" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
              <Input placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} required />
              <Textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
              <Input
                placeholder="Category (new or existing)"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                list="categories"
              />
              <datalist id="categories">
                {categories?.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>

              <div className="space-y-2">
                <label className="text-sm font-medium">Variants</label>
                {variants.map((v, i) => (
                  <div key={i} className="flex flex-wrap gap-2 rounded-lg border p-3">
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
                      value={v.stock}
                      onChange={(e) => {
                        const next = [...variants];
                        next[i] = { ...next[i], stock: parseInt(e.target.value) || 0 };
                        setVariants(next);
                      }}
                    />
                    <ImageUpload
                      token={token!}
                      businessId={businessId}
                      onUploaded={(url) => {
                        const next = [...variants];
                        next[i] = { ...next[i], imageUrl: url };
                        setVariants(next);
                      }}
                    />
                    {v.imageUrl && <span className="text-xs text-green-600">Image uploaded</span>}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setVariants([...variants, { name: '', stock: 0 }])}
                >
                  + Variant
                </Button>
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create Product</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
