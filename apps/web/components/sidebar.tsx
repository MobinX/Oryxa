'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  MessageSquare,
  ShoppingCart,
  Radio,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logout } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

const nav = [
  { href: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: 'products', label: 'Products', icon: Package },
  { href: 'channels', label: 'Channels', icon: Radio },
  { href: 'inbox', label: 'Inbox', icon: MessageSquare },
  { href: 'orders', label: 'Orders', icon: ShoppingCart },
];

export function Sidebar({ businessId }: { businessId: string }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="flex w-64 flex-col border-r border-[var(--border)] bg-white">
      <div className="border-b border-[var(--border)] p-6">
        <h1 className="text-xl font-bold text-[var(--primary)]">Oryxa</h1>
        <p className="text-xs text-[var(--muted-foreground)]">AI Commerce</p>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {nav.map(({ href, label, icon: Icon }) => {
          const path = `/b/${businessId}/${href}`;
          const active = pathname === path;
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
      <div className="border-t border-[var(--border)] p-4">
        <button
          onClick={async () => {
            await logout();
            router.push('/login');
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
