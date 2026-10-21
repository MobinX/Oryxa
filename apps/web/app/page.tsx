'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { COMPANY_NAME } from '@/lib/brand';
import { OnlyOrdesLogo } from '@/components/sidebar';
import { HeroInteractiveAd } from '@/components/hero-interactive-ad';
import { ActiveWorkflowPipeline } from '@/components/active-workflow-pipeline';
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
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

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

            {/* Right Interactive Live AI Ad Window Column (7 cols on lg) */}
            <div className="lg:col-span-7">
              <HeroInteractiveAd />
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
          3. DARK 6-STEP LIVE AUTOMATION FLOW SECTION (Active Interactive Pipeline)
         ===================================================================== */}
      <section id="workflow" className="bg-[#0B0D1D] py-20 text-white lg:py-24">
        <div className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8 space-y-10">
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

          {/* Active Living Workflow Pipeline */}
          <ActiveWorkflowPipeline />
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
