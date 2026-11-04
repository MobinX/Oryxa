'use client';

import { createContext, useContext, useRef, useState } from 'react';
import { CircleAlert, Loader2, Paperclip, X } from 'lucide-react';
import { formatMailBytes } from '@/lib/mail-format';
import type { UploadedAttachmentRef } from '@/lib/mail-attachments';

const MAX_FILES = 20;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

type UploadContextValue = {
  uploading: boolean;
  setUploading: (value: boolean) => void;
};

const UploadContext = createContext<UploadContextValue | null>(null);

export function AttachmentUploadProvider({ children }: { children: React.ReactNode }) {
  const [uploading, setUploading] = useState(false);
  return (
    <UploadContext.Provider value={{ uploading, setUploading }}>
      {children}
    </UploadContext.Provider>
  );
}

/** Lets a submit button hold the form while attachment bytes are still going to B2. */
export function useAttachmentUploading(): boolean {
  return useContext(UploadContext)?.uploading ?? false;
}

function putToStorage(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Storage upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Storage upload failed: network error'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    xhr.send(file);
  });
}

async function uploadAttachment(file: File, onProgress: (percent: number) => void) {
  const signResponse = await fetch('/api/admin/mail/attachments/sign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      filename: file.name || 'attachment',
      contentType: file.type || 'application/octet-stream',
      size: file.size,
    }),
  });
  const signed = (await signResponse.json().catch(() => ({}))) as {
    key?: string;
    uploadUrl?: string;
    filename?: string;
    contentType?: string;
    error?: string;
  };
  if (!signResponse.ok || !signed.key || !signed.uploadUrl) {
    throw new Error(signed.error || 'Could not prepare the upload');
  }

  await putToStorage(signed.uploadUrl, file, onProgress);

  return {
    key: signed.key,
    filename: signed.filename || file.name || 'attachment',
    contentType: signed.contentType || file.type || 'application/octet-stream',
    size: file.size,
  } satisfies UploadedAttachmentRef;
}

/**
 * The browser sends attachment bytes straight to B2 with a presigned PUT, the same way
 * product photos are uploaded. Only the returned key travels in the form, so the mail
 * action and API stay small no matter how large the file is.
 */
export function MailAttachmentField() {
  const context = useContext(UploadContext);
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadedAttachmentRef[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ name: string; percent: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  async function handleFiles(list: FileList | null) {
    if (!list?.length) return;
    const incoming = Array.from(list);
    setError(null);

    if (files.length + incoming.length > MAX_FILES) {
      setError(`At most ${MAX_FILES} attachments are allowed.`);
      return;
    }
    const incomingBytes = incoming.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes + incomingBytes > MAX_TOTAL_BYTES) {
      setError('Attachments must total 10 MB or less.');
      return;
    }

    setBusy(true);
    context?.setUploading(true);
    try {
      for (const file of incoming) {
        if (file.size <= 0) {
          setError(`${file.name} is empty.`);
          continue;
        }
        if (file.size > MAX_TOTAL_BYTES) {
          setError(`${file.name} is larger than 10 MB.`);
          continue;
        }
        setProgress({ name: file.name, percent: 0 });
        const uploaded = await uploadAttachment(file, (percent) =>
          setProgress({ name: file.name, percent }),
        );
        setFiles((current) => [...current, uploaded]);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Attachment upload failed');
    } finally {
      setBusy(false);
      context?.setUploading(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />
      <input type="hidden" name="uploaded_attachments" value={JSON.stringify(files)} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 motion-reduce:transition-none"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <Paperclip className="h-3.5 w-3.5" aria-hidden />
          )}
          {busy ? 'Uploading…' : 'Attach files'}
        </button>
        <span className="text-[11px] text-muted-foreground">
          Up to {MAX_FILES} files · 10 MB total · uploaded straight to private storage
        </span>
      </div>

      {progress ? (
        <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
          <p className="truncate text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">{progress.name}</span> ·{' '}
            {progress.percent}%
          </p>
          <div
            role="progressbar"
            aria-label={`Uploading ${progress.name}`}
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      ) : null}

      {files.length ? (
        <ul className="space-y-1" aria-label="Attached files">
          {files.map((file) => (
            <li
              key={file.key}
              className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2 text-xs"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Paperclip className="h-3 w-3" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{file.filename}</span>
              <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                {formatMailBytes(file.size)}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => setFiles((current) => current.filter((item) => item.key !== file.key))}
                aria-label={`Remove ${file.filename}`}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-xs leading-relaxed text-destructive">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
