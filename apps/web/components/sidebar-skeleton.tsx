import Link from 'next/link';
import {
  LayoutDashboard,
  Package,
  MessageSquare,
  ShoppingCart,
  Radio,
  FolderTree,
  Settings,
} from 'lucide-react';

const nav = [
  { href: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: 'products', label: 'Products', icon: Package },
  { href: 'orders', label: 'Orders', icon: ShoppingCart },
  { href: 'categories', label: 'Categories', icon: FolderTree },
  { href: 'channels', label: 'Channels', icon: Radio },
  { href: 'inbox', label: 'Inbox', icon: MessageSquare },
  { href: 'settings', label: 'Settings', icon: Settings },
];

export function SidebarSkeleton({ businessId }: { businessId: string }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-white lg:hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="h-4 w-20 animate-pulse rounded bg-[var(--muted)]" />
          <div className="h-4 w-28 animate-pulse rounded bg-[var(--muted)]" />
          <div className="h-4 w-4 animate-pulse rounded bg-[var(--muted)]" />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={`/b/${businessId}/${item.href}`}
              className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs text-[var(--muted-foreground)]"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--border)] bg-white lg:flex">
        <div className="border-b border-[var(--border)] p-6">
          <div className="mb-3 h-3 w-24 animate-pulse rounded bg-[var(--muted)]" />
          <div className="h-6 w-36 animate-pulse rounded bg-[var(--muted)]" />
          <div className="mt-2 h-3 w-28 animate-pulse rounded bg-[var(--muted)]" />
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={`/b/${businessId}/${item.href}`}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
    </>
  );
}
