'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { useUploadGate } from './upload-gate';

/**
 * The product form's save button. It waits for two things rather than one: the server action that
 * writes the product, and any picture still being handled — saving mid-photo writes the product
 * without it, and the row goes on spinning over a form already persisted.
 *
 * The number is repeated here because the upload's own bar is inside the photo dialog, and the
 * button the merchant is about to press is a screen away at the bottom of the form. Without it the
 * button simply reads "Uploading image…" for as long as a big photo takes, which looks like a stuck
 * page rather than a picture on its way.
 */
export function ProductFormSubmit({ label, saving }: { label: string; saving: string }) {
  const { pending } = useFormStatus();
  const gate = useUploadGate();
  const uploading = gate?.uploading ?? false;
  const percent = gate?.percent ?? null;

  return (
    <div className="w-full sm:w-auto">
      <Button type="submit" disabled={pending || uploading} className="w-full sm:w-auto">
        {uploading
          ? percent === null
            ? 'Handling image…'
            : `Uploading image… ${percent}%`
          : pending
            ? saving
            : label}
      </Button>
      {uploading && (
        <div
          role="progressbar"
          aria-label="Image upload progress"
          aria-valuenow={percent ?? undefined}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className={
              percent === null
                ? 'h-full w-full origin-left animate-pulse rounded-full bg-primary/60'
                : 'h-full rounded-full bg-primary transition-[width] duration-200'
            }
            style={percent === null ? undefined : { width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
