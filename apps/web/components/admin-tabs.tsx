'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, CreditCard, Cpu, FileText, Inbox, LayoutDashboard, Radio, ScrollText, Settings, Sparkles, Users } from 'lucide-react';

const TABS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/plans', label: 'Plans', icon: CreditCard, exact: true },
  { href: '/admin/channels', label: 'Channels', icon: Radio, exact: false },
  { href: '/admin/ai-studio', label: 'AI Studio', icon: Sparkles, exact: false },
  { href: '/admin/capacity', label: 'Capacity', icon: Users, exact: false },
  { href: '/admin/inbox', label: 'Inbox', icon: Inbox, exact: false },
  { href: '/admin/leads', label: 'Leads', icon: Users, exact: false },
  { href: '/admin/token-analytics', label: 'Tokens', icon: Cpu, exact: false },
  { href: '/admin/default-agent', label: 'Default', icon: FileText, exact: true },
  { href: '/admin/agent-playground', label: 'Playground', icon: Bot, exact: false },
  { href: '/admin/logs', label: 'Event log', icon: ScrollText, exact: false },
  { href: '/admin/settings', label: 'Settings', icon: Settings, exact: true },
];

export function AdminTabs() {
  const pathname = usePathname();

  return (
    // Scrolls rather than widening the page: six labelled tabs run past a narrow tablet, and the console
    // header overflowing sideways is the bug this app has already been asked to fix once.
    <nav className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border/40 bg-muted/40 p-1">
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
