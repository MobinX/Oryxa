import type { PublicPlan } from './api';

/** One card as both the landing page and /pricing draw it. */
export type DisplayPlan = {
  name: string;
  slug: string;
  priceLabel: string;
  priceCents: number;
  copy: string;
  cta: string;
  ctaHref: string;
  /** $0 and uncapped on both allowances: the Custom card, priced with the team. */
  custom: boolean;
  featured: boolean;
  badge?: string;
  tagTone: string;
  features: string[];
};

/** Visual variation only; the plan data itself never chooses a colour. */
const TAG_TONES = [
  'border-white/10 bg-white/[0.06] text-slate-300',
  'border-[#5B3DF5]/30 bg-[#5B3DF5]/15 text-[#A78BFA]',
  'border-[#5B3DF5]/50 bg-[#5B3DF5]/20 text-[#A78BFA]',
  'border-white/10 bg-white/[0.06] text-slate-300',
];

export function toDisplayPlans(plans: PublicPlan[]): DisplayPlan[] {
  return plans.map((plan, index) => {
    const featured = plan.slug === 'pro';
    // A free tier is $0 with a quota; $0 with no quota on either side is the
    // Custom offer, which must read as "talk to us", never as a free signup.
    const custom =
      plan.priceCents === 0 &&
      plan.messageLimitLabel === 'Uncapped' &&
      plan.commentLimitLabel === 'Uncapped';
    const features = [
      ...new Set([plan.messageLimitLabel, plan.commentLimitLabel, ...plan.features]),
    ];
    return {
      name: plan.name,
      slug: plan.slug,
      priceLabel: custom ? 'Custom' : plan.priceLabel,
      priceCents: plan.priceCents,
      copy: custom
        ? 'Unlimited replies, priced with our team'
        : `${plan.messageLimitLabel} · ${plan.commentLimitLabel} per 30-day cycle`,
      cta: custom ? 'Contact us' : plan.priceCents === 0 ? 'Get started free' : 'Get started',
      ctaHref: custom ? '/contact' : '/login',
      custom,
      featured,
      ...(featured ? { badge: 'Most popular' } : {}),
      tagTone: TAG_TONES[index % TAG_TONES.length]!,
      features,
    };
  });
}

/** A comparison row built from what the operator actually saved on each plan. */
export type PlanCompareRow = {
  label: string;
  cells: string[];
};

export function toCompareRows(plans: PublicPlan[]): PlanCompareRow[] {
  if (plans.length === 0) return [];
  const limitRows: PlanCompareRow[] = [
    {
      label: 'Messenger replies',
      cells: plans.map((plan) => plan.messageLimitLabel),
    },
    {
      label: 'Comment replies',
      cells: plans.map((plan) => plan.commentLimitLabel),
    },
  ];

  const featureLabels = [...new Set(plans.flatMap((plan) => plan.features))];
  return [
    ...limitRows,
    ...featureLabels.map((label) => ({
      label,
      cells: plans.map((plan) => (plan.features.includes(label) ? '✓' : '—')),
    })),
  ];
}
