'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useUploadGate } from '@/components/products/upload-gate';
import {
  uploadVariantImageDirect,
  ImageUploadError,
  type UploadedImage,
} from '@/lib/uploads-client';

/** Where the short id sits on the picture. A buyer reads it off the photo, so corners only. */
type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const CORNERS: Array<{ value: Corner; label: string }> = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-right', label: 'Bottom right' },
];

/** The bucket refuses anything over 4MB, so the stamped picture is re-rolled at lower quality until it fits. */
const MAX_STORED_BYTES = 4 * 1024 * 1024;
const QUALITIES = [0.9, 0.8, 0.68, 0.55];

/**
 * Longest side kept after editing. Enough for the id to still read on a phone, small enough to
 * stay inside the storage cap — and inside the canvas area a mobile browser is willing to allocate,
 * which a 108-megapixel phone photo is not.
 */
const MAX_EDGE = 2048;

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality));
}

/** Draws the id into one corner: white glyphs on a soft plate, so it reads on any background. */
function stamp(canvas: HTMLCanvasElement, bitmap: ImageBitmap, corner: Corner, text: string) {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw on the picture.');

  ctx.drawImage(bitmap, 0, 0, width, height);

  const side = Math.max(width, height);
  const fontSize = Math.round(Math.min(72, Math.max(16, side * 0.05)));
  const margin = Math.round(side * 0.03);
  const padX = Math.round(fontSize * 0.42);
  const padY = Math.round(fontSize * 0.26);

  ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  const textWidth = ctx.measureText(text).width;
  const boxWidth = textWidth + padX * 2;
  const boxHeight = fontSize + padY * 2;
  const x = corner.endsWith('left') ? margin : width - margin - boxWidth;
  const y = corner.startsWith('top') ? margin : height - margin - boxHeight;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = fontSize * 0.35;
  ctx.shadowOffsetY = Math.max(1, fontSize * 0.05);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.62)';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, boxWidth, boxHeight, Math.round(fontSize * 0.3));
  else ctx.rect(x, y, boxWidth, boxHeight);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, Math.round(x + padX), Math.round(y + padY));
}

/**
 * One picture, two steps, nothing sent anywhere until the merchant says so.
 *
 * Step one reads the file into the page and shows how far that read got; step two draws the
 * variant's short id onto the picture with the canvas API and only then puts the edited JPEG
 * into storage. The bytes stay in memory between the two, so a picture the merchant did not like
 * never reaches the bucket and never costs a slot in the photo allowance.
 */
export function VariantPhotoDialog({
  businessId,
  file,
  label,
  remaining,
  onUploaded,
  onCancel,
}: {
  businessId: string;
  file: File;
  /** The variant's short label to stamp, or null when the row has none to give. */
  label: string | null;
  /** How many more pictures are waiting behind this one. */
  remaining: number;
  onUploaded: (image: UploadedImage) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<'prepare' | 'place'>('prepare');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [readPercent, setReadPercent] = useState(0);
  const [ready, setReady] = useState(false);
  const [corner, setCorner] = useState<Corner | null>(null);
  const [stamping, setStamping] = useState(false);
  const [stamped, setStamped] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bitmapRef = useRef<ImageBitmap | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** The edited bytes, held between the drawing and the merchant pressing Upload. */
  const stampedRef = useRef<Blob | null>(null);

  const gate = useUploadGate();
  const begin = gate?.begin;
  const end = gate?.end;
  const report = gate?.report;

  // Every phase that can lose a picture holds the form's save button: reading the file into the
  // page, redrawing it with the variant's id, and the PUT to storage. None of them is instant — a
  // 4 MB shot takes seconds to read and encode — and a save that lands mid-phase writes the
  // product without the photo nobody has finished.
  //
  // Between phases the button frees again, and so it does the moment a phase fails: an error is
  // not work in progress, and holding a form hostage to a picture that will never arrive is its
  // own kind of broken.
  const working = uploading || stamping || (step === 'prepare' && !ready && !error);
  useEffect(() => {
    if (!working || !begin || !end) return;
    begin();
    return () => end();
  }, [working, begin, end]);

  // Reading the file is the only work step one does, and it is undone on any exit — including
  // the merchant cancelling out of a picture they no longer want.
  useEffect(() => {
    let abandoned = false;
    let objectUrl: string | null = null;
    const reader = new FileReader();

    setStep('prepare');
    setReadPercent(0);
    setReady(false);
    setCorner(null);
    setStamped(false);
    setError(null);
    stampedRef.current = null;

    reader.onprogress = (event) => {
      if (!abandoned && event.lengthComputable) {
        setReadPercent(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };
    reader.onerror = () => {
      if (!abandoned) setError('The browser could not read that file. Pick it again.');
    };
    reader.onload = async () => {
      if (abandoned) return;
      try {
        const blob = new Blob([reader.result as ArrayBuffer], { type: file.type || 'image/jpeg' });
        bitmapRef.current = await createImageBitmap(blob);
        if (abandoned) return;
        objectUrl = URL.createObjectURL(file);
        setPreviewUrl(objectUrl);
        setReadPercent(100);
        setReady(true);
      } catch {
        if (!abandoned) setError('That file is not a picture this editor can open.');
      }
    };
    reader.readAsArrayBuffer(file);

    return () => {
      abandoned = true;
      reader.abort();
      bitmapRef.current?.close();
      bitmapRef.current = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setPreviewUrl(null);
    };
  }, [file]);

  // The picture paints itself: entering step two draws it plain, and picking a corner redraws it
  // with the id in that corner. `Upload` only becomes possible once a draw has finished.
  useEffect(() => {
    if (step !== 'place' || !ready) return;
    void draw(corner);
  }, [step, ready, corner]);

  useEffect(() => {
    if (step !== 'place' || uploading) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, uploading, onCancel]);

  /** Redraws whatever is on screen: the plain picture, then the picture with the id in it. */
  async function draw(chosen: Corner | null) {
    const bitmap = bitmapRef.current;
    const canvas = canvasRef.current;
    if (!bitmap || !canvas) return;

    setStamping(true);
    setStamped(false);
    // One frame of slack, so the disabled Upload button paints before this blocks on the encode.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    try {
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This browser cannot draw on the picture.');
      // The output is JPEG, which has no alpha: a transparent PNG or the first frame of a GIF
      // would otherwise be flattened onto black.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (chosen && label) stamp(canvas, bitmap, chosen, `#${label}`);
      else ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of QUALITIES) {
        const blob = await toBlob(canvas, quality);
        if (!blob) throw new Error('The browser could not write the edited picture.');
        if (blob.size <= MAX_STORED_BYTES) {
          stampedRef.current = blob;
          setStamped(true);
          return;
        }
      }
      throw new Error('Even at its smallest, this picture is too large to store.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The picture could not be edited.');
    } finally {
      setStamping(false);
    }
  }

  async function upload() {
    const blob = stampedRef.current;
    if (!blob || uploading) return;

    setError(null);
    setUploading(true);
    setUploadPercent(0);
    report?.(0);
    try {
      const edited = new File([blob], label ? `variant-${label}.jpg` : 'variant.jpg', {
        type: 'image/jpeg',
      });
      const result = await uploadVariantImageDirect(businessId, edited, (percent) => {
        setUploadPercent(percent);
        report?.(percent);
      });
      onUploaded(result);
    } catch (err) {
      setError(
        err instanceof ImageUploadError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'The edited picture could not be stored.',
      );
      setUploadPercent(0);
      report?.(0);
    } finally {
      setUploading(false);
    }
  }

  const awaitingCorner = Boolean(label) && corner === null;
  const canUpload = stamped && !stamping && !uploading && !awaitingCorner;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="variant-photo-dialog-title"
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="min-w-0">
            <h2 id="variant-photo-dialog-title" className="truncate text-sm font-semibold text-foreground">
              {step === 'prepare' ? '1 · Read the picture' : '2 · Place the variant id'}
            </h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {file.name}
              {remaining > 0 ? ` — ${remaining} more after this` : ''}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label ? `#${label}` : 'no id'}
          </span>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {step === 'prepare' ? (
            <>
              <div className="aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="The picture being prepared"
                    className="h-full w-full object-contain"
                  />
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{ready ? 'Ready to edit' : 'Reading…'}</span>
                  <span>{readPercent}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Picture read progress"
                  aria-valuenow={readPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-200"
                    style={{ width: `${readPercent}%` }}
                  />
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Nothing leaves the browser yet. Next places the id on the picture; only Upload
                  stores it.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-border bg-muted">
                <canvas
                  ref={canvasRef}
                  aria-label="The picture with the variant id placed on it"
                  className="mx-auto block h-auto max-h-56 w-auto max-w-full"
                />
              </div>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">
                  Where the id goes
                </span>
                <Select
                  value={corner ?? ''}
                  disabled={!label || stamping || uploading}
                  onChange={(event) => setCorner((event.target.value || null) as Corner | null)}
                >
                  <option value="">
                    {label ? 'Choose a corner…' : 'This variant has no short id yet'}
                  </option>
                  {CORNERS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {label
                  ? 'The id is burnt into the photo, so a customer who sends the picture back can be read straight off it.'
                  : 'This row has no short id to place, so the picture is stored as it is.'}
              </p>
              {uploading && (
                <div
                  role="progressbar"
                  aria-label="Picture upload progress"
                  aria-valuenow={uploadPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-200"
                    style={{ width: `${uploadPercent}%` }}
                  />
                </div>
              )}
            </>
          )}

          {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-4">
          {step === 'prepare' ? (
            <>
              <Button type="button" variant="ghost" onClick={onCancel} disabled={uploading}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep('place');
                }}
                disabled={!ready || uploading}
              >
                Next
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setError(null);
                  setStep('prepare');
                }}
                disabled={uploading}
              >
                Back
              </Button>
              <Button type="button" onClick={() => void upload()} disabled={!canUpload}>
                {uploading ? `Uploading… ${uploadPercent}%` : stamping ? 'Placing id…' : 'Upload'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
