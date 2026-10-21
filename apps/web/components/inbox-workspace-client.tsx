'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  SlidersHorizontal,
  ArrowUpDown,
  Send,
  ShoppingBag,
} from 'lucide-react';

const HOODIE_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="none">
    <rect width="200" height="200" rx="24" fill="#F8FAFC"/>
    <path d="M68 48C68 36 82 28 100 28C118 28 132 36 132 48L165 68L150 104L134 94V164H66V94L50 104L35 68L68 48Z" fill="#111827" stroke="#1F2937" stroke-width="4"/>
    <path d="M84 46C84 54 91 60 100 60C109 60 116 54 116 46" stroke="#374151" stroke-width="4" stroke-linecap="round"/>
    <line x1="93" y1="60" x2="93" y2="86" stroke="#9CA3AF" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="107" y1="60" x2="107" y2="86" stroke="#9CA3AF" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="78" y="122" width="44" height="24" rx="6" fill="#1F2937"/>
  </svg>
`);

const TSHIRT_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="none">
    <rect width="200" height="200" rx="24" fill="#F8FAFC"/>
    <path d="M70 46L100 54L130 46L164 68L148 98L132 88V160H68V88L52 98L36 68L70 46Z" fill="#E2E8F0" stroke="#CBD5E1" stroke-width="4"/>
  </svg>
`);

const CAP_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="none">
    <rect width="200" height="200" rx="24" fill="#F8FAFC"/>
    <path d="M45 118C45 82 70 60 104 60C136 60 156 82 156 118H45Z" fill="#1E293B"/>
    <path d="M32 118H166C166 126 142 132 104 132C64 132 32 126 32 118Z" fill="#0F172A"/>
  </svg>
`);

const AVATARS = {
  sarah: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
  rafiul: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
  nusrat: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80',
  tanvir: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
  ayesha: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&auto=format&fit=crop&q=80',
  imran: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=120&auto=format&fit=crop&q=80',
  mim: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=120&auto=format&fit=crop&q=80',
  arman: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=120&auto=format&fit=crop&q=80',
};

const DEFAULT_CONTACTS = [
  { id: 'sarah', name: 'Sarah Ahmed', preview: 'Hi! Is this available in M?', time: '2m', unread: 2, channel: 'facebook', color: 'bg-[#1877F2]', location: 'Dhaka, Bangladesh', avatar: AVATARS.sarah },
  { id: 'rafiul', name: 'Rafiul Islam', preview: 'Can you give a discount?', time: '12m', unread: 1, channel: 'instagram', color: 'bg-pink-500', location: 'Chattogram, Bangladesh', avatar: AVATARS.rafiul },
  { id: 'nusrat', name: 'Nusrat Jahan', preview: 'When will I receive my order?', time: '25m', unread: 0, channel: 'messenger', color: 'bg-[#006AFF]', location: 'Sylhet, Bangladesh', avatar: AVATARS.nusrat },
  { id: 'tanvir', name: 'Tanvir Hasan', preview: "Thanks! It's perfect", time: '1h', unread: 0, channel: 'whatsapp', color: 'bg-emerald-500', location: 'Dhaka, Bangladesh', avatar: AVATARS.tanvir },
  { id: 'ayesha', name: 'Ayesha Rahman', preview: 'Do you have this in blue?', time: '2h', unread: 0, channel: 'facebook', color: 'bg-[#1877F2]', location: 'Dhaka, Bangladesh', avatar: AVATARS.ayesha },
  { id: 'imran', name: 'Imran Chowdhury', preview: 'Can you show more photos?', time: '3h', unread: 0, channel: 'instagram', color: 'bg-pink-500', location: 'Rajshahi, Bangladesh', avatar: AVATARS.imran },
  { id: 'mim', name: 'Mim Sultana', preview: 'Is cash on delivery available?', time: '5h', unread: 0, channel: 'whatsapp', color: 'bg-emerald-500', location: 'Khulna, Bangladesh', avatar: AVATARS.mim },
  { id: 'arman', name: 'Arman Hossain', preview: "What's the return policy?", time: '8h', unread: 0, channel: 'messenger', color: 'bg-[#006AFF]', location: 'Dhaka, Bangladesh', avatar: AVATARS.arman },
];

export interface InboxWorkspaceClientProps {
  businessId: string;
  initialConversations?: any[];
  initialMessages?: any;
  selectedConversationId?: string;
}

export function InboxWorkspaceClient({
  businessId,
  initialConversations = [],
  selectedConversationId,
}: InboxWorkspaceClientProps) {
  const [inboxTab, setInboxTab] = useState<'all' | 'unread' | 'ai' | 'pending'>('all');
  const [selectedContactId, setSelectedContactId] = useState<string>(
    selectedConversationId || 'sarah',
  );
  const [inboxSize, setInboxSize] = useState('M');
  const [inboxReplyTab, setInboxReplyTab] = useState<'ai' | 'custom' | 'quick'>('ai');
  const [inboxSuggestion, setInboxSuggestion] = useState(
    'Great! I have created the order for you. You can complete the payment now via bKash, Nagad or card. Here is the order summary...',
  );
  const [inboxEditingSuggestion, setInboxEditingSuggestion] = useState(false);
  const [inboxComposer, setInboxComposer] = useState('');
  const [inboxExtraMsgs, setInboxExtraMsgs] = useState<Array<{ id: number; text: string; isAi?: boolean }>>([]);
  const [inboxOrders, setInboxOrders] = useState([
    { id: '#1024', date: 'Oct 12, 2024', amount: '$29.00', status: 'Delivered' },
    { id: '#1023', date: 'Sep 28, 2024', amount: '$58.00', status: 'Shipped' },
    { id: '#1022', date: 'Sep 10, 2024', amount: '$29.00', status: 'Delivered' },
  ]);

  // Merge real conversations with fallback demo contacts
  const contacts = initialConversations && initialConversations.length > 0
    ? initialConversations.map((c: any) => ({
        id: c.id,
        name: c.customerName || c.customerPlatformId || 'Customer',
        preview: c.lastMessageSnippet || 'Conversation started',
        time: c.updatedAt ? new Date(c.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now',
        unread: c.unreadCount || 0,
        channel: c.channelType || 'facebook',
        color: 'bg-[#1877F2]',
        location: 'Bangladesh',
        avatar: c.customerAvatarUrl || AVATARS.sarah,
      }))
    : DEFAULT_CONTACTS;

  const activeContact =
    contacts.find((c) => c.id === selectedContactId) || contacts[0] || DEFAULT_CONTACTS[0];

  const filteredContacts = contacts.filter((c) => {
    if (inboxTab === 'unread') return (c.unread ?? 0) > 0;
    if (inboxTab === 'ai') return c.channel === 'messenger' || c.channel === 'facebook';
    if (inboxTab === 'pending') return c.id === 'sarah' || c.id === 'rafiul';
    return true;
  });

  return (
    <div className="mx-auto max-w-[1380px] p-2 sm:p-4 lg:p-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left Conversations Pane */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#13172B] lg:col-span-3">
          <div className="flex items-center justify-between pb-3">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">Conversations</h2>
            <div className="flex gap-1.5 text-slate-400">
              <button type="button" aria-label="Filter" className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
                <SlidersHorizontal className="h-4 w-4" />
              </button>
              <button type="button" aria-label="Sort" className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
                <ArrowUpDown className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex gap-1 border-b border-slate-100 pb-2.5 text-[11px] font-semibold dark:border-slate-800">
            {(['all', 'unread', 'ai', 'pending'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setInboxTab(t)}
                className={`rounded-lg px-2 py-1 capitalize transition ${
                  inboxTab === t
                    ? 'bg-[#5B3DF5]/10 font-bold text-[#5B3DF5]'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {t === 'all'
                  ? `All (${contacts.length})`
                  : t === 'unread'
                  ? 'Unread (6)'
                  : t === 'ai'
                  ? 'AI Replied'
                  : 'Pending'}
              </button>
            ))}
          </div>

          <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
            {filteredContacts.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedContactId(c.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2.5 text-left transition ${
                  selectedContactId === c.id
                    ? 'bg-[#5B3DF5]/10 dark:bg-[#5B3DF5]/20'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="relative">
                  <img src={c.avatar} alt={c.name} className="h-9 w-9 rounded-full object-cover" />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-[#13172B] ${c.color}`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-xs font-bold text-slate-900 dark:text-white">
                    <span className="truncate">{c.name}</span>
                    <span className="text-[10px] font-normal text-slate-400">{c.time}</span>
                  </div>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{c.preview}</p>
                </div>
                {(c.unread ?? 0) > 0 && (
                  <span className="rounded-full bg-[#5B3DF5] px-1.5 py-0.5 text-[9px] font-bold text-white">
                    {c.unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Center Chat + AI Suggested Reply Pane */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white shadow-2xs dark:border-slate-800 dark:bg-[#13172B] lg:col-span-6">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <img
                src={activeContact.avatar}
                alt={activeContact.name}
                className="h-9 w-9 rounded-full object-cover"
              />
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{activeContact.name}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="capitalize">{activeContact.channel}</span> · {activeContact.location}
                </p>
              </div>
            </div>
            <span className="rounded-xl bg-emerald-500/12 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              Open ▾
            </span>
          </div>

          <div className="flex-1 space-y-3 p-5 text-xs overflow-y-auto max-h-[520px]">
            <div className="max-w-[75%] rounded-2xl bg-slate-100 px-4 py-2.5 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
              Hi! Is this hoodie available in M?
            </div>
            <div className="ml-auto max-w-[75%] rounded-2xl bg-[#EDE9FE] px-4 py-2.5 text-slate-900 dark:bg-[#5B3DF5]/20 dark:text-slate-100">
              Yes! This hoodie is available in size M. The price is $29.00. Would you like to place an order? ✨
            </div>
            <div className="max-w-[75%] rounded-2xl bg-slate-100 px-4 py-2.5 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
              Can you show more photos?
            </div>
            <div className="ml-auto max-w-[78%] rounded-2xl border border-[#5B3DF5]/20 bg-[#F5F3FF] p-3 dark:border-[#5B3DF5]/30 dark:bg-[#5B3DF5]/10">
              <div className="flex gap-3">
                <img src={HOODIE_SVG} alt="Hoodie" className="h-16 w-16 rounded-xl bg-white shadow-2xs" />
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">Essential Hoodie</p>
                  <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                    $29.00 · <span className="text-xs text-emerald-600 dark:text-emerald-400">In Stock</span>
                  </p>
                  <div className="mt-1.5 flex gap-1.5">
                    <img src={HOODIE_SVG} alt="v1" className="h-7 w-7 rounded border bg-white dark:border-slate-700" />
                    <img src={TSHIRT_SVG} alt="v2" className="h-7 w-7 rounded border bg-white dark:border-slate-700" />
                    <img src={CAP_SVG} alt="v3" className="h-7 w-7 rounded border bg-white dark:border-slate-700" />
                  </div>
                </div>
              </div>
            </div>
            <div className="max-w-[75%] rounded-2xl bg-slate-100 px-4 py-2.5 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
              Looks good! I&apos;ll take one in M.
            </div>

            {inboxExtraMsgs.map((m) => (
              <div
                key={m.id}
                className={`max-w-[78%] rounded-2xl px-4 py-2.5 ${
                  m.isAi
                    ? 'ml-auto bg-[#EDE9FE] text-slate-900 dark:bg-[#5B3DF5]/20 dark:text-slate-100'
                    : 'ml-auto bg-[#5B3DF5] text-white'
                }`}
              >
                {m.text}
              </div>
            ))}
          </div>

          {/* AI Suggested Reply Box */}
          <div className="border-t border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex gap-4 border-b border-slate-200 pb-2 text-xs font-semibold dark:border-slate-800">
              {(['ai', 'custom', 'quick'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setInboxReplyTab(t)}
                  className={`pb-1 transition ${
                    inboxReplyTab === t
                      ? 'border-b-2 border-[#5B3DF5] font-bold text-[#5B3DF5]'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                  }`}
                >
                  {t === 'ai'
                    ? '✨ AI Suggested Reply'
                    : t === 'custom'
                    ? 'Custom Reply'
                    : 'Quick Replies'}
                </button>
              ))}
            </div>

            {inboxEditingSuggestion ? (
              <textarea
                value={inboxSuggestion}
                onChange={(e) => setInboxSuggestion(e.target.value)}
                rows={2}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#5B3DF5] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                {inboxSuggestion}
              </p>
            )}

            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setInboxExtraMsgs((prev) => [
                    ...prev,
                    { id: Date.now(), text: inboxSuggestion, isAi: true },
                  ])
                }
                className="rounded-xl bg-[#5B3DF5] px-4 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-[#4C2EE0] transition"
              >
                Use This Reply
              </button>
              <button
                type="button"
                onClick={() => setInboxEditingSuggestion((e) => !e)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                ✏️ {inboxEditingSuggestion ? 'Done' : 'Edit'}
              </button>
            </div>
          </div>

          {/* Composer Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!inboxComposer.trim()) return;
              setInboxExtraMsgs((prev) => [
                ...prev,
                { id: Date.now(), text: inboxComposer.trim() },
              ]);
              setInboxComposer('');
            }}
            className="flex items-center gap-2 border-t border-slate-100 p-3 dark:border-slate-800"
          >
            <input
              type="text"
              value={inboxComposer}
              onChange={(e) => setInboxComposer(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 rounded-xl bg-transparent px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-white"
            />
            <button
              type="submit"
              className="rounded-xl bg-[#5B3DF5] p-2.5 text-white hover:bg-[#4C2EE0] transition"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>

        {/* Right Customer VIP + Product Quick-Order + Recent Orders Pane */}
        <div className="space-y-4 lg:col-span-3">
          {/* Customer VIP Card */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#13172B]">
            <div className="flex justify-between text-xs font-bold text-slate-900 dark:text-white">
              <span>Customer</span>
              <span className="cursor-pointer text-[#5B3DF5] hover:underline">View Profile &gt;</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <img
                src={activeContact.avatar}
                alt={activeContact.name}
                className="h-11 w-11 rounded-full object-cover shadow-2xs"
              />
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{activeContact.name}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{activeContact.location}</p>
                <div className="mt-1 flex gap-1">
                  <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-[#5B3DF5] dark:bg-[#5B3DF5]/20">
                    New Customer
                  </span>
                  <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                    👑 VIP
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 border-t border-slate-100 pt-2.5 text-center text-xs dark:border-slate-800">
              <div>
                <p className="text-[10px] text-slate-400">Total Orders</p>
                <p className="font-extrabold text-slate-900 dark:text-white">{inboxOrders.length}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">Total Spent</p>
                <p className="font-extrabold text-slate-900 dark:text-white">$87.00</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">Last Order</p>
                <p className="font-bold text-slate-700 dark:text-slate-300">Oct 12, 2024</p>
              </div>
            </div>
          </div>

          {/* Product Quick-Order Builder */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#13172B]">
            <div className="flex justify-between text-xs font-bold text-slate-900 dark:text-white">
              <span>Product</span>
              <span className="cursor-pointer text-[#5B3DF5] hover:underline">View Product &gt;</span>
            </div>
            <div className="mt-3 flex gap-3">
              <img
                src={HOODIE_SVG}
                alt="Hoodie"
                className="h-16 w-16 rounded-xl border bg-slate-50 shadow-2xs dark:border-slate-700 dark:bg-slate-800"
              />
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">Essential Hoodie</p>
                <p className="text-base font-extrabold text-slate-900 dark:text-white">$29.00</p>
                <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                  In Stock
                </span>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Size</span>
              <div className="flex gap-1">
                {['S', 'M', 'L', 'XL'].map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setInboxSize(sz)}
                    className={`h-7 w-8 rounded-lg font-bold transition ${
                      inboxSize === sz
                        ? 'bg-[#5B3DF5] text-white shadow-2xs'
                        : 'border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const id = `#${1025 + inboxOrders.length}`;
                setInboxOrders((prev) => [
                  { id, date: 'Today', amount: '$29.00', status: 'Pending' },
                  ...prev,
                ]);
                setInboxExtraMsgs((prev) => [
                  ...prev,
                  {
                    id: Date.now(),
                    text: `Order ${id} created for Essential Hoodie (${inboxSize}) — $29.00!`,
                    isAi: true,
                  },
                ]);
              }}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#5B3DF5] py-2 text-xs font-bold text-white shadow-md shadow-[#5B3DF5]/20 hover:bg-[#4C2EE0] transition"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              <span>+ Create Order</span>
            </button>
          </div>

          {/* Recent Orders List */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#13172B]">
            <div className="flex justify-between text-xs font-bold text-slate-900 dark:text-white">
              <span>Recent Orders</span>
              <Link href={`/b/${businessId}/orders`} className="text-[#5B3DF5] hover:underline">
                View All
              </Link>
            </div>
            <div className="mt-2.5 space-y-2 text-xs">
              {inboxOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between py-1">
                  <span className="font-bold text-slate-900 dark:text-white">{o.id}</span>
                  <span className="text-slate-400">{o.date}</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{o.amount}</span>
                  <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                    {o.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
