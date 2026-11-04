'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PaymentMethod } from '@/lib/api';

type MethodRow = { name: string; info: string; requiresTransactionId: boolean };

const STARTERS: MethodRow[] = [
  { name: 'bKash', info: '', requiresTransactionId: true },
  { name: 'Nagad', info: '', requiresTransactionId: true },
];

export function PaymentMethodsEditor({
  action,
  initial,
}: {
  action: (formData: FormData) => void;
  initial: PaymentMethod[];
}) {
  const [rows, setRows] = useState<MethodRow[]>(
    initial.length
      ? initial.map((method) => ({
          name: method.name,
          info: method.info ?? '',
          requiresTransactionId: method.requiresTransactionId === true,
        }))
      : STARTERS,
  );
  const [error, setError] = useState<string | null>(null);

  const payload = rows
    .map((row) => ({
      name: row.name.trim(),
      info: row.info.trim(),
      requiresTransactionId: row.requiresTransactionId,
    }))
    .filter((row) => row.name.length > 0);

  // A half-typed row is a mistake, not an empty one: the merchant means to take money this way
  // and would otherwise wonder why the agent never offers it.
  const complete = rows.every(
    (row) => row.name.trim().length === 0 || row.name.trim().length <= 40,
  );

  function update(index: number, patch: Partial<MethodRow>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!complete) {
          event.preventDefault();
          setError('A payment method name must be 40 characters or fewer. Remove empty rows.');
          return;
        }
        setError(null);
      }}
      className="mt-4 space-y-3"
    >
      <input type="hidden" name="methods" value={JSON.stringify(payload)} />

      <p className="rounded-lg bg-[var(--muted)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
        Cash on delivery is always available and needs no transaction id. Everything below is a way
        the customer pays you first.
      </p>

      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="rounded-xl border border-[var(--border)] p-3">
            <div className="flex items-start gap-2">
              <Input
                aria-label={`Method ${index + 1} name`}
                placeholder="e.g. bKash, Nagad, Bank transfer"
                value={row.name}
                maxLength={40}
                onChange={(event) => update(index, { name: event.target.value })}
                className="min-w-0 flex-1"
              />
              <button
                type="button"
                onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                aria-label={`Remove ${row.name || `method ${index + 1}`}`}
                className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <Input
              aria-label={`Account details for ${row.name || `method ${index + 1}`}`}
              placeholder="Number or account the customer pays into, e.g. 01712-345678 (Personal)"
              value={row.info}
              maxLength={200}
              onChange={(event) => update(index, { info: event.target.value })}
              className="mt-2 w-full"
            />
            <label className="mt-2 flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={row.requiresTransactionId}
                onChange={(event) =>
                  update(index, { requiresTransactionId: event.target.checked })
                }
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--border)] accent-[var(--primary)]"
              />
              <span>
                Need a transaction ID before the order can be created
                <span className="mt-0.5 block text-[var(--muted-foreground)]">
                  The agent asks for it, and no order is saved without it.
                </span>
              </span>
            </label>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          setRows((current) => [
            ...current,
            { name: '', info: '', requiresTransactionId: false },
          ])
        }
      >
        <Plus className="mr-1 h-3.5 w-3.5" /> Add payment method
      </Button>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[var(--muted-foreground)]">
          The agent offers only these, tells the customer the number written here, and refuses an
          order until the transaction id arrives when the box is ticked.
        </p>
        <SaveButton />
      </div>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      {pending ? 'Saving…' : 'Save payment methods'}
    </Button>
  );
}
