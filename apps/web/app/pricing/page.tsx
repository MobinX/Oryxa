import Link from 'next/link';
import { Check, ArrowRight, ChevronDown, Lock, ShieldCheck, Server, Headphones } from 'lucide-react';
import { cachedPublicPlans } from '@/app/_cache/queries';
import { toCompareRows, toDisplayPlans } from '@/lib/plan-display';
import { getBrand } from '@/lib/brand-server';
import { OnlyOrdesLogo } from '@/components/sidebar';

export async function generateMetadata() {
  const { companyName } = await getBrand();
  return {
    title: `Pricing — ${companyName}`,
    description: `${companyName} plans for AI auto-reply, catalog and order management. Simple, transparent pricing that scales with your store.`,
    alternates: { canonical: '/pricing' },
  };
}

export default async function PricingPage() {
  const { plans, unavailable } = await cachedPublicPlans();
  const displayPlans = toDisplayPlans(plans);
  const compareRows = toCompareRows(plans);
  const { companyName } = await getBrand();

  return (
    <div className="min-h-screen bg-[#F8F9FC] font-inter text-slate-900">
      {/* Top Navbar Matching Screenshot 5 */}
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-18 max-w-[1280px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-10">
            <Link href="/">
              <OnlyOrdesLogo />
            </Link>
            <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
              <Link href="/#live-demo" className="inline-flex items-center gap-1 hover:text-slate-950">
                Product <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </Link>
              <Link href="/#workflow" className="inline-flex items-center gap-1 hover:text-slate-950">
                Solutions <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </Link>
              <Link href="/pricing" className="font-semibold text-slate-950">
                Pricing
              </Link>
              <Link href="/docs" className="inline-flex items-center gap-1 hover:text-slate-950">
                Resources <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-full border border-slate-200 bg-white px-5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:text-sm"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#5B3DF5] to-[#6C47FF] px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-[#5B3DF5]/25 hover:brightness-105 sm:text-sm"
            >
              <span>Get started</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-2xl text-center space-y-3">
          <span className="inline-block rounded-full bg-[#5B3DF5]/10 px-3.5 py-1 text-xs font-semibold text-[#5B3DF5]">
            Simple &amp; Transparent Pricing
          </span>
          <h1 className="font-geist text-3xl font-extrabold tracking-tight text-slate-950 sm:text-5xl">
            Choose the Right Plan for Your Business
          </h1>
          <p className="text-sm text-slate-600 sm:text-base">
            All plans include core automation features. Upgrade anytime as your business grows.
          </p>

          <div className="pt-3 flex justify-center">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-2xs">
              Live monthly pricing from the {companyName} admin catalogue
            </span>
          </div>
        </div>

        {/* Plan cards from the admin catalogue */}
        {displayPlans.length === 0 ? (
          <div className="mt-12 rounded-2xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 shadow-xs">
            {unavailable
              ? 'Pricing is temporarily unavailable. Please check back shortly.'
              : 'No plans are published yet.'}
          </div>
        ) : (
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {displayPlans.map((plan) => (
              <div
                key={plan.slug}
                className={`flex flex-col justify-between rounded-2xl bg-white p-6 ${
                  plan.featured
                    ? 'relative border-2 border-[#5B3DF5] shadow-xl shadow-[#5B3DF5]/10'
                    : 'border border-slate-200/90 shadow-xs'
                }`}
              >
                {plan.featured ? (
                  <span className="absolute right-4 top-4 rounded-full bg-[#5B3DF5] px-3 py-1 text-[10px] font-bold text-white">
                    {plan.badge}
                  </span>
                ) : null}
                <div>
                  <span
                    className={`inline-block rounded-md px-2.5 py-0.5 text-[11px] font-semibold ${
                      plan.featured
                        ? 'bg-[#5B3DF5]/10 text-[#5B3DF5]'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {plan.priceCents === 0 ? 'Free' : 'Paid'}
                  </span>
                  <h2 className="mt-3 font-geist text-xl font-bold text-slate-950">{plan.name}</h2>
                  <p className="mt-1 text-xs text-slate-500">{plan.copy}</p>
                  <div className="mt-5 flex items-baseline gap-1 border-b border-slate-100 pb-5">
                    <span className="font-geist text-4xl font-extrabold text-slate-950">
                      {plan.priceLabel}
                    </span>
                    {plan.priceCents > 0 ? (
                      <span className="text-xs text-slate-500">/ month</span>
                    ) : null}
                  </div>
                  <ul className="mt-5 space-y-2.5 text-xs text-slate-700">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-[#5B3DF5]" /> {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                <Link
                  href="/login"
                  className={`mt-7 flex h-10 w-full items-center justify-center rounded-xl text-xs font-bold ${
                    plan.featured
                      ? 'bg-[#5B3DF5] text-white shadow-md shadow-[#5B3DF5]/25 hover:bg-[#4C2EE0]'
                      : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Compare plans, generated from the saved plan features */}
        {displayPlans.length > 0 && compareRows.length > 0 ? (
          <div className="mt-12 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs lg:p-8">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-3">
                <h3 className="font-geist text-xl font-bold text-slate-950">Compare Plans</h3>
                <p className="mt-1 text-xs text-slate-500">
                  See what is included in each plan and choose what fits your business.
                </p>
              </div>
              <div className="overflow-x-auto lg:col-span-9">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 font-bold text-slate-900">
                      <th className="py-2.5 pr-4">Feature</th>
                      {displayPlans.map((plan) => (
                        <th
                          key={plan.slug}
                          className={`px-4 py-2.5 text-center ${
                            plan.featured ? 'text-[#5B3DF5]' : ''
                          }`}
                        >
                          {plan.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600">
                    {compareRows.map((row) => (
                      <tr key={row.label}>
                        <td className="py-2.5 pr-4 font-medium text-slate-800">{row.label}</td>
                        {row.cells.map((cell, ci) => (
                          <td
                            key={ci}
                            className={`px-4 py-2.5 text-center ${
                              cell === '✓'
                                ? 'text-emerald-600'
                                : cell === '—'
                                  ? 'text-slate-300'
                                  : displayPlans[ci]?.featured
                                    ? 'font-semibold text-slate-900'
                                    : ''
                            }`}
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
        ) : null}

        {/* Data Control Footer Strip */}
        <div className="mt-12 grid grid-cols-1 gap-6 border-t border-slate-200/80 pt-10 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <h3 className="font-geist text-lg font-extrabold text-slate-950">
              Your Business Data Stays in Your Control
            </h3>
            <p className="mt-1.5 text-xs text-slate-500">
              We follow industry best practices to keep your data secure and private.
            </p>
          </div>
          <div className="lg:col-span-9 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600">
                <Lock className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-bold text-slate-900">Secure Access</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Only necessary permissions requested.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-bold text-slate-900">Your Data, Your Control</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Disconnect accounts or delete anytime.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                <Server className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-bold text-slate-900">Reliable Infrastructure</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Trusted cloud providers &amp; encryption.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                <Headphones className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-bold text-slate-900">Real Human Support</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Dedicated help whenever you need it.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
