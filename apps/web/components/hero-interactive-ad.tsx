'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Sparkles,
  Send,
  CheckCircle2,
  Share2,
  Clock,
  Truck,
  ShoppingBag,
  CreditCard,
  Play,
  Pause,
  RotateCcw,
  ChevronRight,
  ShieldCheck,
  Check,
  Phone,
  Video,
  Smile,
  Image as ImageIcon,
  Mic,
  Star,
  ChevronLeft,
  ExternalLink,
  ThumbsUp,
  MapPin,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// 8 Sequential Story Chapters matching the gold standard eCommerce workflow
export interface StoryChapter {
  id: number;
  labelBn: string;
  labelEn: string;
  durationMs: number;
  title: string;
  statusBadge: string;
}

export const CHAPTERS: StoryChapter[] = [
  { id: 0, labelBn: 'সালাম', labelEn: 'Greeting', durationMs: 4200, title: 'স্বাগতম ও ক্যাটাগরি সাজেশন', statusBadge: 'AI Response: 0.4s' },
  { id: 1, labelBn: 'পছন্দ', labelEn: 'Catalog', durationMs: 4500, title: 'লাইভ প্রোডাক্ট ক্যাটালগ কার্ড', statusBadge: 'Live Inventory Synced' },
  { id: 2, labelBn: 'ছবি', labelEn: 'Photo Match', durationMs: 4600, title: 'কাস্টমার ছবি দেখে স্বয়ংক্রিয় শনাক্ত', statusBadge: 'Vision AI: 99.2% Match' },
  { id: 3, labelBn: 'সাইজ', labelEn: 'Size Check', durationMs: 4200, title: 'রিয়েলটাইম সাইজ গাইড ও স্টক যাচাই', statusBadge: 'Inventory: In Stock' },
  { id: 4, labelBn: 'অর্ডার', labelEn: 'Checkout', durationMs: 4400, title: 'ঠিকানা ও ফোন নম্বর স্বয়ংক্রিয় পার্সিং', statusBadge: 'Address Verified' },
  { id: 5, labelBn: 'রসিদ', labelEn: 'Receipt', durationMs: 4800, title: 'ইনস্ট্যান্ট অর্ডার ভাউচার ও মেমো', statusBadge: 'Order #22961 Created' },
  { id: 6, labelBn: 'কুরিয়ার', labelEn: 'Courier', durationMs: 4600, title: 'স্টেডফাস্ট কুরিয়ার কনসাইনমেন্ট ও ট্র্যাকিং', statusBadge: 'Steadfast Sync · 24h Delivery' },
  { id: 7, labelBn: 'রিভিউ', labelEn: 'Review', durationMs: 4400, title: 'ডেলিভারি পরবর্তী ৫-স্টার ফিডব্যাক', statusBadge: '★ 5.0 Customer Rating' },
];

export function HeroInteractiveAd() {
  const [currentChapter, setCurrentChapter] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [selectedProductSize, setSelectedProductSize] = useState<string>('L');
  const [manualOrdered, setManualOrdered] = useState<boolean>(false);
  const [userCustomMessage, setUserCustomMessage] = useState<string>('');
  const [customReplies, setCustomReplies] = useState<Array<{ sender: 'user' | 'ai'; text: string; time: string }>>([]);

  const chatScrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll inside phone chat on stage changes (never scrolls window)
  useEffect(() => {
    if (chatScrollContainerRef.current) {
      chatScrollContainerRef.current.scrollTo({
        top: chatScrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [currentChapter, isTyping, customReplies]);

  // Main interactive playback loop
  useEffect(() => {
    if (!isPlaying) return;

    const chapterDuration = CHAPTERS[currentChapter].durationMs;
    const intervalMs = 60;
    const increment = (intervalMs / chapterDuration) * 100;

    // Simulate typing indicator in the first 800ms of chapters that have an AI reply
    const typingTimer = setTimeout(() => {
      setIsTyping(true);
    }, 200);

    const typingEndTimer = setTimeout(() => {
      setIsTyping(false);
    }, 1100);

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          setCurrentChapter((curr) => (curr + 1) % CHAPTERS.length);
          return 0;
        }
        return prev + increment;
      });
    }, intervalMs);

    return () => {
      clearInterval(timer);
      clearTimeout(typingTimer);
      clearTimeout(typingEndTimer);
    };
  }, [isPlaying, currentChapter]);

  const jumpToChapter = (idx: number) => {
    setCurrentChapter(idx);
    setProgress(0);
    setIsTyping(false);
  };

  const handleCustomSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userCustomMessage.trim()) return;
    const text = userCustomMessage.trim();
    setUserCustomMessage('');

    setCustomReplies((prev) => [
      ...prev,
      { sender: 'user', text, time: '11:43 AM' },
    ]);

    setTimeout(() => {
      setCustomReplies((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: `জ্বি ম্যাম! "${text}" সম্পর্কে আমাদের স্টক আপডেট রয়েছে। আপনি অর্ডার কনফার্ম করতে চাইলে সাইজ ও ঠিকানা দিন 😊`,
          time: '11:43 AM',
        },
      ]);
    }, 900);
  };

  return (
    <div className="relative mx-auto flex w-full max-w-[480px] flex-col items-center select-none">
      {/* Ambient background glow ring */}
      <div className="pointer-events-none absolute -inset-4 rounded-[60px] bg-gradient-to-tr from-[#5B3DF5]/25 via-[#7C3AED]/15 to-transparent blur-2xl" />

      {/* =====================================================================
          1. REALISTIC SMARTPHONE CHASSIS (Deep Slate & Gunmetal Bezel)
         ===================================================================== */}
      <div
        className="relative w-full max-w-[340px] sm:max-w-[370px] rounded-[52px] p-2.5 sm:p-3 transition-all duration-300"
        style={{
          background: 'linear-gradient(145deg, #242938 0%, #151824 50%, #0D0F18 100%)',
          boxShadow:
            '0 0 0 1px rgba(255, 255, 255, 0.16) inset, 0 0 0 3px #181B26 inset, 0 0 0 4px #08090A inset, 0 35px 70px -15px rgba(0, 0, 0, 0.9), 0 20px 40px -10px rgba(91, 61, 245, 0.25)',
        }}
      >
        {/* Hardware Side Buttons */}
        <div className="absolute -left-[5px] top-24 h-9 w-[4px] rounded-l-xs bg-[#32374A]" />
        <div className="absolute -left-[5px] top-36 h-12 w-[4px] rounded-l-xs bg-[#32374A]" />
        <div className="absolute -left-[5px] top-52 h-12 w-[4px] rounded-l-xs bg-[#32374A]" />
        <div className="absolute -right-[5px] top-32 h-16 w-[4px] rounded-r-xs bg-[#32374A]" />

        {/* ===================================================================
            2. PHONE SCREEN INNER (Glass Display with Dynamic Island)
           =================================================================== */}
        <div className="relative flex h-[610px] sm:h-[630px] w-full flex-col overflow-hidden rounded-[42px] bg-[#0A0C16] text-white">
          {/* Top Dynamic Island Pill */}
          <div className="absolute top-2.5 left-1/2 z-40 flex h-5 w-24 -translate-x-1/2 items-center justify-between rounded-full bg-black px-2 shadow-inner">
            <div className="h-2 w-2 rounded-full bg-[#181B28] ring-1 ring-[#2E344A]/50" />
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <div className="h-2 w-2 rounded-full bg-[#0C1E3C] ring-1 ring-blue-500/40" />
            </div>
          </div>

          {/* Top iOS Status Bar */}
          <div className="relative z-30 flex h-10 shrink-0 items-center justify-between px-6 pt-1 text-[11px] font-semibold text-white/90">
            <span className="tracking-tight">11:42</span>
            <div className="flex items-center gap-1.5">
              {/* Cellular Signal */}
              <svg className="h-2.5 w-3.5 fill-current" viewBox="0 0 17 11">
                <rect x="0" y="8" width="2.5" height="3" rx="0.5" />
                <rect x="4" y="5.5" width="2.5" height="5.5" rx="0.5" />
                <rect x="8" y="3" width="2.5" height="8" rx="0.5" />
                <rect x="12" y="0.5" width="2.5" height="10.5" rx="0.5" />
              </svg>
              {/* Wifi */}
              <svg className="h-2.5 w-3 fill-current" viewBox="0 0 16 12">
                <path d="M8 9.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm-4.2-3a5.9 5.9 0 0 1 8.4 0 .8.8 0 0 1-.2 1.2.8.8 0 0 1-1.1-.1 4.3 4.3 0 0 0-6 0 .8.8 0 0 1-1.1.1.8.8 0 0 1-.2-1.2zm-2.8-2.8a9.9 9.9 0 0 1 14 0 .8.8 0 0 1-.2 1.2.8.8 0 0 1-1.1-.1 8.3 8.3 0 0 0-11.6 0 .8.8 0 0 1-1.1.1.8.8 0 0 1-.2-1.2z" />
              </svg>
              {/* Battery */}
              <div className="flex items-center gap-0.5">
                <div className="h-2.5 w-4.5 rounded-[3px] border border-white/80 p-[1px]">
                  <div className="h-full w-full rounded-[1px] bg-white" />
                </div>
                <div className="h-1 w-[1.5px] rounded-r-[0.5px] bg-white/80" />
              </div>
            </div>
          </div>

          {/* Social Messenger Chat Header */}
          <div className="relative z-20 flex shrink-0 items-center justify-between border-b border-white/10 bg-[#0E1120]/95 px-3 py-2 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Back" className="text-[#818CF8] hover:text-white transition">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="relative">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-[#5B3DF5] to-[#818CF8] font-bold text-xs text-white shadow-xs">
                  S
                </div>
                <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[#0A0C16]" />
              </div>
              <div className="leading-tight">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-white">StyleHub BD</span>
                  <CheckCircle2 className="h-3 w-3 text-[#5B3DF5] fill-white" />
                </div>
                <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Active now · AI Auto-Reply
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-slate-300">
              <span className="rounded-full bg-white/5 p-1.5 hover:bg-white/10 transition">
                <Phone className="h-3.5 w-3.5 text-slate-300" />
              </span>
              <span className="rounded-full bg-white/5 p-1.5 hover:bg-white/10 transition">
                <Video className="h-3.5 w-3.5 text-slate-300" />
              </span>
            </div>
          </div>

          {/* ===================================================================
              3. LIVE CONVERSATION STREAM (Sequential Dynamic Revealer)
             =================================================================== */}
          <div
            ref={chatScrollContainerRef}
            className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 text-xs scrollbar-thin scrollbar-thumb-white/10"
          >
            {/* Timestamp */}
            <div className="text-center">
              <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[9px] font-semibold text-slate-400">
                Today 11:42 AM · Messenger
              </span>
            </div>

            {/* STAGE 0: Salam & Greeting */}
            <div className="flex flex-col items-end space-y-0.5 animate-fadeIn">
              <div className="max-w-[82%] rounded-2xl rounded-br-xs bg-[#5B3DF5] px-3.5 py-2 text-white shadow-xs">
                Assalamualaikum
              </div>
              <span className="text-[9px] text-slate-500 pr-1">11:42 AM · Sent</span>
            </div>

            <div className="flex items-start gap-2 animate-fadeIn">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#5B3DF5] to-[#818CF8] text-[9px] font-bold">
                S
              </div>
              <div className="space-y-1 max-w-[85%]">
                <div className="rounded-2xl rounded-tl-xs border border-white/10 bg-[#16192B] px-3.5 py-2 text-slate-100 leading-relaxed shadow-xs">
                  ওয়ালাইকুম আসসালাম ম্যাম 😊 <br />
                  <strong className="text-white">StyleHub BD</strong>-তে আপনাকে স্বাগতম! <br />
                  আজ কী খুঁজছেন?
                </div>

                {/* Quick Selection Pills */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {['কুর্তি', 'থ্রি-পিস', 'শাড়ি', 'পাঞ্জাবি'].map((item, i) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => jumpToChapter(1)}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[10px] font-semibold transition shadow-2xs',
                        item === 'কুর্তি'
                          ? 'border border-[#5B3DF5]/50 bg-[#5B3DF5]/20 text-[#A78BFA] hover:bg-[#5B3DF5]/30'
                          : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
                      )}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* STAGE 1+: Customer selects Kurti & Catalog Drop-in */}
            {currentChapter >= 1 && (
              <>
                <div className="flex flex-col items-end space-y-0.5 animate-fadeIn">
                  <div className="max-w-[82%] rounded-2xl rounded-br-xs bg-[#5B3DF5] px-3.5 py-2 text-white shadow-xs">
                    কুর্তি
                  </div>
                  <span className="text-[9px] text-slate-500 pr-1">11:42 AM</span>
                </div>

                <div className="flex items-start gap-2 animate-fadeIn">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#5B3DF5] to-[#818CF8] text-[9px] font-bold">
                    S
                  </div>
                  <div className="space-y-1.5 max-w-[88%]">
                    <div className="rounded-2xl rounded-tl-xs border border-white/10 bg-[#16192B] px-3.5 py-2 text-slate-100">
                      জ্বি ম্যাম, নতুন কালেকশনের কুর্তিগুলো দেখুন 👇
                    </div>

                    {/* Product Card */}
                    <div className="rounded-xl border border-[#5B3DF5]/40 bg-[#131628] p-2.5 shadow-md space-y-2">
                      <div className="flex items-center gap-2.5">
                        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-[#2D1B69] to-[#171A2E] text-white">
                          <ShoppingBag className="h-6 w-6 text-[#A78BFA]" />
                          <span className="absolute bottom-0 right-0 rounded-tl bg-emerald-600 px-1 text-[8px] font-bold">
                            NEW
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-white">
                            Mint Chikankari Kurti
                          </p>
                          <p className="text-xs font-extrabold text-[#A78BFA]">
                            ৳১,৬৫০{' '}
                            <span className="text-[10px] line-through text-slate-500 font-normal">
                              ৳১,৯৫০
                            </span>
                          </p>
                          <p className="text-[10px] text-emerald-400 font-medium">
                            ✓ কোড: KT1087 · ইন স্টক
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => jumpToChapter(3)}
                          className="flex-1 rounded-lg bg-[#5B3DF5] py-1 text-[10px] font-bold text-white shadow-xs hover:bg-[#4C2EE0] transition"
                        >
                          এটি নিতে চাই
                        </button>
                        <button
                          type="button"
                          onClick={() => jumpToChapter(2)}
                          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-slate-300 hover:bg-white/10 transition"
                        >
                          বিস্তারিত
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* STAGE 2+: Customer sends photo or asks about color match */}
            {currentChapter >= 2 && (
              <>
                <div className="flex flex-col items-end space-y-0.5 animate-fadeIn">
                  <div className="rounded-xl rounded-br-xs border border-white/10 bg-[#1F2338] p-1.5 shadow-xs max-w-[70%]">
                    <div className="flex items-center gap-1.5 rounded-lg bg-[#0E1020] px-2 py-1 text-[10px] text-slate-300">
                      <ImageIcon className="h-3 w-3 text-[#818CF8]" />
                      <span>photo_kurti_mint.jpg</span>
                    </div>
                    <p className="mt-1 px-1 text-xs text-white">
                      eta ki apnader? ei color ta khujchi
                    </p>
                  </div>
                  <span className="text-[9px] text-slate-500 pr-1">11:42 AM</span>
                </div>

                <div className="flex items-start gap-2 animate-fadeIn">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#5B3DF5] to-[#818CF8] text-[9px] font-bold">
                    S
                  </div>
                  <div className="rounded-2xl rounded-tl-xs border border-white/10 bg-[#16192B] px-3.5 py-2 text-slate-100 max-w-[85%] leading-relaxed">
                    <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold mb-1">
                      <Sparkles className="h-3 w-3 text-emerald-400" />
                      <span>Vision AI: Mint Chikankari (KT1087) ৯৯.২% মিলেছে</span>
                    </div>
                    জ্বি ম্যাম! এটা আমাদের অরিজিনাল মিন্ট চিকেনকারি কুর্তি 😊 ১০০% পিওর কটন ফেব্রিক।
                  </div>
                </div>
              </>
            )}

            {/* STAGE 3+: Size Selection & Stock Check */}
            {currentChapter >= 3 && (
              <>
                <div className="flex items-start gap-2 animate-fadeIn">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#5B3DF5] to-[#818CF8] text-[9px] font-bold">
                    S
                  </div>
                  <div className="rounded-2xl rounded-tl-xs border border-white/10 bg-[#16192B] px-3.5 py-2 text-slate-100 max-w-[85%] leading-relaxed space-y-1">
                    <p>📏 কোন সাইজটি নেবেন? স্টকে M, L, XL সাইজ রয়েছে।</p>
                    <div className="flex gap-1.5 pt-1">
                      {['M', 'L', 'XL'].map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setSelectedProductSize(size)}
                          className={cn(
                            'h-6 w-8 rounded-md text-[10px] font-bold transition',
                            selectedProductSize === size
                              ? 'bg-[#5B3DF5] text-white ring-1 ring-white/40'
                              : 'bg-white/10 text-slate-300 hover:bg-white/20',
                          )}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end space-y-0.5 animate-fadeIn">
                  <div className="max-w-[82%] rounded-2xl rounded-br-xs bg-[#5B3DF5] px-3.5 py-2 text-white shadow-xs">
                    L e bust koto?
                  </div>
                  <span className="text-[9px] text-slate-500 pr-1">11:43 AM</span>
                </div>

                <div className="flex items-start gap-2 animate-fadeIn">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#5B3DF5] to-[#818CF8] text-[9px] font-bold">
                    S
                  </div>
                  <div className="rounded-2xl rounded-tl-xs border border-white/10 bg-[#16192B] px-3.5 py-2 text-slate-100 max-w-[85%] leading-relaxed">
                    জ্বি ম্যাম, L সাইজে বুক ৪০ ইঞ্চি, লম্বা ৪৪ ইঞ্চি 📏 <br />
                    ✅ <strong className="text-white">L সাইজ</strong> এখন স্টকে আছে।
                    আপনার জন্য L-টাই বুক করব?
                  </div>
                </div>
              </>
            )}

            {/* STAGE 4+: Address & Phone Delivery Details */}
            {currentChapter >= 4 && (
              <>
                <div className="flex flex-col items-end space-y-0.5 animate-fadeIn">
                  <div className="max-w-[85%] rounded-2xl rounded-br-xs bg-[#5B3DF5] px-3.5 py-2 text-white shadow-xs leading-relaxed">
                    ha L rakhun. Sarah Ahmed, 01712-345678, House 12, Road 4, Dhanmondi, Dhaka. Cash on delivery hobe?
                  </div>
                  <span className="text-[9px] text-slate-500 pr-1">11:43 AM</span>
                </div>

                <div className="flex items-start gap-2 animate-fadeIn">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#5B3DF5] to-[#818CF8] text-[9px] font-bold">
                    S
                  </div>
                  <div className="rounded-2xl rounded-tl-xs border border-white/10 bg-[#16192B] px-3.5 py-2 text-slate-100 max-w-[85%] leading-relaxed">
                    জ্বি ম্যাম! ঢাকার ভেতরে ক্যাশ অন ডেলিভারি একদম সহজ 🚚 আপনার অর্ডারটি এখনই কনফার্ম করছি...
                  </div>
                </div>
              </>
            )}

            {/* STAGE 5+: Confirmed Order Receipt Voucher */}
            {currentChapter >= 5 && (
              <div className="rounded-2xl border border-emerald-500/40 bg-[#0E1524] p-3 shadow-lg space-y-2 animate-scaleIn">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-black">
                      <Check className="h-3 w-3 stroke-[3]" />
                    </span>
                    <span className="text-xs font-bold text-white">অর্ডার #22961 কনফার্মড!</span>
                  </div>
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[9px] font-bold text-emerald-400">
                    COD Accepted
                  </span>
                </div>

                <div className="space-y-1 text-[11px] text-slate-300">
                  <div className="flex justify-between">
                    <span>প্রোডাক্ট:</span>
                    <span className="font-semibold text-white">
                      Mint Chikankari (Size {selectedProductSize})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>কাস্টমার:</span>
                    <span className="text-slate-200">Sarah Ahmed (01712-345678)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ঠিকানা:</span>
                    <span className="text-slate-200 truncate max-w-[170px]">
                      Dhanmondi, Dhaka
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-white/8 pt-1 text-xs font-bold text-white">
                    <span>মোট প্রদেয়:</span>
                    <span className="text-[#818CF8]">৳১,৭২০ (ডেলিভারি ৳৭০ সহ)</span>
                  </div>
                </div>

                <div className="rounded-lg bg-white/5 p-2 text-[10px] text-slate-400 flex items-center justify-between">
                  <span>Merchant bKash: 01800-000000</span>
                  <span className="text-emerald-400 font-semibold">অথবা ক্যাশ অন ডেলিভারি</span>
                </div>
              </div>
            )}

            {/* STAGE 6+: Courier Handover & Steadfast Consignment */}
            {currentChapter >= 6 && (
              <div className="rounded-xl border border-[#5B3DF5]/30 bg-[#13162C] p-3 space-y-2 animate-scaleIn">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Truck className="h-4 w-4 text-[#818CF8]" />
                    <span className="text-xs font-bold text-white">
                      Steadfast Courier Integration
                    </span>
                  </div>
                  <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[9px] font-bold text-blue-300">
                    পার্সেল হস্তান্তর
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 space-y-0.5">
                  <p>
                    ট্র্যাকিং আইডি:{' '}
                    <strong className="font-mono text-[#818CF8]">ST-902418-BD</strong>
                  </p>
                  <p className="text-[10px] text-slate-400">
                    রাইডার পার্সেল সংগ্রহ করেছে। সাধারণত ২৪ ঘণ্টার মধ্যে ডেলিভারি সম্পন্ন হয়।
                  </p>
                </div>
                <button
                  type="button"
                  className="w-full flex items-center justify-center gap-1 rounded-lg bg-white/10 py-1 text-[10px] font-bold text-slate-200 hover:bg-white/20 transition"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span>লাইভ ট্র্যাকিং দেখুন</span>
                </button>
              </div>
            )}

            {/* STAGE 7: Delivery & 5-Star Review */}
            {currentChapter >= 7 && (
              <>
                <div className="flex flex-col items-end space-y-0.5 animate-fadeIn">
                  <div className="max-w-[85%] rounded-2xl rounded-br-xs bg-[#5B3DF5] px-3.5 py-2 text-white shadow-xs leading-relaxed">
                    Kurti ta onnorokom sundor hoise 😍 5-star review dilam! Color &amp; fitting ekdom perfect.
                  </div>
                  <span className="text-[9px] text-slate-500 pr-1">Next Day 3:40 PM</span>
                </div>

                <div className="rounded-xl border border-amber-500/30 bg-[#1E1910] p-2.5 flex items-center justify-between animate-scaleIn">
                  <div className="flex items-center gap-1.5">
                    <div className="flex text-amber-400">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="h-3.5 w-3.5 fill-current" />
                      ))}
                    </div>
                    <span className="text-xs font-bold text-white">5.0 Star Verified Review</span>
                  </div>
                  <span className="rounded bg-amber-400/20 px-2 py-0.5 text-[9px] font-bold text-amber-300">
                    Saved to Store
                  </span>
                </div>

                <div className="flex items-start gap-2 animate-fadeIn">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#5B3DF5] to-[#818CF8] text-[9px] font-bold">
                    S
                  </div>
                  <div className="rounded-2xl rounded-tl-xs border border-white/10 bg-[#16192B] px-3.5 py-2 text-slate-100 max-w-[85%] leading-relaxed">
                    শুনে খুব ভালো লাগল ম্যাম 🥰 আপনার ৫-স্টার রিভিউ আমাদের জন্য অনেক অনুপ্রেরণা! আবার আসবেন।
                  </div>
                </div>
              </>
            )}

            {/* Interactive User Injected Replies */}
            {customReplies.map((r, i) => (
              <div
                key={i}
                className={cn(
                  'flex flex-col space-y-0.5 animate-fadeIn',
                  r.sender === 'user' ? 'items-end' : 'items-start',
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3.5 py-2 text-xs shadow-xs',
                    r.sender === 'user'
                      ? 'rounded-br-xs bg-[#5B3DF5] text-white'
                      : 'rounded-tl-xs border border-white/10 bg-[#16192B] text-slate-100',
                  )}
                >
                  {r.text}
                </div>
                <span className="text-[9px] text-slate-500 px-1">{r.time}</span>
              </div>
            ))}

            {/* Live Typing Indicator */}
            {isTyping && (
              <div className="flex items-center gap-2 animate-fadeIn">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#5B3DF5]/30 text-[9px] text-white">
                  S
                </div>
                <div className="flex items-center gap-1 rounded-2xl rounded-tl-xs border border-white/10 bg-[#16192B] px-3.5 py-2.5 shadow-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#818CF8] animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-[#818CF8] animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-[#818CF8] animate-bounce" />
                </div>
              </div>
            )}


          </div>

          {/* Social Messenger Bottom Input Tray */}
          <div className="relative z-20 border-t border-white/10 bg-[#0E1120] p-2">
            <form onSubmit={handleCustomSend} className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 text-slate-400">
                <button type="button" aria-label="Add image" className="rounded-lg p-1 hover:text-white transition">
                  <ImageIcon className="h-4 w-4" />
                </button>
                <button type="button" aria-label="Voice note" className="rounded-lg p-1 hover:text-white transition">
                  <Mic className="h-4 w-4" />
                </button>
              </div>

              <div className="relative flex-1">
                <input
                  type="text"
                  value={userCustomMessage}
                  onChange={(e) => setUserCustomMessage(e.target.value)}
                  placeholder="পরীক্ষামূলক বার্তা লিখুন..."
                  className="w-full rounded-full border border-white/10 bg-[#16192B] px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-[#5B3DF5] focus:outline-none"
                />
                <button
                  type="button"
                  aria-label="Add emoji"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <Smile className="h-3.5 w-3.5" />
                </button>
              </div>

              <button
                type="submit"
                aria-label="Send message"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-[#5B3DF5] text-white shadow-xs hover:bg-[#4C2EE0] transition"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>

            {/* Bottom iOS Home Screen Indicator Bar */}
            <div className="mx-auto mt-2 h-1 w-28 rounded-full bg-white/30" />
          </div>
        </div>
      </div>

      {/* =====================================================================
          4. INTERACTIVE CHAPTER TIMELINE CONTROLLER & AUDIO PLAYBAR
         ===================================================================== */}
      <div className="mt-5 w-full space-y-3">
        {/* Live Status Caption and Play/Pause */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#0D101E]/90 px-3.5 py-2 text-xs shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-slate-300 font-medium">
              চলছে: <strong className="text-white">{CHAPTERS[currentChapter].title}</strong>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="rounded-md bg-[#5B3DF5]/20 border border-[#5B3DF5]/30 px-2 py-0.5 text-[10px] font-bold text-[#A78BFA]">
              {CHAPTERS[currentChapter].statusBadge}
            </span>

            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-white/10 transition"
              aria-label={isPlaying ? 'Pause simulation' : 'Play simulation'}
            >
              {isPlaying ? (
                <>
                  <Pause className="h-3 w-3 text-[#A78BFA]" />
                  <span>থামান</span>
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 text-emerald-400" />
                  <span>চালান</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => jumpToChapter(0)}
              className="rounded-lg border border-white/10 bg-white/5 p-1 text-slate-300 hover:bg-white/10 transition"
              aria-label="Restart simulation"
              title="শুরু থেকে দেখুন"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* 8-Step Interactive Progress Timeline Rail */}
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
          {CHAPTERS.map((ch, idx) => {
            const isActive = currentChapter === idx;
            const isPassed = currentChapter > idx;

            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => jumpToChapter(idx)}
                className={cn(
                  'group relative flex flex-col items-center justify-center rounded-xl p-2 text-center transition-all',
                  isActive
                    ? 'border border-[#5B3DF5] bg-[#1A1D36] shadow-md shadow-[#5B3DF5]/20'
                    : isPassed
                    ? 'border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
                    : 'border border-white/5 bg-transparent text-slate-500 hover:bg-white/[0.02]',
                )}
              >
                <span
                  className={cn(
                    'text-[11px] font-bold tracking-tight',
                    isActive ? 'text-white' : isPassed ? 'text-slate-300' : 'text-slate-500',
                  )}
                >
                  {ch.labelBn}
                </span>
                <span className="text-[9px] text-slate-400">{ch.labelEn}</span>

                {/* Step Progress Micro-Bar */}
                <div className="mt-1.5 h-[2px] w-full rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-all duration-75',
                      isActive
                        ? 'bg-gradient-to-r from-[#5B3DF5] to-[#818CF8]'
                        : isPassed
                        ? 'bg-emerald-500'
                        : 'bg-transparent',
                    )}
                    style={{
                      width: isActive ? `${progress}%` : isPassed ? '100%' : '0%',
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
