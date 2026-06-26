import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes, forwardRef } from 'react';

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}>(({ className, variant = 'default', size = 'md', ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center font-medium tracking-wide transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]',
      variant === 'default' && 'bg-primary text-primary-foreground shadow-sm hover:brightness-105 active:brightness-95',
      variant === 'outline' && 'border border-border bg-card text-foreground hover:bg-muted',
      variant === 'ghost' && 'text-foreground hover:bg-muted',
      size === 'sm' && 'h-9 px-4 rounded-xl text-xs',
      size === 'md' && 'h-10 px-5 rounded-[12px] text-sm',
      size === 'lg' && 'h-12 px-6 rounded-[14px] text-sm font-semibold',
      className,
    )}
    {...props}
  />
));
Button.displayName = 'Button';
