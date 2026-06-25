import { cn } from '@/lib/utils';

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm', className)}>
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
    default: 'bg-zinc-100 text-zinc-700',
    warning: 'bg-yellow-100 text-yellow-800',
    success: 'bg-green-100 text-green-800',
    info: 'bg-blue-100 text-blue-800',
    purple: 'bg-purple-100 text-purple-800',
  };
  return (
    <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', colors[variant])}>
      {children}
    </span>
  );
}
