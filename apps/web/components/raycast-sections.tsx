'use client';

import { useMemo, useState } from 'react';
import {
  BadgeCheck,
  CreditCard,
  Inbox,
  Megaphone,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Star,
  Truck,
  Zap,
} from 'lucide-react';
import { GlowCard, Reveal, SectionHeading } from '@/components/marketing/primitives';
import { cn } from '@/lib/utils';

type Channel = 'Inbox' | 'Orders' | 'Posts';

const CHANNELS: Record<
  Channel,
  { detail: string; value: string; dot: string; accent: string }
> = {
  Inbox: {
    detail: '12 conversations waiting · 11 already drafted by AI',
    value: 'Every customer gets an answer in seconds — in their language.',
    dot: 'bg-[#A78BFA] shadow-[0_0_12px_2px_rgba(167,139,250,0.55)]',
    accent: 'text-[#A78BFA]',
  },
  Orders: {
    detail: '28 orders in the pipeline · 6 out for delivery today',
    value: 'From a one-line chat to a courier booking, without the copy-paste.',
    dot: 'bg-sky-400 shadow-[0_0_12px_2px_rgba(56,189,248,0.55)]',
    accent: 'text-sky-300',
  },
  Posts: {
    detail: '3 posts scheduled for tonight · captions written by AI',
    value: 'Your storefront keeps showing up while you work on the fun part.',
    dot: 'bg-emerald-400 shadow-[0_0_12px_2px_rgba(52,211,153,0.55)]',
    accent: 'text-emerald-300',
  },
};

const COMMANDS = [
  { icon: Send, label: 'Reply to the latest customer', hint: 'AI draft ready' },
  { icon: ShoppingBag, label: 'Create an order from this chat', hint: 'chat → checkout' },
  { icon: Megaphone, label: 'Schedule the evening product drop', hint: 'auto-publish' },
  { icon: Truck, label: 'Book tomorrow’s courier pickup', hint: 'Steadfast · Pathao' },
  { icon: CreditCard, label: 'Verify a pending bKash payment', hint: 'matched in 2s' },
];

const ACCENTS = 'text-[#A78BFA]';

const PILLARS = [
  {
    step: '01 — Capture',
    icon: Inbox,
    title: 'One command center',
    copy: 'Conversations, orders and channels in a single quiet workspace — no twelve open tabs.',
  },
  {
    step: '02 — Automate',
    icon: Zap,
    title: 'Work at the speed of thought',
    copy: 'AI drafts replies, parses addresses and checks stock, while you stay in final control.',
  },
  {
    step: '03 — Grow',
    icon: Sparkles,
    title: 'Make every moment count',
    copy: 'Follow up faster, learn what sells, and turn attention into loyal repeat customers.',
  },
];

const CAPABILITIES = [
  { icon: Zap, title: 'AI auto-reply', copy: 'Bengali & English, 24/7' },
  { icon: BadgeCheck, title: 'Payment checks', copy: 'bKash · Nagad verified' },
  { icon: Truck, title: 'Courier handoff', copy: 'Steadfast · Pathao sync' },
];

const SHORTCUT_FAKE = [
  { keys: ['⌘', 'K'], label: 'Command palette' },
  { keys: ['⇧', 'R'], label: 'AI reply to chat' },
  { keys: ['⇧', 'O'], label: 'New order' },
];

const TESTIMONIALS = [
  {
    quote:
      'The inbox used to eat our whole evening. Now most replies go out before I even open the phone.',
    name: 'Nusrat',
    role: 'Fashion boutique owner, Dhaka',
  },
  {
    quote:
      'Orders land with the address parsed and payment already checked. We just pack and hand off to the rider.',
    name: 'Tanvir',
    role: 'Gadget reseller, Chattogram',
  },
  {
    quote:
      'It writes our product posts in our own tone. On scheduled-drop days the orders show up before noon.',
    name: 'Marium',
    role: 'Home bakery, Sylhet',
  },
];

const STATS: Array<[string, string]> = [
  ['<1s', 'average first reply'],
  ['24/7', 'AI selling coverage'],
  ['1', 'unified inbox for all channels'],
  ['0', 'orders missed overnight'],
];

export function RaycastSections() {
  const [query, setQuery] = useState('');
  const [activeChannel, setActiveChannel] = useState<Channel>('Inbox');
  const [lastRun, setLastRun] = useState<string | null>(null);
  const channel = CHANNELS[activeChannel];

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS.slice(0, 3);
    return COMMANDS.filter((c) => c.label.toLowerCase().includes(q));
  }, [query]);

  return (
    <section id="workflow" className="relative overflow-hidden py-20 text-white lg:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[440px] w-[min(820px,120vw)] -translate-x-1/2 rounded-full bg-[#5B3DF5]/10 blur-3xl"
      />

      <div className="relative mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Your business, in focus"
          icon={<Sparkles className="h-3.5 w-3.5" />}
          title="Less busywork."
          gradient="More momentum."
          copy="A command center built for the moments that actually move a store forward."
        />

        {/* Command palette demo */}
        <Reveal delayMs={80} className="mx-auto mt-14 max-w-4xl">
          <div className="relative rounded-[28px] p-px">
            <span
              aria-hidden
              className="absolute inset-0 rounded-[28px] bg-gradient-to-b from-[#5B3DF5]/60 via-white/10 to-transparent"
            />
            <div className="rounded-[27px] border border-white/10 bg-[#0B0D16]/95 p-2 shadow-[0_40px_120px_-40px_rgba(91,61,245,0.5)] backdrop-blur-xl sm:p-3">
              <div className="overflow-hidden rounded-3xl bg-[#07080D]/90">
                {/* Window chrome */}
                <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#5B3DF5]/70" />
                  <p className="ml-2 text-[11px] font-semibold tracking-wide text-slate-500">
                    OnlyOrders Command Center
                  </p>
                  {lastRun ? (
                    <span className="ml-auto hidden w-fit rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300 sm:block">
                      Run “{lastRun}” ✓
                    </span>
                  ) : null}
                </div>

                {/* Search row */}
                <form
                  className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3.5 focus-within:bg-white/[0.03]"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (matches.length) setLastRun(matches[0].label);
                  }}
                >
                  <Search className={cn('h-4 w-4 shrink-0', ACCENTS)} />
                  <input
                    aria-label="Search quick actions"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Reply, create an order, schedule a post…"
                    className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
                  />
                  <kbd className="hidden shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 sm:block">
                    ESC
                  </kbd>
                </form>

                {/* Command rows */}
                <ul className="p-2 sm:p-3" aria-live="polite">
                  {(matches.length ? matches : COMMANDS.slice(0, 3)).map((cmd, i) => (
                    <li key={cmd.label}>
                      <button
                        type="button"
                        onClick={() => setLastRun(cmd.label)}
                        className={cn(
                          'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
                          i === 0 && !query.trim()
                            ? 'bg-[#5B3DF5]/12 ring-1 ring-inset ring-[#5B3DF5]/30'
                            : 'hover:bg-white/[0.05]',
                        )}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
                          <cmd.icon className={cn('h-4 w-4', ACCENTS)} />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-300 group-hover:text-white">
                          {cmd.label}
                        </span>
                        <span className="hidden shrink-0 text-[11px] text-slate-600 sm:block">
                          {cmd.hint}
                        </span>
                        <Send className="h-3.5 w-3.5 shrink-0 -rotate-45 text-[#5B3DF5] opacity-0 transition group-hover:opacity-100" />
                      </button>
                    </li>
                  ))}
                </ul>

                {/* Keyboard hints */}
                <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-4 py-3">
                  {SHORTCUT_FAKE.map((s) => (
                    <span
                      key={s.label}
                      className="inline-flex items-center gap-1.5 text-[11px] text-slate-500"
                    >
                      {s.keys.map((k) => (
                        <kbd
                          key={k}
                          className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-semibold text-slate-300 shadow-[inset_0_-2px_0_rgba(0,0,0,0.4)]"
                        >
                          {k}
                        </kbd>
                      ))}
                      <span className="ml-0.5">{s.label}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Pillar bento */}
        <div className="mt-20 grid gap-4 md:grid-cols-3">
          {PILLARS.map((p, i) => (
            <Reveal key={p.title} delayMs={i * 90}>
              <GlowCard className="flex h-full flex-col p-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#5B3DF5]/30 bg-[#5B3DF5]/12 shadow-[0_0_28px_-8px_rgba(91,61,245,0.8)]">
                  <p.icon className={cn('h-5 w-5', ACCENTS)} />
                </span>
                <p className="mt-7 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  {p.step}
                </p>
                <h3 className="mt-2 font-geist text-xl font-bold text-white">{p.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{p.copy}</p>
              </GlowCard>
            </Reveal>
          ))}
        </div>

        {/* Capability mini-tiles */}
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {CAPABILITIES.map((c, i) => (
            <Reveal key={c.title} delayMs={i * 70}>
              <GlowCard className="flex items-center gap-4 rounded-2xl! px-5 py-4">
                <c.icon className={cn('h-5 w-5 shrink-0', ACCENTS)} />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">{c.title}</p>
                  <p className="truncate text-xs text-slate-500">{c.copy}</p>
                </div>
              </GlowCard>
            </Reveal>
          ))}
        </div>

        {/* Tabbed channel showcase */}
        <Reveal className="mt-20">
          <div className="grid items-center gap-10 rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.015] p-6 shadow-[0_40px_120px_-60px_rgba(91,61,245,0.45)] backdrop-blur-xl sm:p-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className={cn('text-[11px] font-bold uppercase tracking-[0.2em]', ACCENTS)}>
                Everything connected
              </p>
              <h3 className="mt-3 font-geist text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                A clearer view of your day.
              </h3>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">
                Jump between the work that matters without losing your place.
                Your next best action is always one keystroke away.
              </p>
              <div className="mt-7 flex flex-wrap gap-2" role="tablist" aria-label="Workspace channels">
                {(Object.keys(CHANNELS) as Channel[]).map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="tab"
                    aria-selected={activeChannel === name}
                    onClick={() => setActiveChannel(name)}
                    className={cn(
                      'rounded-full px-4 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5B3DF5]/70',
                      activeChannel === name
                        ? 'bg-white text-[#0B0D16] shadow-[0_0_24px_-6px_rgba(255,255,255,0.6)]'
                        : 'border border-white/10 bg-white/[0.04] text-slate-400 hover:text-white',
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0A0C14]/90 p-5 shadow-2xl sm:p-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className={cn('h-2.5 w-2.5 rounded-full', channel.dot)} />
                  <span className="text-sm font-semibold text-white">{activeChannel}</span>
                </div>
                <span className="text-[11px] font-semibold text-emerald-400">Live</span>
              </div>
              <p className="mt-6 text-balance text-xl font-bold tracking-tight text-white sm:text-2xl">
                {channel.value}
              </p>
              <div className="mt-7 flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] p-4">
                <span className="text-xs text-slate-400">{channel.detail}</span>
                <span className={cn('shrink-0 text-xs font-semibold', channel.accent)}>
                  View all →
                </span>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Testimonials */}
        <div className="mt-20">
          <Reveal>
            <h3 className="text-center font-geist text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              Sellers are already{' '}
              <span className="bg-gradient-to-r from-[#A78BFA] to-[#67E8F9] bg-clip-text text-transparent">
                off the treadmill
              </span>
            </h3>
          </Reveal>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.name} delayMs={i * 90}>
                <GlowCard className="flex h-full flex-col p-7">
                  <div className="flex gap-1 text-amber-300">
                    {Array.from({ length: 5 }).map((_, s) => (
                      <Star key={s} className="h-3.5 w-3.5 fill-current" />
                    ))}
                  </div>
                  <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-slate-300">
                    “{t.quote}”
                  </blockquote>
                  <div className="mt-6 border-t border-white/[0.06] pt-4">
                    <p className="text-sm font-bold text-white">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.role}</p>
                  </div>
                </GlowCard>
              </Reveal>
            ))}
          </div>
        </div>

        {/* Stats strip */}
        <Reveal className="mt-16">
          <div className="grid grid-cols-2 gap-6 rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-9 backdrop-blur-md sm:grid-cols-4">
            {STATS.map(([value, label]) => (
              <div key={label} className="text-center">
                <p className="font-geist text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                  {value}
                </p>
                <p className="mt-1.5 text-[11px] font-medium text-slate-500 sm:text-xs">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
