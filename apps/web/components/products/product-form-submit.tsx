'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { useUploadGate } from './upload-gate';

/**
 * The product form's save button. It waits for two things rather than one: the server action that
 * writes the product, and any variant image still travelling to storage — saving mid-upload writes
 * the product without the picture, and the row would go on spinning over a form already persisted.
 */
export function ProductFormSubmit({ label, saving }: { label: string; saving: string }) {
  const { pending } = useFormStatus();
  const uploading = useUploadGate()?.uploading ?? false;

  return (
    <Button type="submit" disabled={pending || uploading} className="w-full sm:w-auto">
      {uploading ? 'Uploading image…' : pending ? saving : label}
    </Button>
  );
}
