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
  'border-white/10 bg-white/[0.06] text-neutral-300',
  'border-white/20 bg-white/[0.08] text-white',
  'border-white/25 bg-white/[0.10] text-white',
  'border-white/10 bg-white/[0.06] text-neutral-300',
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

type CompareQuantity = { kind: 'number'; raw: string } | { kind: 'word'; word: string };

type ParsedFeature = {
  /** Trimmed, whitespace-collapsed original for ambiguous cells. */
  original: string;
  hasUpTo: boolean;
  qty: CompareQuantity | null;
  /** Lowercased grouping key: quantity and trailing unit stripped. */
  key: string;
  /** Trailing 'per …' unit in original casing, whitespace-collapsed. */
  unit: string;
  unitLower: string;
};

function parseCompareFeature(feature: string): ParsedFeature {
  const original = feature.trim().replace(/\s+/g, ' ');
  const hasUpTo = /^up to\s+/i.test(original);
  const rest = hasUpTo ? original.replace(/^up to\s+/i, '') : original;

  let qty: CompareQuantity | null = null;
  let remainder = rest;
  const numeric = rest.match(/^(\d[\d,]*)(?=\s|$)([\s\S]*)$/);
  const word = rest.match(/^(unlimited|uncapped)(?=\s|$)([\s\S]*)$/i);
  if (numeric) {
    qty = { kind: 'number', raw: numeric[1]! };
    remainder = (numeric[2] ?? '').trim();
  } else if (word) {
    qty = { kind: 'word', word: word[1]! };
    remainder = (word[2] ?? '').trim();
  }

  let keyPart = remainder;
  let unit = '';
  const unitMatch = remainder.match(/^(.*?)\s+(per\s+.+)$/i);
  if (unitMatch && unitMatch[1]!.trim() !== '') {
    keyPart = unitMatch[1]!.trim();
    unit = unitMatch[2]!.trim().replace(/\s+/g, ' ');
  }
  const collapsedKey = keyPart.trim().replace(/\s+/g, ' ');
  const key = (collapsedKey === '' ? original : collapsedKey).toLowerCase();
  return { original, hasUpTo, qty, key, unit, unitLower: unit.toLowerCase() };
}

function sentenceCase(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

function formatCompareCount(raw: string): string {
  const parsed = Number(raw.replace(/,/g, ''));
  if (Number.isSafeInteger(parsed)) return parsed.toLocaleString('en-US');
  return raw;
}

function formatCompareWord(word: string): string {
  return word.toLowerCase() === 'uncapped' ? 'Uncapped' : 'Unlimited';
}

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

  // Group quota-like strings ('1,000 agent replies per 30 days',
  // 'Up to 3000 agent replies per 30 days', 'Unlimited agent replies')
  // into one row per feature; groups keep first-seen order.
  const groups = new Map<string, { items: ParsedFeature[]; perPlan: Map<number, ParsedFeature> }>();
  plans.forEach((plan, planIndex) => {
    for (const feature of plan.features) {
      const parsed = parseCompareFeature(feature);
      let group = groups.get(parsed.key);
      if (!group) {
        group = { items: [], perPlan: new Map() };
        groups.set(parsed.key, group);
      }
      group.items.push(parsed);
      if (!group.perPlan.has(planIndex)) group.perPlan.set(planIndex, parsed);
    }
  });

  const rows: PlanCompareRow[] = [...limitRows];
  for (const { items, perPlan } of groups.values()) {
    const hasQuantities = items.some((item) => item.qty !== null);
    // Unit consensus runs over quantity-bearing items only: ambiguous
    // quantity-less cells keep their full string anyway, and a bare
    // Unlimited/Uncapped has no period to disagree with.
    const pool = items.filter((item) => {
      if (item.qty === null) return !hasQuantities;
      if (item.qty.kind === 'word' && item.unitLower === '') return false;
      return true;
    });
    let sharedUnit = '';
    if (
      pool.length > 0 &&
      pool.every((item) => item.unitLower === pool[0]!.unitLower) &&
      pool[0]!.unitLower !== ''
    ) {
      sharedUnit = pool[0]!.unit;
    }

    const key = items[0]!.key;
    const label = sharedUnit === '' ? sentenceCase(key) : `${sentenceCase(key)} ${sharedUnit}`;
    const cells = plans.map((_, planIndex) => {
      const item = perPlan.get(planIndex);
      if (!item) return '—';
      if (item.qty !== null) {
        const prefix = item.hasUpTo ? 'Up to ' : '';
        const value =
          item.qty.kind === 'number'
            ? formatCompareCount(item.qty.raw)
            : formatCompareWord(item.qty.word);
        const unitSuffix = sharedUnit === '' && item.unit !== '' ? ` ${item.unit}` : '';
        return `${prefix}${value}${unitSuffix}`;
      }
      if (!hasQuantities) return '✓';
      return item.original;
    });
    rows.push({ label, cells });
  }
  return rows;
}
