'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useBrand } from '@/components/brand-provider';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

type SceneMeta = {
  id: number;
  label: string;
  eyebrow: string;
  caption: string;
  accent: string;
};

const SCENES: SceneMeta[] = [
  { id: 1, label: 'Customer message', eyebrow: '01 · Messenger', caption: 'Customer asks about your product on Messenger', accent: '#818CF8' },
  { id: 2, label: 'AI product card', eyebrow: '02 · AI Reply', caption: 'AI agent instantly replies with a rich product card', accent: '#A78BFA' },
  { id: 3, label: 'In-chat checkout', eyebrow: '03 · Checkout', caption: 'Customer fills the checkout sheet without leaving the chat', accent: '#C084FC' },
  { id: 4, label: 'Order dashboard', eyebrow: '04 · Dashboard', caption: 'New order appears in your dashboard instantly', accent: '#5B3DF5' },
  { id: 5, label: 'Courier booked', eyebrow: '05 · Logistics', caption: 'Courier is auto-booked and a consignment ID is generated', accent: '#38BDF8' },
  { id: 6, label: 'Delivery DM', eyebrow: '06 · Delivery', caption: 'Customer gets an out-for-delivery DM, then a delivered confirmation', accent: '#34D399' },
];

const SCENE_DURATION_MS = 3500;

// ---------------------------------------------------------------------------
// Scene visual renders
// ---------------------------------------------------------------------------

function SceneMessengerInquiry() {
  return (
    <div className="flex flex-col gap-3">
      {/* Incoming customer message */}
      <div className="flex items-end gap-2">
        <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-violet-400 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">R</div>
        <div className="max-w-[76%] rounded-2xl rounded-bl-sm bg-white/8 border border-white/10 px-3.5 py-2.5 text-sm text-slate-100 shadow-md">
          নীল পাঞ্জাবিটা কি L সাইজে পাওয়া যাবে? 🙏
          <span className="block text-[10px] text-slate-400 mt-1">10:32 AM</span>
        </div>
      </div>

      {/* Typing indicator */}
      <div className="flex items-end gap-2 self-end">
        <div className="max-w-[76%] rounded-2xl rounded-br-sm bg-[#5B3DF5]/25 border border-[#5B3DF5]/30 px-4 py-2.5 shadow-md">
          <span className="inline-flex gap-1 items-center">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:300ms]" />
          </span>
        </div>
        <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-[#5B3DF5] to-violet-700 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" />
            <path d="M8 9h8M8 12h5" />
          </svg>
        </div>
      </div>

      {/* Footer bar label */}
      <div className="flex items-center gap-1.5 rounded-xl bg-white/4 border border-white/8 px-3 py-2 mt-1">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        <span className="text-[11px] text-slate-400">Messenger · AI agent listening…</span>
      </div>
    </div>
  );
}

function SceneProductCard() {
  return (
    <div className="flex flex-col gap-2.5">
      {/* Customer message (faded) */}
      <div className="flex items-end gap-2 opacity-50">
        <div className="h-6 w-6 shrink-0 rounded-full bg-gradient-to-br from-violet-400 to-indigo-600" />
        <div className="rounded-2xl rounded-bl-sm bg-white/6 border border-white/8 px-3 py-2 text-xs text-slate-300">
          নীল পাঞ্জাবিটা কি L সাইজে পাওয়া যাবে? 🙏
        </div>
      </div>

      {/* AI product card reply */}
      <div className="self-end max-w-[88%]">
        <div className="rounded-2xl rounded-br-sm overflow-hidden border border-[#5B3DF5]/40 shadow-lg shadow-[#5B3DF5]/10">
          {/* Product image placeholder */}
          <div className="h-28 bg-gradient-to-br from-[#5B3DF5]/40 via-indigo-700/30 to-violet-800/40 flex items-center justify-center relative">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="1.5" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <span className="absolute top-2 left-2 rounded-full bg-[#5B3DF5]/80 px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wide">In Stock ✓</span>
          </div>
          {/* Product details */}
          <div className="bg-[#0E1122]/90 px-3.5 py-3 space-y-2">
            <p className="text-sm font-semibold text-white">নীল পাঞ্জাবি (Blue Panjabi)</p>
            <p className="text-xl font-bold text-[#A78BFA]">৳ 1,450</p>
            <div className="flex gap-1.5 flex-wrap">
              {['S', 'M', 'L', 'XL'].map((s) => (
                <span key={s} className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${s === 'L' ? 'border-[#5B3DF5] bg-[#5B3DF5]/20 text-violet-300' : 'border-white/15 text-slate-400'}`}>{s}</span>
              ))}
            </div>
            <button className="w-full rounded-lg bg-gradient-to-r from-[#5B3DF5] to-violet-600 py-1.5 text-xs font-semibold text-white shadow shadow-[#5B3DF5]/30">
              Order now →
            </button>
          </div>
        </div>
        <span className="ml-auto mt-1 block text-right text-[10px] text-slate-500">AI agent · 10:32 AM</span>
      </div>
    </div>
  );
}

function SceneCheckout() {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0C0D1A]/80 backdrop-blur-sm overflow-hidden shadow-xl">
      <div className="bg-gradient-to-r from-[#5B3DF5]/30 to-violet-700/20 border-b border-white/10 px-4 py-3 flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2.2" strokeLinecap="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
        <span className="text-sm font-semibold text-white">Checkout</span>
        <span className="ml-auto text-[11px] text-slate-400">নীল পাঞ্জাবি · L</span>
      </div>
      <div className="px-4 py-3 space-y-2.5">
        {[
          { label: 'Name', value: 'Rahim Uddin', icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
          { label: 'Phone', value: '01712-345678', icon: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 13 19.79 19.79 0 0 1 1.05 4.18 2 2 0 0 1 3.05 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 17z' },
          { label: 'Address', value: 'Mirpur 10, Dhaka 1216', icon: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z' },
        ].map(({ label, value, icon }) => (
          <div key={label} className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/8 px-3 py-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round"><path d={icon} /></svg>
            <span className="text-[11px] text-slate-400 w-12 shrink-0">{label}</span>
            <span className="text-[11px] text-slate-200 truncate">{value}</span>
          </div>
        ))}
        {/* Delivery select */}
        <div className="flex gap-2 mt-1">
          {['Inside Dhaka · ৳60', 'Outside · ৳120'].map((opt, i) => (
            <div key={opt} className={`flex-1 rounded-lg border px-2 py-1.5 text-center text-[10px] font-semibold ${i === 0 ? 'border-[#5B3DF5] bg-[#5B3DF5]/15 text-violet-300' : 'border-white/10 text-slate-400'}`}>{opt}</div>
          ))}
        </div>
        {/* Total + confirm */}
        <div className="flex items-center justify-between rounded-lg bg-[#5B3DF5]/10 border border-[#5B3DF5]/25 px-3 py-2 mt-1">
          <span className="text-xs text-slate-300">Total</span>
          <span className="text-base font-bold text-[#A78BFA]">৳ 1,510</span>
        </div>
        <button className="w-full rounded-xl bg-gradient-to-r from-[#5B3DF5] to-violet-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#5B3DF5]/30">
          ✓ Confirm Order
        </button>
      </div>
    </div>
  );
}

function SceneDashboard() {
  const [status, setStatus] = useState<'Pending' | 'Confirmed'>('Pending');

  useEffect(() => {
    const t = setTimeout(() => setStatus('Confirmed'), 1400);
    return () => clearTimeout(t);
  }, []);

  const orders = [
    { id: '#8821', name: 'Rahim Uddin', product: 'নীল পাঞ্জাবি · L', price: '৳ 1,510', current: true },
    { id: '#8820', name: 'Karim Ahmed', product: 'White Kurta · M', price: '৳ 950', current: false },
    { id: '#8819', name: 'Nadia Islam', product: 'Red Saree · Free', price: '৳ 2,200', current: false },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0C0D1A]/80 backdrop-blur-sm overflow-hidden shadow-xl">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 bg-white/[0.03]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
        <span className="text-sm font-semibold text-white">Orders</span>
        <div className="ml-auto flex gap-1.5">
          {['All', 'Pending', 'Confirmed'].map((f) => (
            <span key={f} className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${f === 'All' ? 'bg-[#5B3DF5]/20 text-violet-300' : 'text-slate-500'}`}>{f}</span>
          ))}
        </div>
      </div>
      <div className="divide-y divide-white/5">
        {orders.map((o) => (
          <div key={o.id} className={`flex items-center gap-3 px-4 py-2.5 ${o.current ? 'bg-[#5B3DF5]/8' : ''} transition-colors duration-700`}>
            <span className="text-[11px] font-mono text-slate-400 w-12 shrink-0">{o.id}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate">{o.name}</p>
              <p className="text-[10px] text-slate-500 truncate">{o.product}</p>
            </div>
            <span className="text-xs font-semibold text-slate-300 shrink-0">{o.price}</span>
            {o.current ? (
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold transition-all duration-700 ${
                  status === 'Pending'
                    ? 'bg-amber-400/15 text-amber-300 border border-amber-400/25'
                    : 'bg-emerald-400/15 text-emerald-300 border border-emerald-400/25'
                }`}
              >
                {status}
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-400/15">Confirmed</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SceneCourierBooked() {
  return (
    <div className="flex flex-col gap-3">
      {/* Courier card */}
      <div className="rounded-2xl border border-[#38BDF8]/25 bg-[#0C0D1A]/80 backdrop-blur-sm overflow-hidden shadow-xl shadow-sky-900/20">
        <div className="flex items-center gap-2.5 border-b border-white/10 bg-sky-500/8 px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round"><rect x="1" y="3" width="15" height="13" /><path d="m16 8 5 0 3 5v3h-8V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>
          <span className="text-sm font-semibold text-white">Courier Booked</span>
          <span className="ml-auto h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50 animate-pulse" />
        </div>
        <div className="px-4 py-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Provider</span>
            <span className="text-xs font-semibold text-sky-300">SteadFast Courier</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Consignment ID</span>
            <span className="font-mono text-xs font-bold text-white tracking-wider">SFC-2024-88210</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Recipient</span>
            <span className="text-xs text-slate-200">Rahim Uddin · Mirpur 10</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">COD Amount</span>
            <span className="text-xs font-bold text-[#A78BFA]">৳ 1,510</span>
          </div>
          <div className="h-px bg-white/8" />
          <div className="flex items-center gap-2 rounded-lg bg-emerald-400/8 border border-emerald-400/15 px-3 py-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>
            <span className="text-[11px] text-emerald-300 font-medium">Pickup scheduled for today</span>
          </div>
        </div>
      </div>
      {/* Tracking URL */}
      <div className="flex items-center gap-2 rounded-xl bg-white/4 border border-white/8 px-3 py-2">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10A15.3 15.3 0 0 1 8 12 15.3 15.3 0 0 1 12 2z" /></svg>
        <span className="text-[11px] text-slate-400">track.steadfast.com/SFC-2024-88210</span>
      </div>
    </div>
  );
}

function SceneDelivery() {
  const [phase, setPhase] = useState<0 | 1>(0);

  useEffect(() => {
    const t = setTimeout(() => setPhase(1), 1600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {/* First DM: out for delivery */}
      <div className="flex items-start gap-2">
        <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-[#5B3DF5] to-violet-700 flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" /><path d="M8 9h8M8 12h5" /></svg>
        </div>
        <div className="rounded-2xl rounded-tl-sm bg-white/8 border border-white/10 px-3.5 py-2.5 text-sm text-slate-100 shadow-md max-w-[88%]">
          📦 আপনার অর্ডার (#8821) এখন ডেলিভারি দেওয়া হচ্ছে! আজকেই পাবেন ইনশাল্লাহ।
          <span className="block text-[10px] text-slate-400 mt-1">AI agent · 11:15 AM</span>
        </div>
      </div>

      {/* Second DM: delivered — fades in */}
      <div
        className="flex items-start gap-2 transition-all duration-700"
        style={{ opacity: phase === 1 ? 1 : 0, transform: phase === 1 ? 'translateY(0)' : 'translateY(8px)' }}
      >
        <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-[#5B3DF5] to-violet-700 flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" /><path d="M8 9h8M8 12h5" /></svg>
        </div>
        <div className="rounded-2xl rounded-tl-sm bg-emerald-400/10 border border-emerald-400/20 px-3.5 py-2.5 text-sm text-slate-100 shadow-md max-w-[88%]">
          ✅ ডেলিভারি সম্পন্ন! ধন্যবাদ আপনার ক্রয়ের জন্য। আবার আসবেন 🎉
          <span className="block text-[10px] text-emerald-400 mt-1">Delivered · 2:48 PM</span>
        </div>
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-2 rounded-xl bg-emerald-400/8 border border-emerald-400/15 px-3 py-2 mt-1">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>
        <span className="text-[11px] text-emerald-300 font-medium">Order complete · Full cycle in 4h 16m</span>
      </div>
    </div>
  );
}

const SCENE_COMPONENTS = [
  SceneMessengerInquiry,
  SceneProductCard,
  SceneCheckout,
  SceneDashboard,
  SceneCourierBooked,
  SceneDelivery,
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function HeroWorkflowShowcase() {
  const { companyName } = useBrand();
  const [activeScene, setActiveScene] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  const sectionRef = useRef<HTMLElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userPausedRef = useRef(false);

  const scene = SCENES[activeScene];
  const SceneComp = SCENE_COMPONENTS[activeScene];

  // Detect prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // IntersectionObserver — pause when off-screen
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Page visibility API — pause when tab hidden
  useEffect(() => {
    const handler = () => setIsVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  const goToScene = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(SCENES.length - 1, index));
    setActiveScene(clamped);
    setProgress(0);
  }, []);

  const handleUserGoTo = useCallback((index: number) => {
    userPausedRef.current = true;
    setIsPlaying(false);
    goToScene(index);
  }, [goToScene]);

  // Clear timers helper
  const clearTimers = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (progressRef.current) clearInterval(progressRef.current);
    intervalRef.current = null;
    progressRef.current = null;
  }, []);

  // Autoplay engine
  useEffect(() => {
    clearTimers();
    if (reducedMotion || !isPlaying || !isVisible) {
      if (!isPlaying || !isVisible) setProgress(0);
      return;
    }

    const tickMs = 50;
    const steps = SCENE_DURATION_MS / tickMs;

    progressRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) return 100;
        return p + 100 / steps;
      });
    }, tickMs);

    intervalRef.current = setInterval(() => {
      setActiveScene((s) => (s + 1) % SCENES.length);
      setProgress(0);
    }, SCENE_DURATION_MS);

    return clearTimers;
  }, [isPlaying, isVisible, reducedMotion, activeScene, clearTimers]);

  // Reset progress on scene change
  useEffect(() => {
    setProgress(0);
  }, [activeScene]);

  // Global keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); handleUserGoTo(activeScene + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); handleUserGoTo(activeScene - 1); }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); userPausedRef.current = !isPlaying; setIsPlaying((p) => !p); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeScene, handleUserGoTo, isPlaying]);

  const shouldAnimate = !reducedMotion;
  const autoplayActive = isPlaying && !reducedMotion && isVisible;

  return (
    <section
      ref={sectionRef}
      role="region"
      aria-label={`${companyName} workflow showcase`}
      data-testid="hero-showcase"
      data-scene={activeScene + 1}
      className="w-full max-w-2xl mx-auto select-none"
    >
      {/* Main showcase panel */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0C0D1A]/70 shadow-2xl shadow-[#5B3DF5]/10 backdrop-blur-2xl">
        {/* Ambient glow behind active scene */}
        <div
          className="pointer-events-none absolute inset-0 -z-10 transition-all duration-700"
          style={{ background: `radial-gradient(ellipse 60% 40% at 50% 0%, ${scene.accent}18, transparent 70%)` }}
        />

        {/* Scene progress bar */}
        <div className="h-[2px] w-full bg-white/5">
          <div
            className="h-full origin-left"
            style={{
              width: `${autoplayActive ? progress : 0}%`,
              backgroundColor: scene.accent,
              transition: shouldAnimate && autoplayActive ? 'width 50ms linear, background-color 700ms ease' : 'background-color 700ms ease',
            }}
          />
        </div>

        {/* Scene header */}
        <div className="flex items-center gap-3 border-b border-white/8 px-5 py-3.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: scene.accent }}>
            {scene.eyebrow}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            {/* Browser-chrome dots */}
            <span className="h-2 w-2 rounded-full bg-white/15" />
            <span className="h-2 w-2 rounded-full bg-white/10" />
            <span className="h-2 w-2 rounded-full bg-white/8" />
          </span>
        </div>

        {/* Scene content */}
        <div
          className="min-h-[280px] sm:min-h-[300px] p-5"
          style={{ transition: shouldAnimate ? 'opacity 300ms ease' : undefined }}
        >
          <SceneComp key={activeScene} />
        </div>

        {/* Caption + controls */}
        <div className="flex flex-col gap-3 border-t border-white/8 bg-white/[0.02] px-5 py-4">
          <p aria-live="polite" aria-atomic="true" className="text-sm text-slate-300 leading-snug">
            {scene.caption}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { userPausedRef.current = !isPlaying; setIsPlaying((p) => !p); }}
              aria-label={isPlaying && !reducedMotion ? 'Pause autoplay' : 'Play autoplay'}
              aria-pressed={isPlaying && !reducedMotion}
              className={`rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-violet-400 ${shouldAnimate ? 'transition' : ''}`}
            >
              {isPlaying && !reducedMotion ? '⏸ Pause' : '▶ Play'}
            </button>
            <button
              type="button"
              onClick={() => handleUserGoTo(activeScene - 1)}
              aria-label="Previous scene"
              disabled={activeScene === 0}
              className={`rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-30 ${shouldAnimate ? 'transition' : ''}`}
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={() => handleUserGoTo(activeScene + 1)}
              aria-label="Next scene"
              disabled={activeScene === SCENES.length - 1}
              className={`rounded-xl bg-[#5B3DF5] px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:opacity-30 ${shouldAnimate ? 'transition' : ''}`}
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* Step rail — horizontally scrollable on mobile */}
      <div
        role="tablist"
        aria-label="Workflow scenes"
        className="mt-4 flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-6 sm:overflow-visible scrollbar-none"
      >
        {SCENES.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={activeScene === index}
            aria-label={`Scene ${item.id}: ${item.label}`}
            aria-controls="showcase-scene-panel"
            tabIndex={activeScene === index ? 0 : -1}
            data-testid={`showcase-step-${item.id}`}
            onClick={() => handleUserGoTo(index)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') { e.preventDefault(); handleUserGoTo(index + 1); }
              if (e.key === 'ArrowLeft') { e.preventDefault(); handleUserGoTo(index - 1); }
            }}
            className={`shrink-0 w-[calc(100%/3.4)] sm:w-auto rounded-xl border px-2 py-2.5 text-left focus:outline-none focus:ring-2 focus:ring-violet-400 ${shouldAnimate ? 'transition' : ''} hover:border-white/25`}
            style={
              activeScene === index
                ? { borderColor: item.accent, backgroundColor: `${item.accent}14` }
                : { borderColor: 'rgba(255,255,255,0.08)' }
            }
          >
            <span className="block text-[9px] font-bold uppercase tracking-widest" style={{ color: activeScene === index ? item.accent : '#64748b' }}>
              {String(item.id).padStart(2, '0')}
            </span>
            <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-300">{item.label}</span>
          </button>
        ))}
      </div>

      {/* SR-only live region */}
      <p className="sr-only" aria-live="polite">
        Scene {activeScene + 1} of {SCENES.length}: {scene.label}. {scene.caption}.{' '}
        {autoplayActive ? 'Autoplay active.' : 'Autoplay paused.'}
      </p>
    </section>
  );
}
