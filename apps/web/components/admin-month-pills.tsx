import Link from 'next/link';
import { monthLabel, recentMonths } from '@/lib/admin-month';

/**
 * The month selector, as links rather than a `<select>`: it must work with no client
 * JavaScript, and a month is a window a reader may want to bookmark. A pasted month that
 * has already rolled out of the four newest ones takes the first slot, so the control never
 * offers four links to somewhere other than what the page is showing.
 */
export function AdminMonthPills({ hrefBase, month }: { hrefBase: string; month: string }) {
  const months = recentMonths(4);
  const pills = months.includes(month) ? months : [month, ...months.slice(0, 3)];

  return (
    <div className="flex items-center rounded-full border border-border/40 bg-muted/40 p-1">
      {pills.map((key) => (
        <Link
          key={key}
          href={`${hrefBase}?month=${key}`}
          aria-current={key === month ? 'page' : undefined}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
            key === month
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {key === months[0] ? 'This month' : monthLabel(key)}
        </Link>
      ))}
    </div>
  );
}
