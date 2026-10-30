'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  MessageSquare,
  ClipboardList,
  Package,
  Users,
  Megaphone,
  BarChart3,
  Blocks,
  Bell,
  Settings,
  Sparkles,
  ChevronDown,
  Menu,
  X,
  LogOut,
  Store,
  Terminal,
  CreditCard,
  FolderTree,
  HelpCircle,
  ArrowRight,
  Search,
  Plus,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SignOutForm } from '@/components/sign-out-button';
import { useBrand } from '@/components/brand-provider';

const primaryNav: Array<{
  href: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: 'notifications';
  children?: Array<{ href: string; label: string }>;
}> = [
  { href: 'dashboard', label: 'Dashboard', icon: Home },
  { href: 'inbox', label: 'Inbox', icon: MessageSquare },
  { href: 'orders', label: 'Orders', icon: ClipboardList },
  { href: 'products', label: 'Products', icon: Package },
  { href: 'customers', label: 'Customers', icon: Users },
  {
    href: 'posts',
    label: 'Social Media',
    icon: Megaphone,
    children: [
      { href: 'posts', label: 'Content & Posts' },
      { href: 'posts?tab=comments', label: 'Comments' },
      { href: 'posts?tab=autoreply', label: 'Auto-Reply' },
    ],
  },
  { href: 'analytics', label: 'Analytics', icon: BarChart3 },
  { href: 'notifications', label: 'Notifications', icon: Bell, badgeKey: 'notifications' },
  { href: 'channels', label: 'Integrations', icon: Blocks },
  { href: 'categories', label: 'Categories', icon: FolderTree },
  { href: 'storefront', label: 'Storefront', icon: Store },
  { href: 'billing', label: 'Billing', icon: CreditCard },
  { href: 'settings', label: 'Settings', icon: Settings },
];

export function OnlyOrdesLogo({ className, lightText = false }: { className?: string; lightText?: boolean }) {
  const { companyName } = useBrand();
  return (
    <div className={cn('inline-flex items-center gap-2.5 select-none', className)}>
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#5B3DF5] to-[#7C3AED] text-white shadow-md shadow-[#5B3DF5]/30">
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="3" y1="6" x2="21" y2="6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16 10a4 4 0 0 1-8 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <span
        className={cn(
          'font-geist text-xl font-extrabold tracking-tight',
          lightText ? 'text-white' : 'text-slate-900 dark:text-white',
        )}
      >
        {companyName}
      </span>
    </div>
  );
}

export function DashboardTopHeader({
  businessId,
  businessName,
  userName = 'Mohammad Shihab',
  unreadNotificationsCount = 0,
}: {
  businessId: string;
  businessName: string;
  userName?: string;
  unreadNotificationsCount?: number;
}) {
  return (
    <header className="sticky top-0 z-30 hidden h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white/90 px-6 backdrop-blur-md dark:border-slate-800 dark:bg-[#111427]/90 lg:flex">
      {/* Global Search Bar with Ctrl K */}
      <div className="relative flex w-full max-w-md items-center">
        <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" />
        <input
          type="search"
          placeholder="Search conversations, orders, products..."
          aria-label="Search conversations, orders, products"
          className="h-10 w-full rounded-xl border border-slate-200/90 bg-slate-50/80 pl-10 pr-16 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#5B3DF5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#5B3DF5]/15 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100"
        />
        <kbd className="pointer-events-none absolute right-2.5 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-500 shadow-2xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          Ctrl K
        </kbd>
      </div>

      {/* Right Action Cluster */}
      <div className="flex items-center gap-3">
        <Link
          href="/businesses"
          className="hidden items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 xl:flex dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600">
            <Store className="h-3.5 w-3.5" />
          </span>
          <div className="text-left leading-tight">
            <div className="font-semibold text-slate-900 dark:text-white">{businessName || 'My Store'}</div>
            <div className="text-[10px] text-slate-500">Main Store</div>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </Link>

        <Link
          href={`/b/${businessId}/posts`}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#5B3DF5] px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-[#5B3DF5]/25 transition hover:bg-[#4C2EE0]"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Create Post</span>
        </Link>

        <Link
          href={`/b/${businessId}/notifications`}
          className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadNotificationsCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
              {unreadNotificationsCount}
            </span>
          )}
        </Link>

        <Link
          href="/docs"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          title="Help & Documentation"
          aria-label="Help & Documentation"
        >
          <HelpCircle className="h-4 w-4" />
        </Link>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-800" />

        <Link
          href={`/b/${businessId}/settings`}
          className="flex items-center gap-2.5 rounded-xl px-2 py-1 transition hover:bg-slate-100/80 dark:hover:bg-slate-800/60"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#5B3DF5] to-indigo-400 text-xs font-bold text-white shadow-xs">
            {userName.trim().charAt(0).toUpperCase() || 'M'}
          </div>
          <div className="hidden text-left leading-tight sm:block">
            <p className="text-xs font-semibold text-slate-900 dark:text-white">
              {userName === 'User' ? 'Mohammad Shihab' : userName}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">Store Owner</p>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </Link>
      </div>
    </header>
  );
}

export function Sidebar({
  businessId,
  businessName,
  userName = 'Mohammad Shihab',
  channels = [],
  unreadNotificationsCount = 0,
  billing,
}: {
  businessId: string;
  businessName: string;
  userName?: string;
  channels?: Array<{ id: string; platform: string; platformChannelId?: string; pageName?: string | null }>;
  unreadNotificationsCount?: number;
  billing?: any;
}) {
  const pathname = usePathname() ?? '';
  const [isOpen, setIsOpen] = useState(false);
  const [socialExpanded, setSocialExpanded] = useState(true);
  const displayUser = userName === 'User' ? 'Mohammad Shihab' : userName;
  const userInitial = displayUser.trim().charAt(0).toUpperCase() || 'M';

  const hasFacebook = channels.some((c) => c.platform === 'facebook');
  const facebookChannel = channels.find((c) => c.platform === 'facebook');
  const dynamicChannels = [
    {
      name: 'Facebook Page',
      sublabel: hasFacebook ? (facebookChannel?.pageName || 'Connected') : 'Connect page',
      status: hasFacebook ? 'Connected' : 'Not Connected',
      connected: hasFacebook,
      comingSoon: false,
      color: 'bg-[#1877F2]',
      iconText: 'f',
    },
    {
      name: 'Messenger',
      sublabel: hasFacebook ? 'Active Auto-Reply' : 'Requires Facebook',
      status: hasFacebook ? 'Active' : 'Inactive',
      connected: hasFacebook,
      comingSoon: false,
      color: 'bg-gradient-to-tr from-[#00B2FF] to-[#006AFF]',
      iconText: 'M',
    },
    {
      name: 'Instagram',
      sublabel: 'DM & Comments',
      status: 'Coming Soon',
      connected: false,
      comingSoon: true,
      color: 'bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600',
      iconText: 'IG',
    },
    {
      name: 'WhatsApp',
      sublabel: 'Cloud API',
      status: 'Coming Soon',
      connected: false,
      comingSoon: true,
      color: 'bg-[#25D366]',
      iconText: 'WA',
    },
  ];

  const quota = billing?.quota;
  const planName = quota?.planName || billing?.plan?.name || 'Standard Plan';
  const hasLimit = typeof quota?.messageLimit === 'number' && quota.messageLimit > 0;
  const messagesUsed = quota?.messagesUsed ?? 0;
  const messageLimit = quota?.messageLimit ?? 0;
  const usedPercent = hasLimit ? Math.min(100, Math.round((messagesUsed / messageLimit) * 100)) : 0;

  const isActive = (href: string) => {
    const cleanHref = href.split('?')[0] ?? href;
    const path = `/b/${businessId}/${cleanHref}`;
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  const renderNavItems = (onItemClick?: () => void) => (
    <div className="space-y-1">
      {primaryNav.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;
        const hasChildren = Boolean(item.children && item.children.length > 0);
        const badgeCount = item.badgeKey === 'notifications' && unreadNotificationsCount > 0 ? unreadNotificationsCount : null;

        return (
          <div key={item.href}>
            <div className="flex items-center">
              <Link
                href={`/b/${businessId}/${item.href}`}
                onClick={onItemClick}
                className={cn(
                  'group relative flex flex-1 items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-medium transition-all duration-150',
                  active
                    ? 'bg-[#5B3DF5] text-white font-semibold shadow-sm shadow-[#5B3DF5]/30'
                    : 'text-slate-300/85 hover:bg-white/8 hover:text-white',
                )}
              >
                <span className="flex items-center gap-3">
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0 transition-colors',
                      active ? 'text-white' : 'text-slate-400 group-hover:text-white',
                    )}
                  />
                  <span>{item.label}</span>
                </span>

                <span className="flex items-center gap-1.5">
                  {badgeCount !== null && (
                    <span
                      className={cn(
                        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold bg-rose-500 text-white',
                      )}
                    >
                      {badgeCount}
                    </span>
                  )}
                  {hasChildren && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSocialExpanded((prev) => !prev);
                      }}
                      className="rounded p-0.5 text-slate-300 hover:bg-white/10"
                      aria-label="Toggle submenu"
                    >
                      <ChevronDown
                        className={cn('h-3.5 w-3.5 transition-transform', socialExpanded ? 'rotate-180' : '')}
                      />
                    </button>
                  )}
                </span>
              </Link>
            </div>

            {hasChildren && socialExpanded && (
              <div className="mt-1 ml-6 space-y-0.5 border-l border-white/10 pl-3">
                {item.children!.map((sub) => {
                  const subActive = pathname.includes('/posts') && sub.label === 'Content & Posts';
                  return (
                    <Link
                      key={sub.label}
                      href={`/b/${businessId}/${sub.href}`}
                      onClick={onItemClick}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                        subActive
                          ? 'text-[#A78BFA] font-semibold'
                          : 'text-slate-400 hover:text-white',
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          subActive ? 'bg-[#A78BFA]' : 'bg-slate-600',
                        )}
                      />
                      {sub.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Mobile Sticky Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0F1123] text-white lg:hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <button
            onClick={() => setIsOpen(true)}
            className="rounded-xl p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <OnlyOrdesLogo lightText />
          <Link
            href={`/b/${businessId}/notifications`}
            className="relative rounded-xl p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-500" />
          </Link>
        </div>
      </header>

      {/* Mobile Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setIsOpen(false)}
          />
          <aside className="relative flex h-full w-[268px] max-w-[82vw] flex-col bg-[#0F1123] text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <Link href="/" onClick={() => setIsOpen(false)}>
                <OnlyOrdesLogo lightText />
              </Link>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">
              {renderNavItems(() => setIsOpen(false))}
            </div>
          </aside>
        </div>
      )}

      {/* Desktop Left Sidebar (Matches Dark Navy OnlyOrdes Sidebar from Screenshots 3, 4, 6, 7) */}
      <aside className="hidden w-[252px] shrink-0 flex-col border-r border-slate-800/80 bg-[#0F1123] text-white lg:flex">
        {/* Brand Logo Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <Link href="/">
            <OnlyOrdesLogo lightText />
          </Link>
        </div>

        {/* Store Workspace Switcher */}
        <div className="px-3.5 pb-3">
          <Link
            href="/businesses"
            className="flex items-center justify-between gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 transition hover:bg-white/[0.08]"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#5B3DF5]/25 text-[#A78BFA]">
                <Store className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white">
                  {businessName || 'StyleHub BD'}
                </p>
                <p className="truncate text-[10px] text-slate-400">Business · Pro Plan</p>
              </div>
            </div>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          </Link>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
          {renderNavItems()}

          {/* Real Connected Channels List */}
          <div className="border-t border-white/10 pt-4">
            <div className="flex items-center justify-between px-2 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Connected Channels
              </p>
              <Link
                href={`/b/${businessId}/channels`}
                className="text-[10px] text-[#A78BFA] hover:underline"
              >
                Manage
              </Link>
            </div>
            <div className="mt-2 space-y-1.5 px-1.5">
              {dynamicChannels.map((ch) => (
                <Link
                  key={ch.name}
                  href={`/b/${businessId}/channels`}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 transition hover:bg-white/5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-2xs',
                        ch.color,
                      )}
                    >
                      {ch.iconText}
                    </span>
                    <div className="min-w-0 leading-tight">
                      <p className="truncate text-xs font-medium text-slate-200">{ch.name}</p>
                      <p className="truncate text-[10px] text-slate-400">{ch.sublabel}</p>
                    </div>
                  </div>
                  <div>
                    {ch.comingSoon ? (
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400">
                        Soon
                      </span>
                    ) : ch.connected ? (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        {ch.status}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-slate-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                        Connect
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </nav>

        {/* AI Replies Usage Meter Card */}
        <div className="px-3.5 pt-2 pb-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium text-slate-300">AI Sales Agent</span>
              <span className="font-semibold text-emerald-400">Active</span>
            </div>
            <p className="mt-0.5 text-xs font-bold text-white">
              {planName}
            </p>
            {hasLimit ? (
              <div className="mt-2">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>{messagesUsed} replies used</span>
                  <span>{messageLimit} limit</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#5B3DF5] to-[#8B5CF6]"
                    style={{ width: `${usedPercent}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="mt-1 text-[10px] text-slate-400">
                {messagesUsed > 0 ? `${messagesUsed} AI replies this cycle` : 'Ready to handle customer messages'}
              </p>
            )}
            <Link
              href={`/b/${businessId}/billing`}
              className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg bg-[#5B3DF5]/20 py-1.5 text-[11px] font-semibold text-[#C4B5FD] transition hover:bg-[#5B3DF5]/35 hover:text-white"
            >
              <span>Manage Plan</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* User Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#5B3DF5] text-xs font-bold text-white">
              {userInitial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white">{displayUser}</p>
              <p className="text-[10px] text-slate-400">Store Owner</p>
            </div>
          </div>
          <SignOutForm
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </SignOutForm>
        </div>
      </aside>
    </>
  );
}
