import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes, forwardRef } from 'react';

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}>(({ className, variant = 'default', size = 'md', ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:opacity-50',
      variant === 'default' && 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90',
      variant === 'outline' && 'border border-[var(--border)] bg-white hover:bg-[var(--muted)]',
      variant === 'ghost' && 'hover:bg-[var(--muted)]',
      size === 'sm' && 'h-8 px-3 text-sm',
      size === 'md' && 'h-10 px-4 text-sm',
      size === 'lg' && 'h-12 px-6',
      className,
    )}
    {...props}
  />
));
Button.displayName = 'Button';
