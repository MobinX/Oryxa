import { cn } from '@/lib/utils';
import { InputHTMLAttributes, forwardRef } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]/30',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
