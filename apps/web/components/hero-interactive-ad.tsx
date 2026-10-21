'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  Sparkles,
  Send,
  CheckCircle2,
  Share2,
  ThumbsUp,
  Clock,
  Truck,
  ShoppingBag,
  CreditCard,
  Play,
  Pause,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function HeroInteractiveAd() {
  const [activeScene, setActiveScene] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [progress, setProgress] = useState<number>(0);

  // Scene 1 Interactive states
  const [selectedSize, setSelectedSize] = useState<string>('L');
  const [orderCreated, setOrderCreated] = useState<boolean>(false);
  const [customMsg, setCustomMsg] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string; time: string; card?: boolean }>>([
    {
      sender: 'user',
      text: 'Hi! Black Hoodie size L ache? Cash on delivery hobe?',
      time: '10:24 AM',
    },
    {
      sender: 'ai',
      text: 'Ji sir! Essential Black Hoodie size L stock e ache (৳2,490). 100% Combed Cotton, 380 GSM. Free Cash on Delivery available across Bangladesh 🚚',
      time: '10:24 AM',
      card: true,
    },
  ]);

  // Scene 2 states (Comment Auto-Reply)
  const [commentReplySent, setCommentReplySent] = useState<boolean>(true);
  const [privateDmSent, setPrivateDmSent] = useState<boolean>(true);

  // Scene 3 states (AI Post Generation)
  const [postTone, setPostTone] = useState<'Friendly' | 'Professional' | 'Urgent'>('Friendly');
  const [postPublished, setPostPublished] = useState<boolean>(false);

  // Scene 4 states (bKash & Dispatch)
  const [bKashVerified, setBKashVerified] = useState<boolean>(true);
  const [courierDispatched, setCourierDispatched] = useState<boolean>(true);

  const SCENES = [
    {
      id: 0,
      title: 'Chat to Order',
      icon: MessageSquare,
      badge: 'Auto-Sales',
    },
    {
      id: 1,
      title: 'Comment to DM',
      icon: Share2,
      badge: 'FB Comments',
    },
    {
      id: 2,
      title: 'AI Post Creator',
      icon: Sparkles,
      badge: 'Auto-Publish',
    },
    {
      id: 3,
      title: 'bKash & Dispatch',
      icon: Truck,
      badge: 'Payment & Courier',
    },
  ];

  // Auto-playing timer
  useEffect(() => {
    if (!isPlaying) return;

    const interval = 100; // update progress every 100ms
    const sceneDuration = 6000; // 6 seconds per scene
    const increment = (interval / sceneDuration) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          setActiveScene((current) => (current + 1) % SCENES.length);
          return 0;
        }
        return prev + increment;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [isPlaying, SCENES.length]);

  const switchScene = (idx: number) => {
    setActiveScene(idx);
    setProgress(0);
  };

  const handleSendCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customMsg.trim()) return;
    const userText = customMsg;
    setCustomMsg('');
    setChatMessages((prev) => [
      ...prev,
      { sender: 'user', text: userText, time: 'Just now' },
    ]);
    setTimeout(() => {
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: `Ji, apnar message peyechi! "${userText}" - er jonno amader stock ready ache. Order confirm korte chaile phone number & address din.`,
          time: 'Just now',
        },
      ]);
    }, 900);
  };

  return (
    <div className="relative overflow-hidden rounded-[24px] border-[5px] border-[#1D2035] bg-[#0E1022] text-white shadow-2xl shadow-indigo-950/40">
      {/* Top Interactive Ad Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-white/10 bg-[#13162C] px-3.5 py-2.5 sm:px-4">
        {/* Live Status indicator */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
            Live AI Ad Reel
          </span>
          <span className="hidden text-slate-500 sm:inline">·</span>
          <span className="hidden text-[11px] text-slate-400 sm:inline">
            Interactive Commerce Automation
          </span>
        </div>

        {/* Player Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => switchScene((activeScene - 1 + SCENES.length) % SCENES.length)}
            aria-label="Previous scene"
            className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            aria-label={isPlaying ? 'Pause demo' : 'Play demo'}
            className="flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:bg-white/20 transition"
          >
            {isPlaying ? (
              <>
                <Pause className="h-3 w-3 text-[#A78BFA]" />
                <span className="hidden sm:inline">Pause</span>
              </>
            ) : (
              <>
                <Play className="h-3 w-3 text-emerald-400" />
                <span className="hidden sm:inline">Play</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => switchScene((activeScene + 1) % SCENES.length)}
            aria-label="Next scene"
            className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 4 Multi-Scene Tabs with Progress Bar */}
      <div className="grid grid-cols-4 border-b border-white/10 bg-[#0B0D1B] text-center text-xs">
        {SCENES.map((scene, idx) => {
          const isActive = activeScene === idx;
          const Icon = scene.icon;
          return (
            <button
              key={scene.id}
              type="button"
              onClick={() => switchScene(idx)}
              className={cn(
                'relative flex flex-col items-center justify-center py-2.5 px-1 transition-all',
                isActive
                  ? 'bg-white/[0.06] text-white font-bold'
                  : 'text-slate-400 hover:bg-white/[0.02] hover:text-slate-200',
              )}
            >
              <div className="flex items-center gap-1.5">
                <Icon
                  className={cn(
                    'h-3.5 w-3.5',
                    isActive ? 'text-[#818CF8]' : 'text-slate-400',
                  )}
                />
                <span className="hidden sm:inline text-[11px]">{scene.title}</span>
              </div>
              <span className="mt-0.5 text-[9px] text-slate-400 sm:hidden">
                {scene.badge}
              </span>
              {/* Progress Line */}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-[#5B3DF5] to-[#818CF8] transition-all duration-100 ease-linear"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Scene Canvas Area */}
      <div className="min-h-[440px] p-3 sm:p-5 flex flex-col justify-between">
        {/* SCENE 0: Messenger Chat to Order Creation */}
        {activeScene === 0 && (
          <div className="space-y-3.5 animate-slide-up-fade">
            {/* Facebook Messenger Header Mockup */}
            <div className="flex items-center justify-between rounded-xl bg-white/[0.04] p-2.5 border border-white/8">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-[#5B3DF5] to-indigo-400 font-bold text-xs text-white">
                    S
                  </div>
                  <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[#0E1022]" />
                </div>
                <div className="leading-tight">
                  <p className="text-xs font-bold text-white flex items-center gap-1">
                    StyleHub BD
                    <span className="rounded bg-blue-500/20 text-blue-400 px-1 py-0.2 text-[8px] font-semibold">
                      Verified Store
                    </span>
                  </p>
                  <p className="text-[10px] text-emerald-400 font-medium">
                    ⚡ AI Sales Agent Active · Instant Replies
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-[#1877F2]/20 px-2 py-0.5 text-[10px] font-bold text-[#1877F2]">
                Messenger
              </span>
            </div>

            {/* Chat Messages Stream */}
            <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex flex-col space-y-1',
                    msg.sender === 'user' ? 'items-end' : 'items-start',
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-sm',
                      msg.sender === 'user'
                        ? 'rounded-br-xs bg-[#5B3DF5] text-white'
                        : 'rounded-bl-xs bg-[#1C2038] text-slate-100 border border-white/10',
                    )}
                  >
                    {msg.text}
                  </div>

                  {/* Interactive Product Card attached to AI message */}
                  {msg.card && (
                    <div className="mt-1 w-full max-w-[340px] rounded-xl border border-[#5B3DF5]/30 bg-[#151930] p-3 shadow-md space-y-2.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#222846] text-white">
                          <ShoppingBag className="h-6 w-6 text-[#A78BFA]" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-white">Essential Black Hoodie</p>
                          <p className="text-xs font-extrabold text-[#818CF8]">৳2,490</p>
                          <p className="text-[10px] text-emerald-400">In Stock · 24 available</p>
                        </div>
                      </div>

                      {/* Size Selectors (Interactive!) */}
                      <div className="flex items-center justify-between border-t border-white/8 pt-2">
                        <span className="text-[10px] text-slate-400 font-medium">Select Size:</span>
                        <div className="flex gap-1.5">
                          {['S', 'M', 'L', 'XL'].map((size) => (
                            <button
                              key={size}
                              type="button"
                              onClick={() => setSelectedSize(size)}
                              className={cn(
                                'h-6 w-7 rounded-md text-[10px] font-bold transition',
                                selectedSize === size
                                  ? 'bg-[#5B3DF5] text-white ring-1 ring-white/50'
                                  : 'bg-white/10 text-slate-300 hover:bg-white/20',
                              )}
                            >
                              {size}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 1-Click Order Confirmation Action */}
                      <button
                        type="button"
                        onClick={() => setOrderCreated(true)}
                        className={cn(
                          'w-full flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition shadow-xs',
                          orderCreated
                            ? 'bg-emerald-600 text-white'
                            : 'bg-gradient-to-r from-[#5B3DF5] to-[#7C3AED] text-white hover:brightness-110',
                        )}
                      >
                        {orderCreated ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>Order #1042 Placed (Size {selectedSize})</span>
                          </>
                        ) : (
                          <>
                            <ShoppingBag className="h-3.5 w-3.5" />
                            <span>Confirm Order · Size {selectedSize}</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                  <span className="px-1 text-[9px] text-slate-400">{msg.time}</span>
                </div>
              ))}
            </div>

            {/* Interactive Live Message Input */}
            <form onSubmit={handleSendCustom} className="mt-2 flex gap-2">
              <input
                type="text"
                value={customMsg}
                onChange={(e) => setCustomMsg(e.target.value)}
                placeholder="Type a test customer message (e.g. Discount ache?)..."
                className="flex-1 rounded-xl border border-white/10 bg-[#171B33] px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:border-[#5B3DF5] focus:outline-none"
              />
              <button
                type="submit"
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#5B3DF5] text-white transition hover:bg-[#4C2EE0]"
                title="Send test message"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        )}

        {/* SCENE 1: Facebook Post Comment to Private DM */}
        {activeScene === 1 && (
          <div className="space-y-3.5 animate-slide-up-fade">
            {/* Simulated Facebook Post Card */}
            <div className="rounded-xl border border-white/10 bg-[#14182E] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1877F2] font-bold text-xs text-white">
                    f
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">StyleHub BD</p>
                    <p className="text-[10px] text-slate-400">Published · 15 mins ago</p>
                  </div>
                </div>
                <span className="rounded-md bg-blue-500/20 px-2 py-0.5 text-[9px] font-bold text-blue-300">
                  Facebook Page
                </span>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">
                🔥 Our Winter Collection 2026 is officially live! Heavyweight premium hoodies &amp;
                sweatshirts now in stock. Drop a comment below for sizes and pricing details.
              </p>
              <div className="flex items-center gap-4 border-t border-white/8 pt-2 text-[11px] text-slate-400">
                <span className="flex items-center gap-1 font-semibold text-[#818CF8]">
                  <ThumbsUp className="h-3 w-3" /> 148 Likes
                </span>
                <span>32 Comments</span>
              </div>
            </div>

            {/* Comment Flow Action */}
            <div className="rounded-xl border border-[#5B3DF5]/30 bg-[#161B36] p-3 space-y-2.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-white">Live Comment Auto-Reply</span>
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">
                  0.4s Response Time
                </span>
              </div>

              {/* Incoming Customer Comment */}
              <div className="flex items-start gap-2.5 rounded-lg bg-[#0F1224] p-2.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold">
                  R
                </div>
                <div className="text-xs">
                  <span className="font-bold text-slate-200">Rafiq Islam: </span>
                  <span className="text-slate-300 font-medium">&quot;Price koto vai? (What is the price?)&quot;</span>
                  <p className="mt-1 text-[9px] text-slate-400">Commented on post · 1 min ago</p>
                </div>
              </div>

              {/* AI Auto Public Reply */}
              <div className="ml-4 flex items-start gap-2.5 rounded-lg border border-[#5B3DF5]/30 bg-[#1B2144] p-2.5">
                <Sparkles className="h-4 w-4 shrink-0 text-[#818CF8] mt-0.5" />
                <div className="text-xs leading-snug">
                  <span className="font-bold text-[#A78BFA]">StyleHub AI (Public Reply): </span>
                  <span className="text-slate-200">
                    &quot;Inbox e check korun vaiya! 15% discount code soho catalog pathano hoyeche ✨&quot;
                  </span>
                </div>
              </div>

              {/* Private DM Bubble */}
              <div className="flex items-center justify-between rounded-lg bg-[#006AFF]/15 border border-[#006AFF]/30 p-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#006AFF] text-[9px] text-white font-bold">
                    M
                  </span>
                  <span className="text-[11px] text-slate-200">
                    Private DM sent with discount code <code className="font-mono text-[#818CF8] font-bold">WINTER15</code>
                  </span>
                </div>
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">
                  Delivered
                </span>
              </div>
            </div>
          </div>
        )}

        {/* SCENE 2: AI Social Post Generator & Auto-Publish */}
        {activeScene === 2 && (
          <div className="space-y-3.5 animate-slide-up-fade">
            {/* AI Generator Control Box */}
            <div className="rounded-xl border border-white/10 bg-[#14182E] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[#818CF8]" />
                  AI Post Generator
                </span>
                {/* Tone Selectors */}
                <div className="flex gap-1 text-[10px]">
                  {(['Friendly', 'Professional', 'Urgent'] as const).map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => setPostTone(tone)}
                      className={cn(
                        'rounded-md px-2 py-0.5 font-semibold transition',
                        postTone === tone
                          ? 'bg-[#5B3DF5] text-white'
                          : 'bg-white/10 text-slate-400 hover:text-white',
                      )}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prompt box */}
              <div className="rounded-lg bg-[#0E1122] p-2 text-[11px] text-slate-300 border border-white/8">
                <span className="text-slate-400">Prompt: </span>
                Create high-converting Facebook post for Eid Punjabi collection with 20% discount &amp; free COD
              </div>

              {/* Generated Post Output Card */}
              <div className="rounded-xl border border-[#5B3DF5]/30 bg-[#161B38] p-3 text-xs leading-relaxed space-y-1.5">
                <p className="font-medium text-slate-100">
                  🌙 ঈদে আপনার স্পেশাল মুহূর্তগুলো হোক আরও জমকালো! প্রিমিয়াম পাঞ্জাবি কালেকশনে পাচ্ছেন ফ্ল্যাট ২০% ছাড়।
                </p>
                <p className="text-[11px] text-slate-300">
                  ✓ ১০০% পিওর সুতি ফেব্রিক · আরামদায়ক ও ট্রেন্ডি <br />
                  ✓ সারা দেশে ক্যাশ অন ডেলিভারি ও ফ্রি রিটার্ন সুবিধা 🚚
                </p>
                <p className="text-[10px] text-[#A78BFA] font-mono">
                  #EidFashion #Panjabi2026 #StyleHubBD #CashOnDelivery
                </p>
              </div>

              {/* Action row */}
              <div className="flex items-center justify-between border-t border-white/8 pt-2">
                <span className="text-[10px] text-slate-400">
                  Scheduled for 7:30 PM Peak Engagement
                </span>
                <button
                  type="button"
                  onClick={() => setPostPublished(!postPublished)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition shadow-xs',
                    postPublished
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#5B3DF5] text-white hover:bg-[#4C2EE0]',
                  )}
                >
                  {postPublished ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Published to Facebook Page!</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="h-3.5 w-3.5" />
                      <span>Approve &amp; Auto-Publish</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SCENE 3: bKash Payment & Courier Dispatch */}
        {activeScene === 3 && (
          <div className="space-y-3.5 animate-slide-up-fade">
            {/* bKash Payment Card */}
            <div className="rounded-xl border border-white/10 bg-[#14182E] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#E2136E] text-[10px] font-black text-white">
                    bK
                  </span>
                  <span className="text-xs font-bold text-white">bKash Merchant Verification</span>
                </div>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-bold text-emerald-400">
                  TrxID Verified
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] rounded-lg bg-[#0F1224] p-2.5 border border-white/8">
                <div>
                  <span className="text-slate-400 block text-[10px]">TrxID:</span>
                  <span className="font-mono font-bold text-slate-100">BK9F3D2K7L</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Received Amount:</span>
                  <span className="font-bold text-emerald-400">৳2,550.00</span>
                </div>
              </div>
            </div>

            {/* Courier Dispatch Card */}
            <div className="rounded-xl border border-[#5B3DF5]/30 bg-[#161B38] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-[#818CF8]" />
                  <span className="text-xs font-bold text-white">Steadfast Courier Integration</span>
                </div>
                <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[9px] font-bold text-blue-300">
                  Consignment Ready
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Customer:</span>
                  <span className="font-bold text-white">Sarah Ahmed (+880 1712-345678)</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Destination:</span>
                  <span className="font-medium text-slate-200">House 12, Road 3, Dhanmondi, Dhaka</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Courier Tracking:</span>
                  <span className="font-mono font-bold text-[#818CF8]">ST-902418-BD</span>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-white/8 pt-2 text-[10px]">
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  SMS Notification Sent to Customer
                </span>
                <span className="rounded bg-white/10 px-2 py-0.5 text-slate-300 font-medium">
                  24-48 hr Delivery
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Interactive Ad Summary Strip */}
        <div className="mt-3 flex items-center justify-between rounded-xl bg-white/[0.04] p-2.5 border border-white/8 text-[11px]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span className="text-slate-300">
              Zero tab switching · Handles conversations, orders, and social posts 24/7
            </span>
          </div>
          <Link
            href="/login"
            className="flex items-center gap-1 font-bold text-[#A78BFA] hover:text-white transition"
          >
            <span>Try live</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
