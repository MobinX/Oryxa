'use client';

import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';

function categoryDeleteWarning(categoryName: string, productCount: number) {
  if (productCount > 0) {
    return (
      `Delete category "${categoryName}"?\n\n` +
      `This will also soft-delete ${productCount} product${productCount === 1 ? '' : 's'} in this category. ` +
      `Those products will disappear from your catalog, filters, and agent search.\n\n` +
      `Continue?`
    );
  }
  return (
    `Delete category "${categoryName}"?\n\n` +
    `No products are currently in this category.\n\n` +
    `Continue?`
  );
}

export function DeleteCategoryButton({
  categoryName,
  productCount,
  onDelete,
}: {
  categoryName: string;
  productCount: number;
  onDelete: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      className="inline-flex items-center justify-center text-sm text-red-600 hover:underline font-semibold disabled:opacity-50"
      title="Delete"
      onClick={() => {
        if (!confirm(categoryDeleteWarning(categoryName, productCount))) return;
        startTransition(async () => {
          await onDelete();
        });
      }}
    >
      <Trash2 className="h-4 w-4 sm:hidden" />
      <span className="hidden sm:inline">{pending ? 'Deleting…' : 'Delete'}</span>
    </button>
  );
}
