'use client';

import { use, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth-provider';
import {
  listProducts,
  createProduct,
  getProduct,
  updateProduct,
  deleteProduct,
  listCategories,
  type ProductListItem,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, Badge } from '@/components/ui/card';
import { ProductForm } from '@/components/products/product-form';

type ModalState =
  | { type: 'create' }
  | { type: 'edit'; productId: string }
  | { type: 'delete'; product: ProductListItem }
  | null;

function formatPrice(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export default function ProductsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = use(params);
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<ModalState>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['products', businessId, categoryFilter],
    queryFn: () =>
      listProducts(token!, businessId, {
        categoryId: categoryFilter || undefined,
        limit: 100,
      }),
    enabled: !!token,
  });

  const { data: categories } = useQuery({
    queryKey: ['categories', businessId],
    queryFn: () => listCategories(token!, businessId),
    enabled: !!token,
  });

  const editingId = modal?.type === 'edit' ? modal.productId : null;

  const { data: editingProduct, isLoading: loadingProduct } = useQuery({
    queryKey: ['product', businessId, editingId],
    queryFn: () => getProduct(token!, businessId, editingId!),
    enabled: !!token && !!editingId,
  });

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data?.products ?? [];
    return (data?.products ?? []).filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
    );
  }, [data?.products, search]);

  function closeModal() {
    setModal(null);
    setSubmitting(false);
  }

  async function handleCreate(values: {
    name: string;
    price: number;
    sku: string;
    description: string;
    categoryName?: string;
    variants: Array<{ name: string; imageUrl?: string; stock: number; price?: number }>;
  }) {
    setSubmitting(true);
    await createProduct(token!, businessId, values);
    await queryClient.invalidateQueries({ queryKey: ['products', businessId] });
    await queryClient.invalidateQueries({ queryKey: ['categories', businessId] });
    closeModal();
  }

  async function handleUpdate(values: {
    name: string;
    price: number;
    sku: string;
    description: string;
    variants: Array<{
      id?: string;
      name: string;
      imageUrl?: string;
      stock: number;
      price?: number;
      isAvailable?: boolean;
    }>;
  }) {
    if (modal?.type !== 'edit') return;
    setSubmitting(true);
    await updateProduct(token!, businessId, modal.productId, {
      name: values.name,
      price: values.price,
      sku: values.sku,
      description: values.description,
      variants: values.variants.map((v) => ({
        id: v.id,
        name: v.name,
        stock: v.stock,
        price: v.price,
        isAvailable: v.isAvailable ?? true,
        imageUrl: v.imageUrl,
      })),
    });
    await queryClient.invalidateQueries({ queryKey: ['products', businessId] });
    await queryClient.invalidateQueries({ queryKey: ['product', businessId, modal.productId] });
    closeModal();
  }

  async function handleDelete() {
    if (modal?.type !== 'delete') return;
    setDeleting(true);
    try {
      await deleteProduct(token!, businessId, modal.product.id);
      await queryClient.invalidateQueries({ queryKey: ['products', businessId] });
      closeModal();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Manage your catalog — {data?.totalCount ?? 0} total
          </p>
        </div>
        <Button onClick={() => setModal({ type: 'create' })}>Add product</Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="Search by name or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-10 rounded-lg border border-[var(--border)] bg-white px-3 text-sm"
        >
          <option value="">All categories</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="text-[var(--muted-foreground)]">Loading products…</p>
      ) : filteredProducts.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-[var(--muted-foreground)]">
            {search || categoryFilter
              ? 'No products match your filters.'
              : 'No products yet. Add your first product to get started.'}
          </p>
          {!search && !categoryFilter && (
            <Button className="mt-4" onClick={() => setModal({ type: 'create' })}>
              Add product
            </Button>
          )}
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Product</th>
                <th className="hidden px-4 py-3 text-left font-medium md:table-cell">SKU</th>
                <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Category</th>
                <th className="px-4 py-3 text-left font-medium">Price</th>
                <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">Variants</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--muted)]">
                        {product.thumbnailUrl ? (
                          <img
                            src={product.thumbnailUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-xs text-[var(--muted-foreground)]">No img</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{product.name}</p>
                        <p className="truncate text-xs text-[var(--muted-foreground)] md:hidden">
                          {product.sku}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-[var(--muted-foreground)] md:table-cell">
                    {product.sku}
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    {product.categoryName ? (
                      <Badge>{product.categoryName}</Badge>
                    ) : (
                      <span className="text-[var(--muted-foreground)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">{formatPrice(product.price)}</td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {product.variantCount ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="text-sm text-[var(--primary)] hover:underline"
                        onClick={() => setModal({ type: 'edit', productId: product.id })}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-sm text-red-600 hover:underline"
                        onClick={() => setModal({ type: 'delete', product })}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal?.type === 'create' && (
        <Modal title="Add product" onClose={closeModal}>
          <ProductForm
            mode="create"
            token={token!}
            businessId={businessId}
            categories={categories ?? []}
            submitting={submitting}
            onCancel={closeModal}
            onSubmit={handleCreate}
          />
        </Modal>
      )}

      {modal?.type === 'edit' && (
        <Modal title="Edit product" onClose={closeModal}>
          {loadingProduct || !editingProduct ? (
            <p className="text-[var(--muted-foreground)]">Loading product…</p>
          ) : (
            <ProductForm
              mode="edit"
              token={token!}
              businessId={businessId}
              categories={categories ?? []}
              submitting={submitting}
              initial={{
                name: editingProduct.name,
                price: String(editingProduct.price),
                sku: editingProduct.sku,
                description: editingProduct.description ?? '',
                categoryName: editingProduct.category?.name ?? '',
                variants: editingProduct.variants.map((v) => ({
                  id: v.id,
                  name: v.name,
                  imageKey: v.imageKey ?? null,
                  imagePreviewUrl: v.imageUrl ?? undefined,
                  price: v.price,
                  stock: v.stock,
                  isAvailable: v.isAvailable,
                })),
              }}
              onCancel={closeModal}
              onSubmit={handleUpdate}
            />
          )}
        </Modal>
      )}

      {modal?.type === 'delete' && (
        <Modal title="Delete product" onClose={closeModal}>
          <p className="text-sm text-[var(--muted-foreground)]">
            Are you sure you want to delete <strong>{modal.product.name}</strong>? This cannot be
            undone.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={closeModal} disabled={deleting}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:opacity-90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete product'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </Card>
    </div>
  );
}
