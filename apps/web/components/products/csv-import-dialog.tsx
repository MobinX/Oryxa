'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { importShopifyCsv, initialImportState, type ImportState } from '@/lib/product-csv-import';

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
    if (finalState.phase === 'done') router.refresh();
  };

  const cancel = () => abortRef.current?.abort();

  const parsePercent = state ? Math.round(state.parseFraction * 100) : 0;

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
                  Pick a product CSV exported from Shopify. Images are downloaded, stamped with each
                  variant&apos;s short id, and uploaded from your browser — keep this tab open until
                  it finishes.
                </p>
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
                    <p className="text-sm">Reading CSV… {parsePercent}%</p>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                      <div className="h-full bg-[var(--primary)]" style={{ width: `${parsePercent}%` }} />
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
