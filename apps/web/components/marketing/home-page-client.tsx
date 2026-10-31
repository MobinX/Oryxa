'use client';

import Link from 'next/link';
import { useBrand } from '@/components/brand-provider';
import type { PublicPlan } from '@/lib/api';
import { toCompareRows, toDisplayPlans, type DisplayPlan } from '@/lib/plan-display';
import { HeroInteractiveAd } from '@/components/hero-interactive-ad';
import { MotionVideoAd } from '@/components/motion-video-ad';
import { HomeBento } from '@/components/marketing/home-bento';
import { MarketingNav } from '@/components/marketing/nav';
import { MarketingFooter } from '@/components/marketing/footer';
import { GlowBackground, MarketingStyles } from '@/components/marketing/glow';
import { CtaBanner } from '@/components/marketing/cta-banner';
import { Eyebrow, Reveal, SectionHeading } from '@/components/marketing/primitives';
import {
  ArrowRight,
  BarChart3,
  Check,
  Clock,
  Layers,
  Lock,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';

const HERO_PROOF_POINTS = [
  { icon: Clock, title: 'AI replies', copy: 'Answers when your Page is connected' },
  { icon: Layers, title: 'One inbox', copy: 'Every connected channel together' },
  { icon: ShoppingBag, title: 'Chat to order', copy: 'Orders captured in your dashboard' },
  { icon: BarChart3, title: 'Clear analytics', copy: 'See chats, orders and revenue' },
];

const TRUST_POINTS = [
  {
    icon: Lock,
    tone: 'bg-violet-500/15 text-violet-300',
    title: 'Scoped access',
    copy: 'We request only the platform permissions needed to run your accounts.',
  },
  {
    icon: ShieldCheck,
    tone: 'bg-sky-500/15 text-sky-300',
    title: 'Your data, your control',
    copy: 'Disconnect channels or delete your workspace any time.',
  },
  {
    icon: Layers,
    tone: 'bg-emerald-500/15 text-emerald-300',
    title: 'Established providers',
    copy: 'Hosted on reputable cloud infrastructure. See our Privacy Policy for the list.',
  },
  {
    icon: Clock,
    tone: 'bg-amber-500/15 text-amber-300',
    title: 'Human oversight',
    copy: 'Review, edit, pause or take over any AI reply.',
  },
];

export default function HomePageClient({
  plans,
  unavailable = false,
}: {
  plans: PublicPlan[];
  unavailable?: boolean;
}) {
  const { companyName: COMPANY_NAME } = useBrand();
  const showVideo = COMPANY_NAME === 'Oryxa';
  const displayPlans = toDisplayPlans(plans);
  const compareRows = toCompareRows(plans);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#08090A] font-inter text-slate-100 selection:bg-[#5B3DF5] selection:text-white">
      <MarketingStyles />
      <GlowBackground />
      <MarketingNav />

      <main>
        {/* 1. HERO + PHONE DEMO (right) */}
        <section id="live-demo" className="relative overflow-hidden pb-16 pt-10 lg:pb-24 lg:pt-20">
          <div className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-12 lg:gap-10">
              {/* Copy (left) */}
              <div className="space-y-6 lg:col-span-5">
                <Reveal>
                  <Eyebrow icon={<Sparkles className="h-3.5 w-3.5" />}>
                    AI commerce autopilot
                  </Eyebrow>
                </Reveal>

                <Reveal delayMs={70}>
                  <h1 className="font-geist text-4xl font-extrabold leading-[1.06] tracking-tight text-white sm:text-5xl xl:text-[56px]">
                    Your orders,{' '}
                    <span className="relative inline-block">
                      <span className="bg-gradient-to-r from-[#A78BFA] via-[#C084FC] to-[#5B3DF5] bg-clip-text text-transparent">
                        on autopilot.
                      </span>
                      <span
                        aria-hidden
                        className="pointer-events-none absolute -inset-4 -z-10 rounded-full bg-[#5B3DF5]/25 blur-3xl"
                      />
                    </span>
                  </h1>
                </Reveal>

                <Reveal delayMs={140}>
                  <p className="max-w-xl text-balance text-base leading-relaxed text-slate-300 sm:text-[17px]">
                    {COMPANY_NAME} turns DMs and comments into confirmed orders
                    — automated replies, live catalog checks, order capture
                    and human handoff, all from one inbox.
                  </p>
                </Reveal>

                <Reveal delayMs={210}>
                  <div className="flex flex-wrap items-center gap-3.5 pt-1">
                    <Link
                      href="/login"
                      className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5B3DF5] to-[#7C3AED] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_0_44px_-10px_rgba(91,61,245,0.95)] transition hover:brightness-110 active:scale-97 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]/70"
                    >
                      Start selling free
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                    <a
                      href="#workflow"
                      className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.04] px-7 py-3.5 text-sm font-semibold text-slate-200 backdrop-blur transition hover:bg-white/[0.09] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5B3DF5]/70"
                    >
                      See it in action
                    </a>
                  </div>
                </Reveal>

                <Reveal delayMs={280}>
                  <p className="text-xs text-slate-500">
                    Free plan available · Cancel anytime
                  </p>
                </Reveal>
              </div>

              {/* Phone demo (right) */}
              <Reveal delayMs={120} className="lg:col-span-7">
                <HeroInteractiveAd />
                <p className="mx-auto mt-3 max-w-[440px] text-center text-[10px] leading-relaxed text-slate-500">
                  Interactive preview. Screens are simulated illustrations; available features depend
                  on your connected channels and plan.
                </p>
              </Reveal>
            </div>

            {/* Glass value strip */}
            <Reveal delayMs={120} className="mt-16">
              <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-1.5 shadow-2xl backdrop-blur-xl">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#A78BFA]/60 to-transparent"
                />
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                  {HERO_PROOF_POINTS.map(({ icon: Icon, title, copy }) => (
                    <div
                      key={title}
                      className="flex items-center gap-4 rounded-2xl bg-white/[0.02] px-5 py-4 transition hover:bg-[#5B3DF5]/[0.08]"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#5B3DF5]/25 bg-[#5B3DF5]/12">
                        <Icon className="h-4.5 w-4.5 text-[#A78BFA]" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">{title}</p>
                        <p className="truncate text-xs text-slate-400">{copy}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* 2. CINEMATIC VIDEO + COMMERCIAL AUTOMATION SHOWCASE — Oryxa only */}
        {showVideo ? (
          <section
            id="workflow"
            className="border-t border-b border-white/10 bg-[#0A0C18] py-20 text-white lg:py-24"
          >
            <div className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8">
              <MotionVideoAd />
            </div>
          </section>
        ) : null}

        {/* 3. WORKFLOW / FEATURE SECTIONS */}
        {showVideo ? (
          <HomeBento />
        ) : (
          <div id="workflow">
            <HomeBento />
          </div>
        )}

        {/* 3. PRICING */}
        <section id="pricing" className="relative overflow-hidden py-20 lg:py-24">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-10 h-[420px] w-[min(900px,130vw)] -translate-x-1/2 rounded-full bg-[#5B3DF5]/[0.08] blur-3xl"
          />

          <div className="relative mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Simple, transparent pricing"
              icon={<Sparkles className="h-3.5 w-3.5" />}
              title="Pick the plan that fits your store."
              copy="Every plan ships with the core automation. Upgrade only when your orders are."
            />

            <Reveal delayMs={100}>
              <div className="mt-9 flex justify-center">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-slate-400">
                  Live monthly plans from the admin catalogue
                </span>
              </div>
            </Reveal>

            {displayPlans.length === 0 ? (
              <Reveal delayMs={100}>
                <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-slate-400">
                  {unavailable
                    ? 'Pricing is temporarily unavailable. Please check back shortly.'
                    : 'No plans are published yet.'}
                </div>
              </Reveal>
            ) : (
              <>
                {/* Plan cards */}
                <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
                  {displayPlans.map((plan, i) => (
                    <Reveal key={plan.slug} delayMs={i * 80} className="h-full">
                      {plan.featured ? (
                        <div className="relative flex h-full flex-col rounded-3xl p-px shadow-[0_30px_80px_-30px_rgba(91,61,245,0.6)]">
                          <span
                            aria-hidden
                            className="absolute inset-0 rounded-3xl bg-gradient-to-b from-[#5B3DF5] via-[#7C3AED]/40 to-[#5B3DF5]/10"
                          />
                          <span
                            aria-hidden
                            className="absolute right-7 top-6 z-10 rounded-full bg-gradient-to-r from-[#5B3DF5] to-[#7C3AED] px-3 py-1 text-[10px] font-bold text-white shadow-md"
                          >
                            {plan.badge}
                          </span>
                          <div className="relative flex h-full flex-col rounded-[calc(1.5rem-1px)] bg-[#0C0E1A] p-6">
                            <PlanBody plan={plan} />
                          </div>
                        </div>
                      ) : (
                        <div className="group flex h-full flex-col rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-[#7C3AED]/50 hover:bg-[#5B3DF5]/[0.06] hover:shadow-[0_24px_60px_-24px_rgba(91,61,245,0.45)]">
                          <PlanBody plan={plan} />
                        </div>
                      )}
                    </Reveal>
                  ))}
                </div>

                {/* Compare plans, generated from the saved plan features */}
                {compareRows.length > 0 ? (
                  <Reveal delayMs={100} className="mt-12">
                    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl backdrop-blur-xl lg:p-8">
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-[#A78BFA]/50 to-transparent"
                      />
                      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                        <div className="lg:col-span-3">
                          <h3 className="font-geist text-xl font-bold text-white">Compare plans</h3>
                          <p className="mt-2 text-xs leading-relaxed text-slate-400">
                            Every line item, up front — so you can decide in one scroll.
                          </p>
                        </div>
                        <div className="table-wrap lg:col-span-9">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-white/10 font-bold text-white">
                                <th className="py-2.5 pr-4">Feature</th>
                                {displayPlans.map((plan) => (
                                  <th
                                    key={plan.slug}
                                    className={`px-4 py-2.5 text-center ${plan.featured ? 'text-[#A78BFA]' : ''}`}
                                  >
                                    {plan.name}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.06] text-slate-300">
                              {compareRows.map((row) => (
                                <tr key={row.label} className="transition hover:bg-white/[0.02]">
                                  <td className="py-2.5 pr-4 font-medium text-white">{row.label}</td>
                                  {row.cells.map((cell, ci) => (
                                    <td
                                      key={ci}
                                      className={`px-4 py-2.5 text-center ${compareCellClass(
                                        cell,
                                        displayPlans[ci]?.featured === true,
                                      )}`}
                                    >
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </Reveal>
                ) : null}
              </>
            )}

            <Reveal delayMs={100} className="mt-10 flex justify-center">
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-[#7C3AED]/50 hover:text-white"
              >
                See full pricing
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Reveal>

            {/* Trust grid */}
            <section aria-label="How your data stays yours" className="mt-14 border-t border-white/10 pt-12">
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
                <div className="lg:col-span-3">
                  <Reveal>
                    <h3 className="font-geist text-lg font-extrabold text-white">
                      Your business data stays in your control
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">
                      Best-practice security and privacy, plus the right to
                      disconnect whenever you decide.
                    </p>
                  </Reveal>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-9 lg:grid-cols-4">
                  {TRUST_POINTS.map((pt, i) => (
                    <Reveal key={pt.title} delayMs={i * 70}>
                      <div className="flex h-full items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 transition hover:border-[#7C3AED]/40 hover:bg-[#5B3DF5]/[0.05]">
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${pt.tone}`}
                        >
                          <pt.icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white">{pt.title}</p>
                          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                            {pt.copy}
                          </p>
                        </div>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </section>

        {/* 4. CTA */}
        <CtaBanner />
      </main>

      {/* 5. FOOTER */}
      <MarketingFooter />
    </div>
  );
}

function compareCellClass(cell: string, featured: boolean): string {
  if (cell === '✓') return 'text-emerald-400';
  if (cell === '—') return 'text-slate-600';
  return featured ? 'font-semibold text-[#A78BFA]' : 'text-slate-300';
}

function PlanBody({ plan }: { plan: DisplayPlan }) {
  return (
    <>
      <div>
        <span
          className={`inline-block rounded-md border px-2.5 py-0.5 text-[11px] font-semibold ${plan.tagTone}`}
        >
          {plan.custom ? 'Custom' : plan.priceCents === 0 ? 'Free' : 'Paid'}
        </span>
        <h3 className="mt-3 font-geist text-xl font-bold text-white">{plan.name}</h3>
        <p className="mt-1.5 min-h-9 text-xs text-slate-400">{plan.copy}</p>
        <div className="mt-5 flex items-baseline gap-1 border-b border-white/[0.08] pb-5">
          <span className="font-geist text-4xl font-extrabold text-white">{plan.priceLabel}</span>
          {plan.priceCents > 0 ? <span className="text-xs text-slate-400">/ month</span> : null}
        </div>
        <ul className="mt-5 space-y-2.5 text-xs">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-slate-300">
              <Check
                className={`h-4 w-4 shrink-0 ${
                  plan.featured ? 'text-emerald-400' : 'text-[#818CF8]'
                }`}
              />
              {feature}
            </li>
          ))}
        </ul>
      </div>
      <Link
        href={plan.ctaHref}
        className={`mt-7 flex h-10 w-full items-center justify-center rounded-xl text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]/70 ${
          plan.featured
            ? 'bg-gradient-to-r from-[#5B3DF5] to-[#7C3AED] text-white shadow-[0_0_28px_-6px_rgba(91,61,245,0.8)] hover:brightness-110'
            : 'border border-white/15 bg-white/[0.04] text-slate-200 hover:bg-white/[0.09]'
        }`}
      >
        {plan.cta}
      </Link>
    </>
  );
}
