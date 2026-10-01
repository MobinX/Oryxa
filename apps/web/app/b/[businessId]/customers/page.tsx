'use client';

import { use, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth-provider';
import {
  getBusiness,
  listCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  ApiError,
  type Customer,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';

type ModalState =
  | { type: 'create' }
  | { type: 'edit'; customer: Customer }
  | { type: 'delete'; customer: Customer }
  | null;

type CustomerValues = {
  name: string;
  phone: string;
  email: string;
  address: string;
  avatar: string;
};

export default function CustomersPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = use(params);
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<ModalState>(null);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: business, isLoading: loadingBusiness } = useQuery({
    queryKey: ['business', businessId],
    queryFn: () => getBusiness(token!, businessId),
    enabled: !!token,
  });

  const hasCompany = !!business?.companyId;

  const { data, isLoading } = useQuery({
    queryKey: ['customers', businessId, search],
    queryFn: () => listCustomers(token!, businessId, search.trim() || undefined),
    enabled: !!token && hasCompany,
  });

  const customers = data?.customers ?? [];

  function closeModal() {
    setModal(null);
    setSubmitting(false);
  }

  function invalidateCustomers() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['customers', businessId] }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
    ]);
  }

  async function handleCreate(values: CustomerValues) {
    setSubmitting(true);
    try {
      await createCustomer(token!, businessId, {
        name: values.name,
        phone: values.phone || undefined,
        email: values.email || undefined,
        address: values.address || undefined,
        avatar: values.avatar || undefined,
      });
      await invalidateCustomers();
      closeModal();
    } catch (err) {
      setSubmitting(false);
      throw err;
    }
  }

  async function handleUpdate(values: CustomerValues) {
    if (modal?.type !== 'edit') return;
    setSubmitting(true);
    try {
      await updateCustomer(token!, businessId, modal.customer.id, {
        name: values.name,
        phone: values.phone || undefined,
        email: values.email || undefined,
        address: values.address || undefined,
        avatar: values.avatar || undefined,
      });
      await invalidateCustomers();
      closeModal();
    } catch (err) {
      setSubmitting(false);
      throw err;
    }
  }

  async function handleDelete() {
    if (modal?.type !== 'delete') return;
    setDeleting(true);
    try {
      await deleteCustomer(token!, businessId, modal.customer.id);
      await invalidateCustomers();
      closeModal();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Your customer book — {data?.totalCount ?? 0} total
          </p>
        </div>
        {hasCompany && (
          <Button onClick={() => setModal({ type: 'create' })}>Add customer</Button>
        )}
      </div>

      {loadingBusiness ? (
        <p className="text-[var(--muted-foreground)]">Loading customers…</p>
      ) : !hasCompany ? (
        <Card className="py-12 text-center">
          <p className="text-[var(--muted-foreground)]">
            Customers belong to a company. Link a company first.
          </p>
          <Link href={`/b/${businessId}/companies`} className="mt-4 inline-block">
            <Button>Go to companies</Button>
          </Link>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:max-w-xs"
            />
          </div>

          {isLoading ? (
            <p className="text-[var(--muted-foreground)]">Loading customers…</p>
          ) : customers.length === 0 ? (
            <Card className="py-12 text-center">
              <p className="text-[var(--muted-foreground)]">
                {search
                  ? 'No customers match your search.'
                  : 'No customers yet. Add your first customer to get started.'}
              </p>
              {!search && (
                <Button className="mt-4" onClick={() => setModal({ type: 'create' })}>
                  Add customer
                </Button>
              )}
            </Card>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--border)] bg-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">Phone</th>
                    <th className="hidden px-4 py-3 text-left font-medium md:table-cell">Email</th>
                    <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Address</th>
                    <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">Created</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--muted)]">
                            {customer.avatar ? (
                              <img src={customer.avatar} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-xs text-[var(--muted-foreground)]">
                                {customer.name.slice(0, 1).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{customer.name}</p>
                            <p className="truncate text-xs text-[var(--muted-foreground)] sm:hidden">
                              {customer.phone || customer.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 text-[var(--muted-foreground)] sm:table-cell">
                        {customer.phone || '—'}
                      </td>
                      <td className="hidden px-4 py-3 text-[var(--muted-foreground)] md:table-cell">
                        {customer.email || '—'}
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        <span className="block max-w-[200px] truncate text-[var(--muted-foreground)]">
                          {customer.address || '—'}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-[var(--muted-foreground)] sm:table-cell">
                        {new Date(customer.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="text-sm text-[var(--primary)] hover:underline"
                            onClick={() => setModal({ type: 'edit', customer })}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-sm text-red-600 hover:underline"
                            onClick={() => setModal({ type: 'delete', customer })}
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
        </>
      )}

      {(modal?.type === 'create' || modal?.type === 'edit') && (
        <Modal
          title={modal.type === 'create' ? 'Add customer' : 'Edit customer'}
          onClose={closeModal}
        >
          <CustomerForm
            mode={modal.type}
            submitting={submitting}
            initial={
              modal.type === 'edit'
                ? {
                    name: modal.customer.name,
                    phone: modal.customer.phone ?? '',
                    email: modal.customer.email ?? '',
                    address: modal.customer.address ?? '',
                    avatar: modal.customer.avatar ?? '',
                  }
                : undefined
            }
            onCancel={closeModal}
            onSubmit={modal.type === 'create' ? handleCreate : handleUpdate}
          />
        </Modal>
      )}

      {modal?.type === 'delete' && (
        <Modal title="Delete customer" onClose={closeModal}>
          <p className="text-sm text-[var(--muted-foreground)]">
            Are you sure you want to delete <strong>{modal.customer.name}</strong>? This cannot be
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
              {deleting ? 'Deleting…' : 'Delete customer'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CustomerForm({
  mode,
  initial,
  submitting,
  onCancel,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  initial?: CustomerValues;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: CustomerValues) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [avatar, setAvatar] = useState(initial?.avatar ?? '');
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
            phone: phone.trim(),
            email: email.trim(),
            address: address.trim(),
            avatar: avatar.trim(),
          });
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Something went wrong');
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Customer name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Phone</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Address</label>
          <Textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={3}
            placeholder="Customer address"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Avatar URL</label>
          <Input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://… (optional)" />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : mode === 'create' ? 'Create customer' : 'Save changes'}
        </Button>
      </div>
    </form>
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
