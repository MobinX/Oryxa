import type { LucideIcon } from 'lucide-react';

/**
 * One header for every console page: icon, title, description on the left, the page's
 * actions (filters, primary buttons) bottom-right on the wrap. Titles and descriptions
 * only ever restate what the page really does.
 */
export function AdminPageHeader({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-card shadow-sm"
        >
          <Icon className="h-5 w-5 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-balance sm:text-2xl">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-pretty text-muted-foreground sm:text-[15px]">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 pb-0.5">{actions}</div>
      ) : null}
    </div>
  );
}
