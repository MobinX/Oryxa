'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { uploadVariantImageDirect } from '@/lib/uploads-client';

type ImageUploadProps = {
  token?: string;
  businessId: string;
  onUploaded: (result: { key: string; previewUrl: string }) => void;
  /** Lets the surrounding form block its save button until this upload has settled. */
  onUploadingChange?: (uploading: boolean) => void;
};

export function ImageUpload({ token, businessId, onUploaded, onUploadingChange }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function setBusy(busy: boolean) {
    setUploading(busy);
    onUploadingChange?.(busy);
  }

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    setProgress(0);
    try {
      const result = await uploadVariantImageDirect(businessId, file, setProgress);
      const { key, previewUrl } = result;
      onUploaded({ key, previewUrl });
    } catch (err: any) {
      if (err?.message?.includes('not configured')) {
        setError('Image upload unavailable. Save without an image or configure B2 storage.');
      } else {
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    } finally {
      setBusy(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? `Uploading… ${progress}%` : 'Upload image'}
      </Button>
      {uploading && (
        <div
          role="progressbar"
          aria-label="Image upload progress"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
