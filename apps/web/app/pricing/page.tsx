import Link from 'next/link';
import { Check, ArrowRight, ChevronDown, Lock, ShieldCheck, Server, Headphones } from 'lucide-react';
import { cachedPublicPlans } from '@/app/_cache/queries';
import { COMPANY_NAME } from '@/lib/brand';
import { OnlyOrdesLogo } from '@/components/sidebar';

export const metadata = { title: `Pricing — ${COMPANY_NAME}` };

export default async function PricingPage() {
  await cachedPublicPlans().catch(() => null);

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

          <div className="pt-3 flex items-center justify-center gap-3">
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-2xs">
              <span className="rounded-full bg-[#5B3DF5] px-5 py-1.5 text-xs font-bold text-white">
                Monthly
              </span>
              <span className="rounded-full px-5 py-1.5 text-xs font-semibold text-slate-600">
                Yearly
              </span>
            </div>
            <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
              Save up to 20%
            </span>
          </div>
        </div>

        {/* 4 Plan Cards Grid */}
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* Free */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
            <div>
              <span className="inline-block rounded-md bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                Free
              </span>
              <h2 className="mt-3 font-geist text-xl font-bold text-slate-950">Get Started</h2>
              <p className="mt-1 text-xs text-slate-500">
                Perfect for trying out {COMPANY_NAME} with basic features.
              </p>
              <div className="mt-5 flex items-baseline gap-1 border-b border-slate-100 pb-5">
                <span className="font-geist text-4xl font-extrabold text-slate-950">$0</span>
                <span className="text-xs text-slate-500">/ month</span>
              </div>
              <ul className="mt-5 space-y-2.5 text-xs text-slate-700">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> 50 AI replies per month</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> 1 Facebook page</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Inbox &amp; comment management</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Basic order management</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> AI auto-reply</li>
                <li className="flex items-center gap-2 text-slate-300"><Check className="h-4 w-4" /> AI post generation</li>
                <li className="flex items-center gap-2 text-slate-300"><Check className="h-4 w-4" /> Advanced analytics</li>
                <li className="flex items-center gap-2 text-slate-300"><Check className="h-4 w-4" /> Priority support</li>
              </ul>
            </div>
            <Link
              href="/login"
              className="mt-7 flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 hover:bg-slate-50"
            >
              Get started free
            </Link>
          </div>

          {/* Starter */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
            <div>
              <span className="inline-block rounded-md bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-[#5B3DF5]">
                Starter
              </span>
              <h2 className="mt-3 font-geist text-xl font-bold text-slate-950">For Small Businesses</h2>
              <p className="mt-1 text-xs text-slate-500">
                Essential features for growing online stores.
              </p>
              <div className="mt-5 flex items-baseline gap-1 border-b border-slate-100 pb-5">
                <span className="font-geist text-4xl font-extrabold text-slate-950">$29</span>
                <span className="text-xs text-slate-500">/ month</span>
              </div>
              <ul className="mt-5 space-y-2.5 text-xs text-slate-700">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> 500 AI replies per month</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> 3 social channels</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Order management</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> AI auto-reply &amp; smart suggestions</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> AI post generation (basic)</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Customer tags &amp; notes</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Basic analytics</li>
                <li className="flex items-center gap-2 text-slate-300"><Check className="h-4 w-4" /> Priority support</li>
              </ul>
            </div>
            <Link
              href="/login"
              className="mt-7 flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 hover:bg-slate-50"
            >
              Get started
            </Link>
          </div>

          {/* Pro */}
          <div className="relative flex flex-col justify-between rounded-2xl border-2 border-[#5B3DF5] bg-white p-6 shadow-xl shadow-[#5B3DF5]/10">
            <span className="absolute right-4 top-4 rounded-full bg-[#5B3DF5] px-3 py-1 text-[10px] font-bold text-white">
              Most Popular
            </span>
            <div>
              <span className="inline-block rounded-md bg-[#5B3DF5]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#5B3DF5]">
                Pro
              </span>
              <h2 className="mt-3 font-geist text-xl font-bold text-slate-950">For Growing Businesses</h2>
              <p className="mt-1 text-xs text-slate-500">
                More automation, more channels and advanced features.
              </p>
              <div className="mt-5 flex items-baseline gap-1 border-b border-slate-100 pb-5">
                <span className="font-geist text-4xl font-extrabold text-slate-950">$79</span>
                <span className="text-xs text-slate-500">/ month</span>
              </div>
              <ul className="mt-5 space-y-2.5 text-xs text-slate-700">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> 2,000 AI replies per month</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> All social channels</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Advanced order management</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> AI post generation (advanced)</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Payment verification (bKash, Nagad, etc)</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Courier integration</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Advanced analytics</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Priority support</li>
              </ul>
            </div>
            <Link
              href="/login"
              className="mt-7 flex h-10 w-full items-center justify-center rounded-xl bg-[#5B3DF5] text-xs font-bold text-white shadow-md shadow-[#5B3DF5]/25 hover:bg-[#4C2EE0]"
            >
              Get started
            </Link>
          </div>

          {/* Enterprise */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
            <div>
              <span className="inline-block rounded-md bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                Enterprise
              </span>
              <h2 className="mt-3 font-geist text-xl font-bold text-slate-950">For Large Businesses</h2>
              <p className="mt-1 text-xs text-slate-500">
                Custom solutions for high volume stores and agencies.
              </p>
              <div className="mt-5 flex items-baseline gap-1 border-b border-slate-100 pb-5">
                <span className="font-geist text-2xl font-extrabold text-slate-950">Custom pricing</span>
              </div>
              <ul className="mt-5 space-y-2.5 text-xs text-slate-700">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Unlimited replies</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> All channels</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Advanced automation</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Custom integrations</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Dedicated account manager</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Advanced analytics &amp; reporting</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> SLA &amp; onboarding support</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#5B3DF5]" /> Custom features</li>
              </ul>
            </div>
            <Link
              href="/login"
              className="mt-7 flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 hover:bg-slate-50"
            >
              Contact sales
            </Link>
          </div>
        </div>

        {/* Compare Plans Matrix */}
        <div className="mt-12 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs lg:p-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-3">
              <h3 className="font-geist text-xl font-bold text-slate-950">Compare Plans</h3>
              <p className="mt-1 text-xs text-slate-500">
                See what&apos;s included in each plan and choose what fits your business.
              </p>
            </div>
            <div className="lg:col-span-9 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 font-bold text-slate-900">
                    <th className="py-2.5 pr-4">Feature</th>
                    <th className="py-2.5 px-4 text-center">Free</th>
                    <th className="py-2.5 px-4 text-center">Starter</th>
                    <th className="py-2.5 px-4 text-center text-[#5B3DF5]">Pro</th>
                    <th className="py-2.5 pl-4 text-center">Enterprise</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600">
                  <tr>
                    <td className="py-2.5 pr-4 font-medium text-slate-800">AI replies per month</td>
                    <td className="py-2.5 px-4 text-center">50</td>
                    <td className="py-2.5 px-4 text-center">500</td>
                    <td className="py-2.5 px-4 text-center font-semibold text-slate-900">2,000</td>
                    <td className="py-2.5 pl-4 text-center font-semibold text-slate-900">Unlimited</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-medium text-slate-800">Social channels</td>
                    <td className="py-2.5 px-4 text-center">1 page</td>
                    <td className="py-2.5 px-4 text-center">3 channels</td>
                    <td className="py-2.5 px-4 text-center">All channels</td>
                    <td className="py-2.5 pl-4 text-center">All channels</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-medium text-slate-800">AI post generation</td>
                    <td className="py-2.5 px-4 text-center">—</td>
                    <td className="py-2.5 px-4 text-center">Basic</td>
                    <td className="py-2.5 px-4 text-center">Advanced</td>
                    <td className="py-2.5 pl-4 text-center">Advanced + custom</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-medium text-slate-800">Order management</td>
                    <td className="py-2.5 px-4 text-center">✓</td>
                    <td className="py-2.5 px-4 text-center">✓</td>
                    <td className="py-2.5 px-4 text-center">✓</td>
                    <td className="py-2.5 pl-4 text-center">✓</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-medium text-slate-800">Payment verification</td>
                    <td className="py-2.5 px-4 text-center">—</td>
                    <td className="py-2.5 px-4 text-center">—</td>
                    <td className="py-2.5 px-4 text-center">✓</td>
                    <td className="py-2.5 pl-4 text-center">✓</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-medium text-slate-800">Courier integration</td>
                    <td className="py-2.5 px-4 text-center">—</td>
                    <td className="py-2.5 px-4 text-center">—</td>
                    <td className="py-2.5 px-4 text-center">✓</td>
                    <td className="py-2.5 pl-4 text-center">✓</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-medium text-slate-800">Analytics &amp; reporting</td>
                    <td className="py-2.5 px-4 text-center">Basic</td>
                    <td className="py-2.5 px-4 text-center">Basic</td>
                    <td className="py-2.5 px-4 text-center">Advanced</td>
                    <td className="py-2.5 pl-4 text-center">Advanced + custom</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-medium text-slate-800">Priority support</td>
                    <td className="py-2.5 px-4 text-center">—</td>
                    <td className="py-2.5 px-4 text-center">—</td>
                    <td className="py-2.5 px-4 text-center">✓</td>
                    <td className="py-2.5 pl-4 text-center">✓</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

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
