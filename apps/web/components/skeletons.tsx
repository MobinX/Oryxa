import { cn } from '@/lib/utils';

export function Pulse({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-muted', className)} />;
}

export function TablePageSkeleton({
  titleWidth = 'w-36',
  rows = 6,
  cols = 4,
  showHeader = true,
}: {
  titleWidth?: string;
  rows?: number;
  cols?: number;
  showHeader?: boolean;
}) {
  return (
    <div className="space-y-6">
      {showHeader && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Pulse className={cn('h-8', titleWidth)} />
            <Pulse className="h-4 w-48" />
          </div>
          <Pulse className="h-10 w-32" />
        </div>
      )}
      <div className="overflow-hidden rounded-card border border-border/80">
        <div className="grid gap-px bg-border/40" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((_, i) => (
            <Pulse key={`h-${i}`} className="h-11 rounded-none" />
          ))}
          {Array.from({ length: rows * cols }).map((_, i) => (
            <Pulse key={`c-${i}`} className="h-14 rounded-none bg-muted/60" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function FormPageSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Pulse className="h-4 w-32" />
      <div className="rounded-card border border-border/80 bg-card p-6 space-y-4">
        <Pulse className="h-8 w-48" />
        <Pulse className="h-10 w-full" />
        <Pulse className="h-10 w-full" />
        <Pulse className="h-24 w-full" />
        <div className="flex justify-end gap-2 pt-2">
          <Pulse className="h-10 w-24" />
          <Pulse className="h-10 w-32" />
        </div>
      </div>
    </div>
  );
}

export function DashboardPageSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-5">
        <Pulse className="h-11 w-full max-w-md" />
        <div className="flex gap-2">
          <Pulse className="h-10 w-10 rounded-xl" />
          <Pulse className="h-10 w-10 rounded-full" />
        </div>
      </div>
      <div className="space-y-2">
        <Pulse className="h-9 w-72" />
        <Pulse className="h-4 w-56" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Pulse key={i} className="h-36 rounded-[22px]" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-12">
        <Pulse className="h-72 lg:col-span-5 rounded-[22px]" />
        <Pulse className="h-72 lg:col-span-7 rounded-[22px]" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Pulse key={i} className="h-28 rounded-[22px]" />
        ))}
      </div>
    </div>
  );
}

export function SplitPaneSkeleton() {
  return (
    <div className="flex min-h-0 flex-col">
      <Pulse className="h-8 w-32" />
      <div className="mt-4 flex min-h-[min(70vh,600px)] overflow-hidden rounded-card border border-border/80 lg:mt-6">
        <Pulse className="hidden w-80 shrink-0 rounded-none lg:block" />
        <div className="flex flex-1 flex-col gap-3 p-4">
          <Pulse className="h-10 w-full" />
          <Pulse className="h-16 w-3/4" />
          <Pulse className="ml-auto h-16 w-2/3" />
          <Pulse className="h-16 w-1/2" />
        </div>
      </div>
    </div>
  );
}
