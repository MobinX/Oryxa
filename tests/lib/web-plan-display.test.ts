import { describe, it, expect } from 'vitest';
import { toCompareRows, toDisplayPlans } from '../../apps/web/lib/plan-display';
import type { PublicPlan } from '../../apps/web/lib/api';

const plan = (overrides: Partial<PublicPlan>): PublicPlan => ({
  name: 'Free',
  slug: 'free',
  priceCents: 0,
  currency: 'USD',
  priceLabel: 'Free',
  messageLimitLabel: '1,000 messenger replies',
  commentLimitLabel: '1,000 comment replies',
  features: ['Storefront, orders and posts included'],
  ...overrides,
});

describe('web plan cards (apps/web/lib/plan-display.ts)', () => {
  it('sends the $0 uncapped Custom offer to the contact page, not signup', () => {
    const [custom] = toDisplayPlans([
      plan({
        name: 'Custom',
        slug: 'enterprise',
        messageLimitLabel: 'Uncapped',
        commentLimitLabel: 'Uncapped',
        features: ['Custom pricing, agreed with our team'],
      }),
    ]);

    expect(custom.custom).toBe(true);
    expect(custom.priceLabel).toBe('Custom');
    expect(custom.cta).toBe('Contact us');
    expect(custom.ctaHref).toBe('/contact');
    expect(custom.copy).toContain('priced with our team');
  });

  it('keeps a $0 capped tier on the free signup path', () => {
    const [free] = toDisplayPlans([plan({})]);

    expect(free.custom).toBe(false);
    expect(free.priceLabel).toBe('Free');
    expect(free.cta).toBe('Get started free');
    expect(free.ctaHref).toBe('/login');
  });

  it('keeps paid tiers on signup and Pro featured', () => {
    const [starter, pro] = toDisplayPlans([
      plan({ name: 'Starter', slug: 'starter', priceCents: 2900, priceLabel: '$29' }),
      plan({ name: 'Pro', slug: 'pro', priceCents: 7900, priceLabel: '$79' }),
    ]);

    expect(starter.cta).toBe('Get started');
    expect(starter.ctaHref).toBe('/login');
    expect(starter.featured).toBe(false);
    expect(pro.featured).toBe(true);
    expect(pro.badge).toBe('Most popular');
  });

  it('collapses one shared feature string into one compare row', () => {
    const rows = toCompareRows([
      plan({ features: ['Storefront, orders and posts included'] }),
      plan({
        slug: 'starter',
        features: ['Storefront, orders and posts included', 'Priority support'],
      }),
    ]);

    const storefront = rows.filter((row) => row.label === 'Storefront, orders and posts included');
    expect(storefront).toHaveLength(1);
    expect(storefront[0].cells).toEqual(['✓', '✓']);
    expect(rows.find((row) => row.label === 'Priority support')?.cells).toEqual(['—', '✓']);
  });
});
