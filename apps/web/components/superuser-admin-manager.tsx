'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import {
  CONSOLE_CAPABILITY_OPTIONS,
  type ConsoleUser,
} from '@/lib/console-capabilities';

function labelFor(key: string): string {
  return CONSOLE_CAPABILITY_OPTIONS.find((option) => option.key === key)?.label ?? key;
}

function CapabilityChecks({ selected }: { selected?: string[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {CONSOLE_CAPABILITY_OPTIONS.map((option) => (
        <label key={option.key} className="flex items-start gap-2 rounded-lg border border-border/60 p-2 text-xs">
          <input
            type="checkbox"
            name="capabilities"
            value={option.key}
            defaultChecked={selected?.includes(option.key)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">{option.label}</span>
            <span className="block text-[11px] text-muted-foreground">{option.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function AdminEditForm({ admin }: { admin: ConsoleUser }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const capabilities = form.getAll('capabilities').map(String);
    const password = String(form.get('password') ?? '').trim();
    const response = await fetch(`/api/superuser/admins/${encodeURIComponent(admin.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        capabilities,
        isActive: form.get('isActive') === 'on',
        ...(password ? { password } : {}),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setMessage(data.error || 'Could not save permissions');
      return;
    }
    setMessage('Permissions saved. The admin must sign in again if the session was revoked.');
    router.refresh();
  }

  return (
    <details className="mt-3 rounded-xl border border-border/60 bg-background/40 p-3">
      <summary className="cursor-pointer text-xs font-semibold text-primary">
        Edit permissions / password
      </summary>
      <form onSubmit={save} className="mt-3 space-y-3">
        <CapabilityChecks selected={admin.capabilities} />
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" name="isActive" defaultChecked={admin.isActive} />
          Active — can sign in
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Reset password (optional)</span>
          <input
            name="password"
            type="password"
            minLength={8}
            autoComplete="new-password"
            placeholder="Leave blank to keep the current password"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save permissions'}
        </button>
      </form>
    </details>
  );
}

export function SuperuserAdminManager({
  admins,
  currentEmail,
}: {
  admins: ConsoleUser[];
  currentEmail: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setError(null);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    const capabilities = form.getAll('capabilities').map(String);
    const response = await fetch('/api/superuser/admins', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: String(form.get('name') ?? '').trim() || null,
        email: String(form.get('email') ?? '').trim(),
        password: String(form.get('password') ?? ''),
        capabilities,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setCreating(false);
    if (!response.ok) {
      setError(data.error || 'Could not create admin');
      return;
    }
    setNotice('Admin created with a mail mailbox and the selected permissions.');
    event.currentTarget.reset();
    router.refresh();
  }

  async function remove(admin: ConsoleUser) {
    if (deleting) return;
    if (!window.confirm(`Delete ${admin.email}? Their console access is revoked immediately. Their mailbox is kept.`)) {
      return;
    }
    setDeleting(admin.id);
    setError(null);
    setNotice(null);
    const response = await fetch(`/api/superuser/admins/${encodeURIComponent(admin.id)}`, {
      method: 'DELETE',
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setDeleting(null);
    if (!response.ok) {
      setError(data.error || 'Could not delete admin');
      return;
    }
    setNotice(`${admin.email} deleted.`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Create admin</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          The email becomes the admin’s mailbox on <code>@onlyorders.tech</code> and the login
          identity. Capabilities control both the sidebar and the API.
        </p>

        <form onSubmit={create} className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Name</span>
              <input
                name="name"
                placeholder="Operations lead"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Admin email</span>
              <input
                name="email"
                type="email"
                required
                placeholder="admin@onlyorders.tech"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Initial password</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>
          <div>
            <p className="mb-2 text-sm font-medium">Capabilities</p>
            <CapabilityChecks />
          </div>
          {error ? (
            <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              {notice}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={creating}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {creating ? 'Creating…' : 'Create admin'}
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-base font-semibold">Admins</h2>
            <p className="text-xs text-muted-foreground">Signed in as {currentEmail}.</p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold">
            {admins.length} total
          </span>
        </div>

        {admins.map((admin) => (
          <article key={admin.id} className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {admin.role === 'superuser' ? <ShieldCheck className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold">{admin.name || admin.email}</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                      {admin.role}
                    </span>
                    {!admin.isActive ? (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase text-destructive">
                        disabled
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{admin.email}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {admin.capabilities.length ? (
                      admin.capabilities.map((capability) => (
                        <span key={capability} className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] text-muted-foreground">
                          {labelFor(capability)}
                        </span>
                      ))
                    ) : admin.role === 'superuser' ? (
                      <span className="text-[11px] text-muted-foreground">All capabilities</span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">No admin sections</span>
                    )}
                  </div>
                </div>
              </div>

              {admin.role !== 'superuser' ? (
                <button
                  type="button"
                  onClick={() => remove(admin)}
                  disabled={deleting === admin.id}
                  className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleting === admin.id ? 'Deleting…' : 'Delete'}
                </button>
              ) : null}
            </div>

            {admin.role !== 'superuser' ? <AdminEditForm admin={admin} /> : null}
          </article>
        ))}
      </section>
    </div>
  );
}
