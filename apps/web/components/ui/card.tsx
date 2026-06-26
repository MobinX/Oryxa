import { cn } from '@/lib/utils';

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-card border border-border bg-card p-6 shadow-card transition-all duration-300 hover:shadow-lg',
        className
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'warning' | 'success' | 'info' | 'purple';
}) {
  const colors = {
    default: 'bg-muted text-muted-foreground border border-border/30',
    warning: 'bg-yellow-500/10 text-yellow-500 dark:text-yellow-400 border border-yellow-500/20',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
    info: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20',
    purple: 'bg-primary/10 text-primary border border-primary/20',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide uppercase',
        colors[variant]
      )}
    >
      {children}
    </span>
  );
}
