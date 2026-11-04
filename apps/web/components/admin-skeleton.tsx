/** The shape of the dashboard, before any number has arrived. */
export function AdminSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-8 w-52 max-w-full animate-pulse rounded-element bg-muted" />
          <div className="h-4 w-80 max-w-full animate-pulse rounded-element bg-muted" />
        </div>
        <div className="h-9 w-40 max-w-full animate-pulse rounded-full bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-card bg-muted" />
        ))}
      </div>
      <div className="h-32 animate-pulse rounded-card bg-muted" />
      <div className="h-72 animate-pulse rounded-card bg-muted" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-64 animate-pulse rounded-card bg-muted lg:col-span-2" />
        <div className="h-64 animate-pulse rounded-card bg-muted" />
      </div>
    </div>
  );
}
