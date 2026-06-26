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
        <div className="rounded-card border border-border/80 bg-card p-12 text-center text-muted-foreground shadow-card">
          {emptyMessage}
        </div>
      ) : (
        <div className="table-wrap overflow-x-auto rounded-card border border-border/80 bg-card shadow-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                {bulkDeleteAction && (
                  <th className="w-10 px-5 py-4 text-left font-medium">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-border text-primary bg-card outline-none focus:ring-2 focus:ring-primary/20"
                      aria-label="Select all"
                    />
                  </th>
                )}
                {headers.map((col) => (
                  <th key={col.key} className={`px-5 py-4 text-left font-semibold text-foreground tracking-wide font-geist text-xs uppercase max-w-0 ${col.className ?? ''}`}>
                    {col.header}
                  </th>
                ))}
                {hasRowActions && <th className="w-1 px-5 py-4 text-right font-semibold text-foreground tracking-wide font-geist text-xs uppercase whitespace-nowrap">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/40 last:border-0 transition-colors hover:bg-muted/30">
                  {bulkDeleteAction && (
                    <td className="px-5 py-4">
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                        className="h-4 w-4 rounded border-border text-primary bg-card outline-none focus:ring-2 focus:ring-primary/20"
                        aria-label="Select row"
                      />
                    </td>
                  )}
                  {row.cells.map((cell, index) => (
                    <td
                      key={headers[index]?.key ?? index}
                      className={`px-5 py-4 text-foreground/90 font-medium ${headers[index]?.className ?? ''}`}
                    >
                      {cell}
                    </td>
                  ))}
                  {hasRowActions && (
                    <td className="w-1 px-5 py-4 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2.5">{row.actions}</div>
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
