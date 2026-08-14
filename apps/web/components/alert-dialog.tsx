'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export function AlertDialog({
  open,
  title,
  description,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-desc"
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-2xl text-white">
            !
          </div>
          <h2 id="alert-dialog-title" className="mt-3 text-lg font-bold text-white">
            {title}
          </h2>
        </div>
        <div className="space-y-4 px-6 py-5 text-center">
          <p id="alert-dialog-desc" className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
          <Button type="button" onClick={onClose} className="w-full">
            OK
          </Button>
        </div>
      </div>
    </div>
  );
}
