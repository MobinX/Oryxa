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
  Receipt,
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

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/admin/token-analytics', label: 'Tokens', icon: Cpu },
      { href: '/admin/model-billing', label: 'Model billing', icon: Receipt },
    ],
  },
  {
    label: 'Store platform',
    items: [
      { href: '/admin/plans', label: 'Plans', icon: CreditCard },
      { href: '/admin/channels', label: 'Store channels', icon: Radio },
      { href: '/admin/default-agent', label: 'Default agent', icon: FileText },
      { href: '/admin/agent-playground', label: 'Playground', icon: Bot },
    ],
  },
  {
    label: 'Official channels',
    items: [
      { href: '/admin/official', label: 'Official channels', icon: Globe },
      { href: '/admin/official/inbox', label: 'Official inbox', icon: Inbox },
      { href: '/admin/official/tickets', label: 'Tickets', icon: LifeBuoy },
      { href: '/admin/official/prospects', label: 'Prospects', icon: Users },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/admin/logs', label: 'Event log', icon: ScrollText },
      { href: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
];

const NAV: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

function matches(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
}

type AdminSidebarProps = { signedIn?: boolean };

/**
 * The console's navigation rail, laid out as a proper column of the page: on desktop it is
 * a section-grouped, collapsible rail in the flow (sticky under the header), so it can
 * never overlap the content again; on phones it is a slide-in drawer behind a sticky
 * hamburger above the page. The collapse state is remembered in localStorage and only
 * ever affects the desktop rail.
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
  const activeClass = 'bg-primary/10 font-semibold text-primary';
  const idleClass = 'text-muted-foreground hover:bg-muted hover:text-foreground';

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p
            className={`px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 ${
              collapsed ? 'lg:hidden' : ''
            }`}
          >
            {group.label}
          </p>
          {/* A hairline keeps collapsed icon-only groups apart without spelling them out. */}
          <div className={`mx-2 h-px bg-border/50 ${collapsed ? 'hidden lg:block' : 'hidden'}`} />
          {group.items.map((item) => {
            const active = item.href === activeHref;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                title={item.label}
                className={`flex items-center gap-2.5 whitespace-nowrap rounded-element px-3 py-2 text-sm transition-colors ${
                  collapsed ? 'lg:justify-center lg:px-2' : ''
                } ${active ? activeClass : idleClass}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className={collapsed ? 'lg:hidden' : ''}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-2 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary font-geist text-base font-bold text-primary-foreground shadow-md shadow-primary/20">
        O
      </div>
      <span className={`truncate font-geist text-sm font-bold tracking-tight ${collapsed ? 'lg:hidden' : ''}`}>
        Console
      </span>
    </div>
  );

  return (
    <>
      {/* Phone: the hamburger is a row of the layout column, so nothing rides on the content. */}
      <div className="sticky top-[4.4rem] z-40 -mx-4 px-4 pb-3 pt-3 sm:-mx-6 sm:px-6 lg:hidden">
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="flex h-10 items-center gap-2 rounded-xl border border-border/80 bg-card px-3 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground active:scale-95"
        >
          <PanelRightOpen className="h-4 w-4" />
          Menu
        </button>
      </div>

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

      {/* Desktop: a sticky column in the flow; the content column is its flex neighbour. */}
      <aside
        className={`hidden w-64 shrink-0 flex-col border-r border-border/40 bg-card lg:sticky lg:top-16 lg:flex lg:h-[calc(100dvh-4rem)] lg:translate-x-0 ${railClass}`}
        aria-label="Console navigation"
      >
        {brand}
        {nav}
        <div className="border-t border-border/40 p-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex w-full items-center justify-center gap-2 rounded-element px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={collapsed ? 'Expand navigation labels' : 'Collapse navigation to icons'}
          >
            <ChevronLeft className={`h-4 w-4 ${collapsed ? 'rotate-180' : ''}`} />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* The drawer the hamburger opens shows the same grouped rail, always labelled. */}
      {open && (
        <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border/40 bg-card shadow-2xl lg:hidden">
          {brand}
          {nav}
        </aside>
      )}
    </>
  );
}
