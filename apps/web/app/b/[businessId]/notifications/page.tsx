'use client';

import { useState, use } from 'react';
import Link from 'next/link';
import {
  Check,
  Users,
  ShoppingCart,
  CreditCard,
  Box,
  MessageSquare,
  AlertTriangle,
  TrendingUp,
  ChevronLeft,
  MoreHorizontal,
  Clock,
  Sparkles,
  AlertCircle,
  Lightbulb,
  ArrowRight,
  Flag,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type SmartNotification = {
  id: string;
  section: 'today' | 'yesterday';
  category: 'ai' | 'orders' | 'payments' | 'comments';
  title: string;
  subtitle: string;
  time: string;
  badgeText: string;
  badgeClass: string;
  iconBg: string;
  iconType: 'ai' | 'order' | 'payment' | 'parcel' | 'comment' | 'stock' | 'milestone';
  productThumb?: string;
  productMeta?: string;
  commentQuote?: string;
  read?: boolean;
};

const INITIAL_NOTIFICATIONS: SmartNotification[] = [
  {
    id: 'notif-ai-1',
    section: 'today',
    category: 'ai',
    title: 'AI needs your help',
    subtitle: "Customer has a question outside AI's confidence",
    time: '10:24 AM',
    badgeText: 'Needs review',
    badgeClass: 'bg-rose-500/12 text-rose-600',
    iconBg: 'bg-rose-500/12 text-rose-600',
    iconType: 'ai',
  },
  {
    id: 'notif-ord-1',
    section: 'today',
    category: 'orders',
    title: 'New order received',
    subtitle: '#1024 from Sarah Ahmed',
    time: '09:18 AM',
    badgeText: 'New order',
    badgeClass: 'bg-emerald-500/12 text-emerald-700',
    iconBg: 'bg-emerald-500/12 text-emerald-600',
    iconType: 'order',
    productThumb: '/images/essential-hoodie.jpg',
    productMeta: '$29.00 · 1 item',
  },
  {
    id: 'notif-pay-1',
    section: 'today',
    category: 'payments',
    title: 'Payment awaiting verification',
    subtitle: 'Mobile banking payment for #1023',
    time: '08:41 AM',
    badgeText: 'Awaiting',
    badgeClass: 'bg-amber-500/15 text-amber-700',
    iconBg: 'bg-amber-500/12 text-amber-600',
    iconType: 'payment',
  },
  {
    id: 'notif-par-1',
    section: 'today',
    category: 'orders',
    title: 'Parcel status updated',
    subtitle: '#1021 is out for delivery',
    time: '08:12 AM',
    badgeText: 'In transit',
    badgeClass: 'bg-blue-500/12 text-blue-700',
    iconBg: 'bg-blue-500/12 text-blue-600',
    iconType: 'parcel',
  },
  {
    id: 'notif-com-1',
    section: 'today',
    category: 'comments',
    title: 'New comment needs reply',
    subtitle: 'Comment on Eid Special post',
    time: '07:55 AM',
    badgeText: 'Comment',
    badgeClass: 'bg-purple-500/12 text-purple-700',
    iconBg: 'bg-purple-500/12 text-purple-600',
    iconType: 'comment',
    productThumb: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&auto=format&fit=crop&q=80',
    commentQuote: '“Do you have this in white color?”',
  },
  {
    id: 'notif-stk-1',
    section: 'yesterday',
    category: 'orders',
    title: 'Low stock alert',
    subtitle: 'Essential Hoodie (M) is running low',
    time: 'Yesterday, 8:12 PM',
    badgeText: 'Low stock',
    badgeClass: 'bg-rose-500/12 text-rose-600',
    iconBg: 'bg-rose-500/12 text-rose-600',
    iconType: 'stock',
  },
  {
    id: 'notif-mil-1',
    section: 'yesterday',
    category: 'orders',
    title: 'Sales milestone',
    subtitle: 'You reached 50 orders this month 🎉',
    time: 'Yesterday, 6:30 PM',
    badgeText: 'Milestone',
    badgeClass: 'bg-emerald-500/12 text-emerald-700',
    iconBg: 'bg-emerald-500/12 text-emerald-600',
    iconType: 'milestone',
  },
];

export default function NotificationsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = use(params);
  const [filter, setFilter] = useState<'all' | 'orders' | 'ai' | 'payments' | 'comments'>('all');
  const [items, setItems] = useState<SmartNotification[]>(INITIAL_NOTIFICATIONS);
  const [selectedId, setSelectedId] = useState<string>('notif-ai-1');
  const [assignee, setAssignee] = useState<string>('Mohammad Shihab');
  const [priority, setPriority] = useState<string>('Normal');
  const [resolvedBanner, setResolvedBanner] = useState<boolean>(false);

  const filtered = items.filter((n) => (filter === 'all' ? true : n.category === filter));
  const todayItems = filtered.filter((n) => n.section === 'today');
  const yesterdayItems = filtered.filter((n) => n.section === 'yesterday');

  const renderIcon = (type: SmartNotification['iconType']) => {
    switch (type) {
      case 'ai':
        return <Users className="h-4 w-4" />;
      case 'order':
        return <ShoppingCart className="h-4 w-4" />;
      case 'payment':
        return <CreditCard className="h-4 w-4" />;
      case 'parcel':
        return <Box className="h-4 w-4" />;
      case 'comment':
        return <MessageSquare className="h-4 w-4" />;
      case 'stock':
        return <AlertTriangle className="h-4 w-4" />;
      case 'milestone':
        return <TrendingUp className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Filter Pills Row Matching Screenshot 7 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-geist text-2xl font-extrabold tracking-tight text-slate-950 dark:text-white">
            Notifications
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
            Stay updated with important activities across your business.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-2xl border border-slate-200/80 bg-white p-1 text-xs font-semibold shadow-2xs dark:border-slate-800 dark:bg-[#13172B]">
            {[
              { id: 'all', label: 'All (5)' },
              { id: 'orders', label: 'Orders (2)' },
              { id: 'ai', label: 'AI (1)' },
              { id: 'payments', label: 'Payments (1)' },
              { id: 'comments', label: 'Comments (1)' },
            ].map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setFilter(pill.id as any)}
                className={cn(
                  'rounded-xl px-3 py-1.5 transition',
                  filter === pill.id
                    ? 'border border-[#5B3DF5]/30 bg-[#5B3DF5]/10 text-[#5B3DF5] font-bold'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300',
                )}
              >
                {pill.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setItems((prev) => prev.map((i) => ({ ...i, read: true })))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Check className="h-3.5 w-3.5" />
            <span>Mark all as read</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Split View Matching Screenshot 7 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* =================================================================
            LEFT COLUMN: TODAY & YESTERDAY FEED (6 cols)
           ================================================================= */}
        <div className="space-y-4 lg:col-span-6">
          {/* Today Card */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#13172B]">
            <h2 className="font-geist text-sm font-extrabold text-slate-900 pb-3 dark:text-white">
              Today
            </h2>
            <div className="space-y-2.5">
              {todayItems.map((item) => {
                const active = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      'flex w-full items-start justify-between gap-3 rounded-2xl border p-3.5 text-left transition',
                      active
                        ? 'border-[#5B3DF5]/40 bg-[#F5F3FF]/80 shadow-xs dark:bg-[#5B3DF5]/15'
                        : 'border-slate-100 bg-white hover:bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                          item.iconBg,
                        )}
                      >
                        {renderIcon(item.iconType)}
                      </span>
                      <div className="space-y-1">
                        <p className="text-xs font-extrabold text-slate-900 dark:text-white">
                          {item.title}
                        </p>
                        <p className="text-xs text-slate-500">{item.subtitle}</p>
                        {item.productThumb && (
                          <div className="mt-2 flex items-center gap-2 pt-0.5">
                            <img
                              src={item.productThumb}
                              alt="Attachment"
                              className="h-8 w-8 rounded-lg border border-slate-200 bg-white object-cover"
                            />
                            {item.productMeta && (
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                {item.productMeta}
                              </span>
                            )}
                            {item.commentQuote && (
                              <span className="text-xs italic text-slate-600 dark:text-slate-300">
                                {item.commentQuote}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-[11px] text-slate-400">{item.time}</span>
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-[10px] font-bold',
                          item.badgeClass,
                        )}
                      >
                        {item.badgeText}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Yesterday Card */}
          {yesterdayItems.length > 0 && (
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#13172B]">
              <h2 className="font-geist text-sm font-extrabold text-slate-900 pb-3 dark:text-white">
                Yesterday
              </h2>
              <div className="space-y-2.5">
                {yesterdayItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 p-3.5 text-left hover:bg-slate-50 dark:border-slate-800"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                          item.iconBg,
                        )}
                      >
                        {renderIcon(item.iconType)}
                      </span>
                      <div>
                        <p className="text-xs font-extrabold text-slate-900 dark:text-white">
                          {item.title}
                        </p>
                        <p className="text-xs text-slate-500">{item.subtitle}</p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-[11px] text-slate-400">{item.time}</span>
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-[10px] font-bold',
                          item.badgeClass,
                        )}
                      >
                        {item.badgeText}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* =================================================================
            RIGHT COLUMN: AI ESCALATION DETAIL INSPECTOR (6 cols)
           ================================================================= */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs lg:col-span-6 dark:border-slate-800 dark:bg-[#13172B]">
          {/* Top Action Bar */}
          <div className="flex items-center justify-between pb-4">
            <button
              type="button"
              aria-label="Back"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAssignee('Mohammad Shihab')}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                Assign to me
              </button>
              <button
                type="button"
                aria-label="More options"
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Escalation Header */}
          <div className="flex items-start gap-3.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/12 text-rose-600">
              <Users className="h-6 w-6" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="font-geist text-xl font-extrabold text-slate-950 dark:text-white">
                  AI needs your help
                </h2>
                <span className="rounded-full bg-rose-500/12 px-2.5 py-0.5 text-xs font-bold text-rose-600">
                  {resolvedBanner ? 'Resolved' : 'Needs review'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Customer has a question outside AI&apos;s confidence. Please review and reply.
              </p>
            </div>
          </div>

          {/* Timestamp & Channel Meta Row */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              Today, 10:24 AM
            </span>
            <span className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <MessageSquare className="h-3.5 w-3.5 text-slate-500" />
              Conversation
            </span>
            <span className="font-semibold text-slate-600">#1025</span>
          </div>

          {/* Customer Message & Detected Intent Card */}
          <div className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80"
                  alt="Nusrat Jahan"
                  className="h-10 w-10 rounded-full object-cover"
                />
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Nusrat Jahan</p>
                  <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-[#1877F2] text-[8px] font-bold text-white">
                      f
                    </span>
                    Facebook · Page messaging
                  </p>
                </div>
              </div>
              <span className="text-xs text-slate-400">10:22 AM</span>
            </div>

            <div className="mt-3 ml-12 rounded-2xl bg-slate-200/70 p-3.5 text-xs leading-relaxed text-slate-800 dark:bg-slate-800 dark:text-slate-100">
              Do you have this hoodie in size XL?
              <br />
              And is there a discount if I buy 2 pieces?
            </div>

            <div className="mt-4">
              <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                <Sparkles className="h-3.5 w-3.5 text-[#5B3DF5]" />
                Detected intent
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full bg-slate-200/80 px-3 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Product inquiry
                </span>
                <span className="rounded-full bg-slate-200/80 px-3 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Price/discount question
                </span>
                <span className="rounded-full bg-slate-200/80 px-3 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Multi-item order
                </span>
              </div>
            </div>
          </div>

          {/* Red Alert Box: Why it needs your help */}
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-900/50 dark:bg-rose-950/30">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <div>
                <p className="text-xs font-extrabold text-rose-700 dark:text-rose-400">
                  Why it needs your help
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                  The customer is asking about a bundle discount which is not configured in current
                  AI rules. AI is 45% confident.
                </p>
              </div>
            </div>
          </div>

          {/* Suggested Next Steps */}
          <div className="mt-4 space-y-2">
            <p className="flex items-center gap-2 text-xs font-extrabold text-slate-900 dark:text-white">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              Suggested next steps
            </p>
            <ul className="list-disc space-y-1.5 pl-6 text-xs text-slate-600 dark:text-slate-300">
              <li>Check if you want to offer a discount for 2 pieces</li>
              <li>Share available sizes and updated price</li>
              <li>Send product images or a product link</li>
            </ul>
          </div>

          {/* Assign To & Priority Controls */}
          <div className="mt-5 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">Assign to</span>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                aria-label="Assign to team member"
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="Mohammad Shihab">Mohammad Shihab</option>
                <option value="Support Team">Support Team</option>
              </select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">Priority</span>
              <div className="relative flex-1">
                <Flag className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-rose-500" />
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  aria-label="Select priority"
                  className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="Normal">Normal</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
            </div>
          </div>

          {/* Bottom Primary & Secondary Buttons */}
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              href={`/b/${businessId}/inbox`}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#5B3DF5] to-[#6C47FF] py-3 text-xs font-bold text-white shadow-md shadow-[#5B3DF5]/25 transition hover:brightness-105"
            >
              <span>Open conversation</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={() => setResolvedBanner(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-xs font-bold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <Check className="h-4 w-4 text-emerald-600" />
              <span>{resolvedBanner ? 'Marked as resolved' : 'Mark as resolved'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
