'use client';

import { useState } from 'react';

type Channel = 'Inbox' | 'Orders' | 'Posts';

const channels: Record<Channel, { label: string; detail: string; value: string; color: string }> = {
  Inbox: {
    label: 'Inbox',
    detail: '12 conversations need attention',
    value: 'Turn every message into momentum.',
    color: 'bg-violet-400',
  },
  Orders: {
    label: 'Orders',
    detail: '28 orders ready to process',
    value: 'Move from chat to checkout in seconds.',
    color: 'bg-sky-400',
  },
  Posts: {
    label: 'Posts',
    detail: '3 posts scheduled for today',
    value: 'Stay visible while you focus on growth.',
    color: 'bg-emerald-400',
  },
};

const features = [
  { eyebrow: '01 / Capture', title: 'One command center', copy: 'Bring conversations, orders, and social channels into one calm workspace.', icon: '⌘' },
  { eyebrow: '02 / Automate', title: 'Work at the speed of thought', copy: 'Let AI handle repetitive replies and actions while you stay in control.', icon: '✦' },
  { eyebrow: '03 / Grow', title: 'Make every moment count', copy: 'See what is working, follow up faster, and turn attention into loyal customers.', icon: '↗' },
];

export function RaycastSections() {
  const [query, setQuery] = useState('');
  const [activeChannel, setActiveChannel] = useState<Channel>('Inbox');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const channel = channels[activeChannel];
  const commandMatches = query.trim() ? ['Reply to latest customer', 'Create an order', 'Schedule a post'] : [];

  return (
    <section id="workflow" className="relative overflow-hidden border-y border-white/10 bg-[#0A0C18] py-20 text-white lg:py-28">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-[#5B3DF5]/12 blur-3xl" />
      <div className="relative mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-[#A78BFA]">Your business, in focus</p>
          <h2 className="font-geist text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Less busywork. <span className="bg-gradient-to-r from-[#A78BFA] to-[#67E8F9] bg-clip-text text-transparent">More momentum.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
            A thoughtful command center for the moments that move your business forward.
          </p>
        </div>

        <div className="mx-auto mt-14 max-w-4xl rounded-[28px] border border-white/15 bg-[#111425]/90 p-2 shadow-2xl shadow-[#5B3DF5]/15 backdrop-blur-xl sm:p-3">
          <div className="rounded-[22px] border border-white/10 bg-[#090B14] p-5 sm:p-8">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Quick actions</p>
                <p className="mt-1 text-sm text-slate-300">What would you like to do?</p>
              </div>
              <button type="button" onClick={() => setPaletteOpen((open) => !open)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400 transition hover:border-[#A78BFA]/50 hover:text-white">
                {paletteOpen ? 'Close' : 'Open'} <kbd className="ml-1 text-slate-500">⌘ K</kbd>
              </button>
            </div>
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 focus-within:border-[#7C3AED] focus-within:ring-2 focus-within:ring-[#5B3DF5]/20">
              <span className="text-lg text-[#A78BFA]">⌕</span>
              <input aria-label="Search quick actions" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search anything..." className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600" />
              <span className="hidden rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-600 sm:block">ESC</span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {(commandMatches.length ? commandMatches : ['Reply to a customer', 'Create an order', 'Schedule a post']).map((action, index) => (
                <button type="button" key={action} onClick={() => setQuery(action)} className="group flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#7C3AED]/50 hover:bg-[#5B3DF5]/10">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#5B3DF5]/15 text-sm text-[#A78BFA]">{['↗', '+', '◷'][index]}</span>
                  <span className="text-xs font-medium text-slate-300 group-hover:text-white">{action}</span>
                </button>
              ))}
            </div>
            {paletteOpen && <p className="mt-4 text-center text-xs text-[#A78BFA]">Tip: search by what you want to accomplish, not where it lives.</p>}
          </div>
        </div>

        <div className="mt-20 grid gap-4 lg:grid-cols-3">
          {features.map((feature, index) => (
            <article key={feature.title} className={`group rounded-3xl border border-white/10 p-6 transition duration-300 hover:-translate-y-1 hover:border-[#7C3AED]/60 hover:shadow-xl hover:shadow-[#5B3DF5]/10 ${index === 1 ? 'bg-gradient-to-br from-[#181533] to-[#101323]' : 'bg-white/[0.03]'}`}>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-xl text-[#A78BFA] transition group-hover:bg-[#5B3DF5]/25">{feature.icon}</span>
              <p className="mt-8 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{feature.eyebrow}</p>
              <h3 className="mt-2 text-xl font-bold text-white">{feature.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{feature.copy}</p>
            </article>
          ))}
        </div>

        <div className="mt-20 grid items-center gap-10 rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-6 sm:p-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#A78BFA]">Everything connected</p>
            <h3 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">A clearer view of your day.</h3>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">Jump between the work that matters without losing your place. Your next best action is always close by.</p>
            <div className="mt-7 flex flex-wrap gap-2" role="tablist" aria-label="Workspace channels">
              {(Object.keys(channels) as Channel[]).map((name) => (
                <button key={name} type="button" role="tab" aria-selected={activeChannel === name} onClick={() => setActiveChannel(name)} className={`rounded-full px-4 py-2 text-xs font-semibold transition ${activeChannel === name ? 'bg-white text-[#10111C]' : 'border border-white/10 bg-white/5 text-slate-400 hover:text-white'}`}>{name}</button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0A0C16] p-5 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${channel.color}`} /><span className="text-sm font-semibold text-white">{channel.label}</span></div><span className="text-[11px] text-emerald-400">Live now</span></div>
            <p className="mt-6 text-2xl font-bold tracking-tight text-white">{channel.value}</p>
            <div className="mt-7 flex items-center justify-between rounded-xl bg-white/[0.04] p-4"><span className="text-xs text-slate-400">{channel.detail}</span><span className="text-xs font-semibold text-[#A78BFA]">View all →</span></div>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-2 gap-6 border-t border-white/10 pt-8 text-center sm:grid-cols-4">
          {[['24/7', 'always-on assistance'], ['3×', 'faster responses'], ['+42%', 'more follow-ups'], ['1 view', 'for every channel']].map(([value, label]) => <div key={label}><p className="text-2xl font-extrabold text-white sm:text-3xl">{value}</p><p className="mt-1 text-xs text-slate-500">{label}</p></div>)}
        </div>
      </div>
    </section>
  );
}
