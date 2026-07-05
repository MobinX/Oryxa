'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Button } from './ui/button';

export function DeleteSuccessDialog() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get('deleted') === 'facebook') {
      setOpen(true);
    }
  }, [searchParams]);

  const handleClose = () => {
    setOpen(false);
    // Remove the 'deleted' search param from the URL without triggering a full reload
    const params = new URLSearchParams(searchParams.toString());
    params.delete('deleted');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all duration-300"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-sm bg-[var(--card)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden scale-100 transform transition-all duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Decorative Success Icon/Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-green-600 px-6 py-6 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-3xl text-white font-bold shadow-inner">
            ✓
          </div>
          <h2 className="text-xl font-bold text-white mt-3">Facebook Page Deleted</h2>
        </div>

        <div className="px-6 py-5 text-center space-y-4">
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            Your connected Facebook page has been deleted successfully.
          </p>

          <div className="pt-2">
            <Button
              type="button"
              onClick={handleClose}
              className="w-full h-11 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 active:bg-emerald-800 transition-colors shadow-sm"
            >
              OK
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
