import { cn } from '@/lib/utils';
import { SelectHTMLAttributes, forwardRef } from 'react';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]/30',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
