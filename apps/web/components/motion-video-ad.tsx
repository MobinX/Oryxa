'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  Sparkles,
  ShoppingBag,
  CreditCard,
  Truck,
  CheckCircle2,
  ArrowRight,
  Clock,
  Moon,
  Sun,
  ShieldCheck,
  Check,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  MessageSquare,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBrand } from '@/components/brand-provider';

export interface AdScene {
  id: number;
  timecode: string;
  badge: string;
  title: string;
  subtitle: string;
  durationMs: number;
  featureTitle: string;
  featureDesc: string;
  benefitTag: string;
  icon: React.ElementType;
}

export const AD_SCENES: AdScene[] = [
  {
    id: 0,
    timecode: '00:06',
    badge: 'SCENE 01 · 02:45 AM MIDNIGHT',
    title: 'Customer Messages at 2:45 AM (While You Sleep 🌙)',
    subtitle: 'Store owner is offline & sleeping. AI Sales Agent engages in 0.3 seconds.',
    durationMs: 5000,
    featureTitle: '24/7 Overnight Auto-Closer',
    featureDesc: 'Captures late-night shoppers when your competitors are asleep. Zero missed customer inquiries.',
    benefitTag: '+42% Extra Night Sales',
    icon: Moon,
  },
  {
    id: 1,
    timecode: '00:15',
    badge: 'SCENE 02 · REAL-TIME INVENTORY',
    title: 'Instant Visual Matching & Stock Verification ⚡',
    subtitle: 'Understands customer photos, recommends matching sizes, and confirms live stock.',
    durationMs: 5000,
    featureTitle: 'Visual Intelligence & Sizing',
    featureDesc: 'Recognizes photos, fabric details and recommends exact chest/length measurements in seconds.',
    benefitTag: 'Zero Stock Outages',
    icon: Sparkles,
  },
  {
    id: 2,
    timecode: '00:26',
    badge: 'SCENE 03 · AUTOMATED CHECKOUT',
    title: '1-Click bKash Verification & Order Receipt 💳',
    subtitle: 'Customer pays advance via bKash. TrxID verified in real-time, order created.',
    durationMs: 5200,
    featureTitle: 'Instant Payment & Order Voucher',
    featureDesc: 'Parses Bangladeshi phone numbers and addresses into official receipts without manual typing.',
    benefitTag: 'Zero Manual Data Entry',
    icon: CreditCard,
  },
  {
    id: 3,
    timecode: '00:38',
    badge: 'SCENE 04 · AUTOMATED COURIER',
    title: 'Automated Courier Consignment Handover 🚚',
    subtitle: 'Parcel booked with Steadfast Courier with tracking SMS sent to customer.',
    durationMs: 5000,
    featureTitle: 'Courier Tracking Sync',
    featureDesc: 'Generates Steadfast/Pathao courier tracking slips automatically and notifies the buyer.',
    benefitTag: '24h Delivery Dispatch',
    icon: Truck,
  },
  {
    id: 4,
    timecode: '00:48',
    badge: 'SCENE 05 · 08:30 AM MORNING',
    title: 'Morning 8:30 AM: Wake Up to Deposited Profits ☀️',
    subtitle: 'Merchant wakes up to overnight order summary: 14 orders processed & ৳32,850 revenue.',
    durationMs: 5500,
    featureTitle: 'Total Merchant Peace of Mind',
    featureDesc: 'Wake up to real orders ready for delivery, with full receipts and customer happiness.',
    benefitTag: '100% Peace of Mind',
    icon: TrendingUp,
  },
];

export function MotionVideoAd() {
  const { companyName: COMPANY_NAME } = useBrand();
  const [activeSceneIdx, setActiveSceneIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [sceneProgress, setSceneProgress] = useState<number>(0);

  const currentScene = AD_SCENES[activeSceneIdx];

  // Auto-playing video ad ticker
  useEffect(() => {
    if (!isPlaying) return;

    const intervalMs = 60;
    const duration = currentScene.durationMs;
    const increment = (intervalMs / duration) * 100;

    const timer = setInterval(() => {
      setSceneProgress((prev) => {
        if (prev >= 100) {
          setActiveSceneIdx((curr) => (curr + 1) % AD_SCENES.length);
          return 0;
        }
        return prev + increment;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, currentScene.durationMs, activeSceneIdx]);

  const selectScene = (idx: number) => {
    setActiveSceneIdx(idx);
    setSceneProgress(0);
  };

  return (
    <div className="space-y-8 select-none">
      {/* Top Banner Header */}
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-white/10 pb-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#5B3DF5]/40 bg-[#5B3DF5]/15 px-3.5 py-1 text-xs font-semibold text-[#A78BFA]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Commercial Motion Showcase · Desktop Video Ad</span>
          </div>
          <h2 className="font-geist text-3xl font-extrabold tracking-tight text-white sm:text-5xl leading-[1.12]">
            You sleep. <span className="text-[#818CF8]">{COMPANY_NAME} sells.</span>
            <br />
            <span className="text-slate-300 text-2xl sm:text-4xl font-bold">
              Every message converted into verified orders.
            </span>
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
            See what happens when a late-night customer messages your Facebook page at 2:45 AM.
            Watch {COMPANY_NAME} handle conversations, stock checks, bKash verification, and courier booking.
          </p>
        </div>

        {/* Live Ad Status Pill */}
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0E1122]/90 px-4 py-2.5 shadow-xl backdrop-blur-md">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
          </span>
          <div className="leading-tight">
            <p className="text-xs font-extrabold text-white">AUTONOMOUS SALES REEL</p>
            <p className="text-[10px] text-emerald-400 font-medium">4K HDR · 60 FPS Dynamic Motion</p>
          </div>
        </div>
      </div>

      {/* Main Split Grid: Left Video Ad Player (7 cols) + Right Feature Showcase (5 cols) */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-stretch">
        {/* ===================================================================
            COLUMN 1: THE MOTION GRAPHICS DESKTOP VIDEO PLAYER (7 cols)
           =================================================================== */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-3xl border border-white/15 bg-gradient-to-b from-[#13162A] via-[#0E1020] to-[#0A0C16] p-3 sm:p-4 shadow-2xl shadow-indigo-950/50">
          {/* Top Video Player Chrome Bar */}
          <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-3 py-2 rounded-t-2xl">
            {/* macOS Window Controls */}
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#FF5F56] shadow-xs" />
              <span className="h-3 w-3 rounded-full bg-[#FFBD2E] shadow-xs" />
              <span className="h-3 w-3 rounded-full bg-[#27C93F] shadow-xs" />
              <span className="ml-2 font-mono text-[11px] text-slate-400 hidden sm:inline">
                {COMPANY_NAME}_commercial_ad_2026.mp4
              </span>
            </div>

            {/* Video HUD Indicators */}
            <div className="flex items-center gap-2.5">
              <span className="rounded bg-rose-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-rose-300 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                REC
              </span>
              <span className="font-mono text-xs font-bold text-[#818CF8]">
                {currentScene.timecode} / 01:00
              </span>
              <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                4K UHD
              </span>
            </div>
          </div>

          {/* =================================================================
              VIDEO STAGE CANVAS: DYNAMIC MOTION SCENE CONTAINER
             ================================================================= */}
          <div className="relative min-h-[380px] sm:min-h-[420px] my-3 overflow-hidden rounded-2xl border border-white/10 bg-[#080A14] p-4 sm:p-6 flex flex-col justify-between">
            {/* Subtle background motion grid */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#5B3DF5_1px,transparent_1px)] [background-size:24px_24px] opacity-20" />

            {/* Top Scene Caption Strip */}
            <div className="relative z-10 flex items-center justify-between">
              <span className="rounded-full bg-[#5B3DF5]/20 border border-[#5B3DF5]/40 px-3 py-1 text-[11px] font-bold text-[#A78BFA]">
                {currentScene.badge}
              </span>

              {/* Sound Wave Equalizer (Animated) */}
              <div className="flex items-end gap-1 h-4">
                {[40, 80, 50, 100, 70, 90, 30].map((h, i) => (
                  <span
                    key={i}
                    className="w-1 rounded-full bg-[#818CF8] transition-all duration-300"
                    style={{
                      height: isPlaying ? `${(h * (1 + (i % 3) * 0.2)).toFixed(0)}%` : '20%',
                      animation: isPlaying ? `pulse 1s ease-in-out infinite ${i * 0.15}s` : 'none',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* -------------------------------------------------------------
                SCENE 0: Midnight Customer Message at 2:45 AM
               ------------------------------------------------------------- */}
            {activeSceneIdx === 0 && (
              <div className="relative z-10 space-y-4 my-auto animate-fadeIn">
                {/* Midnight Status Clock */}
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#12162A]/90 p-3 shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-[#818CF8]">
                      <Moon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">02:45 AM · Dhaka Local Time</p>
                      <p className="text-[11px] text-slate-400">Store Owner Status: Sleeping 😴</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1 text-[10px] font-bold text-emerald-400">
                    AI Auto-Pilot 100% Active
                  </span>
                </div>

                {/* Customer Incoming Ping */}
                <div className="space-y-2">
                  <div className="flex items-start gap-2.5 rounded-xl border border-white/15 bg-[#171B36] p-3 shadow-md">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-600 font-bold text-xs text-white">
                      N
                    </div>
                    <div className="flex-1 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-white">Nusrat Jahan (Customer)</span>
                        <span className="text-[10px] text-slate-400">2:45 AM · Messenger</span>
                      </div>
                      <p className="text-slate-100 leading-relaxed">
                        &quot;Hi! Blue Silk Kurti size XL ache? Kal dupur 2 tay urgent event ache, delivery hobe?&quot;
                      </p>
                    </div>
                  </div>

                  {/* AI Instant Wakeup Reaction */}
                  <div className="ml-6 flex items-center justify-between rounded-xl border border-[#5B3DF5]/40 bg-[#1F193E] p-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-emerald-400 animate-bounce" />
                      <span className="text-slate-200">
                        {COMPANY_NAME} AI Agent engaged in <strong className="text-emerald-400">0.3 seconds</strong>
                      </span>
                    </div>
                    <span className="rounded bg-indigo-500/30 px-2 py-0.5 text-[10px] font-bold text-[#A78BFA]">
                      Fastest in BD
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* -------------------------------------------------------------
                SCENE 1: Visual Intelligence & Stock Check
               ------------------------------------------------------------- */}
            {activeSceneIdx === 1 && (
              <div className="relative z-10 space-y-4 my-auto animate-fadeIn">
                <div className="rounded-xl border border-emerald-500/30 bg-[#0E1A1F] p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    <div>
                      <p className="text-xs font-bold text-white">Warehouse Inventory Scanned</p>
                      <p className="text-[10px] text-slate-400">Product: Blue Silk Kurti (SKU: BSK-XL)</p>
                    </div>
                  </div>
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-300">
                    12 Units in Stock
                  </span>
                </div>

                {/* AI Product Response with Card */}
                <div className="rounded-2xl border border-[#5B3DF5]/40 bg-[#151932] p-3.5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#5B3DF5] to-[#7C3AED] text-white">
                      <ShoppingBag className="h-7 w-7" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-white">Royal Blue Silk Kurti</p>
                      <p className="text-sm font-extrabold text-[#A78BFA]">৳১,৮৫০</p>
                      <p className="text-[10px] text-emerald-400">
                        ✓ সাইজ XL: বুক ৪২&quot;, লম্বা ৪৪&quot; · পারফেক্ট ফিটিং
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-2 text-[11px] text-slate-200 leading-snug">
                    &quot;ওয়ালাইকুম আসসালাম ম্যাম! সাইজ XL স্টকে আছে। কাল সকাল ১১টায় কুরিয়ার রাইডার রওনা দেবে, বিকেলের মধ্যে পেয়ে যাবেন 🚚&quot;
                  </div>
                </div>
              </div>
            )}

            {/* -------------------------------------------------------------
                SCENE 2: Instant bKash Payment & Order Voucher
               ------------------------------------------------------------- */}
            {activeSceneIdx === 2 && (
              <div className="relative z-10 space-y-3.5 my-auto animate-fadeIn">
                {/* Live bKash Verification Banner */}
                <div className="rounded-xl border border-pink-500/40 bg-[#1D0F1B] p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E2136E] text-xs font-black text-white">
                      bK
                    </span>
                    <div>
                      <p className="text-xs font-bold text-white">bKash Merchant Auto-Verification</p>
                      <p className="font-mono text-[10px] text-pink-300">TrxID: BK9F2D8M1 · Instant Match</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-extrabold text-emerald-400">
                    ৳১,৯২০ Received
                  </span>
                </div>

                {/* Confirmed Order Voucher */}
                <div className="rounded-2xl border border-white/15 bg-[#12162A] p-3.5 space-y-2">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-xs font-extrabold text-white">অর্ডার ভাউচার #4892</span>
                    <span className="rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5">
                      Paid &amp; Approved
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Customer:</span>
                      <strong className="text-white">Nusrat Jahan</strong> (01700-112233)
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Delivery:</span>
                      <span className="text-slate-200">Road 7, Dhanmondi, Dhaka</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* -------------------------------------------------------------
                SCENE 3: Automated Courier Consignment Handover
               ------------------------------------------------------------- */}
            {activeSceneIdx === 3 && (
              <div className="relative z-10 space-y-3.5 my-auto animate-fadeIn">
                <div className="rounded-xl border border-blue-500/30 bg-[#0E1528] p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
                      <Truck className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Steadfast Courier Booking</p>
                      <p className="font-mono text-[10px] text-blue-300">Consignment #ST-90248-BD</p>
                    </div>
                  </div>
                  <span className="rounded bg-blue-500/20 px-2.5 py-0.5 text-[10px] font-bold text-blue-300">
                    Label Generated
                  </span>
                </div>

                <div className="rounded-2xl border border-white/15 bg-[#13172E] p-3.5 space-y-2">
                  <p className="text-xs text-slate-200 leading-relaxed">
                    📦 পার্সেল স্বয়ংক্রিয়ভাবে বুকিং সম্পন্ন হয়েছে। কাস্টমারকে এসএমএস ও মেসেঞ্জারে ট্র্যাকিং লিঙ্ক পাঠানো হয়েছে।
                  </p>
                  <div className="flex items-center justify-between border-t border-white/8 pt-2 text-[11px]">
                    <span className="text-emerald-400 font-semibold">✓ SMS Sent: Tracking Live</span>
                    <span className="text-slate-400">Dhaka Express Delivery</span>
                  </div>
                </div>
              </div>
            )}

            {/* -------------------------------------------------------------
                SCENE 4: Morning 8:30 AM Wake Up to Profits
               ------------------------------------------------------------- */}
            {activeSceneIdx === 4 && (
              <div className="relative z-10 space-y-3.5 my-auto animate-fadeIn">
                <div className="rounded-xl border border-amber-500/30 bg-[#211A0D] p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
                      <Sun className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">08:30 AM · Morning Store Summary</p>
                      <p className="text-[10px] text-amber-300">Good morning! Your store sold all night.</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-extrabold text-emerald-400">
                    +৳৩২,৮৫০ Net
                  </span>
                </div>

                <div className="rounded-2xl border border-[#5B3DF5]/40 bg-gradient-to-r from-[#171B38] to-[#1F193F] p-4 text-center space-y-2 shadow-xl">
                  <p className="text-xs font-bold text-slate-300">Overnight Automated Performance</p>
                  <p className="text-2xl sm:text-3xl font-extrabold text-white">
                    ১৪টি নতুন অর্ডার <span className="text-emerald-400">কনফার্মড</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    জিরো মিসড সেলস · জিরো ম্যানুয়াল চ্যাট · ফুল পেমেন্ট ও কুরিয়ার সিঙ্ক
                  </p>
                </div>
              </div>
            )}

            {/* Bottom Timeline Scrubber inside Video Player */}
            <div className="relative z-10 border-t border-white/10 pt-3 flex flex-col gap-2">
              {/* Progress Line */}
              <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden cursor-pointer">
                <div
                  className="h-full bg-gradient-to-r from-[#5B3DF5] to-[#818CF8] transition-all duration-75"
                  style={{ width: `${sceneProgress}%` }}
                />
              </div>

              {/* Player Bottom Control Bar */}
              <div className="flex items-center justify-between text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Pause className="h-3.5 w-3.5 text-[#A78BFA]" /> : <Play className="h-3.5 w-3.5 text-emerald-400" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => selectScene(0)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-slate-400 hover:text-white transition"
                    title="Restart ad"
                    aria-label="Restart ad"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>

                  <span className="font-medium text-[11px] text-white">
                    {currentScene.title}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsMuted(!isMuted)}
                    className="p-1 text-slate-400 hover:text-white transition"
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  </button>
                  <span className="font-mono text-[10px] text-slate-500">1.0X</span>
                </div>
              </div>
            </div>
          </div>

          {/* 5 Scene Navigation Badges underneath Video */}
          <div className="grid grid-cols-5 gap-1.5 pt-1">
            {AD_SCENES.map((sc, idx) => {
              const isSelected = activeSceneIdx === idx;
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => selectScene(idx)}
                  className={cn(
                    'rounded-xl p-2 text-center transition-all',
                    isSelected
                      ? 'border border-[#5B3DF5] bg-[#1A1D36] text-white font-bold shadow-md shadow-[#5B3DF5]/20'
                      : 'border border-white/5 bg-white/[0.02] text-slate-400 hover:bg-white/[0.05] hover:text-slate-200',
                  )}
                >
                  <p className="text-[10px] truncate">{sc.badge.split('·')[1]?.trim() || `0${idx + 1}`}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ===================================================================
            COLUMN 2: MERCHANT FEATURE OPTIONS (Right 5 cols)
           =================================================================== */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-3.5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#A78BFA]">
                What {COMPANY_NAME} Automates For You
              </span>
              <span className="text-[11px] text-slate-400">Click to preview scene</span>
            </div>

            {/* 5 Merchant Benefit Accordion Cards */}
            {AD_SCENES.map((sc, idx) => {
              const isSelected = activeSceneIdx === idx;
              const Icon = sc.icon;

              return (
                <div
                  key={sc.id}
                  onClick={() => selectScene(idx)}
                  className={cn(
                    'group cursor-pointer rounded-2xl p-4 transition-all duration-200 border',
                    isSelected
                      ? 'border-[#5B3DF5] bg-gradient-to-r from-[#171B36] to-[#121528] shadow-lg shadow-[#5B3DF5]/15'
                      : 'border-white/8 bg-[#0E1122]/70 hover:border-white/20 hover:bg-[#12162B]',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition',
                          isSelected
                            ? 'bg-[#5B3DF5] text-white shadow-md shadow-[#5B3DF5]/30'
                            : 'bg-white/5 text-slate-400 group-hover:text-white',
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <p
                            className={cn(
                              'text-sm font-bold transition',
                              isSelected ? 'text-white' : 'text-slate-200 group-hover:text-white',
                            )}
                          >
                            {sc.featureTitle}
                          </p>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          {sc.featureDesc}
                        </p>
                      </div>
                    </div>

                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold border transition',
                        isSelected
                          ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                          : 'border-white/10 bg-white/5 text-slate-400',
                      )}
                    >
                      {sc.benefitTag}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick CTA Card */}
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#1A1838] to-[#0E1122] p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-white">Ready to automate your store?</p>
              <p className="text-[11px] text-slate-400">Start with free credits · Setup in 5 minutes</p>
            </div>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#5B3DF5] to-[#7C3AED] px-4 py-2 text-xs font-bold text-white shadow-md shadow-[#5B3DF5]/25 hover:brightness-110 transition"
            >
              <span>Get started</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
