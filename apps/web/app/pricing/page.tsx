import Link from 'next/link';
import { ArrowLeft, Check, CreditCard } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { cachedPublicPlans } from '@/app/_cache/queries';
import type { PublicPlan } from '@/lib/api';

export const metadata = { title: 'Pricing — Oryxa' };

/**
 * The same four offers the migration seeds, written down. If `/api/v1/plans` does not
 * answer, `/pricing` still shows a price list: a 500 on the new route must not take the
 * page a customer is being sent to. The labels match what the server formats, so the
 * fallback is not a different copy — it is this copy, early.
 */
const STATIC_PLANS: PublicPlan[] = [
  {
    name: 'Free',
    slug: 'free',
    priceCents: 0,
    currency: 'USD',
    priceLabel: 'Free',
    messageLimitLabel: '1,000 messenger replies',
    commentLimitLabel: '1,000 comment replies',
    features: ['Storefront, orders and posts included', 'No card details required'],
  },
  {
    name: 'Starter',
    slug: 'starter',
    priceCents: 2900,
    currency: 'USD',
    priceLabel: '$29',
    messageLimitLabel: '1,000 messenger replies',
    commentLimitLabel: '1,000 comment replies',
    features: ['Priority support', 'Every channel connection you need'],
  },
  {
    name: 'Pro',
    slug: 'pro',
    priceCents: 7900,
    currency: 'USD',
    priceLabel: '$79',
    messageLimitLabel: '10,000 messenger replies',
    commentLimitLabel: '10,000 comment replies',
    features: ['Multiple pages and posts', 'Advanced analytics'],
  },
  {
    name: 'Enterprise',
    slug: 'enterprise',
    priceCents: 0,
    currency: 'USD',
    priceLabel: 'Free',
    messageLimitLabel: 'Uncapped',
    commentLimitLabel: 'Uncapped',
    features: ['Custom pricing, agreed with our team', 'Dedicated onboarding'],
  },
];

function PlanCard({ plan, popular }: { plan: PublicPlan; popular: boolean }) {
  return (
    <div
      className={`flex flex-col justify-between rounded-card border bg-card p-7 shadow-card transition-transform duration-300 hover:scale-[1.01] ${
        popular ? 'border-2 border-primary/45' : 'border-border/50'
      } relative overflow-hidden`}
    >
      {popular && (
        <span className="absolute right-0 top-0 rounded-bl-xl bg-primary px-3 py-1.5 font-geist text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
          Popular
        </span>
      )}

      <div className="space-y-5">
        <h3 className="font-geist text-lg font-extrabold text-foreground">{plan.name}</h3>

        <p className="flex items-baseline gap-1">
          <span className="font-geist text-4xl font-black tracking-tight text-foreground">
            {plan.priceLabel}
          </span>
          {plan.priceCents > 0 && (
            <span className="text-xs font-semibold text-muted-foreground">/ 30 days</span>
          )}
        </p>

        <ul className="space-y-3 border-t border-border/10 pt-5 font-inter text-xs font-medium text-muted-foreground">
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-primary" />
            {plan.messageLimitLabel} per 30 days
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-primary" />
            {plan.commentLimitLabel} per 30 days
          </li>
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-primary" />
              {feature}
            </li>
          ))}
        </ul>
      </div>

      <Link
        href="/login"
        className={`mt-7 flex h-11 w-full items-center justify-center rounded-element font-geist text-xs font-bold uppercase tracking-wider transition-all active:scale-95 ${
          popular
            ? 'bg-primary text-primary-foreground hover:bg-primary/95'
            : 'border border-border bg-card text-foreground hover:bg-muted'
        }`}
      >
        Start Free
      </Link>
    </div>
  );
}

export default async function PricingPage() {
  // Live data when the API answers; the identical list written down when it does not.
  const listed = await cachedPublicPlans();
  const plans = listed.unavailable || listed.plans.length === 0 ? STATIC_PLANS : listed.plans;
  const live = !listed.unavailable && listed.plans.length > 0;

  return (
    <div className="flex min-h-screen flex-col justify-between bg-background font-inter text-foreground transition-colors duration-300">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 font-geist text-xl font-black tracking-tight">
            <CreditCard className="h-5 w-5 text-primary" />
            Oryxa
            <span className="text-[8px] font-extrabold uppercase tracking-widest text-muted-foreground">
              pricing
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link
              href="/login"
              className="rounded-element bg-primary px-4 py-2.5 font-geist text-sm font-bold text-primary-foreground transition-all active:scale-95 hover:bg-primary/90"
            >
              Start Free
            </Link>
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-7xl flex-1 overflow-hidden px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="pointer-events-none absolute left-1/2 top-1/4 -z-10 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/5 blur-[120px]" />

        <div className="mx-auto mb-12 max-w-2xl space-y-3 text-center">
          <span className="font-geist text-[10px] font-bold uppercase tracking-widest text-muted-foreground sm:text-xs">
            Priced by replies, not by seats
          </span>
          <h1 className="font-geist text-3xl font-black tracking-tight sm:text-4xl">
            What the agent answers for you, per 30 days
          </h1>
          <p className="text-sm text-muted-foreground">
            Every plan is an allowance of agent replies. Messenger and comment budgets are counted
            separately, a cycle runs 30 days from the day you started, and unused replies do not
            roll over.
          </p>
        </div>

        {!live && (
          <p className="mx-auto mb-8 max-w-2xl rounded-element border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-center text-xs text-amber-700 dark:text-amber-400">
            The price list could not be reached, so this is the standard offer. It is the same list —
            refresh once the service is back to see the live numbers.
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <PlanCard key={plan.slug} plan={plan} popular={plan.slug === 'pro'} />
          ))}
        </div>

        <div className="mx-auto mt-14 max-w-3xl space-y-4 rounded-card border border-border/50 bg-card p-7 shadow-card">
          <h2 className="font-geist text-base font-extrabold">What counts, in plain words</h2>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">One reply the agent actually sends is one unit.</strong>{' '}
              A run that decides to stay silent costs nothing, and a reply that fails to reach
              Facebook is given back.
            </li>
            <li>
              <strong className="text-foreground">Typing it yourself is free.</strong>{' '}
              Replies you send from the inbox or from a comment never count and are never blocked,
              however full the plan is.
            </li>
            <li>
              <strong className="text-foreground">Reaching the allowance stops the agent, not the store.</strong>{' '}
              Your storefront, orders and posts keep working. You get a notification at 80% and at
              100%.
            </li>
            <li>
              <strong className="text-foreground">Payment is agreed off-platform.</strong>{' '}
              Upgrading happens in your billing page and applies immediately — no card details are
              collected here, and money settles the same way orders do today.
            </li>
          </ul>
        </div>
      </main>

      <footer className="border-t border-border/40 py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Oryxa
          </Link>
          <div className="flex items-center gap-5 text-sm text-muted-foreground">
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
            <Link href="/login" className="font-semibold text-primary transition-opacity hover:opacity-80">
              Start Free
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
