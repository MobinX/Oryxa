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
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5 text-xl font-bold tracking-tight sm:text-2xl">
          <Icon className="h-6 w-6 shrink-0 text-primary" />
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-end gap-2">{actions}</div> : null}
    </div>
  );
}
