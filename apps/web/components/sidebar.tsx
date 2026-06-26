import Link from 'next/link';
import { headers } from 'next/headers';
import {
  LayoutDashboard,
  Package,
  MessageSquare,
  ShoppingCart,
  Radio,
  Building2,
  ChevronLeft,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SignOutForm } from '@/components/sign-out-button';

const nav = [
  { href: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: 'products', label: 'Products', icon: Package },
  { href: 'orders', label: 'Orders', icon: ShoppingCart },
  { href: 'channels', label: 'Channels', icon: Radio },
  { href: 'inbox', label: 'Inbox', icon: MessageSquare },
];

function NavLink({
  businessId,
  href,
  label,
  icon: Icon,
  active,
  compact,
}: {
  businessId: string;
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  compact?: boolean;
}) {
  const path = `/b/${businessId}/${href}`;
  return (
    <Link
      href={path}
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-lg font-medium transition-colors',
        compact
          ? 'px-3 py-2 text-xs whitespace-nowrap'
          : 'gap-3 px-3 py-2 text-sm w-full',
        active
          ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
          : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]',
      )}
    >
      <Icon className={compact ? 'h-4 w-4' : 'h-4 w-4'} />
      {label}
    </Link>
  );
}

export async function Sidebar({
  businessId,
  businessName,
}: {
  businessId: string;
  businessName: string;
}) {
  const h = await headers();
  const pathname = h.get('x-pathname') ?? '';

  const isActive = (href: string) => {
    const path = `/b/${businessId}/${href}`;
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <>
      {/* Mobile: sticky header + horizontal nav */}
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-white lg:hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <Link
            href="/businesses"
            className="flex items-center gap-1 text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--primary)]"
          >
            <ChevronLeft className="h-3 w-3" />
            Businesses
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-center text-sm font-bold text-[var(--primary)]">
            {businessName}
          </h1>
          <Link
            href="/businesses"
            className="text-[var(--muted-foreground)] hover:text-[var(--primary)]"
            aria-label="Switch business"
          >
            <Building2 className="h-4 w-4" />
          </Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {nav.map((item) => (
            <NavLink
              key={item.href}
              businessId={businessId}
              {...item}
              active={isActive(item.href)}
              compact
            />
          ))}
        </nav>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--border)] bg-white lg:flex">
        <div className="border-b border-[var(--border)] p-6">
          <Link
            href="/businesses"
            className="mb-3 flex items-center gap-1 text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--primary)]"
          >
            <ChevronLeft className="h-3 w-3" />
            All businesses
          </Link>
          <h1 className="truncate text-lg font-bold text-[var(--primary)]">{businessName}</h1>
          <p className="text-xs text-[var(--muted-foreground)]">Business workspace</p>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {nav.map((item) => (
            <NavLink
              key={item.href}
              businessId={businessId}
              {...item}
              active={isActive(item.href)}
            />
          ))}
        </nav>
        <div className="space-y-1 border-t border-[var(--border)] p-4">
          <Link
            href="/businesses"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
          >
            <Building2 className="h-4 w-4" />
            Switch business
          </Link>
          <SignOutForm className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]">
            Sign out
          </SignOutForm>
        </div>
      </aside>
    </>
  );
}
