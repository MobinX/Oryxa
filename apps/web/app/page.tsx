'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { COMPANY_NAME } from '@/lib/brand';
import { OnlyOrdesLogo } from '@/components/sidebar';
import {
  Sparkles,
  ArrowRight,
  Check,
  ChevronDown,
  MessageSquare,
  Zap,
  ShoppingBag,
  Calendar,
  Clock,
  Layers,
  BarChart3,
  Users,
  Search,
  Bell,
  Star,
  MoreHorizontal,
  Smile,
  Paperclip,
  Send,
  Plus,
  Minus,
  ShieldCheck,
  Lock,
  Server,
  Headphones,
  Play,
  Pause,
  RotateCcw,
  ShoppingCart,
  AlertCircle,
  Truck,
  CheckCircle2,
  Home,
  Package,
  Blocks,
  Settings,
  Store,
} from 'lucide-react';

type HeroChatMessage = {
  id: string;
  sender: 'customer' | 'ai';
  text: string;
  time: string;
  hasProductCard?: boolean;
};

const INBOX_CONTACTS = [
  {
    id: 'sarah',
    name: 'Sarah Ahmed',
    preview: 'Hi! Is this available in M?',
    time: '2m',
    unread: 2,
    channel: 'messenger',
    channelColor: 'bg-[#006AFF]',
    location: 'Dhaka, Bangladesh',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
  },
  {
    id: 'rafiul',
    name: 'Rafiul Islam',
    preview: 'Can you give a discount?',
    time: '12m',
    unread: 1,
    channel: 'instagram',
    channelColor: 'bg-pink-500',
    location: 'Chattogram, Bangladesh',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
  },
  {
    id: 'nusrat',
    name: 'Nusrat Jahan',
    preview: 'When will I receive my order?',
    time: '25m',
    unread: 0,
    channel: 'whatsapp',
    channelColor: 'bg-emerald-500',
    location: 'Sylhet, Bangladesh',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80',
  },
  {
    id: 'tanvir',
    name: 'Tanvir Hasan',
    preview: "Thanks! It's perfect",
    time: '1h',
    unread: 0,
    channel: 'comment',
    channelColor: 'bg-amber-500',
    location: 'Dhaka, Bangladesh',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
  },
  {
    id: 'ayesha',
    name: 'Ayesha Rahman',
    preview: 'Do you have this in blue?',
    time: '2h',
    unread: 0,
    channel: 'instagram',
    channelColor: 'bg-pink-500',
    location: 'Dhaka, Bangladesh',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&auto=format&fit=crop&q=80',
  },
  {
    id: 'imran',
    name: 'Imran Chowdhury',
    preview: 'Can you show more photos?',
    time: '3h',
    unread: 0,
    channel: 'messenger',
    channelColor: 'bg-[#006AFF]',
    location: 'Rajshahi, Bangladesh',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=120&auto=format&fit=crop&q=80',
  },
  {
    id: 'mim',
    name: 'Mim Sultana',
    preview: 'Is cash on delivery available?',
    time: '5h',
    unread: 0,
    channel: 'whatsapp',
    channelColor: 'bg-emerald-500',
    location: 'Khulna, Bangladesh',
    avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=120&auto=format&fit=crop&q=80',
  },
  {
    id: 'arman',
    name: 'Arman Hossain',
    preview: 'Where is my order?',
    time: '8h',
    unread: 0,
    channel: 'messenger',
    channelColor: 'bg-[#006AFF]',
    location: 'Dhaka, Bangladesh',
    avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=120&auto=format&fit=crop&q=80',
  },
];

export default function HomePage() {
  // Live Interactive Hero AI Workflow State
  const [workflowPhase, setWorkflowPhase] = useState<number>(3);
  const [autoPlay, setAutoPlay] = useState<boolean>(true);
  const [selectedSize, setSelectedSize] = useState<'S' | 'M' | 'L' | 'XL'>('M');
  const [draftQty, setDraftQty] = useState<number>(1);
  const [orderCreatedBanner, setOrderCreatedBanner] = useState<boolean>(false);
  const [ordersBadgeCount, setOrdersBadgeCount] = useState<number>(8);
  const [customerTotalOrders, setCustomerTotalOrders] = useState<number>(3);
  const [customerTotalSpend, setCustomerTotalSpend] = useState<number>(87);
  const [chatInput, setChatInput] = useState<string>('');
  const [aiTyping, setAiTyping] = useState<boolean>(false);
  const [customMessages, setCustomMessages] = useState<HeroChatMessage[]>([]);

  // 6-Step Dark Workflow Active Step
  const [activeFlowStep, setActiveFlowStep] = useState<number>(1);

  // Pricing Billing Cycle
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  // Auto-cycle the live hero workflow & 6-step pipeline for a living SaaS demo feel
  useEffect(() => {
    if (!autoPlay) return;
    const timer = setInterval(() => {
      setWorkflowPhase((prev) => (prev >= 4 ? 1 : prev + 1));
      setActiveFlowStep((prev) => (prev >= 6 ? 1 : prev + 1));
    }, 3400);
    return () => clearInterval(timer);
  }, [autoPlay]);

  const unitPrice = 29;
  const draftTotal = unitPrice * draftQty;

  const handleCreateOrderLive = () => {
    setAutoPlay(false);
    setOrderCreatedBanner(true);
    setOrdersBadgeCount((c) => c + 1);
    setCustomerTotalOrders((c) => c + 1);
    setCustomerTotalSpend((s) => s + draftTotal);
    setCustomMessages((prev) => [
      ...prev,
      {
        id: `ai-order-${Date.now()}`,
        sender: 'ai',
        text: `Order #1042 created for ${draftQty}x Essential Hoodie (${selectedSize}) — Total $${draftTotal.toFixed(2)}. Payment link (bKash / Nagad / COD) sent!`,
        time: 'Just now',
      },
    ]);
    setTimeout(() => setOrderCreatedBanner(false), 3200);
  };

  const handleSendHeroMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setAutoPlay(false);
    setWorkflowPhase(3);
    const text = chatInput.trim();
    setChatInput('');
    setCustomMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, sender: 'customer', text, time: 'Just now' },
    ]);
    setAiTyping(true);
    setTimeout(() => {
      setAiTyping(false);
      const lower = text.toLowerCase();
      const reply =
        lower.includes('delivery') || lower.includes('payment') || lower.includes('bkash')
          ? 'Inside Dhaka delivery takes 24 hours ($2). You can pay via bKash, Nagad, or Cash on Delivery! Shall I confirm your Essential Hoodie order?'
          : lower.includes('discount') || lower.includes('price')
            ? `The Essential Hoodie (${selectedSize}) is $29.00 and currently in stock. I've added it to your Order Draft on the right!`
            : `Got it! I've updated the Order Draft for Essential Hoodie (Size ${selectedSize}, Qty ${draftQty}). Ready to create your order whenever you are.`;
      setCustomMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, sender: 'ai', text: reply, time: 'Just now' },
      ]);
    }, 650);
  };

  const resetHeroSimulation = () => {
    setCustomMessages([]);
    setSelectedSize('M');
    setDraftQty(1);
    setOrdersBadgeCount(8);
    setCustomerTotalOrders(3);
    setCustomerTotalSpend(87);
    setWorkflowPhase(3);
    setAutoPlay(true);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FC] text-slate-900 font-inter selection:bg-[#5B3DF5] selection:text-white">
      {/* =====================================================================
          1. TOP NAVIGATION BAR (Matches Screenshot 1 & 5)
         ===================================================================== */}
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-18 max-w-[1380px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-10">
            <Link href="/" className="focus:outline-none">
              <OnlyOrdesLogo />
            </Link>

            <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
              <a href="#live-demo" className="inline-flex items-center gap-1 transition hover:text-slate-950">
                <span>Product</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </a>
              <a href="#workflow" className="inline-flex items-center gap-1 transition hover:text-slate-950">
                <span>Solutions</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </a>
              <a href="#pricing" className="transition hover:text-slate-950">
                Pricing
              </a>
              <Link href="/docs" className="inline-flex items-center gap-1 transition hover:text-slate-950">
                <span>Resources</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-full border border-slate-200 bg-white px-5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-slate-300 hover:bg-slate-50 sm:text-sm"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#5B3DF5] to-[#6C47FF] px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-[#5B3DF5]/25 transition hover:brightness-105 active:scale-98 sm:text-sm"
            >
              <span>Get started</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* =====================================================================
          2. HERO SECTION + LIVE ANIMATED TABLET WORKSPACE (Screenshot 1)
         ===================================================================== */}
      <section id="live-demo" className="relative overflow-hidden pt-8 pb-16 lg:pt-12 lg:pb-24">
        {/* Subtle ambient pastel glow behind hero */}
        <div className="pointer-events-none absolute -top-24 right-0 -z-10 h-[550px] w-[650px] rounded-full bg-gradient-to-br from-[#5B3DF5]/12 via-purple-400/10 to-indigo-200/20 blur-3xl" />

        <div className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-8">
            {/* Left Copy Column (5 cols on lg) */}
            <div className="lg:col-span-5 space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#5B3DF5]/20 bg-[#5B3DF5]/8 px-3.5 py-1.5 text-xs font-semibold text-[#5B3DF5]">
                <Sparkles className="h-3.5 w-3.5" />
                <span>AI-Powered Commerce Management</span>
              </div>

              <h1 className="font-geist text-4xl font-extrabold leading-[1.08] tracking-tight text-slate-950 sm:text-5xl xl:text-[54px]">
                Grow your online business with AI that{' '}
                <span className="bg-gradient-to-r from-[#5B3DF5] to-[#7C3AED] bg-clip-text text-transparent">
                  works for you
                </span>
              </h1>

              <p className="max-w-xl text-base leading-relaxed text-slate-600 sm:text-[17px]">
                {COMPANY_NAME} helps online sellers manage customer conversations, orders, products and
                social media — with intelligent automation that saves time and helps you sell more.
              </p>

              <div className="flex flex-wrap items-center gap-3.5 pt-1">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5B3DF5] to-[#6C47FF] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#5B3DF5]/30 transition hover:brightness-105 active:scale-98"
                >
                  <span>Start for free</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#workflow"
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-7 py-3.5 text-sm font-semibold text-slate-800 shadow-2xs transition hover:bg-slate-50"
                >
                  Book a demo
                </a>
              </div>

              {/* 4 Mini Feature Icons Row (Bottom-left of Screenshot 1) */}
              <div className="grid grid-cols-2 gap-4 pt-6 sm:grid-cols-4 border-t border-slate-200/70">
                <div>
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[#5B3DF5]/10 text-[#5B3DF5]">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-900">Unified Inbox</p>
                  <p className="text-[11px] text-slate-500">All channels in one place</p>
                </div>

                <div>
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[#5B3DF5]/10 text-[#5B3DF5]">
                    <Zap className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-900">AI Auto-Reply</p>
                  <p className="text-[11px] text-slate-500">Save time, sell more</p>
                </div>

                <div>
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[#5B3DF5]/10 text-[#5B3DF5]">
                    <ShoppingBag className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-900">Order Management</p>
                  <p className="text-[11px] text-slate-500">From chat to delivery</p>
                </div>

                <div>
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[#5B3DF5]/10 text-[#5B3DF5]">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-900">Auto Post</p>
                  <p className="text-[11px] text-slate-500">Engage your audience</p>
                </div>
              </div>
            </div>

            {/* Right Interactive Live AI Window Column (7 cols on lg) */}
            <div className="lg:col-span-7">
              {/* Live Simulation Controls Pill Bar */}
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 px-1">
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-900/90 px-3 py-1 text-[11px] font-medium text-slate-200 shadow-xs">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  <span>Live Interactive AI Workspace — Click sizes, type a message, or create an order</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAutoPlay((p) => !p)}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {autoPlay ? <Pause className="h-3 w-3 text-[#5B3DF5]" /> : <Play className="h-3 w-3 text-[#5B3DF5]" />}
                    <span>{autoPlay ? 'Live Loop On' : 'Paused'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={resetHeroSimulation}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                    title="Reset demo"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset</span>
                  </button>
                </div>
              </div>

              {/* Bezel Tablet Frame Matching Screenshot 1 */}
              <div className="rounded-[24px] border-[6px] border-[#1B1D2E] bg-[#0F1123] text-white shadow-2xl shadow-indigo-950/25 overflow-hidden">
                {/* Top App Header Inside Tablet */}
                <div className="flex h-12 items-center justify-between border-b border-white/8 bg-[#121528] px-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#5B3DF5] to-[#7C3AED] text-white">
                      <ShoppingBag className="h-4 w-4" />
                    </div>
                    <span className="font-geist text-sm font-bold tracking-tight text-white">
                      {COMPANY_NAME}
                    </span>
                  </div>

                  {/* Search bar inside tablet */}
                  <div className="hidden flex-1 max-w-xs mx-4 items-center justify-between rounded-lg border border-white/10 bg-[#1A1E36] px-3 py-1.5 text-[11px] text-slate-400 sm:flex">
                    <span className="flex items-center gap-1.5 truncate">
                      <Search className="h-3 w-3 text-slate-400" />
                      Search conversations, orders, products...
                    </span>
                    <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-slate-300">
                      Ctrl K
                    </kbd>
                  </div>

                  {/* Right profile inside tablet */}
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Bell className="h-4 w-4 text-slate-300" />
                      <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500 text-[8px] font-bold text-white">
                        1
                      </span>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1">
                      <img
                        src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=80&auto=format&fit=crop&q=80"
                        alt="Mohammad Shihab"
                        className="h-6 w-6 rounded-full object-cover"
                      />
                      <div className="leading-none">
                        <p className="text-[11px] font-semibold text-white">Mohammad Shihab</p>
                        <p className="text-[9px] text-slate-400">Store Owner</p>
                      </div>
                      <ChevronDown className="h-3 w-3 text-slate-400" />
                    </div>
                  </div>
                </div>

                {/* 4-Column Tablet Body: Sidebar | Inbox List | Live Chat | Customer & Order Draft */}
                <div className="grid grid-cols-1 md:grid-cols-12 min-h-[470px]">
                  {/* Col 1: Mini Dark Sidebar (2 cols) */}
                  <div className="hidden border-r border-white/8 bg-[#0E1020] p-2.5 md:col-span-2 md:flex md:flex-col md:justify-between">
                    <div className="space-y-1 text-[11px]">
                      <div className="flex items-center justify-between rounded-lg bg-[#5B3DF5] px-2.5 py-1.5 font-semibold text-white">
                        <span className="flex items-center gap-2">
                          <Home className="h-3.5 w-3.5" />
                          Inbox
                        </span>
                        <span className="rounded-full bg-white/20 px-1.5 text-[9px]">12</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-slate-400 hover:bg-white/5">
                        <span className="flex items-center gap-2">
                          <ShoppingBag className="h-3.5 w-3.5" />
                          Orders
                        </span>
                        <span className="rounded-full bg-[#5B3DF5] px-1.5 text-[9px] font-bold text-white transition-transform duration-300">
                          {ordersBadgeCount}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-400">
                        <Package className="h-3.5 w-3.5" />
                        Products
                      </div>
                      <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-400">
                        <Users className="h-3.5 w-3.5" />
                        Customers
                      </div>
                      <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-400">
                        <Sparkles className="h-3.5 w-3.5" />
                        Auto Post
                      </div>
                      <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-400">
                        <BarChart3 className="h-3.5 w-3.5" />
                        Analytics
                      </div>
                      <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-400">
                        <Blocks className="h-3.5 w-3.5" />
                        Integrations
                      </div>
                      <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-400">
                        <Users className="h-3.5 w-3.5" />
                        Team
                      </div>
                      <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-400">
                        <Settings className="h-3.5 w-3.5" />
                        Settings
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-2 text-[10px]">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#5B3DF5] text-white">
                          <Store className="h-3 w-3" />
                        </span>
                        <div className="truncate leading-tight">
                          <p className="font-semibold text-white">My Store</p>
                          <p className="text-[8px] text-slate-400">onlyordes.com</p>
                        </div>
                      </div>
                      <ChevronDown className="h-3 w-3 text-slate-400" />
                    </div>
                  </div>

                  {/* Col 2: Conversations List (3 cols) */}
                  <div className="hidden border-r border-white/8 bg-[#121528] md:col-span-3 md:flex md:flex-col">
                    <div className="flex items-center justify-between px-3 pt-3 pb-2">
                      <span className="text-xs font-bold text-white">Inbox</span>
                      <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] text-slate-300">
                        All channels <ChevronDown className="h-2.5 w-2.5" />
                      </span>
                    </div>

                    <div className="flex items-center gap-1 border-b border-white/8 px-3 pb-2 text-[9px] font-medium text-slate-400">
                      <span className="rounded-md bg-[#5B3DF5]/30 px-2 py-0.5 font-semibold text-white">
                        All (12)
                      </span>
                      <span className="px-1.5 py-0.5">Unread (6)</span>
                      <span className="px-1.5 py-0.5">Customers</span>
                      <span className="px-1.5 py-0.5">AI Replied</span>
                    </div>

                    <div className="flex-1 divide-y divide-white/5 overflow-y-auto">
                      {INBOX_CONTACTS.map((c, idx) => (
                        <div
                          key={c.id}
                          className={`flex items-center gap-2.5 px-3 py-2 transition ${
                            idx === 0 ? 'bg-[#5B3DF5]/20 border-l-2 border-[#5B3DF5]' : 'hover:bg-white/4'
                          }`}
                        >
                          <div className="relative shrink-0">
                            <img
                              src={c.avatar}
                              alt={c.name}
                              className="h-8 w-8 rounded-full object-cover"
                            />
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-[#121528] ${c.channelColor}`}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <p className="truncate text-[11px] font-semibold text-white">{c.name}</p>
                              <span className="text-[9px] text-slate-400">{c.time}</span>
                            </div>
                            <div className="flex items-center justify-between gap-1">
                              <p className="truncate text-[10px] text-slate-400">{c.preview}</p>
                              {c.unread > 0 && (
                                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#5B3DF5] text-[8px] font-bold text-white">
                                  {c.unread}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Col 3: Live AI Conversation Thread (4 cols) */}
                  <div className="flex flex-col border-r border-white/8 bg-[#14182D] md:col-span-4">
                    {/* Chat Header */}
                    <div className="flex items-center justify-between border-b border-white/8 px-3.5 py-2.5">
                      <div className="flex items-center gap-2">
                        <img
                          src={INBOX_CONTACTS[0]!.avatar}
                          alt="Sarah Ahmed"
                          className="h-7 w-7 rounded-full object-cover"
                        />
                        <div>
                          <p className="text-xs font-bold text-white">Sarah Ahmed</p>
                          <p className="flex items-center gap-1 text-[9px] text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            Online · Dhaka, Bangladesh
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="Star conversation"
                          className="rounded-md border border-white/10 p-1 text-slate-400 hover:text-white"
                        >
                          <Star className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          aria-label="More options"
                          className="rounded-md border border-white/10 p-1 text-slate-400 hover:text-white"
                        >
                          <MoreHorizontal className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* Live Animated Messages Stream */}
                    <div className="flex-1 space-y-2.5 overflow-y-auto p-3 text-[11px]">
                      {/* Msg 1: Customer Inquiry */}
                      <div className="flex items-start gap-2 animate-slide-up-fade">
                        <img
                          src={INBOX_CONTACTS[0]!.avatar}
                          alt="Sarah"
                          className="mt-0.5 h-6 w-6 rounded-full object-cover"
                        />
                        <div>
                          <div className="rounded-2xl rounded-tl-xs bg-[#222741] px-3 py-2 text-slate-100">
                            Hi! Is this available in {selectedSize}?
                          </div>
                          <span className="mt-0.5 block text-[9px] text-slate-500">10:24 AM</span>
                        </div>
                      </div>

                      {/* Msg 2: AI Auto-Reply + Interactive Product Card */}
                      {workflowPhase >= 2 && (
                        <div className="space-y-2 animate-slide-up-fade">
                          <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-xs bg-gradient-to-r from-[#5B3DF5] to-[#6C47FF] px-3 py-2 text-white shadow-md shadow-[#5B3DF5]/20">
                            Yes! This product is available in size {selectedSize}. Here are the details:
                          </div>
                          <span className="block text-right text-[9px] text-slate-400">10:24 AM ✓✓</span>

                          {/* Embedded Interactive Product Card */}
                          <div className="ml-auto max-w-[92%] rounded-xl border border-white/12 bg-[#1B203A] p-2.5 shadow-lg">
                            <div className="flex gap-2.5">
                              <img
                                src="/images/essential-hoodie.jpg"
                                alt="Essential Hoodie"
                                className="h-14 w-14 rounded-lg bg-white object-cover"
                              />
                              <div className="flex-1">
                                <p className="text-xs font-bold text-white">Essential Hoodie</p>
                                <p className="text-xs font-extrabold text-slate-200">$29.00</p>
                                <span className="mt-1 inline-block rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400">
                                  In Stock
                                </span>
                              </div>
                            </div>

                            {/* Interactive Size Pills */}
                            <div className="mt-2.5 flex items-center gap-1.5">
                              {(['S', 'M', 'L', 'XL'] as const).map((sz) => (
                                <button
                                  key={sz}
                                  type="button"
                                  onClick={() => {
                                    setAutoPlay(false);
                                    setSelectedSize(sz);
                                  }}
                                  className={`h-6 flex-1 rounded-md text-[10px] font-bold transition ${
                                    selectedSize === sz
                                      ? 'border border-[#7C3AED] bg-[#5B3DF5] text-white shadow-xs'
                                      : 'border border-white/10 bg-[#121528] text-slate-300 hover:bg-white/10'
                                  }`}
                                >
                                  {sz}
                                </button>
                              ))}
                            </div>

                            {/* Card Action Buttons */}
                            <div className="mt-2 grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setAutoPlay(false);
                                  setDraftQty((q) => q + 1);
                                }}
                                className="rounded-lg border border-white/12 bg-[#121528] py-1.5 text-[10px] font-semibold text-slate-200 hover:bg-white/8"
                              >
                                View Details
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setAutoPlay(false);
                                  setDraftQty((q) => q + 1);
                                }}
                                className="rounded-lg bg-[#5B3DF5] py-1.5 text-[10px] font-semibold text-white hover:bg-[#4C2EE0]"
                              >
                                Add to Order
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Msg 3: Customer Follow-up */}
                      {workflowPhase >= 3 && (
                        <div className="flex items-start gap-2 animate-slide-up-fade">
                          <img
                            src={INBOX_CONTACTS[0]!.avatar}
                            alt="Sarah"
                            className="mt-0.5 h-6 w-6 rounded-full object-cover"
                          />
                          <div>
                            <div className="rounded-2xl rounded-tl-xs bg-[#222741] px-3 py-2 text-slate-100">
                              Can you share the delivery time and payment options?
                            </div>
                            <span className="mt-0.5 block text-[9px] text-slate-500">10:26 AM</span>
                          </div>
                        </div>
                      )}

                      {/* Custom Interactive Messages Sent by User */}
                      {customMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`animate-slide-up-fade ${
                            msg.sender === 'ai' ? 'ml-auto max-w-[90%]' : 'flex items-start gap-2'
                          }`}
                        >
                          {msg.sender === 'customer' && (
                            <img
                              src={INBOX_CONTACTS[0]!.avatar}
                              alt="Sarah"
                              className="mt-0.5 h-6 w-6 rounded-full object-cover"
                            />
                          )}
                          <div
                            className={
                              msg.sender === 'ai'
                                ? 'rounded-2xl rounded-tr-xs bg-gradient-to-r from-[#5B3DF5] to-[#6C47FF] px-3 py-2 text-white'
                                : 'rounded-2xl rounded-tl-xs bg-[#222741] px-3 py-2 text-slate-100'
                            }
                          >
                            {msg.text}
                          </div>
                        </div>
                      ))}

                      {aiTyping && (
                        <div className="ml-auto inline-flex items-center gap-1 rounded-xl bg-[#5B3DF5]/30 px-3 py-1.5 text-[10px] text-indigo-200">
                          <Sparkles className="h-3 w-3 animate-spin" />
                          <span>OnlyOrdes AI is replying...</span>
                        </div>
                      )}
                    </div>

                    {/* Interactive Chat Input Bar */}
                    <form
                      onSubmit={handleSendHeroMessage}
                      className="flex items-center gap-1.5 border-t border-white/8 bg-[#111426] p-2.5"
                    >
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1 bg-transparent px-2 text-[11px] text-white placeholder:text-slate-500 focus:outline-none"
                      />
                      <Smile className="h-3.5 w-3.5 text-slate-400" />
                      <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                      <button
                        type="submit"
                        aria-label="Send message"
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#5B3DF5] text-white hover:bg-[#4C2EE0]"
                      >
                        <Send className="h-3 w-3" />
                      </button>
                    </form>
                  </div>

                  {/* Col 4: Customer Details & Live Order Draft (3 cols) */}
                  <div className="flex flex-col justify-between bg-[#121528] p-3 md:col-span-3">
                    {/* Customer Details */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-white">Customer Details</span>
                        <span className="text-[10px] font-medium text-[#A78BFA]">View Profile</span>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <img
                          src={INBOX_CONTACTS[0]!.avatar}
                          alt="Sarah Ahmed"
                          className="h-9 w-9 rounded-full object-cover"
                        />
                        <div>
                          <p className="text-xs font-bold text-white">Sarah Ahmed</p>
                          <p className="text-[10px] text-slate-400">Dhaka, Bangladesh</p>
                        </div>
                      </div>

                      <div className="space-y-1.5 border-y border-white/8 py-2 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Total Orders</span>
                          <span className="font-bold text-white">{customerTotalOrders}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Total Spend</span>
                          <span className="font-bold text-white">${customerTotalSpend.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Customer Since</span>
                          <span className="font-medium text-slate-200">Oct 12, 2024</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1 text-[9px]">
                        <span className="text-slate-400 mr-1">Tags</span>
                        <span className="rounded bg-blue-500/20 px-1.5 py-0.5 font-semibold text-blue-300">
                          Regular
                        </span>
                        <span className="rounded bg-white/10 px-1.5 py-0.5 font-medium text-slate-300">
                          High Intent
                        </span>
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-slate-300">+</span>
                      </div>
                    </div>

                    {/* Live Order Draft Card */}
                    <div className="mt-3 rounded-xl border border-white/10 bg-[#181C35] p-2.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-white">Order Draft</span>
                        {workflowPhase === 4 && (
                          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[8px] font-bold text-emerald-300">
                            AI Synced
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 rounded-lg bg-[#111426] p-2">
                        <div className="flex items-center gap-2">
                          <img
                            src="/images/essential-hoodie.jpg"
                            alt="Essential Hoodie"
                            className="h-9 w-9 rounded bg-white object-cover"
                          />
                          <div className="leading-tight">
                            <p className="text-[10px] font-bold text-white">Essential Hoodie</p>
                            <p className="text-[9px] text-slate-400">Black · {selectedSize}</p>
                            <p className="text-[10px] font-bold text-white">${unitPrice.toFixed(2)}</p>
                          </div>
                        </div>

                        {/* Stepper */}
                        <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-[#181C35] px-1.5 py-0.5 text-[10px]">
                          <button
                            type="button"
                            onClick={() => setDraftQty((q) => Math.max(1, q - 1))}
                            className="text-slate-400 hover:text-white"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-2.5 w-2.5" />
                          </button>
                          <span className="w-3 text-center font-bold text-white">{draftQty}</span>
                          <button
                            type="button"
                            onClick={() => setDraftQty((q) => q + 1)}
                            className="text-slate-400 hover:text-white"
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setDraftQty((q) => q + 1)}
                        className="text-[10px] font-medium text-[#A78BFA] hover:underline"
                      >
                        + Add more items
                      </button>

                      <div className="space-y-1 border-t border-white/8 pt-2 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Customer</span>
                          <span className="font-medium text-slate-200">Sarah Ahmed</span>
                        </div>
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-slate-300">Total</span>
                          <span className="text-white">${draftTotal.toFixed(2)}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleCreateOrderLive}
                        className="w-full rounded-lg bg-gradient-to-r from-[#5B3DF5] to-[#6C47FF] py-2 text-[11px] font-bold text-white shadow-md shadow-[#5B3DF5]/30 transition hover:brightness-110 active:scale-98"
                      >
                        {orderCreatedBanner ? '✓ Order #1042 Created!' : 'Create Order'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Floating Value Strip (Matches Screenshot 1 bottom bar) */}
          <div className="mt-10 rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-lg shadow-slate-900/4 backdrop-blur-md">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-slate-200/70">
              <div className="flex items-center gap-3.5 px-2">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#5B3DF5]/10 text-[#5B3DF5]">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Faster replies</p>
                  <p className="text-xs text-slate-500">Respond to customers in less time</p>
                </div>
              </div>

              <div className="flex items-center gap-3.5 px-2 lg:pl-6">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#5B3DF5]/10 text-[#5B3DF5]">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Less tab switching</p>
                  <p className="text-xs text-slate-500">All conversations in one place</p>
                </div>
              </div>

              <div className="flex items-center gap-3.5 px-2 lg:pl-6">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#5B3DF5]/10 text-[#5B3DF5]">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Orders in one place</p>
                  <p className="text-xs text-slate-500">From inquiry to delivery</p>
                </div>
              </div>

              <div className="flex items-center gap-3.5 px-2 lg:pl-6">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#5B3DF5]/10 text-[#5B3DF5]">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Engage automatically</p>
                  <p className="text-xs text-slate-500">AI-powered posts for your store</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          3. DARK 6-STEP LIVE AUTOMATION FLOW SECTION (Matches Screenshot 2)
         ===================================================================== */}
      <section id="workflow" className="bg-[#0B0D1D] py-20 text-white lg:py-24">
        <div className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8">
          {/* Header Row */}
          <div className="grid grid-cols-1 items-start justify-between gap-8 lg:grid-cols-12">
            <div className="lg:col-span-6 space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#5B3DF5]/40 bg-[#5B3DF5]/15 px-3.5 py-1 text-xs font-semibold text-[#A78BFA]">
                <Sparkles className="h-3.5 w-3.5" />
                <span>AI-Powered Commerce Automation</span>
              </div>

              <h2 className="font-geist text-3xl font-extrabold tracking-tight text-white sm:text-5xl leading-[1.12]">
                From customer message
                <br />
                to <span className="text-[#818CF8]">completed order.</span>
              </h2>

              <p className="max-w-xl text-sm leading-relaxed text-slate-400 sm:text-base">
                See how {COMPANY_NAME} automatically handles customer conversations, finds products,
                creates orders and keeps you updated — all in one place.
              </p>
            </div>

            {/* Top-Right 4 Capability Badges Box */}
            <div className="lg:col-span-6">
              <div className="grid grid-cols-2 gap-4 rounded-2xl border border-white/10 bg-[#12162B]/90 p-5 sm:grid-cols-4">
                <div className="flex flex-col items-center text-center">
                  <div className="mb-2.5 flex h-11 w-11 items-center justify-center rounded-full border border-[#5B3DF5]/40 bg-[#5B3DF5]/20 text-[#A78BFA]">
                    <Zap className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-semibold text-slate-200 leading-snug">
                    Auto replies &amp; order creation
                  </p>
                </div>

                <div className="flex flex-col items-center text-center">
                  <div className="mb-2.5 flex h-11 w-11 items-center justify-center rounded-full border border-[#5B3DF5]/40 bg-[#5B3DF5]/20 text-[#A78BFA]">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-semibold text-slate-200 leading-snug">
                    Event based post automation
                  </p>
                </div>

                <div className="flex flex-col items-center text-center">
                  <div className="mb-2.5 flex h-11 w-11 items-center justify-center rounded-full border border-[#5B3DF5]/40 bg-[#5B3DF5]/20 text-[#A78BFA]">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-semibold text-slate-200 leading-snug">
                    Comment replies &amp; customer support
                  </p>
                </div>

                <div className="flex flex-col items-center text-center">
                  <div className="mb-2.5 flex h-11 w-11 items-center justify-center rounded-full border border-[#5B3DF5]/40 bg-[#5B3DF5]/20 text-[#A78BFA]">
                    <Bell className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-semibold text-slate-200 leading-snug">
                    Smart notifications when you&apos;re needed
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 6-Step Connected Cards Grid (Matches Screenshot 2) */}
          <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {/* STEP 1 */}
            <div
              onClick={() => setActiveFlowStep(1)}
              className="flex cursor-pointer flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      activeFlowStep === 1 ? 'bg-[#5B3DF5] text-white ring-4 ring-[#5B3DF5]/30' : 'bg-[#5B3DF5] text-white'
                    }`}
                  >
                    1
                  </span>
                  <h3 className="text-xs font-bold text-white leading-tight">
                    Customer sends a message
                  </h3>
                </div>
                <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                  A customer asks about a product on your Facebook page.
                </p>
              </div>

              <div
                className={`flex h-[320px] flex-col justify-between rounded-2xl border p-3 transition-all duration-300 ${
                  activeFlowStep === 1
                    ? 'border-[#5B3DF5] bg-[#151931] shadow-lg shadow-[#5B3DF5]/20'
                    : 'border-white/10 bg-[#12162A]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between border-b border-white/8 pb-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#006AFF] text-[10px]">
                        ⚡
                      </span>
                      Messenger
                    </span>
                    <MoreHorizontal className="h-3.5 w-3.5 text-slate-400" />
                  </div>

                  <div className="mt-6 flex items-start gap-2">
                    <img
                      src={INBOX_CONTACTS[0]!.avatar}
                      alt="Sarah"
                      className="h-7 w-7 rounded-full object-cover"
                    />
                    <div className="rounded-2xl rounded-tl-xs bg-[#222846] p-2.5 text-[11px] text-slate-100">
                      <p>Hi! Is the black hoodie available in M?</p>
                      <span className="mt-1 block text-[9px] text-slate-400">10:24 AM</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-white/8 bg-[#0E1122] px-2.5 py-1.5 text-[10px] text-slate-500">
                  <span>Type a message...</span>
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#5B3DF5] text-white">
                    <Send className="h-2.5 w-2.5" />
                  </span>
                </div>
              </div>
            </div>

            {/* STEP 2 */}
            <div
              onClick={() => setActiveFlowStep(2)}
              className="flex cursor-pointer flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      activeFlowStep === 2 ? 'bg-[#5B3DF5] text-white ring-4 ring-[#5B3DF5]/30' : 'bg-[#5B3DF5] text-white'
                    }`}
                  >
                    2
                  </span>
                  <h3 className="text-xs font-bold text-white leading-tight">
                    {COMPANY_NAME} finds the right product
                  </h3>
                </div>
                <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                  AI understands the request and searches your product catalog.
                </p>
              </div>

              <div
                className={`flex h-[320px] flex-col justify-between rounded-2xl border p-3 transition-all duration-300 ${
                  activeFlowStep === 2
                    ? 'border-[#5B3DF5] bg-[#151931] shadow-lg shadow-[#5B3DF5]/20'
                    : 'border-white/10 bg-[#12162A]'
                }`}
              >
                <div className="space-y-2.5">
                  <p className="text-[11px] font-bold text-white">Product Catalog</p>
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0E1122] px-2.5 py-1.5 text-[10px] text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <Search className="h-3 w-3 text-slate-400" />
                      black hoodie
                    </span>
                    <Search className="h-3 w-3 text-slate-500" />
                  </div>

                  <div className="rounded-xl border border-[#5B3DF5]/40 bg-[#1A203D] p-2.5">
                    <div className="flex gap-2.5">
                      <img
                        src="/images/essential-hoodie.jpg"
                        alt="Essential Hoodie"
                        className="h-16 w-14 rounded-lg bg-white object-cover"
                      />
                      <div className="space-y-1">
                        <p className="text-[11px] font-bold text-white">Essential Hoodie</p>
                        <p className="text-[11px] font-extrabold text-white">$29.00</p>
                        <span className="inline-block rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400">
                          In stock
                        </span>
                        <div className="rounded border border-white/10 bg-[#12162A] px-2 py-0.5 text-[9px] text-slate-300">
                          Size: M ▾
                        </div>
                      </div>
                    </div>
                    <div className="mt-2.5 flex gap-1.5">
                      <img src="/images/essential-hoodie.jpg" alt="thumb" className="h-7 w-7 rounded border border-[#5B3DF5] bg-white object-cover" />
                      <img src="/images/minimal-tshirt.jpg" alt="thumb" className="h-7 w-7 rounded bg-white object-cover opacity-70" />
                      <img src="/images/premium-cap.jpg" alt="thumb" className="h-7 w-7 rounded bg-white object-cover opacity-70" />
                    </div>
                  </div>
                </div>

                <div className="w-full rounded-xl bg-[#5B3DF5] py-2 text-center text-[10px] font-bold text-white">
                  Select this product
                </div>
              </div>
            </div>

            {/* STEP 3 */}
            <div
              onClick={() => setActiveFlowStep(3)}
              className="flex cursor-pointer flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      activeFlowStep === 3 ? 'bg-[#5B3DF5] text-white ring-4 ring-[#5B3DF5]/30' : 'bg-[#5B3DF5] text-white'
                    }`}
                  >
                    3
                  </span>
                  <h3 className="text-xs font-bold text-white leading-tight">
                    AI prepares and sends a reply
                  </h3>
                </div>
                <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                  {COMPANY_NAME} drafts a helpful reply with product details.
                </p>
              </div>

              <div
                className={`flex h-[320px] flex-col justify-between rounded-2xl border p-3 transition-all duration-300 ${
                  activeFlowStep === 3
                    ? 'border-[#5B3DF5] bg-[#151931] shadow-lg shadow-[#5B3DF5]/20'
                    : 'border-white/10 bg-[#12162A]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between border-b border-white/8 pb-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#006AFF] text-[10px]">
                        ⚡
                      </span>
                      Messenger
                    </span>
                    <MoreHorizontal className="h-3.5 w-3.5 text-slate-400" />
                  </div>

                  <div className="mt-3 rounded-2xl bg-[#DCE3FF] p-2.5 text-[10px] text-slate-900 space-y-1.5">
                    <p className="font-medium">
                      Yes! The black hoodie is available in size M.
                    </p>
                    <p className="font-bold">Price: $29.00</p>
                    <p>You can place an order here 👇</p>

                    <div className="rounded-xl bg-white p-2 shadow-xs">
                      <div className="flex items-center gap-2">
                        <img
                          src="/images/essential-hoodie.jpg"
                          alt="Hoodie"
                          className="h-10 w-10 rounded object-cover"
                        />
                        <div>
                          <p className="font-bold text-slate-900">Essential Hoodie</p>
                          <p className="font-bold text-slate-700">$29.00</p>
                        </div>
                      </div>
                      <div className="mt-1.5 rounded-md border border-slate-200 py-1 text-center text-[9px] font-semibold text-slate-700">
                        View Product
                      </div>
                    </div>
                  </div>
                  <span className="mt-1 block text-right text-[9px] text-slate-400">10:24 AM ✓✓</span>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-white/8 bg-[#0E1122] px-2.5 py-1.5 text-[10px] text-slate-500">
                  <span>Type a message...</span>
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#5B3DF5] text-white">
                    <Send className="h-2.5 w-2.5" />
                  </span>
                </div>
              </div>
            </div>

            {/* STEP 4 */}
            <div
              onClick={() => setActiveFlowStep(4)}
              className="flex cursor-pointer flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      activeFlowStep === 4 ? 'bg-[#5B3DF5] text-white ring-4 ring-[#5B3DF5]/30' : 'bg-[#5B3DF5] text-white'
                    }`}
                  >
                    4
                  </span>
                  <h3 className="text-xs font-bold text-white leading-tight">
                    Customer confirms and order is created
                  </h3>
                </div>
                <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                  When the customer confirms, {COMPANY_NAME} creates an order.
                </p>
              </div>

              <div
                className={`flex h-[320px] flex-col justify-between rounded-2xl border p-3 transition-all duration-300 ${
                  activeFlowStep === 4
                    ? 'border-[#5B3DF5] bg-[#151931] shadow-lg shadow-[#5B3DF5]/20'
                    : 'border-white/10 bg-[#12162A]'
                }`}
              >
                <div className="space-y-2.5 text-[10px]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Order #1042</span>
                    <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[9px] font-bold text-amber-400">
                      Pending
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-[#1A203D] p-2">
                    <div className="flex items-center gap-2">
                      <img
                        src={INBOX_CONTACTS[0]!.avatar}
                        alt="Sarah"
                        className="h-7 w-7 rounded-full object-cover"
                      />
                      <div>
                        <p className="font-bold text-white">Sarah Ahmed</p>
                        <p className="text-[9px] text-slate-400">sarah@example.com</p>
                      </div>
                    </div>
                    <span className="rounded border border-white/10 px-1.5 py-0.5 text-[8px] text-slate-300">
                      View profile
                    </span>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[9px] font-semibold text-slate-400">Items</p>
                    <div className="flex items-center justify-between rounded-xl bg-[#1A203D] p-2">
                      <div className="flex items-center gap-2">
                        <img
                          src="/images/essential-hoodie.jpg"
                          alt="Hoodie"
                          className="h-8 w-8 rounded bg-white object-cover"
                        />
                        <div>
                          <p className="font-bold text-white">Essential Hoodie</p>
                          <p className="text-[9px] text-slate-400">Black · Size M · x1</p>
                        </div>
                      </div>
                      <span className="font-bold text-white">$29.00</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[9px] font-semibold text-slate-400">Customer Details</p>
                    <p className="text-slate-300">📞 +880 1XXX-XXXX</p>
                    <p className="text-slate-300">📍 Dhaka, Bangladesh</p>
                  </div>
                </div>

                <div className="w-full rounded-xl bg-[#5B3DF5] py-2 text-center text-[10px] font-bold text-white">
                  Create Order Manually ▾
                </div>
              </div>
            </div>

            {/* STEP 5 */}
            <div
              onClick={() => setActiveFlowStep(5)}
              className="flex cursor-pointer flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      activeFlowStep === 5 ? 'bg-[#5B3DF5] text-white ring-4 ring-[#5B3DF5]/30' : 'bg-[#5B3DF5] text-white'
                    }`}
                  >
                    5
                  </span>
                  <h3 className="text-xs font-bold text-white leading-tight">
                    Payment is verified
                  </h3>
                </div>
                <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                  The system checks your connected payment methods (bKash, Nagad, card, etc.).
                </p>
              </div>

              <div
                className={`flex h-[320px] flex-col justify-between rounded-2xl border p-3 transition-all duration-300 ${
                  activeFlowStep === 5
                    ? 'border-[#5B3DF5] bg-[#151931] shadow-lg shadow-[#5B3DF5]/20'
                    : 'border-white/10 bg-[#12162A]'
                }`}
              >
                <div className="space-y-2.5 text-[10px]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Payment</span>
                    <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[9px] font-bold text-amber-400">
                      Awaiting confirmation
                    </span>
                  </div>

                  <div className="rounded-xl border border-white/8 bg-[#1A203D] p-2.5 space-y-2">
                    <p className="text-[9px] text-slate-400">Payment Method</p>
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#E2136E] text-[10px] font-black text-white">
                        bK
                      </span>
                      <span className="font-bold text-white">bKash</span>
                    </div>
                    <div className="flex justify-between border-t border-white/8 pt-1.5">
                      <span className="text-slate-400">Transaction ID</span>
                      <span className="font-mono font-semibold text-slate-200">BK9F3D2K7L</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Amount</span>
                      <span className="font-bold text-white">$29.00</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#5B3DF5]/30 bg-[#5B3DF5]/10 p-2 text-[9px] text-indigo-200">
                    Waiting for payment confirmation from bKash. This usually takes a few minutes.
                  </div>
                </div>

                {/* 3-Step Payment Progress Bar */}
                <div className="pt-2">
                  <div className="relative flex items-center justify-between">
                    <div className="absolute left-0 right-0 top-1.5 h-0.5 bg-white/15" />
                    <div className="absolute left-0 w-1/2 top-1.5 h-0.5 bg-[#5B3DF5]" />
                    <div className="relative z-10 flex flex-col items-center">
                      <span className="h-3.5 w-3.5 rounded-full bg-[#5B3DF5] ring-2 ring-[#12162A]" />
                      <span className="mt-1 text-[8px] text-slate-300">Order Created</span>
                    </div>
                    <div className="relative z-10 flex flex-col items-center">
                      <span className="h-3.5 w-3.5 rounded-full bg-[#818CF8] ring-4 ring-[#5B3DF5]/40" />
                      <span className="mt-1 text-[8px] font-semibold text-white">Awaiting Payment</span>
                    </div>
                    <div className="relative z-10 flex flex-col items-center">
                      <span className="h-3.5 w-3.5 rounded-full bg-slate-700 ring-2 ring-[#12162A]" />
                      <span className="mt-1 text-[8px] text-slate-400">Confirmed</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* STEP 6 */}
            <div
              onClick={() => setActiveFlowStep(6)}
              className="flex cursor-pointer flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      activeFlowStep === 6 ? 'bg-[#5B3DF5] text-white ring-4 ring-[#5B3DF5]/30' : 'bg-[#5B3DF5] text-white'
                    }`}
                  >
                    6
                  </span>
                  <h3 className="text-xs font-bold text-white leading-tight">
                    You stay updated
                  </h3>
                </div>
                <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                  Get notified about important events, new orders, payment status or when AI needs help.
                </p>
              </div>

              <div
                className={`flex h-[320px] flex-col justify-between rounded-2xl border p-3 transition-all duration-300 ${
                  activeFlowStep === 6
                    ? 'border-[#5B3DF5] bg-[#151931] shadow-lg shadow-[#5B3DF5]/20'
                    : 'border-white/10 bg-[#12162A]'
                }`}
              >
                <div className="space-y-2 text-[10px]">
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-xs font-bold text-white">Notifications</span>
                    <span className="text-[9px] text-[#A78BFA]">Mark all read</span>
                  </div>

                  <div className="flex items-start gap-2 rounded-xl bg-[#1A203D] p-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                      <ShoppingCart className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-white">New order created</p>
                      <p className="truncate text-[9px] text-slate-400">#1042 · Sarah Ahmed · 2m ago</p>
                    </div>
                    <span className="h-1.5 w-1.5 rounded-full bg-[#5B3DF5]" />
                  </div>

                  <div className="flex items-start gap-2 rounded-xl bg-[#1A203D] p-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-white">Payment received</p>
                      <p className="truncate text-[9px] text-slate-400">#1038 · $29.00 · 12m ago</p>
                    </div>
                    <span className="h-1.5 w-1.5 rounded-full bg-[#5B3DF5]" />
                  </div>

                  <div className="flex items-start gap-2 rounded-xl bg-[#1A203D] p-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-rose-500/20 text-rose-400">
                      <AlertCircle className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-white">AI needs your help</p>
                      <p className="truncate text-[9px] text-slate-400">Customer has a complex question</p>
                    </div>
                    <span className="h-1.5 w-1.5 rounded-full bg-[#5B3DF5]" />
                  </div>

                  <div className="flex items-start gap-2 rounded-xl bg-[#1A203D] p-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-purple-500/20 text-purple-400">
                      <Truck className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-white">Order shipped</p>
                      <p className="truncate text-[9px] text-slate-400">#1035 · Tracking ID: BD123456</p>
                    </div>
                    <span className="h-1.5 w-1.5 rounded-full bg-[#5B3DF5]" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-10 text-center text-xs font-medium text-slate-400">
            A complete automation flow — from first message to final delivery.
          </p>
        </div>
      </section>

      {/* =====================================================================
          4. PRICING & COMPARE PLANS SECTION (Matches Screenshot 5)
         ===================================================================== */}
      <section id="pricing" className="py-20 lg:py-24">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center space-y-3">
            <span className="inline-block rounded-full bg-[#5B3DF5]/10 px-3.5 py-1 text-xs font-semibold text-[#5B3DF5]">
              Simple &amp; Transparent Pricing
            </span>
            <h2 className="font-geist text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
              Choose the Right Plan for Your Business
            </h2>
            <p className="text-sm text-slate-600 sm:text-base">
              All plans include core automation features. Upgrade anytime as your business grows.
            </p>

            {/* Monthly / Yearly Toggle */}
            <div className="pt-3 flex items-center justify-center gap-3">
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setBillingPeriod('monthly')}
                  className={`rounded-full px-5 py-1.5 text-xs font-bold transition ${
                    billingPeriod === 'monthly'
                      ? 'bg-[#5B3DF5] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingPeriod('yearly')}
                  className={`rounded-full px-5 py-1.5 text-xs font-bold transition ${
                    billingPeriod === 'yearly'
                      ? 'bg-[#5B3DF5] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Yearly
                </button>
              </div>
              <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                Save up to 20%
              </span>
            </div>
          </div>

          {/* 4 Plan Cards Grid */}
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {/* Free */}
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
              <div>
                <span className="inline-block rounded-md bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                  Free
                </span>
                <h3 className="mt-3 font-geist text-xl font-bold text-slate-950">Get Started</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Perfect for trying out {COMPANY_NAME} with basic features.
                </p>
                <div className="mt-5 flex items-baseline gap-1 border-b border-slate-100 pb-5">
                  <span className="font-geist text-4xl font-extrabold text-slate-950">$0</span>
                  <span className="text-xs text-slate-500">/ month</span>
                </div>
                <ul className="mt-5 space-y-2.5 text-xs text-slate-700">
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> 50 AI replies per month</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> 1 Facebook page</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Inbox &amp; comment management</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Basic order management</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> AI auto-reply</li>
                  <li className="flex items-center gap-2 text-slate-300"><Check className="h-4 w-4" /> AI post generation</li>
                  <li className="flex items-center gap-2 text-slate-300"><Check className="h-4 w-4" /> Advanced analytics</li>
                  <li className="flex items-center gap-2 text-slate-300"><Check className="h-4 w-4" /> Priority support</li>
                </ul>
              </div>
              <Link
                href="/login"
                className="mt-7 flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 transition hover:bg-slate-50"
              >
                Get started free
              </Link>
            </div>

            {/* Starter */}
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
              <div>
                <span className="inline-block rounded-md bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-[#5B3DF5]">
                  Starter
                </span>
                <h3 className="mt-3 font-geist text-xl font-bold text-slate-950">For Small Businesses</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Essential features for growing online stores.
                </p>
                <div className="mt-5 flex items-baseline gap-1 border-b border-slate-100 pb-5">
                  <span className="font-geist text-4xl font-extrabold text-slate-950">
                    ${billingPeriod === 'yearly' ? 23 : 29}
                  </span>
                  <span className="text-xs text-slate-500">/ month</span>
                </div>
                <ul className="mt-5 space-y-2.5 text-xs text-slate-700">
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> 500 AI replies per month</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> 3 social channels</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Order management</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> AI auto-reply &amp; smart suggestions</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> AI post generation (basic)</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Customer tags &amp; notes</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Basic analytics</li>
                  <li className="flex items-center gap-2 text-slate-300"><Check className="h-4 w-4" /> Priority support</li>
                </ul>
              </div>
              <Link
                href="/login"
                className="mt-7 flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 transition hover:bg-slate-50"
              >
                Get started
              </Link>
            </div>

            {/* Pro (Most Popular) */}
            <div className="relative flex flex-col justify-between rounded-2xl border-2 border-[#5B3DF5] bg-white p-6 shadow-xl shadow-[#5B3DF5]/10">
              <span className="absolute right-4 top-4 rounded-full bg-[#5B3DF5] px-3 py-1 text-[10px] font-bold text-white">
                Most Popular
              </span>
              <div>
                <span className="inline-block rounded-md bg-[#5B3DF5]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#5B3DF5]">
                  Pro
                </span>
                <h3 className="mt-3 font-geist text-xl font-bold text-slate-950">For Growing Businesses</h3>
                <p className="mt-1 text-xs text-slate-500">
                  More automation, more channels and advanced features.
                </p>
                <div className="mt-5 flex items-baseline gap-1 border-b border-slate-100 pb-5">
                  <span className="font-geist text-4xl font-extrabold text-slate-950">
                    ${billingPeriod === 'yearly' ? 63 : 79}
                  </span>
                  <span className="text-xs text-slate-500">/ month</span>
                </div>
                <ul className="mt-5 space-y-2.5 text-xs text-slate-700">
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> 2,000 AI replies per month</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> All social channels</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Advanced order management</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> AI post generation (advanced)</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Payment verification (bKash, Nagad, etc)</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Courier integration</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Advanced analytics</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Priority support</li>
                </ul>
              </div>
              <Link
                href="/login"
                className="mt-7 flex h-10 w-full items-center justify-center rounded-xl bg-[#5B3DF5] text-xs font-bold text-white shadow-md shadow-[#5B3DF5]/25 transition hover:bg-[#4C2EE0]"
              >
                Get started
              </Link>
            </div>

            {/* Enterprise */}
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
              <div>
                <span className="inline-block rounded-md bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                  Enterprise
                </span>
                <h3 className="mt-3 font-geist text-xl font-bold text-slate-950">For Large Businesses</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Custom solutions for high volume stores and agencies.
                </p>
                <div className="mt-5 flex items-baseline gap-1 border-b border-slate-100 pb-5">
                  <span className="font-geist text-2xl font-extrabold text-slate-950">Custom pricing</span>
                </div>
                <ul className="mt-5 space-y-2.5 text-xs text-slate-700">
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Unlimited replies</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> All channels</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Advanced automation</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Custom integrations</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Dedicated account manager</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Advanced analytics &amp; reporting</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> SLA &amp; onboarding support</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Custom features</li>
                </ul>
              </div>
              <Link
                href="/login"
                className="mt-7 flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 transition hover:bg-slate-50"
              >
                Contact sales
              </Link>
            </div>
          </div>

          {/* Compare Plans Table (Matches Screenshot 5) */}
          <div className="mt-12 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs lg:p-8">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-3">
                <h3 className="font-geist text-xl font-bold text-slate-950">Compare Plans</h3>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  See what&apos;s included in each plan and choose what fits your business.
                </p>
              </div>
              <div className="lg:col-span-9 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-900 font-bold">
                      <th className="py-2.5 pr-4">Feature</th>
                      <th className="py-2.5 px-4 text-center">Free</th>
                      <th className="py-2.5 px-4 text-center">Starter</th>
                      <th className="py-2.5 px-4 text-center text-[#5B3DF5]">Pro</th>
                      <th className="py-2.5 pl-4 text-center">Enterprise</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600">
                    <tr>
                      <td className="py-2.5 pr-4 font-medium text-slate-800">AI replies per month</td>
                      <td className="py-2.5 px-4 text-center">50</td>
                      <td className="py-2.5 px-4 text-center">500</td>
                      <td className="py-2.5 px-4 text-center font-semibold text-slate-900">2,000</td>
                      <td className="py-2.5 pl-4 text-center font-semibold text-slate-900">Unlimited</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 font-medium text-slate-800">Social channels</td>
                      <td className="py-2.5 px-4 text-center">1 page</td>
                      <td className="py-2.5 px-4 text-center">3 channels</td>
                      <td className="py-2.5 px-4 text-center">All channels</td>
                      <td className="py-2.5 pl-4 text-center">All channels</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 font-medium text-slate-800">AI post generation</td>
                      <td className="py-2.5 px-4 text-center">—</td>
                      <td className="py-2.5 px-4 text-center">Basic</td>
                      <td className="py-2.5 px-4 text-center">Advanced</td>
                      <td className="py-2.5 pl-4 text-center">Advanced + custom</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 font-medium text-slate-800">Order management</td>
                      <td className="py-2.5 px-4 text-center">✓</td>
                      <td className="py-2.5 px-4 text-center">✓</td>
                      <td className="py-2.5 px-4 text-center">✓</td>
                      <td className="py-2.5 pl-4 text-center">✓</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 font-medium text-slate-800">Payment verification</td>
                      <td className="py-2.5 px-4 text-center">—</td>
                      <td className="py-2.5 px-4 text-center">—</td>
                      <td className="py-2.5 px-4 text-center">✓</td>
                      <td className="py-2.5 pl-4 text-center">✓</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 font-medium text-slate-800">Courier integration</td>
                      <td className="py-2.5 px-4 text-center">—</td>
                      <td className="py-2.5 px-4 text-center">—</td>
                      <td className="py-2.5 px-4 text-center">✓</td>
                      <td className="py-2.5 pl-4 text-center">✓</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 font-medium text-slate-800">Analytics &amp; reporting</td>
                      <td className="py-2.5 px-4 text-center">Basic</td>
                      <td className="py-2.5 px-4 text-center">Basic</td>
                      <td className="py-2.5 px-4 text-center">Advanced</td>
                      <td className="py-2.5 pl-4 text-center">Advanced + custom</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 font-medium text-slate-800">Priority support</td>
                      <td className="py-2.5 px-4 text-center">—</td>
                      <td className="py-2.5 px-4 text-center">—</td>
                      <td className="py-2.5 px-4 text-center">✓</td>
                      <td className="py-2.5 pl-4 text-center">✓</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Your Business Data Stays in Your Control (Bottom of Screenshot 5) */}
          <div className="mt-12 grid grid-cols-1 gap-6 border-t border-slate-200/80 pt-10 lg:grid-cols-12">
            <div className="lg:col-span-3">
              <h3 className="font-geist text-lg font-extrabold text-slate-950">
                Your Business Data Stays in Your Control
              </h3>
              <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                We follow industry best practices to keep your data secure and private. You always
                control your connected accounts and can disconnect anytime.
              </p>
            </div>
            <div className="lg:col-span-9 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600">
                  <Lock className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-bold text-slate-900">Secure Access</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    We only request the necessary permissions to manage your business accounts.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-bold text-slate-900">Your Data, Your Control</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    You can disconnect your accounts and delete your workspace whenever you want.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                  <Server className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-bold text-slate-900">Reliable Infrastructure</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Built on trusted cloud providers with industry standard security practices.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                  <Headphones className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-bold text-slate-900">Real Human Support</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Get help from our team whenever you need it. We&apos;re here to support your business.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
