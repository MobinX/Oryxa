'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { importShopifyCsv, initialImportState, type ImportState } from '@/lib/product-csv-import';
import { COMPACT_CSV_GUIDE, COMPACT_CSV_EXAMPLE, COMPACT_CSV_PROMPT } from '@/lib/shopify-csv';

/**
 * Upload a Shopify product export and let the browser do the whole import: the CSV streams in
 * chunks, every image is downloaded, stamped with its variant's short label on a canvas, and
 * pushed straight to B2; only the finished object keys go to the API in small pages.
 */
export function ProductCsvImport({ businessId }: { businessId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<ImportState | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const running = state !== null && (state.phase === 'parsing' || state.phase === 'importing');

  const close = () => {
    if (running) return;
    setOpen(false);
    setState(null);
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const start = async () => {
    if (!file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setState(initialImportState);
    const finalState = await importShopifyCsv({
      file,
      businessId,
      onState: setState,
      signal: controller.signal,
    });
    // The returned state is authoritative — whatever path the import ended on, the dialog shows it.
    setState(finalState);
    if (finalState.phase === 'done') router.refresh();
  };

  const cancel = () => abortRef.current?.abort();

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(COMPACT_CSV_PROMPT);
    } catch {
      const area = document.createElement('textarea');
      area.value = COMPACT_CSV_PROMPT;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }
    setCopiedPrompt(true);
    window.setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const downloadSample = () => {
    const blob = new Blob([COMPACT_CSV_EXAMPLE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'oryxa-compact-products-sample.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const parsePercent = state ? Math.round(state.parseFraction * 100) : 0;
  const megabytes = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Upload product CSV
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-[var(--background)] p-6 shadow-xl">
            <h2 className="text-lg font-bold">Import products from Shopify CSV</h2>

            {!state && (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-[var(--muted-foreground)]">
                  Pick a product CSV. Images are downloaded, stamped with each variant&apos;s short
                  id, and uploaded from your browser — keep this tab open until it finishes.
                </p>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3 text-xs">
                  <p className="font-semibold">Only two formats are supported</p>
                  <p className="mt-1 text-[var(--muted-foreground)]">
                    A Shopify product export (a <code>Handle</code> or <code>URL handle</code>{' '}
                    column) or the compact Oryxa template below (a <code>Product Name</code>{' '}
                    column). Any other CSV is rejected.
                  </p>
                </div>
                <details className="rounded-xl border border-[var(--border)] p-3 text-xs">
                  <summary className="cursor-pointer font-medium">
                    Compact template — columns, defaults and an example
                  </summary>
                  <div className="mt-2 max-h-72 space-y-3 overflow-y-auto pr-1">
                    <div className="space-y-2">
                      <p className="text-[10px] leading-relaxed text-[var(--muted-foreground)]">
                        Don&apos;t have this structure? Copy this prompt, attach your CSV to any AI
                        assistant, and it will convert the file for you — or start from the sample.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-7 px-2 text-[10px]"
                          onClick={copyPrompt}
                        >
                          {copiedPrompt ? 'Copied' : 'Copy prompt'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-7 px-2 text-[10px]"
                          onClick={downloadSample}
                        >
                          Download sample CSV
                        </Button>
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                      <table className="w-full border-collapse text-left text-[10px]">
                        <thead className="bg-[var(--muted)] text-[var(--muted-foreground)]">
                          <tr>
                            <th className="px-2 py-1.5 font-semibold">Column</th>
                            <th className="px-2 py-1.5 font-semibold">Required</th>
                            <th className="px-2 py-1.5 font-semibold">Default / notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {COMPACT_CSV_GUIDE.map((column) => (
                            <tr key={column.name} className="border-t border-[var(--border)]">
                              <td className="whitespace-nowrap px-2 py-1 font-mono">{column.name}</td>
                              <td className="px-2 py-1">
                                <span
                                  className={`rounded border px-1 text-[9px] font-semibold uppercase ${
                                    column.requirement === 'required'
                                      ? 'border-red-400/50 text-red-600 dark:text-red-400'
                                      : 'border-emerald-400/50 text-emerald-600 dark:text-emerald-400'
                                  }`}
                                >
                                  {column.requirement === 'required' ? 'Required' : 'Optional'}
                                </span>
                              </td>
                              <td className="px-2 py-1 text-[var(--muted-foreground)]">
                                {column.note || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold">
                        Example — one product with two variants, then a minimal product
                      </p>
                      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre text-[9px] leading-relaxed text-[var(--muted-foreground)]">
                        {COMPACT_CSV_EXAMPLE}
                      </pre>
                    </div>
                  </div>
                </details>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="block w-full cursor-pointer rounded-xl border border-[var(--border)] p-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--primary)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={close}>
                    Cancel
                  </Button>
                  <Button type="button" disabled={!file} onClick={start}>
                    Start import
                  </Button>
                </div>
              </div>
            )}

            {state && running && (
              <div className="mt-4 space-y-3">
                {state.phase === 'parsing' ? (
                  <>
                    <p className="text-sm">
                      Reading CSV…{parsePercent > 0 ? ` ${parsePercent}%` : ''}
                      {state.totalBytes > 0
                        ? ` — ${megabytes(state.bytesRead)} of ${megabytes(state.totalBytes)} MB`
                        : ''}
                      {state.totalProducts > 0 ? ` — ${state.totalProducts} products found so far` : ''}
                    </p>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                      {parsePercent > 0 ? (
                        <div className="h-full bg-[var(--primary)]" style={{ width: `${parsePercent}%` }} />
                      ) : (
                        <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--primary)]" />
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="truncate text-sm font-medium">{state.currentName ?? 'Working…'}</p>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      {state.processedProducts} / {state.totalProducts} products ·{' '}
                      {state.imagesUploaded} images uploaded
                      {state.imagesFailed > 0 ? ` · ${state.imagesFailed} images skipped` : ''}
                    </p>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                      <div
                        className="h-full bg-[var(--primary)] transition-all"
                        style={{
                          width: `${state.totalProducts > 0 ? Math.round((state.processedProducts / state.totalProducts) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {state.createdProducts} products created so far
                    </p>
                  </>
                )}
                <div className="flex justify-end">
                  <Button type="button" variant="outline" onClick={cancel}>
                    Cancel import
                  </Button>
                </div>
              </div>
            )}

            {state && !running && (
              <div className="mt-4 space-y-3">
                {state.phase === 'done' && (
                  <p className="text-sm">
                    Created {state.createdProducts} of {state.totalProducts} products
                    {state.relabeledCount > 0 ? ` — ${state.relabeledCount} short ids were re-assigned` : ''}
                    {state.imagesFailed > 0 ? `, ${state.imagesFailed} images could not be fetched` : ''}.
                  </p>
                )}
                {state.phase === 'aborted' && <p className="text-sm">Import cancelled.</p>}
                {state.phase === 'error' && (
                  <p className="text-sm text-red-600">{state.errorMessage ?? 'The import failed.'}</p>
                )}
                {state.failedProducts.length > 0 && (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl bg-[var(--muted)] p-3">
                    {state.failedProducts.map((f, i) => (
                      <p key={i} className="truncate text-xs text-[var(--muted-foreground)]">
                        <span className="font-medium">{f.name}</span> — {f.error}
                      </p>
                    ))}
                  </div>
                )}
                <div className="flex justify-end">
                  <Button type="button" onClick={close}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
