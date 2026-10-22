'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Bot,
  ChevronLeft,
  CreditCard,
  Cpu,
  FileText,
  Globe,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  PanelRightOpen,
  Radio,
  ScrollText,
  Settings,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/plans', label: 'Plans', icon: CreditCard },
  { href: '/admin/channels', label: 'Store channels', icon: Radio },
  { href: '/admin/official', label: 'Official channels', icon: Globe },
  { href: '/admin/official/inbox', label: 'Official inbox', icon: Inbox },
  { href: '/admin/official/tickets', label: 'Tickets', icon: LifeBuoy },
  { href: '/admin/official/prospects', label: 'Prospects', icon: Users },
  { href: '/admin/token-analytics', label: 'Tokens', icon: Cpu },
  { href: '/admin/default-agent', label: 'Default agent', icon: FileText },
  { href: '/admin/agent-playground', label: 'Playground', icon: Bot },
  { href: '/admin/logs', label: 'Event log', icon: ScrollText },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

function matches(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
}

type AdminSidebarProps = { signedIn?: boolean };

/**
 * The console's navigation rail. A fixed sidebar on desktop (collapsible to icons-only,
 * remembered in localStorage), a slide-in drawer behind a hamburger on phones. Everything
 * is rendered from one client component — hamburger, spacer and rail — so the main column
 * can follow the collapsed width without the server layout knowing about the toggle.
 */
export function AdminSidebar({ signedIn = true }: AdminSidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('admin-sidebar-collapsed');
      if (saved === '1') setCollapsed(true);
    } catch {
      // Storage can refuse (private mode); the default rail is fine either way.
    }
  }, []);

  // Navigating anywhere moves the reader on; a drawer left open would cover the new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const toggleCollapsed = () => {
    setCollapsed((next) => {
      try {
        window.localStorage.setItem('admin-sidebar-collapsed', next ? '0' : '1');
      } catch {
        // The rail still collapses for this session even when storage refuses.
      }
      return !next;
    });
  };

  // The deepest matching entry wins: /admin/official/inbox lights the inbox item, not
  // Official channels, whose href prefixes it.
  const activeHref = [...NAV].reverse().find((item) => matches(pathname, item.href))?.href;

  if (!signedIn) return null;

  const railClass = collapsed ? 'lg:w-16' : 'lg:w-60';

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
      {NAV.map((item) => {
        const active = item.href === activeHref;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            title={item.label}
            className={`flex items-center gap-2.5 whitespace-nowrap rounded-element px-3 py-2 text-sm font-medium transition-colors ${
              collapsed ? 'lg:justify-center lg:px-2' : ''
            } ${
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className={collapsed ? 'hidden lg:inline' : ''}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-2 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary font-geist text-base font-bold text-primary-foreground shadow-md shadow-primary/20">
        O
      </div>
      <span className={`truncate font-geist text-sm font-bold tracking-tight ${collapsed ? 'hidden lg:inline' : ''}`}>
        Console
      </span>
    </div>
  );

  return (
    <>
      {/* Phone: the hamburger rides just under the sticky header, left-aligned. */}
      <button
        type="button"
        aria-label="Open navigation"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="fixed left-3 top-[4.4rem] z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground active:scale-95 lg:hidden"
      >
        <PanelRightOpen className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm lg:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="fixed right-3 top-[4.4rem] z-50 flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground active:scale-95 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </>
      )}

      {/* Desktop: this spacer is the rail's width without pinning the rail into the flow. */}
      <div className={`hidden shrink-0 lg:block ${railClass}`} aria-hidden="true" />

      {/* The drawer the hamburger opens is the same rail that stays pinned on desktop. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border/40 bg-card shadow-2xl transition-transform duration-200 lg:z-30 lg:translate-x-0 lg:shadow-none ${railClass} ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {brand}
        {nav}
        <div className="border-t border-border/40 p-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden w-full items-center justify-center gap-2 rounded-element px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
            aria-label={collapsed ? 'Expand navigation labels' : 'Collapse navigation to icons'}
          >
            <ChevronLeft className={`h-4 w-4 ${collapsed ? 'rotate-180' : ''}`} />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
