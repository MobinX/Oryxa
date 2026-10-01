'use client';

import { use, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth-provider';
import {
  listCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
  getBusiness,
  getCompanyBusinesses,
  assignBusinessToCompany,
  unassignBusinessFromCompany,
  ApiError,
  type Company,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, Badge } from '@/components/ui/card';

type ModalState =
  | { type: 'create' }
  | { type: 'edit'; company: Company }
  | { type: 'delete'; company: Company }
  | null;

type CompanyValues = { name: string; description: string; phone: string };

export default function CompaniesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = use(params);
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<ModalState>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: () => listCompanies(token!),
    enabled: !!token,
  });

  const { data: business } = useQuery({
    queryKey: ['business', businessId],
    queryFn: () => getBusiness(token!, businessId),
    enabled: !!token,
  });

  const companies = data?.companies ?? [];

  function closeModal() {
    setModal(null);
    setSubmitting(false);
  }

  async function handleCreate(values: CompanyValues) {
    setSubmitting(true);
    try {
      await createCompany(token!, {
        name: values.name,
        description: values.description || undefined,
        phone: values.phone || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
      await queryClient.invalidateQueries({ queryKey: ['business', businessId] });
      closeModal();
    } catch (err) {
      setSubmitting(false);
      throw err;
    }
  }

  async function handleUpdate(values: CompanyValues) {
    if (modal?.type !== 'edit') return;
    setSubmitting(true);
    try {
      await updateCompany(token!, modal.company.id, {
        name: values.name,
        description: values.description || undefined,
        phone: values.phone || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
      await queryClient.invalidateQueries({ queryKey: ['business', businessId] });
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
      await deleteCompany(token!, modal.company.id);
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
      await queryClient.invalidateQueries({ queryKey: ['business', businessId] });
      await queryClient.invalidateQueries({
        queryKey: ['company-businesses', modal.company.id, businessId],
      });
      closeModal();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Companies</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Shared customer books — {data?.totalCount ?? 0} total
          </p>
        </div>
        <Button onClick={() => setModal({ type: 'create' })}>Add company</Button>
      </div>

      {isLoading ? (
        <p className="text-[var(--muted-foreground)]">Loading companies…</p>
      ) : companies.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-[var(--muted-foreground)]">
            No companies yet. Create a company to manage customers and assign this business.
          </p>
          <Button className="mt-4" onClick={() => setModal({ type: 'create' })}>
            Add company
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <CompanyCard
              key={company.id}
              company={company}
              token={token!}
              businessId={businessId}
              assigned={business?.companyId === company.id}
              onEdit={() => setModal({ type: 'edit', company })}
              onDelete={() => setModal({ type: 'delete', company })}
            />
          ))}
        </div>
      )}

      {(modal?.type === 'create' || modal?.type === 'edit') && (
        <Modal title={modal.type === 'create' ? 'Add company' : 'Edit company'} onClose={closeModal}>
          <CompanyForm
            mode={modal.type}
            submitting={submitting}
            initial={
              modal.type === 'edit'
                ? {
                    name: modal.company.name,
                    description: modal.company.description ?? '',
                    phone: modal.company.phone ?? '',
                  }
                : undefined
            }
            onCancel={closeModal}
            onSubmit={modal.type === 'create' ? handleCreate : handleUpdate}
          />
        </Modal>
      )}

      {modal?.type === 'delete' && (
        <Modal title="Delete company" onClose={closeModal}>
          <p className="text-sm text-[var(--muted-foreground)]">
            Are you sure you want to delete <strong>{modal.company.name}</strong>? This cannot be
            undone.
          </p>
          <p className="mt-3 rounded-lg bg-yellow-100 px-3 py-2 text-sm text-yellow-800">
            Warning: deleting this company also removes its customer book and unassigns every linked
            business.
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
              {deleting ? 'Deleting…' : 'Delete company'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CompanyCard({
  company,
  token,
  businessId,
  assigned,
  onEdit,
  onDelete,
}: {
  company: Company;
  token: string;
  businessId: string;
  assigned: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: memberData } = useQuery({
    queryKey: ['company-businesses', company.id, businessId],
    queryFn: () => getCompanyBusinesses(token, company.id),
    enabled: !!token,
  });

  const memberBusinesses = memberData?.businesses ?? [];

  async function handleToggle() {
    setBusy(true);
    setError(null);
    try {
      if (assigned) {
        await unassignBusinessFromCompany(token, company.id, businessId);
      } else {
        await assignBusinessToCompany(token, company.id, businessId);
      }
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
      await queryClient.invalidateQueries({ queryKey: ['business', businessId] });
      await queryClient.invalidateQueries({ queryKey: ['company-businesses', company.id, businessId] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-lg font-semibold">{company.name}</p>
        {assigned && <Badge variant="success">Assigned to this business</Badge>}
      </div>

      <p className="text-sm text-[var(--muted-foreground)]">
        {company.description || 'No description'}
      </p>

      <div className="space-y-0.5 text-sm">
        <p>{company.phone || <span className="text-[var(--muted-foreground)]">No phone</span>}</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Created {new Date(company.createdAt).toLocaleDateString()}
        </p>
      </div>

      {memberBusinesses.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {memberBusinesses.map((b) => (
            <Badge key={b.id} variant="info">
              {b.name}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-3">
        <Button size="sm" variant={assigned ? 'outline' : 'default'} onClick={handleToggle} disabled={busy}>
          {busy ? 'Saving…' : assigned ? 'Unassign' : 'Assign this business'}
        </Button>
        <button
          type="button"
          className="text-sm text-[var(--primary)] hover:underline"
          onClick={onEdit}
        >
          Edit
        </button>
        <button type="button" className="text-sm text-red-600 hover:underline" onClick={onDelete}>
          Delete
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </Card>
  );
}

function CompanyForm({
  mode,
  initial,
  submitting,
  onCancel,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  initial?: CompanyValues;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: CompanyValues) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await onSubmit({ name: name.trim(), description: description.trim(), phone: phone.trim() });
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Something went wrong');
        }
      }}
    >
      <div>
        <label className="mb-1 block text-sm font-medium">Company name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Description</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Optional company description"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Phone</label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Contact number" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : mode === 'create' ? 'Create company' : 'Save changes'}
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
