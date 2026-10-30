import type { PublicPlan } from '@/lib/api';

/** One card as both the landing page and /pricing draw it. */
export type DisplayPlan = {
  name: string;
  slug: string;
  priceLabel: string;
  priceCents: number;
  copy: string;
  cta: string;
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
    const features = [
      ...new Set([plan.messageLimitLabel, plan.commentLimitLabel, ...plan.features]),
    ];
    return {
      name: plan.name,
      slug: plan.slug,
      priceLabel: plan.priceLabel,
      priceCents: plan.priceCents,
      copy: `${plan.messageLimitLabel} · ${plan.commentLimitLabel} per 30-day cycle`,
      cta: plan.priceCents === 0 ? 'Get started free' : 'Get started',
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
