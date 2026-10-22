'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bot,
  Box,
  Check,
  CreditCard,
  LayoutDashboard,
  MessageCircle,
  Package,
  Send,
  Truck,
} from 'lucide-react';
import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
  useInView,
  useReducedMotion,
} from 'motion/react';
import { SectionHeading } from '@/components/marketing/primitives';
import { cn } from '@/lib/utils';

const STEP_MS = 3500;

const STEPS = [
  {
    id: 'reply',
    short: 'Replies',
    title: 'Messenger AI replies',
    copy: 'Answers price, size and stock questions in seconds, in your shop’s tone — and hands off when it matters.',
    icon: Bot,
  },
  {
    id: 'checkout',
    short: 'Checkout',
    title: 'Checkout inside the chat',
    copy: 'Customers confirm the cart, address and payment without leaving Messenger.',
    icon: CreditCard,
  },
  {
    id: 'dashboard',
    short: 'Dashboard',
    title: 'One orders dashboard',
    copy: 'Every chat order lands in a single board with status, notes and totals.',
    icon: LayoutDashboard,
  },
  {
    id: 'courier',
    short: 'Courier',
    title: 'Courier tracking, auto-shared',
    copy: 'Book the courier in one tap; tracking updates are sent back to the buyer’s chat.',
    icon: Truck,
  },
] as const;

export function HomeBento() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const inView = useInView(sectionRef, { amount: 0.25 });
  const reduceMotion = useReducedMotion();
  const reduced = reduceMotion === true;
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (reduced || !inView) return;
    const timer = window.setTimeout(() => {
      setActive((current) => (current + 1) % STEPS.length);
    }, STEP_MS);
    return () => window.clearTimeout(timer);
  }, [active, inView, reduced]);

  const progress = active / (STEPS.length - 1);
  const ActiveIcon = STEPS[active].icon;

  return (
    <section ref={sectionRef} id="features" className="relative py-16 text-white lg:py-28">
      <LazyMotion features={domAnimation}>
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Conversational commerce"
            icon={<MessageCircle className="h-3.5 w-3.5" />}
            title="From first message"
            gradient="to delivered order."
            copy="Everything a chat-first store needs, in one place."
          />

          <div id="how-it-works" className="mt-12 lg:mt-14">
            <div className="lg:hidden">
              <div className="relative mb-4">
                <div
                  aria-hidden
                  className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-4 h-px -translate-y-1/2 bg-white/10"
                >
                  <m.div
                    className="h-full origin-left bg-gradient-to-r from-[#5B3DF5] to-[#A78BFA]"
                    animate={{ scaleX: progress }}
                    transition={reduced ? { duration: 0 } : { duration: 0.45, ease: 'easeOut' }}
                  />
                </div>
                <div className="relative grid grid-cols-4 gap-1">
                  {STEPS.map((step, index) => {
                    const Icon = step.icon;
                    const isActive = index === active;
                    const isDone = index < active;
                    return (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => setActive(index)}
                        aria-pressed={isActive}
                        aria-label={`Show step ${index + 1}: ${step.title}`}
                        className={cn(
                          'flex min-w-0 flex-col items-center gap-1.5 rounded-xl px-1 py-1 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B3DF5]',
                          isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200',
                        )}
                      >
                        <span
                          className={cn(
                            'grid h-8 w-8 place-items-center rounded-full border transition-colors',
                            isDone
                              ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300'
                              : isActive
                                ? 'border-[#5B3DF5] bg-[#5B3DF5] text-white shadow-[0_0_18px_-2px_rgba(91,61,245,0.8)]'
                                : 'border-white/15 bg-[#0B0D18] text-slate-500',
                          )}
                        >
                          {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                        </span>
                        <span className="w-full truncate text-[10px] font-semibold tracking-wide">
                          {step.short}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="mb-4 text-center text-[11px] text-slate-500">
                Tap a step to preview it
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[350px_minmax(0,1fr)] lg:items-start xl:grid-cols-[380px_minmax(0,1fr)] xl:gap-8">
              <ol className="relative hidden flex-col gap-3 pl-9 lg:flex">
                <div
                  aria-hidden
                  className="pointer-events-none absolute bottom-7 left-[11px] top-7 w-px bg-white/10"
                >
                  <m.div
                    className="absolute inset-0 origin-top bg-gradient-to-b from-[#5B3DF5] via-[#7C3AED] to-[#A78BFA]"
                    animate={{ scaleY: progress }}
                    transition={reduced ? { duration: 0 } : { duration: 0.45, ease: 'easeOut' }}
                  />
                </div>
                {STEPS.map((step, index) => {
                  const Icon = step.icon;
                  const isActive = index === active;
                  const isDone = index < active;
                  return (
                    <li key={step.id} className="relative">
                      <span
                        aria-hidden
                        className={cn(
                          'absolute -left-9 top-5 z-10 grid h-[22px] w-[22px] place-items-center rounded-full border text-[10px] font-bold transition-colors',
                          isDone
                            ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300'
                            : isActive
                              ? 'border-[#5B3DF5] bg-[#5B3DF5] text-white shadow-[0_0_20px_-2px_rgba(91,61,245,0.9)]'
                              : 'border-white/15 bg-[#0B0D18] text-slate-500',
                        )}
                      >
                        {isDone ? <Check className="h-3 w-3" /> : index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => setActive(index)}
                        aria-pressed={isActive}
                        aria-label={`Show step ${index + 1}: ${step.title}`}
                        className={cn(
                          'group flex w-full items-start gap-3.5 rounded-2xl border p-4 text-left backdrop-blur transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B3DF5]',
                          isActive
                            ? 'border-[#5B3DF5]/50 bg-white/[0.07] shadow-[0_18px_50px_-28px_rgba(91,61,245,0.95)]'
                            : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]',
                        )}
                      >
                        <span
                          className={cn(
                            'grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition-colors',
                            isActive
                              ? 'border-[#5B3DF5]/30 bg-[#5B3DF5]/20 text-violet-200'
                              : 'border-white/10 bg-white/[0.04] text-slate-400 group-hover:text-slate-300',
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-violet-300/80">
                              0{index + 1}
                            </span>
                            {isActive ? (
                              <span className="rounded-full bg-[#5B3DF5]/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-violet-200">
                                Active
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-1 block text-[15px] font-semibold text-white">
                            {step.title}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-slate-400">
                            {step.copy}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              <div className="relative min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md sm:p-6">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#5B3DF5]/10 blur-3xl"
                />
                <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#5B3DF5]/15 text-violet-300">
                      <ActiveIcon className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Step 0{active + 1} · live preview
                      </p>
                      <p className="truncate text-sm font-semibold text-white">{STEPS[active].title}</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-300">
                    {!reduced ? (
                      <m.span
                        className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                        animate={{ opacity: [1, 0.35, 1], scale: [1, 0.8, 1] }}
                        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                      />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    )}
                    Live
                  </span>
                </div>

                <div className="relative mt-4 min-h-[342px] sm:min-h-[382px]" aria-live="polite">
                  <AnimatePresence mode="wait" initial={false}>
                    <m.div
                      key={STEPS[active].id}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -14 }}
                      transition={reduced ? { duration: 0 } : { duration: 0.32, ease: 'easeOut' }}
                      className="min-h-[342px] sm:min-h-[382px]"
                    >
                      <StepPreview index={active} reduced={reduced} />
                    </m.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </div>
      </LazyMotion>
    </section>
  );
}

function StepPreview({ index, reduced }: { index: number; reduced: boolean }) {
  switch (index) {
    case 1:
      return <CheckoutPreview reduced={reduced} />;
    case 2:
      return <DashboardPreview reduced={reduced} />;
    case 3:
      return <CourierPreview reduced={reduced} />;
    default:
      return <MessengerPreview reduced={reduced} />;
  }
}

function useCountUp(target: number, reduced: boolean, delay = 0, duration = 900) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }

    let frame = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [delay, duration, reduced, target]);

  return value;
}

function MessengerPreview({ reduced }: { reduced: boolean }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (reduced) {
      setStage(4);
      return;
    }

    setStage(0);
    const timers = [
      window.setTimeout(() => setStage(1), 650),
      window.setTimeout(() => setStage(2), 1450),
      window.setTimeout(() => setStage(3), 2550),
      window.setTimeout(() => setStage(4), 3200),
    ];

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reduced]);

  const showTyping = stage === 0 || stage === 2 || stage === 3;
  const enterDelay = (delay: number) => (reduced ? { duration: 0 } : { duration: 0.32, delay, ease: 'easeOut' as const });

  return (
    <div className="flex h-full min-h-[342px] flex-col sm:min-h-[382px]">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#5B3DF5] to-[#8B5CF6] text-white">
            <Bot className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">Oryxa AI</p>
            <p className="text-[10px] text-slate-500">Messenger · replies instantly</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          online
        </span>
      </div>

      <div className="mt-3 flex flex-1 flex-col justify-end gap-2.5 rounded-xl border border-white/10 bg-[radial-gradient(circle_at_80%_0%,rgba(91,61,245,0.14),transparent_55%)] p-3">
        <ChatBubble side="right" delay={0} reduced={reduced}>
          Is the blue kurti available in M?
        </ChatBubble>

        {stage === 0 ? <TypingBubble reduced={reduced} /> : null}

        {stage >= 1 ? (
          <ChatBubble side="left" delay={0.05} reduced={reduced}>
            Yes — 3 left in M. Want me to reserve one?
          </ChatBubble>
        ) : null}

        {stage >= 2 ? (
          <ChatBubble side="right" delay={0.05} reduced={reduced}>
            Yes please, cash on delivery.
          </ChatBubble>
        ) : null}

        {showTyping && stage >= 2 ? <TypingBubble reduced={reduced} /> : null}

        {stage >= 4 ? (
          <ChatBubble side="left" delay={0.05} reduced={reduced}>
            Done. Order <span className="font-semibold text-violet-200">#OO-2481</span> is confirmed ✓
          </ChatBubble>
        ) : null}
      </div>

      <m.div
        className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={enterDelay(0.1)}
      >
        <span className="flex-1 truncate text-xs text-slate-500">Write a reply…</span>
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#5B3DF5] text-white">
          <Send className="h-3.5 w-3.5" />
        </span>
      </m.div>
    </div>
  );
}

function ChatBubble({
  side,
  delay,
  reduced,
  children,
}: {
  side: 'left' | 'right';
  delay: number;
  reduced: boolean;
  children: ReactNode;
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduced ? { duration: 0 } : { duration: 0.32, delay, ease: 'easeOut' }}
      className={cn('flex', side === 'right' ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'max-w-[85%] break-words rounded-2xl px-3.5 py-2.5 text-sm leading-5',
          side === 'right'
            ? 'rounded-br-md bg-[#5B3DF5] text-white'
            : 'rounded-bl-md border border-white/10 bg-white/[0.06] text-slate-200',
        )}
      >
        {children}
      </div>
    </m.div>
  );
}

function TypingBubble({ reduced }: { reduced: boolean }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' }}
      className="flex justify-start"
    >
      <span className="inline-flex items-center gap-1 rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.06] px-3 py-2.5">
        {[0, 1, 2].map((dot) => (
          <m.span
            key={dot}
            className="h-1.5 w-1.5 rounded-full bg-slate-400"
            animate={reduced ? { opacity: 0.7, scale: 1 } : { opacity: [0.35, 1, 0.35], scale: [0.8, 1, 0.8] }}
            transition={
              reduced
                ? { duration: 0 }
                : { duration: 0.9, repeat: Infinity, delay: dot * 0.15, ease: 'easeInOut' }
            }
          />
        ))}
      </span>
    </m.div>
  );
}

function CheckoutPreview({ reduced }: { reduced: boolean }) {
  const total = useCountUp(1450, reduced, 450, 900);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (reduced) {
      setConfirmed(true);
      return;
    }
    const timer = window.setTimeout(() => setConfirmed(true), 1700);
    return () => window.clearTimeout(timer);
  }, [reduced]);

  const lines = [
    { name: 'Linen kurti · M', price: '৳890' },
    { name: 'Cotton panjabi · L', price: '৳500' },
  ];

  return (
    <div className="grid h-full gap-3 sm:grid-cols-[1.12fr_0.88fr]">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-white">Cart</p>
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-slate-400">2 items</span>
        </div>
        <div className="mt-3 space-y-2.5">
          {lines.map((line, index) => (
            <m.div
              key={line.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                reduced ? { duration: 0 } : { duration: 0.3, delay: 0.12 + index * 0.14, ease: 'easeOut' }
              }
              className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5"
            >
              <span className="min-w-0 truncate text-xs text-slate-200">{line.name}</span>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-white">{line.price}</span>
            </m.div>
          ))}
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              reduced ? { duration: 0 } : { duration: 0.3, delay: 0.4, ease: 'easeOut' }
            }
            className="flex items-center justify-between gap-3 px-1 text-xs text-slate-400"
          >
            <span>Delivery · Dhaka</span>
            <span className="font-semibold tabular-nums text-slate-200">৳60</span>
          </m.div>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[11px] text-slate-400">
          <CreditCard className="h-3.5 w-3.5 text-violet-300" />
          Cash on delivery
        </div>
      </div>

      <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Order total</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-white">
            ৳{total.toLocaleString('en-US')}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Including delivery</p>
        </div>

        <div className="mt-4">
          <AnimatePresence mode="wait" initial={false}>
            {confirmed ? (
              <m.div
                key="confirmed"
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6 }}
                transition={reduced ? { duration: 0 } : { duration: 0.3, ease: 'easeOut' }}
                className="flex items-center justify-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2.5 text-xs font-semibold text-emerald-300"
              >
                <m.span
                  initial={{ scale: 0, rotate: -25 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 18 }}
                  className="grid h-5 w-5 place-items-center rounded-full bg-emerald-400 text-[#07130C]"
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </m.span>
                Order confirmed
              </m.div>
            ) : (
              <m.div
                key="pending"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={reduced ? { duration: 0 } : { duration: 0.25, ease: 'easeOut' }}
                className="flex items-center justify-center gap-2 rounded-lg border border-[#5B3DF5]/30 bg-[#5B3DF5]/15 px-3 py-2.5 text-xs font-semibold text-violet-200"
              >
                <CreditCard className="h-4 w-4" />
                Confirm order
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function DashboardPreview({ reduced }: { reduced: boolean }) {
  const newOrders = useCountUp(12, reduced, 100, 800);
  const packed = useCountUp(8, reduced, 200, 800);
  const shipped = useCountUp(21, reduced, 300, 900);

  const stats = [
    { label: 'New', value: newOrders, ratio: 12 / 30, icon: Package, tone: 'text-violet-300 bg-[#5B3DF5]/15' },
    { label: 'Packed', value: packed, ratio: 8 / 30, icon: Box, tone: 'text-amber-300 bg-amber-400/10' },
    { label: 'Shipped', value: shipped, ratio: 21 / 30, icon: Truck, tone: 'text-emerald-300 bg-emerald-400/10' },
  ];

  const rows = [
    { id: '#OO-2481', item: 'Linen kurti · M', status: 'New', tone: 'text-violet-200 bg-[#5B3DF5]/20' },
    { id: '#OO-2478', item: 'Cotton panjabi · L', status: 'Packed', tone: 'text-amber-200 bg-amber-400/15' },
    { id: '#OO-2470', item: 'Silk scarf · One size', status: 'Shipped', tone: 'text-emerald-200 bg-emerald-400/15' },
  ];

  return (
    <div className="h-full">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Order board</p>
          <p className="text-[10px] text-slate-500">Today · live across every channel</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] text-slate-400">
          <m.span
            className="h-1.5 w-1.5 rounded-full bg-emerald-400"
            animate={reduced ? { opacity: 1 } : { opacity: [1, 0.35, 1] }}
            transition={reduced ? { duration: 0 } : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
          Synced
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2.5">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <m.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                reduced ? { duration: 0 } : { duration: 0.35, delay: index * 0.08, ease: 'easeOut' }
              }
              className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
            >
              <span className={cn('grid h-7 w-7 place-items-center rounded-lg', stat.tone)}>
                <Icon className="h-4 w-4" />
              </span>
              <p className="mt-3 text-2xl font-bold tabular-nums text-white">{stat.value}</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{stat.label}</p>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
                <m.div
                  className="h-full origin-left rounded-full bg-gradient-to-r from-[#5B3DF5] to-[#A78BFA]"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: stat.ratio }}
                  transition={reduced ? { duration: 0 } : { duration: 0.7, delay: 0.2 + index * 0.08, ease: 'easeOut' }}
                />
              </div>
            </m.div>
          );
        })}
      </div>

      <div className="mt-3 divide-y divide-white/[0.06] rounded-xl border border-white/10 bg-white/[0.03] px-3.5">
        {rows.map((row, index) => (
          <m.div
            key={row.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              reduced ? { duration: 0 } : { duration: 0.3, delay: 0.35 + index * 0.08, ease: 'easeOut' }
            }
            className="flex items-center justify-between gap-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold text-slate-200">{row.id}</p>
              <p className="truncate text-[10px] text-slate-500">{row.item}</p>
            </div>
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold', row.tone)}>
              {row.status}
            </span>
          </m.div>
        ))}
      </div>
    </div>
  );
}

const COURIER_STEPS = [
  { label: 'Picked up', copy: 'Handed to courier · 9:41 AM' },
  { label: 'In transit', copy: 'Sorting hub, Dhaka · 12:20 PM' },
  { label: 'Out for delivery', copy: 'Rider assigned · 3:05 PM' },
  { label: 'Delivered', copy: 'Cash collected · 5:30 PM' },
];

function CourierPreview({ reduced }: { reduced: boolean }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (reduced) {
      setStage(3);
      return;
    }

    setStage(0);
    const timers = [
      window.setTimeout(() => setStage(1), 750),
      window.setTimeout(() => setStage(2), 1450),
      window.setTimeout(() => setStage(3), 2200),
    ];

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reduced]);

  return (
    <div className="h-full">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#5B3DF5]/15 text-violet-300">
            <Truck className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">Pathao Courier</p>
            <p className="truncate text-[10px] text-slate-500">Tracking OO-2481 · Dhaka</p>
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider',
            stage === 3
              ? 'bg-emerald-400/15 text-emerald-300'
              : 'bg-[#5B3DF5]/15 text-violet-200',
          )}
        >
          {stage === 3 ? 'Delivered' : 'On the way'}
        </span>
      </div>

      <div className="relative mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5 pl-11">
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-7 left-[27px] top-7 w-px bg-white/10"
        >
          <m.div
            className="absolute inset-0 origin-top bg-gradient-to-b from-[#5B3DF5] via-[#7C3AED] to-emerald-400"
            animate={{ scaleY: stage / (COURIER_STEPS.length - 1) }}
            transition={reduced ? { duration: 0 } : { duration: 0.45, ease: 'easeOut' }}
          />
        </div>

        <ul className="space-y-3.5">
          {COURIER_STEPS.map((step, index) => {
            const done = index <= stage;
            const current = index === stage;
            return (
              <li key={step.label} className="relative">
                <span
                  aria-hidden
                  className={cn(
                    'absolute -left-[27px] top-0.5 z-10 grid h-5 w-5 place-items-center rounded-full border transition-colors',
                    done
                      ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-300'
                      : 'border-white/15 bg-[#0B0D18] text-slate-600',
                  )}
                >
                  {done ? (
                    <Check className="h-3 w-3" strokeWidth={3} />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  )}
                </span>
                {current && !reduced ? (
                  <m.span
                    className="absolute -left-[31px] top-[-3px] h-[29px] w-[29px] rounded-full border border-emerald-400/30"
                    animate={{ opacity: [0.55, 0, 0.55], scale: [0.8, 1.15, 0.8] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  />
                ) : null}
                <p
                  className={cn(
                    'text-xs font-semibold',
                    current ? 'text-white' : done ? 'text-slate-200' : 'text-slate-500',
                  )}
                >
                  {step.label}
                </p>
                <p className={cn('text-[10px]', done ? 'text-slate-500' : 'text-slate-600')}>{step.copy}</p>
              </li>
            );
          })}
        </ul>
      </div>

      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.3, delay: 0.2, ease: 'easeOut' }}
        className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[11px] text-slate-400"
      >
        <MessageCircle className="h-3.5 w-3.5 text-violet-300" />
        Tracking updates are shared back to the buyer’s chat.
      </m.div>
    </div>
  );
}
