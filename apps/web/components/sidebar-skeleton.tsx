import Link from 'next/link';
import {
  LayoutDashboard,
  Package,
  MessageSquare,
  ShoppingCart,
  Radio,
  FolderTree,
  Settings,
  BarChart3,
} from 'lucide-react';

const nav = [
  { href: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: 'products', label: 'Products', icon: Package },
  { href: 'orders', label: 'Orders', icon: ShoppingCart },
  { href: 'categories', label: 'Categories', icon: FolderTree },
  { href: 'channels', label: 'Channels', icon: Radio },
  { href: 'inbox', label: 'Inbox', icon: MessageSquare },
  { href: 'analytics', label: 'Analytics', icon: BarChart3 },
  { href: 'settings', label: 'Settings', icon: Settings },
];

export function SidebarSkeleton({ businessId }: { businessId: string }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-sidebar-bg lg:hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="h-6 w-6 animate-pulse rounded bg-muted" />
          <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          <div className="h-5 w-5 animate-pulse rounded bg-muted" />
        </div>
      </header>

      <aside className="hidden w-[280px] shrink-0 flex-col border-r border-border bg-sidebar-bg lg:flex">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="h-9 w-9 animate-pulse rounded-xl bg-muted" />
            <div className="h-5 w-20 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-16 w-full animate-pulse rounded-2xl bg-muted" />
        </div>
        <nav className="flex-1 space-y-2 px-4 py-2">
          {nav.map((item) => (
            <div
              key={item.href}
              className="flex h-11 w-full animate-pulse items-center rounded-xl bg-muted/50"
            />
          ))}
        </nav>
        <div className="p-4 border-t border-border mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
            <div className="space-y-1">
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              <div className="h-2 w-10 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="h-9 w-9 animate-pulse rounded-xl bg-muted" />
        </div>
      </aside>
    </>
  );
}
