'use client';

import { useState } from 'react';
import Link from 'next/link';
import { COMPANY_NAME } from '@/lib/brand';
import { OnlyOrdesLogo } from '@/components/sidebar';
import { HeroInteractiveAd } from '@/components/hero-interactive-ad';
import { RaycastSections } from '@/components/raycast-sections';
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
  Lock,
  Server,
  Headphones,
  ShieldCheck,
  Globe,
  Share2,
} from 'lucide-react';

export default function HomePage() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  return (
    <div className="min-h-screen bg-[#08090A] text-slate-100 font-inter selection:bg-[#5B3DF5] selection:text-white overflow-x-hidden">
      {/* Subtle top ambient radial lighting */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(91,61,245,0.18),rgba(255,255,255,0))]" />

      {/* =====================================================================
          1. TOP NAVIGATION BAR (Unified Sleek Dark Header)
         ===================================================================== */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#08090A]/80 backdrop-blur-xl transition-all">
        <div className="mx-auto flex h-18 max-w-[1380px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-10">
            <Link href="/" className="focus:outline-none">
              <OnlyOrdesLogo lightText />
            </Link>

            <nav className="hidden items-center gap-7 text-sm font-medium text-slate-300 md:flex">
              <a href="#live-demo" className="inline-flex items-center gap-1 transition hover:text-white">
                <span>Product</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
              </a>
              <a href="#workflow" className="inline-flex items-center gap-1 transition hover:text-white">
                <span>Solutions</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
              </a>
              <a href="#pricing" className="transition hover:text-white">
                Pricing
              </a>
              <Link href="/docs" className="inline-flex items-center gap-1 transition hover:text-white">
                <span>Resources</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-full border border-white/15 bg-white/5 px-5 py-2 text-xs font-semibold text-slate-200 shadow-sm transition hover:border-white/30 hover:bg-white/10 sm:text-sm"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#5B3DF5] to-[#7C3AED] px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-[#5B3DF5]/30 transition hover:brightness-110 active:scale-98 sm:text-sm"
            >
              <span>Get started</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* =====================================================================
          2. HERO SECTION + REALISTIC SMARTPHONE MOTION SHOWCASE
         ===================================================================== */}
      <section id="live-demo" className="relative overflow-hidden pt-8 pb-16 lg:pt-14 lg:pb-24">
        {/* Glow orb behind hero right */}
        <div className="pointer-events-none absolute -top-24 right-0 -z-10 h-[580px] w-[650px] rounded-full bg-gradient-to-br from-[#5B3DF5]/20 via-[#7C3AED]/15 to-indigo-600/10 blur-3xl" />

        <div className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-8">
            {/* Left Column Copy (5 cols on lg) */}
            <div className="lg:col-span-5 space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#5B3DF5]/30 bg-[#5B3DF5]/15 px-3.5 py-1.5 text-xs font-semibold text-[#A78BFA]">
                <Sparkles className="h-3.5 w-3.5" />
                <span>AI-Powered Commerce Management</span>
              </div>

              <h1 className="font-geist text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl xl:text-[54px]">
                Grow your online business with AI that{' '}
                <span className="bg-gradient-to-r from-[#818CF8] via-[#A78BFA] to-[#C084FC] bg-clip-text text-transparent">
                  works for you
                </span>
              </h1>

              <p className="max-w-xl text-base leading-relaxed text-slate-300 sm:text-[17px]">
                {COMPANY_NAME} helps online sellers manage customer conversations, orders, products and
                social media — with intelligent automation that saves time and helps you sell more.
              </p>

              <div className="flex flex-wrap items-center gap-3.5 pt-1">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5B3DF5] to-[#7C3AED] px-7 py-3.5 text-sm font-semibold text-white shadow-xl shadow-[#5B3DF5]/35 transition hover:brightness-110 active:scale-98"
                >
                  <span>Start for free</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#workflow"
                  className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-semibold text-slate-200 shadow-sm transition hover:bg-white/10"
                >
                  Explore demo
                </a>
              </div>

              {/* 4 Mini Feature Pills Row */}
              <div className="grid grid-cols-2 gap-3.5 pt-6 sm:grid-cols-4 border-t border-white/10">
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                  <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-[#5B3DF5]/20 text-[#A78BFA]">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-bold text-white">Unified Inbox</p>
                  <p className="text-[11px] text-slate-400">All channels in one</p>
                </div>

                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                  <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-[#5B3DF5]/20 text-[#A78BFA]">
                    <Zap className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-bold text-white">AI Auto-Reply</p>
                  <p className="text-[11px] text-slate-400">Save time, sell 24/7</p>
                </div>

                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                  <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-[#5B3DF5]/20 text-[#A78BFA]">
                    <ShoppingBag className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-bold text-white">Order Creation</p>
                  <p className="text-[11px] text-slate-400">Chat to delivery</p>
                </div>

                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                  <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-[#5B3DF5]/20 text-[#A78BFA]">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-bold text-white">Auto Post</p>
                  <p className="text-[11px] text-slate-400">Engage customers</p>
                </div>
              </div>
            </div>

            {/* Right Column: Dynamic Smartphone Showcase (7 cols on lg) */}
            <div className="lg:col-span-7 flex justify-center">
              <HeroInteractiveAd />
            </div>
          </div>

          {/* Bottom Floating Value Strip */}
          <div className="mt-12 rounded-2xl border border-white/10 bg-[#0E1122]/90 p-5 shadow-2xl backdrop-blur-xl">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-white/10">
              <div className="flex items-center gap-3.5 px-2">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#5B3DF5]/20 text-[#A78BFA]">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Faster replies</p>
                  <p className="text-xs text-slate-400">Respond to customers under 1 second</p>
                </div>
              </div>

              <div className="flex items-center gap-3.5 px-2 lg:pl-6">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#5B3DF5]/20 text-[#A78BFA]">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Less tab switching</p>
                  <p className="text-xs text-slate-400">All customer channels in one place</p>
                </div>
              </div>

              <div className="flex items-center gap-3.5 px-2 lg:pl-6">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#5B3DF5]/20 text-[#A78BFA]">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Orders in one place</p>
                  <p className="text-xs text-slate-400">From chat inquiry to courier tracking</p>
                </div>
              </div>

              <div className="flex items-center gap-3.5 px-2 lg:pl-6">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#5B3DF5]/20 text-[#A78BFA]">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Engage automatically</p>
                  <p className="text-xs text-slate-400">AI-generated posts and comments</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          3. RAYCAST-INSPIRED COMMAND CENTER & WORKFLOW SHOWCASE
         ===================================================================== */}
      <RaycastSections />

      {/* =====================================================================
          4. PRICING & COMPARE PLANS SECTION (Dark Themed Harmony)
         ===================================================================== */}
      <section id="pricing" className="py-20 lg:py-24">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center space-y-3">
            <span className="inline-block rounded-full border border-[#5B3DF5]/30 bg-[#5B3DF5]/15 px-3.5 py-1 text-xs font-semibold text-[#A78BFA]">
              Simple &amp; Transparent Pricing
            </span>
            <h2 className="font-geist text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Choose the Right Plan for Your Business
            </h2>
            <p className="text-sm text-slate-400 sm:text-base">
              All plans include core automation features. Upgrade anytime as your business grows.
            </p>

            {/* Monthly / Yearly Toggle */}
            <div className="pt-3 flex items-center justify-center gap-3">
              <div className="inline-flex items-center rounded-full border border-white/10 bg-[#12162B] p-1 shadow-inner">
                <button
                  type="button"
                  onClick={() => setBillingPeriod('monthly')}
                  className={`rounded-full px-5 py-1.5 text-xs font-bold transition ${
                    billingPeriod === 'monthly'
                      ? 'bg-[#5B3DF5] text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingPeriod('yearly')}
                  className={`rounded-full px-5 py-1.5 text-xs font-bold transition ${
                    billingPeriod === 'yearly'
                      ? 'bg-[#5B3DF5] text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Yearly
                </button>
              </div>
              <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-bold text-emerald-400">
                Save up to 20%
              </span>
            </div>
          </div>

          {/* 4 Plan Cards Grid */}
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {/* Free */}
            <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0E1122]/90 p-6 shadow-xl backdrop-blur-md">
              <div>
                <span className="inline-block rounded-md bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-slate-300">
                  Free
                </span>
                <h3 className="mt-3 font-geist text-xl font-bold text-white">Get Started</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Perfect for trying out {COMPANY_NAME} with basic features.
                </p>
                <div className="mt-5 flex items-baseline gap-1 border-b border-white/10 pb-5">
                  <span className="font-geist text-4xl font-extrabold text-white">$0</span>
                  <span className="text-xs text-slate-400">/ month</span>
                </div>
                <ul className="mt-5 space-y-2.5 text-xs text-slate-300">
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#818CF8]" /> 50 AI replies per month</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#818CF8]" /> 1 Facebook page</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#818CF8]" /> Inbox &amp; comment management</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#818CF8]" /> Basic order management</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#818CF8]" /> AI auto-reply</li>
                  <li className="flex items-center gap-2 text-slate-600"><Check className="h-4 w-4" /> AI post generation</li>
                  <li className="flex items-center gap-2 text-slate-600"><Check className="h-4 w-4" /> Advanced analytics</li>
                  <li className="flex items-center gap-2 text-slate-600"><Check className="h-4 w-4" /> Priority support</li>
                </ul>
              </div>
              <Link
                href="/login"
                className="mt-7 flex h-10 w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 text-xs font-bold text-slate-200 transition hover:bg-white/10"
              >
                Get started free
              </Link>
            </div>

            {/* Starter */}
            <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0E1122]/90 p-6 shadow-xl backdrop-blur-md">
              <div>
                <span className="inline-block rounded-md bg-[#5B3DF5]/20 border border-[#5B3DF5]/30 px-2.5 py-0.5 text-[11px] font-semibold text-[#A78BFA]">
                  Starter
                </span>
                <h3 className="mt-3 font-geist text-xl font-bold text-white">For Small Businesses</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Essential features for growing online stores.
                </p>
                <div className="mt-5 flex items-baseline gap-1 border-b border-white/10 pb-5">
                  <span className="font-geist text-4xl font-extrabold text-white">
                    ${billingPeriod === 'yearly' ? 23 : 29}
                  </span>
                  <span className="text-xs text-slate-400">/ month</span>
                </div>
                <ul className="mt-5 space-y-2.5 text-xs text-slate-300">
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#818CF8]" /> 500 AI replies per month</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#818CF8]" /> 3 social channels</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#818CF8]" /> Order management</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#818CF8]" /> AI auto-reply &amp; smart suggestions</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#818CF8]" /> AI post generation (basic)</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#818CF8]" /> Customer tags &amp; notes</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#818CF8]" /> Basic analytics</li>
                  <li className="flex items-center gap-2 text-slate-600"><Check className="h-4 w-4" /> Priority support</li>
                </ul>
              </div>
              <Link
                href="/login"
                className="mt-7 flex h-10 w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 text-xs font-bold text-slate-200 transition hover:bg-white/10"
              >
                Get started
              </Link>
            </div>

            {/* Pro (Most Popular) */}
            <div className="relative flex flex-col justify-between rounded-2xl border-2 border-[#5B3DF5] bg-gradient-to-b from-[#181C38] to-[#0E1122] p-6 shadow-2xl shadow-[#5B3DF5]/20">
              <span className="absolute right-4 top-4 rounded-full bg-[#5B3DF5] px-3 py-1 text-[10px] font-bold text-white shadow-md">
                Most Popular
              </span>
              <div>
                <span className="inline-block rounded-md bg-[#5B3DF5]/30 border border-[#5B3DF5]/50 px-2.5 py-0.5 text-[11px] font-semibold text-[#A78BFA]">
                  Pro
                </span>
                <h3 className="mt-3 font-geist text-xl font-bold text-white">For Growing Businesses</h3>
                <p className="mt-1 text-xs text-slate-300">
                  More automation, more channels and advanced features.
                </p>
                <div className="mt-5 flex items-baseline gap-1 border-b border-white/10 pb-5">
                  <span className="font-geist text-4xl font-extrabold text-white">
                    ${billingPeriod === 'yearly' ? 63 : 79}
                  </span>
                  <span className="text-xs text-slate-400">/ month</span>
                </div>
                <ul className="mt-5 space-y-2.5 text-xs text-slate-200">
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> 2,000 AI replies per month</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> All social channels</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Advanced order management</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> AI post generation (advanced)</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Payment verification (bKash, Nagad)</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Courier integration</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Advanced analytics</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Priority support</li>
                </ul>
              </div>
              <Link
                href="/login"
                className="mt-7 flex h-10 w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#5B3DF5] to-[#7C3AED] text-xs font-bold text-white shadow-lg shadow-[#5B3DF5]/30 transition hover:brightness-110"
              >
                Get started
              </Link>
            </div>

            {/* Enterprise */}
            <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0E1122]/90 p-6 shadow-xl backdrop-blur-md">
              <div>
                <span className="inline-block rounded-md bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-slate-300">
                  Enterprise
                </span>
                <h3 className="mt-3 font-geist text-xl font-bold text-white">For Large Businesses</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Custom solutions for high volume stores and agencies.
                </p>
                <div className="mt-5 flex items-baseline gap-1 border-b border-white/10 pb-5">
                  <span className="font-geist text-2xl font-extrabold text-white">Custom pricing</span>
                </div>
                <ul className="mt-5 space-y-2.5 text-xs text-slate-300">
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#818CF8]" /> Unlimited replies</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#818CF8]" /> All channels</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#818CF8]" /> Advanced automation</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#818CF8]" /> Custom integrations</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#818CF8]" /> Dedicated account manager</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#818CF8]" /> Advanced analytics &amp; reporting</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#818CF8]" /> SLA &amp; onboarding support</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#818CF8]" /> Custom features</li>
                </ul>
              </div>
              <Link
                href="/login"
                className="mt-7 flex h-10 w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 text-xs font-bold text-slate-200 transition hover:bg-white/10"
              >
                Contact sales
              </Link>
            </div>
          </div>

          {/* Compare Plans Table */}
          <div className="mt-12 rounded-2xl border border-white/10 bg-[#0E1122]/90 p-6 shadow-2xl backdrop-blur-md lg:p-8">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-3">
                <h3 className="font-geist text-xl font-bold text-white">Compare Plans</h3>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                  See what&apos;s included in each plan and choose what fits your business.
                </p>
              </div>
              <div className="lg:col-span-9 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-white font-bold">
                      <th className="py-2.5 pr-4">Feature</th>
                      <th className="py-2.5 px-4 text-center">Free</th>
                      <th className="py-2.5 px-4 text-center">Starter</th>
                      <th className="py-2.5 px-4 text-center text-[#A78BFA]">Pro</th>
                      <th className="py-2.5 pl-4 text-center">Enterprise</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/8 text-slate-300">
                    <tr>
                      <td className="py-2.5 pr-4 font-medium text-white">AI replies per month</td>
                      <td className="py-2.5 px-4 text-center text-slate-400">50</td>
                      <td className="py-2.5 px-4 text-center text-slate-300">500</td>
                      <td className="py-2.5 px-4 text-center font-bold text-white">2,000</td>
                      <td className="py-2.5 pl-4 text-center font-bold text-white">Unlimited</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 font-medium text-white">Social channels</td>
                      <td className="py-2.5 px-4 text-center text-slate-400">1 page</td>
                      <td className="py-2.5 px-4 text-center text-slate-300">3 channels</td>
                      <td className="py-2.5 px-4 text-center text-white">All channels</td>
                      <td className="py-2.5 pl-4 text-center text-white">All channels</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 font-medium text-white">AI post generation</td>
                      <td className="py-2.5 px-4 text-center text-slate-600">—</td>
                      <td className="py-2.5 px-4 text-center text-slate-300">Basic</td>
                      <td className="py-2.5 px-4 text-center font-semibold text-[#A78BFA]">Advanced</td>
                      <td className="py-2.5 pl-4 text-center text-white">Advanced + custom</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 font-medium text-white">Order management</td>
                      <td className="py-2.5 px-4 text-center text-emerald-400">✓</td>
                      <td className="py-2.5 px-4 text-center text-emerald-400">✓</td>
                      <td className="py-2.5 px-4 text-center text-emerald-400">✓</td>
                      <td className="py-2.5 pl-4 text-center text-emerald-400">✓</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 font-medium text-white">Payment verification</td>
                      <td className="py-2.5 px-4 text-center text-slate-600">—</td>
                      <td className="py-2.5 px-4 text-center text-slate-600">—</td>
                      <td className="py-2.5 px-4 text-center text-emerald-400">✓</td>
                      <td className="py-2.5 pl-4 text-center text-emerald-400">✓</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 font-medium text-white">Courier integration</td>
                      <td className="py-2.5 px-4 text-center text-slate-600">—</td>
                      <td className="py-2.5 px-4 text-center text-slate-600">—</td>
                      <td className="py-2.5 px-4 text-center text-emerald-400">✓</td>
                      <td className="py-2.5 pl-4 text-center text-emerald-400">✓</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 font-medium text-white">Analytics &amp; reporting</td>
                      <td className="py-2.5 px-4 text-center text-slate-400">Basic</td>
                      <td className="py-2.5 px-4 text-center text-slate-300">Basic</td>
                      <td className="py-2.5 px-4 text-center font-semibold text-[#A78BFA]">Advanced</td>
                      <td className="py-2.5 pl-4 text-center text-white">Advanced + custom</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 font-medium text-white">Priority support</td>
                      <td className="py-2.5 px-4 text-center text-slate-600">—</td>
                      <td className="py-2.5 px-4 text-center text-slate-600">—</td>
                      <td className="py-2.5 px-4 text-center text-emerald-400">✓</td>
                      <td className="py-2.5 pl-4 text-center text-emerald-400">✓</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Your Business Data Stays in Your Control */}
          <div className="mt-12 grid grid-cols-1 gap-6 border-t border-white/10 pt-10 lg:grid-cols-12">
            <div className="lg:col-span-3">
              <h3 className="font-geist text-lg font-extrabold text-white">
                Your Business Data Stays in Your Control
              </h3>
              <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                We follow industry best practices to keep your data secure and private. You always
                control your connected accounts and can disconnect anytime.
              </p>
            </div>
            <div className="lg:col-span-9 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400">
                  <Lock className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-bold text-white">Secure Access</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    We only request necessary permissions to manage your business accounts.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-bold text-white">Your Data, Your Control</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    You can disconnect your accounts and delete your workspace whenever you want.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                  <Server className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-bold text-white">Reliable Infrastructure</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Built on trusted cloud providers with industry standard security practices.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
                  <Headphones className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-bold text-white">Real Human Support</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Get help from our team whenever you need it. We&apos;re here to support your business.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          5. FOOTER (Sleek Dark Theme)
         ===================================================================== */}
      <footer className="border-t border-white/10 bg-[#060708] py-12 text-xs text-slate-400">
        <div className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-3">
              <OnlyOrdesLogo lightText />
              <span className="text-slate-600">·</span>
              <p className="text-slate-500">
                © {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.
              </p>
            </div>

            <div className="flex items-center gap-6">
              <Link href="/privacy" className="hover:text-white transition">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-white transition">
                Terms of Service
              </Link>
              <Link href="/docs" className="hover:text-white transition">
                Documentation
              </Link>
              <Link href="/data-delete-instructions" className="hover:text-white transition">
                Data Deletion
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
