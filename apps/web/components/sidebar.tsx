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
import { cn } from '@/lib/utils';
import { SignOutForm } from '@/components/sign-out-button';

const nav = [
  { href: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: 'products', label: 'Products', icon: Package },
  { href: 'orders', label: 'Orders', icon: ShoppingCart },
  { href: 'channels', label: 'Channels', icon: Radio },
  { href: 'inbox', label: 'Inbox', icon: MessageSquare },
];

export async function Sidebar({
  businessId,
  businessName,
}: {
  businessId: string;
  businessName: string;
}) {
  const h = await headers();
  const pathname = h.get('x-pathname') ?? '';

  return (
    <aside className="flex w-64 flex-col border-r border-[var(--border)] bg-white">
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
        {nav.map(({ href, label, icon: Icon }) => {
          const path = `/b/${businessId}/${href}`;
          const active = pathname === path || pathname.startsWith(`${path}/`);
          return (
            <Link
              key={href}
              href={path}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                  : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
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
  );
}
