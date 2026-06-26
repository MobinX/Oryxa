'use client';

import { useState, useTransition, ReactNode } from 'react';

export type DataTableHeader = {
  key: string;
  header: string;
  className?: string;
};

export type DataTableRow = {
  id: string;
  cells: ReactNode[];
  actions?: ReactNode;
};

type DataTableProps = {
  headers: DataTableHeader[];
  rows: DataTableRow[];
  /** Server action invoked with FormData containing `idField` repeated for each selected id. */
  bulkDeleteAction?: (formData: FormData) => Promise<void>;
  bulkDeleteIdField?: string;
  emptyMessage?: string;
  /** When true, the last column header gets "Actions" label automatically. */
  hasRowActions?: boolean;
};

/**
 * Server-data table with optional multi-select bulk delete. Row cells and actions
 * must be rendered on the server; only checkbox selection runs on the client.
 */
export function DataTable({
  headers,
  rows,
  bulkDeleteAction,
  bulkDeleteIdField = 'ids',
  emptyMessage = 'No records found.',
  hasRowActions,
}: DataTableProps) {
  const ids = rows.map((row) => row.id);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const allSelected = ids.length > 0 && selected.size === ids.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => (prev.size === ids.length ? new Set() : new Set(ids)));

  const submitBulk = () => {
    if (!bulkDeleteAction) return;
    const form = new FormData();
    for (const id of selected) form.append(bulkDeleteIdField, id);
    startTransition(async () => {
      await bulkDeleteAction(form);
      setSelected(new Set());
    });
  };

  return (
    <div className="space-y-3">
      {bulkDeleteAction && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={toggleAll}
              disabled={ids.length === 0}
              className="h-4 w-4 rounded border-[var(--border)]"
            />
            {allSelected ? 'All selected' : `${selected.size} selected`}
          </label>
          {selected.size > 0 ? (
            <button
              type="button"
              onClick={submitBulk}
              disabled={pending}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? 'Working…' : `Delete selected (${selected.size})`}
            </button>
          ) : (
            <span className="text-xs text-[var(--muted-foreground)]">
              Select rows to enable bulk delete.
            </span>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-white p-8 text-center text-[var(--muted-foreground)]">
          {emptyMessage}
        </div>
      ) : (
        <div className="table-wrap overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--muted)]">
              <tr>
                {bulkDeleteAction && (
                  <th className="w-10 px-4 py-3 text-left font-medium">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-[var(--border)]"
                      aria-label="Select all"
                    />
                  </th>
                )}
                {headers.map((col) => (
                  <th key={col.key} className={`px-4 py-3 text-left font-medium ${col.className ?? ''}`}>
                    {col.header}
                  </th>
                ))}
                {hasRowActions && <th className="px-4 py-3 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
                  {bulkDeleteAction && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                        className="h-4 w-4 rounded border-[var(--border)]"
                        aria-label="Select row"
                      />
                    </td>
                  )}
                  {row.cells.map((cell, index) => (
                    <td
                      key={headers[index]?.key ?? index}
                      className={`px-4 py-3 ${headers[index]?.className ?? ''}`}
                    >
                      {cell}
                    </td>
                  ))}
                  {hasRowActions && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-3">{row.actions}</div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
