'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  MessageSquare,
  ShoppingCart,
  Radio,
  Building2,
  ChevronLeft,
  ChevronDown,
  FolderTree,
  Settings,
  BarChart3,
  Menu,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SignOutForm } from '@/components/sign-out-button';

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

function NavLink({
  businessId,
  href,
  label,
  icon: Icon,
  active,
  compact,
  onClick,
}: {
  businessId: string;
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  const path = `/b/${businessId}/${href}`;
  return (
    <Link
      href={path}
      onClick={onClick}
      className={cn(
        'relative flex shrink-0 items-center gap-3 rounded-xl font-medium transition-all duration-200',
        compact
          ? 'px-3 py-2 text-xs whitespace-nowrap'
          : 'px-4 py-3 text-sm w-full',
        active
          ? 'bg-primary/10 text-primary font-semibold'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {active && !compact && (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
      )}
      <Icon className={cn('h-5 w-5 stroke-[1.75]', active ? 'text-primary' : 'text-muted-foreground')} />
      {label}
    </Link>
  );
}

export function Sidebar({
  businessId,
  businessName,
  userName = 'User',
}: {
  businessId: string;
  businessName: string;
  userName?: string;
}) {
  const pathname = usePathname() ?? '';
  const [isOpen, setIsOpen] = useState(false);
  const userInitial = userName.trim().charAt(0).toUpperCase() || 'U';

  const isActive = (href: string) => {
    const path = `/b/${businessId}/${href}`;
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <>
      {/* Mobile Sticky Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-sidebar-bg lg:hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <button
            onClick={() => setIsOpen(true)}
            className="text-muted-foreground hover:text-primary p-1.5 rounded-xl hover:bg-muted transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-center text-sm font-bold text-primary font-geist">
            {businessName}
          </h1>
          <Link
            href="/businesses"
            className="text-muted-foreground hover:text-primary p-1.5 rounded-xl hover:bg-muted transition-colors"
            aria-label="Switch business"
          >
            <Building2 className="h-5 w-5" />
          </Link>
        </div>
      </header>

      {/* Mobile Drawer Navigation Menu */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          {/* Backdrop Blur Overlay */}
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setIsOpen(false)}
          />

          {/* Drawer Sidebar Sheet */}
          <aside className="relative flex w-[280px] max-w-[80vw] flex-col bg-sidebar-bg border-r border-border h-full shadow-2xl animate-in slide-in-from-left duration-300">
            {/* Header / Brand */}
            <div className="flex items-center justify-between p-5 border-b border-border/40">
              <Link
                href="/businesses"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground font-geist font-bold text-base shadow-md shadow-primary/20">
                  O
                </div>
                <span className="font-geist text-lg font-bold tracking-tight bg-gradient-to-r from-primary to-primary-foreground bg-clip-text text-foreground">
                  Oryxa
                </span>
              </Link>
              <button
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1.5 rounded-xl hover:bg-muted transition-colors"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Business Selector Block */}
            <div className="p-4">
              <Link
                href="/businesses"
                onClick={() => setIsOpen(false)}
                className="group flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-muted/30 p-3 transition-all duration-200 hover:bg-muted/80"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Building2 className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      {businessName}
                    </p>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Workspace
                    </p>
                  </div>
                </div>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </Link>
            </div>

            {/* Navigation List */}
            <nav className="flex-1 space-y-1 px-3 py-2 overflow-y-auto">
              {nav.map((item) => (
                <NavLink
                  key={item.href}
                  businessId={businessId}
                  {...item}
                  active={isActive(item.href)}
                  onClick={() => setIsOpen(false)}
                />
              ))}
            </nav>

            {/* Promo CTA Card inside drawer */}
            <div className="px-3 py-2">
              <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 p-4 text-white shadow-lg">
                <p className="font-geist text-[10px] font-semibold uppercase tracking-wider text-indigo-200">
                  Grow faster
                </p>
                <h4 className="font-geist text-sm font-bold mt-0.5">
                  Meta & Oryxa
                </h4>
                <Link
                  href={`/b/${businessId}/channels`}
                  onClick={() => setIsOpen(false)}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-white px-3 py-2 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50"
                >
                  Connect Channel
                </Link>
              </div>
            </div>

            {/* Profile Footer */}
            <div className="border-t border-border p-4 mt-2 flex items-center justify-between gap-3 bg-muted/10">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs border border-primary/20">
                  {userInitial}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {userName}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Admin</p>
                </div>
              </div>
              <SignOutForm className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <Settings className="h-4 w-4" />
              </SignOutForm>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-[280px] shrink-0 flex-col border-r border-border bg-sidebar-bg lg:flex">
        {/* Header Branding */}
        <div className="p-6">
          <Link href="/businesses" className="flex items-center gap-2 mb-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-geist font-bold text-lg shadow-md shadow-primary/20">
              O
            </div>
            <span className="font-geist text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary-foreground bg-clip-text text-foreground">
              Oryxa
            </span>
          </Link>

          {/* Business Selector Block */}
          <Link
            href="/businesses"
            className="group flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-muted/30 p-3.5 transition-all duration-200 hover:bg-muted/80"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  {businessName}
                </p>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5">
                  Workspace
                </p>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-y-0.5" />
          </Link>
        </div>

        {/* Navigation List */}
        <nav className="flex-1 space-y-1 px-4 py-2">
          {nav.map((item) => (
            <NavLink
              key={item.href}
              businessId={businessId}
              {...item}
              active={isActive(item.href)}
            />
          ))}
        </nav>

        {/* Promo CTA Card */}
        <div className="px-4 py-2">
          <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 p-5 text-white shadow-xl shadow-indigo-500/10">
            {/* Background elements */}
            <div className="absolute -right-6 -bottom-6 h-24 w-24 rounded-full bg-white/10 blur-xl" />
            <div className="absolute -left-6 -top-6 h-24 w-24 rounded-full bg-indigo-400/20 blur-xl" />
            
            <p className="font-geist text-xs font-semibold uppercase tracking-wider text-indigo-200">
              Grow faster with
            </p>
            <h4 className="font-geist text-base font-bold leading-tight mt-1">
              Meta & Oryxa
            </h4>
            <p className="text-xs text-indigo-100/80 leading-relaxed mt-2">
              Connect your channels and boost your sales.
            </p>
            <Link
              href={`/b/${businessId}/channels`}
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-indigo-700 shadow-sm transition-all duration-200 hover:bg-indigo-50 active:scale-[0.98]"
            >
              Connect Channel
            </Link>
          </div>
        </div>

        {/* Profile Footer */}
        <div className="border-t border-border p-4 mt-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm border border-primary/20">
              {userInitial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {userName}
              </p>
              <p className="text-xs text-muted-foreground">Admin</p>
            </div>
          </div>
          <SignOutForm className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <Settings className="h-4 w-4" />
          </SignOutForm>
        </div>
      </aside>
    </>
  );
}
